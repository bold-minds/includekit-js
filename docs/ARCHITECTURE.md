# IncludeKit SDK Architecture

This document explains the architecture and design decisions of the IncludeKit JS/TS SDK.

## Overview

The SDK is structured as a monorepo with four main packages that separate concerns for maximum reusability and maintainability:

```
@includekit/core           - Engine + Cache (ORM-agnostic)
        ↓
@includekit/orchestrator  - Coordination layer (ORM-agnostic)
        ↓
@includekit/prisma-mapper  - Prisma-specific mapping
        ↓
@includekit/prisma         - Integration package
```

## Design Philosophy

### Separation of Concerns

**Core** (`@includekit/core`)
- WASM engine loader and wrapper
- Cache adapters (MemoryLRU, RedisCache)
- Base types (Statement, Mutation, AppSchema)
- **No ORM dependencies**

**Orchestrator** (`@includekit/orchestrator`)
- Cache hit/miss coordination
- Singleflight pattern (prevents duplicate queries)
- Transaction-local eviction tracking
- Provides `CachingService` interface for mappers
- **ORM-agnostic**: Works with any database library

**Mapper** (`@includekit/prisma-mapper`)
- Translates Prisma args → Statement
- Translates Prisma args → Mutation
- Implements `ORMMapper` interface
- Uses Prisma Client Extensions for interception
- **Prisma-specific**: Understands Prisma's query structure

**Integration** (`@includekit/prisma`)
- Thin wrapper combining orchestrator + mapper
- Transaction proxy wrapper (handles `$transaction`)
- Diagnostics API (`$includeKit`)
- **User-facing API**

### Why This Structure?

**1. Future ORM Support**

To add Drizzle support:
```typescript
// Create @includekit/drizzle-mapper
class DrizzleMapper implements ORMMapper<DrizzleClient, any, any> {
  buildStatement(params) { /* Drizzle → Statement */ }
  buildMutation(params) { /* Drizzle → Mutation */ }
  extendClient(client, cachingService) { /* Drizzle interception */ }
}

// Create @includekit/drizzle
export async function withIncludeKit(db: DrizzleClient, options) {
  const mapper = new DrizzleMapper(schema);
  return withORM(db, { ...options, mapper });
}
```

The orchestration logic (caching, eviction, singleflight) is **100% reused**.

**2. Testability**

Each package has clear boundaries:
- **Core**: Test WASM calls, cache implementations
- **Orchestrator**: Test coordination logic with mocks
- **Mapper**: Test Prisma → Statement/Mutation translation
- **Integration**: Test transaction wrapping

**3. Maintainability**

Changes are localized:
- Prisma API changes → only update mapper
- Cache strategy changes → only update core
- Invalidation logic → only update engine (not SDK)

## Key Architectural Decisions

### 1. Stateful Engine

The **engine tracks all queries** internally. The SDK never stores dependency maps.

**Flow:**
```typescript
// Read
shapeId = engine.computeShapeId(statement)
cached = cache.get(shapeId)
if (!cached) {
  result = await db.query(...)
  engine.addQuery({ shape: statement, resultHint: result })
  cache.set(shapeId, { result })
}

// Write
evict = engine.invalidate(mutation)
result = await db.write(...)
for (shapeId of evict) {
  cache.del(shapeId)
}
```

**Key insight**: SDK only stores result data. Engine is source of truth for dependencies.

### 2. Transaction Detection via WeakMap

**Problem**: Prisma extensions can't override `$transaction` via `client` component.

**Solution**: Use Proxy pattern + WeakMap for eviction tracking.

```typescript
const txEvictions = new WeakMap<PrismaClient, Set<string>>();

// In mapper (extension):
async create({ args, query }) {
  const evict = await engine.invalidate(mutation);
  const txContext = this; // 'this' is tx client in transactions

  if (txEvictions.has(txContext)) {
    // In transaction: collect evictions
    txEvictions.get(txContext)!.add(...evict);
  } else {
    // Not in transaction: evict immediately
    await cache.del(evict);
  }

  return query(args);
}

// In integration (Proxy):
$transaction: async (fn) => {
  return basePrisma.$transaction(async (tx) => {
    txEvictions.set(tx, new Set()); // Initialize tracking

    try {
      const result = await fn(tx);
      await commitEvictions(tx); // Apply on success
      return result;
    } catch (error) {
      txEvictions.delete(tx); // Discard on error
      throw error;
    }
  });
}
```

**Why this works**:
- Inside `$transaction`, extensions receive tx client as `this`
- Outside, extensions receive base client as `this`
- WeakMap presence indicates transaction tracking is active
- Automatic cleanup when tx client is garbage collected

### 3. Singleflight Pattern

**Problem**: Multiple concurrent requests for same uncached query hit DB multiple times.

**Solution**: In-flight request tracking.

```typescript
const inflightRequests = new Map<string, Promise<any>>();

async executeRead({ statement, execute }) {
  const { shapeId } = await engine.computeShapeId(statement);

  // Check if already in flight
  if (inflightRequests.has(shapeId)) {
    return inflightRequests.get(shapeId)!;
  }

  // Start new request
  const promise = execute().then(result => {
    // Cache and track
    return result;
  });

  inflightRequests.set(shapeId, promise);
  try {
    return await promise;
  } finally {
    inflightRequests.delete(shapeId);
  }
}
```

### 4. Prisma Client Extensions (Not Middleware)

**Why**: `$use()` middleware was removed in Prisma 6.14.0.

```typescript
// ✅ Client Extensions (Prisma 4.16+)
client.$extends({
  query: {
    $allModels: {
      async findMany({ model, args, query }) {
        // Intercept here
        return cachingService.executeRead({
          statement: buildStatement({ model, args }),
          execute: () => query(args)
        });
      }
    }
  }
});

// ❌ Middleware (deprecated)
prisma.$use(async (params, next) => {
  // Don't do this - removed in Prisma 6.14+
});
```

### 5. Operator Mapping Strategy

**Goal**: Support all Prisma operators, gracefully handle unknown ones.

```typescript
const SPEC_OPERATORS = {
  equals: 'eq',
  in: 'in',
  contains: 'contains',
  // ... precise invalidation
};

function mapPrismaOperator(op: string): string {
  if (SPEC_OPERATORS[op]) return SPEC_OPERATORS[op];
  if (op === 'search') return 'unsupported:search';

  // Unknown operator - conservative invalidation
  console.warn(`Unknown operator: ${op}`);
  return `unknown:${op}`;
}
```

**Engine behavior**:
- `unsupported:*` → Conservative invalidation (any mutation to model invalidates ALL queries using this op)
- `unknown:*` → Same as unsupported
- Queries **always work** (never throw on unknown operators)

### 6. Partial Schema Support

**The engine is closed-world**. You can provide a subset of your DB schema.

```json
{
  "version": 1,
  "models": [
    {
      "name": "Post",
      "id": { "kind": "string" },
      "relations": [
        { "name": "author", "model": "User", "cardinality": "many-to-one" }
      ]
    }
  ]
}
```

**Validation rules**:
- **Read**: References to unknown models/fields → `QUERY_INVALID` error
- **Write**: Targets unknown model → `MUTATION_INVALID` error
- **Write**: Updates unknown fields on known model → Fields silently ignored (safe!)

**Safety**: A shape couldn't depend on an untracked field (would fail at query time).

## Data Flow

### Read Flow
```
User calls prisma.user.findMany()
    ↓
[Mapper Extension] Build Statement
    ↓
[Orchestrator] Compute shapeId
    ↓
[Orchestrator] Check cache → HIT? Return
    ↓
[Orchestrator] Singleflight check
    ↓
[Mapper Extension] Execute query(args) → DB
    ↓
[Engine] addQuery() → Track dependencies
    ↓
[Orchestrator] cache.set(shapeId, result)
    ↓
Return result
```

### Write Flow
```
User calls prisma.post.create()
    ↓
[Mapper Extension] Build Mutation
    ↓
[Engine] invalidate(mutation) → Get evict list
    ↓
[Mapper Extension] Execute query(args) → DB
    ↓
[Orchestrator] Transaction check:
    - In tx: Collect evictions
    - Not in tx: Evict immediately
    ↓
Return result
```

### Transaction Flow
```
User calls prisma.$transaction(async (tx) => {...})
    ↓
[Integration Proxy] Initialize WeakMap entry
    ↓
[Mapper Extensions] Collect evictions to WeakMap
    ↓
User callback completes
    ↓
[Integration Proxy] commitEvictions():
    - Apply all collected evictions
    - Delete WeakMap entry
    ↓
Return result
```

## Performance Characteristics

- **Cache lookup**: O(1) hash map lookup
- **Singleflight**: O(1) check per shapeId
- **Invalidation**: O(k) where k = queries tracking affected models (engine-side model index)
- **Memory**: LRU enforces maxItems limit (default 10k shapes)

## Extension Points

### Custom Cache Adapter

```typescript
class MyCacheAdapter implements Cache<any> {
  async get(key: string) { /* ... */ }
  async set(key: string, value: any, ttlMs: number) { /* ... */ }
  async del(key: string) { /* ... */ }
}

const prisma = await withIncludeKit(new PrismaClient(), {
  cache: new MyCacheAdapter(),
  schema: { file: './schema.json' }
});
```

### Custom ORM Mapper

```typescript
class MyORMMapper implements ORMMapper<MyClient, any, any> {
  buildStatement(params) { /* Translate query args */ }
  buildMutation(params) { /* Translate write args */ }
  extendClient(client, cachingService) { /* Intercept operations */ }
}

const client = await withORM(myClient, {
  mapper: new MyORMMapper(schema),
  cache,
  schema: { json: schema }
});
```

### Insights Telemetry

```typescript
const prisma = await withIncludeKit(new PrismaClient(), {
  cache,
  schema: { file: './schema.json' },
  insights: {
    emit: (event) => {
      // Send to analytics service
      analytics.track({
        type: event.eventType,
        shapeId: event.shapeId,
        timestamp: event.timestamp,
        ...event.dependenciesSummary
      });
    }
  }
});
```

## Future Work

- [ ] Drizzle ORM support
- [ ] TypeORM support  
- [ ] Sequelize support
- [ ] DMMF introspection (auto-generate schema from Prisma schema)
- [ ] Distributed cache coordination (Redis Pub/Sub)
- [ ] Query result compression
- [ ] Adaptive TTL based on mutation frequency
