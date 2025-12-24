# @includekit/core

Core package providing WASM engine loader and cache adapters for IncludeKit.

## Installation

```bash
pnpm add @includekit/core
```

## Features

- **WASM Engine Loader** - Load and communicate with IncludeKit WASM engine
- **Cache Adapters** - MemoryLRU and RedisCache implementations
- **Base Types** - TypeScript types for Statement, Mutation, AppSchema, etc.
- **ORM-Agnostic** - No dependencies on any specific ORM

## Usage

### WASM Engine

```typescript
import { loadEngine } from '@includekit/core';

// Load from file path
const engine = await loadEngine('./path/to/core.wasm');

// Or use a fetcher function
const engine = await loadEngine(async () => {
  const response = await fetch('https://cdn.example.com/core.wasm');
  return response.arrayBuffer();
});

// Use engine
const version = await engine.version();
await engine.setSchema(appSchema);
const { shapeId } = await engine.computeShapeId(statement);
```

### Memory Cache

```typescript
import { MemoryLRU } from '@includekit/core';

const cache = new MemoryLRU({
  maxItems: 10000, // Maximum number of items (default: 10,000)
  defaultTtlMs: 300000, // Default TTL in milliseconds (default: 5 minutes)
  enableBackgroundCleanup: true, // Enable background TTL cleanup (default: true)
  cleanupIntervalMs: 60000, // Cleanup interval (default: 1 minute)
});

// Use cache
await cache.set('key', { result: data }, 60000);
const value = await cache.get('key');
await cache.del('key');
```

### Redis Cache

```typescript
import Redis from 'ioredis';
import { RedisCache } from '@includekit/core';

const redis = new Redis();
const cache = new RedisCache({
  client: redis,
  prefix: 'ik:', // Key prefix (default: "ik:")
  defaultTtlMs: 300000, // Default TTL (default: 5 minutes)
});

// Error handling: All errors are logged but not thrown
// - get() returns undefined on error (cache miss)
// - set() silently fails on error
// - del() silently fails on error
```

## API Reference

### Engine Interface

```typescript
interface Engine {
  version(): Promise<{ core: string; contract: string; abi: string }>;
  setSchema(schema: AppSchema): Promise<void>;
  computeShapeId(statement: Statement): Promise<{ shapeId: string }>;
  addQuery(input: {
    shape: Statement;
    resultHint?: Record<string, any[]>;
  }): Promise<{ shapeId: string; dependencies: Dependencies }>;
  invalidate(mutation: Mutation): Promise<{ evict: string[] }>;
  explainInvalidation(input: {
    mutation: Mutation;
    shapeId: string;
  }): Promise<{ invalidate: boolean; reasons: string[] }>;
  reset(): Promise<void>;
}
```

### Cache Interface

```typescript
interface Cache<V> {
  get(key: string): Promise<V | undefined>;
  set(key: string, value: V, ttlMs: number): Promise<void>;
  del(key: string): Promise<void>;
}
```

### Types

```typescript
interface Statement {
  model: string;
  select?: string[] | null;
  where?: Filter | null;
  orderBy?: OrderBy[] | null;
  pagination?: Pagination | null;
  include?: Include[] | null;
  distinct?: string[] | null;
  groupBy?: GroupBy | null;
}

interface Mutation {
  changes: Change[];
}

interface AppSchema {
  version: number;
  models: Array<{
    name: string;
    id: {
      kind: 'string' | 'composite';
      fields?: string[];
    };
    relations?: Array<{
      name: string;
      model: string;
      cardinality: 'one-to-many' | 'many-to-one' | 'many-to-many';
      foreignKey?: string;
    }>;
  }>;
}
```

## WASM Engine Details

### Status Codes

The engine returns status codes for all operations:

- `0` - OK
- `1` - ABI_MISMATCH
- `2` - CONTRACT_VERSION_MISMATCH
- `3` - SCHEMA_INVALID
- `4` - QUERY_INVALID
- `5` - RESULT_SHAPE_MISMATCH
- `6` - MUTATION_INVALID
- `7` - UNSUPPORTED_OPERATOR
- `8` - ENGINE_STATE
- `255` - INTERNAL

### Error Handling

Errors are automatically mapped and thrown as JavaScript errors:

```typescript
try {
  await engine.setSchema(invalidSchema);
} catch (error) {
  console.error(error.message); // "[SCHEMA_INVALID] model name cannot be empty"
}
```

## Testing

The package provides `EngineMock` for testing (re-exported from `@includekit/spec-testkit`):

```typescript
import { EngineMock } from '@includekit/core';

const mockEngine = new EngineMock();
// Use in tests
```

## License

MIT
