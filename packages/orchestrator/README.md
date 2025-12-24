# @includekit/orchestrator

ORM-agnostic orchestration layer for IncludeKit - handles caching coordination, eviction, and singleflight pattern.

## Installation

```bash
pnpm add @includekit/orchestrator @includekit/core
```

## Overview

The orchestrator provides a caching service that encapsulates all coordination logic:

- Cache hit/miss management
- Singleflight pattern (prevents duplicate concurrent queries)
- Transaction-local eviction tracking
- Schema loading and validation

**This package is ORM-agnostic** - it works with any database library through the mapper interface.

## Usage

```typescript
import { withORM } from '@includekit/orchestrator';
import { MemoryLRU } from '@includekit/core';

// Create your ORM mapper (see below)
const mapper = new MyORMMapper(schema);

// Wrap client with orchestrator
const extendedClient = await withORM(myClient, {
  schema: {
    file: './includekit-schema.json', // or { json: schema }
  },
  cache: new MemoryLRU(),
  mapper,
  defaultTtlMs: 300000, // 5 minutes
  insights: {
    emit: (event) => console.log(event),
  },
});
```

## Implementing an ORM Mapper

To integrate a new ORM, implement the `ORMMapper` interface:

```typescript
import { ORMMapper, CachingService } from '@includekit/orchestrator';
import { Statement, Mutation } from '@includekit/core';

class MyORMMapper implements ORMMapper<MyClient, any, any> {
  constructor(private schema: AppSchema) {}

  // Translate ORM query args to Statement
  buildStatement(params: {
    model: string;
    operation: 'findUnique' | 'findFirst' | 'findMany';
    args: any;
  }): Statement {
    return {
      model: params.model,
      where: this.mapWhere(params.args.where),
      // ... map other fields
    };
  }

  // Translate ORM write args to Mutation
  buildMutation(params: {
    model: string;
    operation: string;
    args: any;
  }): Mutation {
    return {
      changes: [
        {
          action: 'update',
          model: params.model,
          where: this.mapWhere(params.args.where),
          sets: params.args.data,
        },
      ],
    };
  }

  // Extend client with caching integration
  extendClient(client: MyClient, cachingService: CachingService): MyClient {
    // Intercept ORM operations
    return client.intercept({
      async findMany(args) {
        const statement = this.buildStatement({ model, operation: 'findMany', args });
        return cachingService.executeRead({
          statement,
          execute: () => originalFindMany(args),
        });
      },

      async create(args) {
        const mutation = this.buildMutation({ model, operation: 'create', args });
        return cachingService.executeWrite({
          mutation,
          execute: () => originalCreate(args),
          txContext: this, // For transaction detection
        });
      },
    });
  }
}
```

## CachingService API

The `CachingService` is provided by the orchestrator to mappers:

```typescript
interface CachingService {
  // Execute read with caching
  executeRead<T>(params: {
    statement: Statement;
    execute: () => Promise<T>;
    resultHint?: Record<string, any[]>;
  }): Promise<T>;

  // Execute write with invalidation
  executeWrite<T>(params: {
    mutation: Mutation;
    execute: () => Promise<T>;
    txContext?: any; // For transaction tracking
  }): Promise<T>;

  // Transaction lifecycle
  commitTransaction(txContext: any): Promise<void>;
  rollbackTransaction(txContext: any): Promise<void>;
}
```

## Schema Loading

The orchestrator handles schema loading and validation:

```typescript
import { loadSchema } from '@includekit/orchestrator';

// From file
const schema = await loadSchema({ file: './schema.json' });

// From JSON
const schema = await loadSchema({ json: schemaObject });

// Schema is validated before passing to engine
// - Checks version field
// - Validates models array
// - Ensures model names and ID configs are present
// - Validates composite ID fields
```

## Transaction Handling

The orchestrator uses WeakMap for transaction-local eviction tracking:

1. Mapper passes `this` (client context) as `txContext`
2. Orchestrator checks if WeakMap has entry for txContext
3. If yes: Collect evictions for later
4. If no: Evict immediately

```typescript
// In mapper's executeWrite:
return cachingService.executeWrite({
  mutation,
  execute: () => query(args),
  txContext: this, // Client context (tx inside $transaction, base outside)
});

// Integration package initializes transaction:
__includekit_initTransaction(tx);
// ... user callback runs, evictions collected
__includekit_commitTransaction(tx); // Apply evictions
```

## Singleflight Pattern

The orchestrator prevents duplicate concurrent queries:

```typescript
// Multiple concurrent identical queries
Promise.all([
  client.user.findMany({ where: { active: true } }),
  client.user.findMany({ where: { active: true } }),
  client.user.findMany({ where: { active: true } }),
]);

// Only ONE database query executes
// All three promises resolve with the same result
```

## Insights Events

Monitor cache behavior with insights:

```typescript
const client = await withORM(myClient, {
  // ...
  insights: {
    emit: (event: InsightsEvent) => {
      console.log({
        type: event.eventType, // 'hit' | 'miss' | 'evict'
        shapeId: event.shapeId,
        timestamp: event.timestamp,
        dependencies: event.dependenciesSummary, // On 'miss' events
      });
    },
  },
});
```

## Internal Methods

The orchestrator exposes internal methods for integration packages:

```typescript
const extended = await withORM(client, options);

// These are exposed for integration packages (not for end users)
extended.__includekit_initTransaction(txContext);
extended.__includekit_commitTransaction(txContext);
extended.__includekit_rollbackTransaction(txContext);
extended.__includekit_getCacheStats();
extended.__includekit_getEngine();
```

## License

MIT
