# @includekit/prisma

Official Prisma integration for IncludeKit - intelligent caching with automatic invalidation.

## Installation

```bash
pnpm add @includekit/prisma
# or: npm install @includekit/prisma
# or: yarn add @includekit/prisma
```

## Quick Start

```typescript
import { PrismaClient } from '@prisma/client';
import { withIncludeKit, MemoryLRU } from '@includekit/prisma';

// Initialize Prisma
const prisma = new PrismaClient();

// Wrap with IncludeKit
const cachedPrisma = await withIncludeKit(prisma, {
  schema: {
    file: './includekit-schema.json',
  },
  cache: new MemoryLRU({
    maxItems: 10000,
    defaultTtlMs: 300000, // 5 minutes
  }),
});

// Use normally - reads are cached, writes invalidate automatically
const users = await cachedPrisma.user.findMany({ include: { posts: true } });
await cachedPrisma.post.create({ data: { title: 'Hello', authorId: users[0].id } });
```

## Features

- ✅ **Automatic caching** - All read operations cached by default
- ✅ **Automatic invalidation** - Writes intelligently evict affected queries
- ✅ **Transaction support** - Evictions deferred until commit
- ✅ **Full Prisma API** - All operations supported (findMany, create, update, etc.)
- ✅ **Nested operations** - Nested creates, updates, relation operations
- ✅ **Type safe** - Full TypeScript support
- ✅ **Diagnostics** - Built-in monitoring via `$includeKit` API

## Configuration

### Options

```typescript
interface IncludeKitPrismaOptions {
  // Schema configuration (required)
  schema: {
    file?: string; // Path to schema JSON file
    json?: AppSchema; // Inline schema object
  };

  // Cache adapter (required)
  cache: Cache<any>;

  // Optional: Pre-loaded engine
  engine?: Engine;

  // Optional: Default TTL for cache entries (default: 300000 = 5 minutes)
  defaultTtlMs?: number;

  // Optional: Insights telemetry
  insights?: {
    emit?: (event: InsightsEvent) => void;
  };
}
```

### Cache Adapters

#### Memory Cache (Development/Testing)

```typescript
import { MemoryLRU } from '@includekit/prisma';

const cache = new MemoryLRU({
  maxItems: 10000, // LRU limit
  defaultTtlMs: 300000, // 5 minutes
  enableBackgroundCleanup: true, // Clean expired entries
  cleanupIntervalMs: 60000, // 1 minute
});
```

#### Redis Cache (Production)

```typescript
import Redis from 'ioredis';
import { RedisCache } from '@includekit/prisma';

const redis = new Redis();
const cache = new RedisCache({
  client: redis,
  prefix: 'ik:', // Key prefix
  defaultTtlMs: 300000,
});
```

## Schema Definition

Create an IncludeKit schema describing your models:

```json
{
  "version": 1,
  "models": [
    {
      "name": "User",
      "id": { "kind": "string" },
      "relations": [
        { "name": "posts", "model": "Post", "cardinality": "one-to-many" }
      ]
    },
    {
      "name": "Post",
      "id": { "kind": "string" },
      "relations": [
        {
          "name": "author",
          "model": "User",
          "cardinality": "many-to-one",
          "foreignKey": "authorId"
        }
      ]
    }
  ]
}
```

**Notes:**
- Partial schemas are supported - only include models you want to cache
- Use `kind: "composite"` for composite primary keys with `fields: ["field1", "field2"]`
- `foreignKey` is optional (defaults to `{relationName}Id`)

## Usage Examples

### Basic Queries

```typescript
// Cache miss - executes DB query
const users1 = await prisma.user.findMany();

// Cache hit - returns cached result
const users2 = await prisma.user.findMany();

// Different query - cache miss
const active = await prisma.user.findMany({ where: { active: true } });
```

### Nested Includes

```typescript
const users = await prisma.user.findMany({
  include: {
    posts: {
      where: { published: true },
      include: {
        tags: true,
      },
    },
  },
});
```

### Writes & Invalidation

```typescript
// Create - invalidates affected queries
await prisma.post.create({
  data: {
    title: 'New Post',
    author: { connect: { id: userId } },
  },
});

// Update - invalidates affected queries
await prisma.user.update({
  where: { id: userId },
  data: { name: 'Updated Name' },
});

// Delete - invalidates affected queries
await prisma.post.delete({ where: { id: postId } });
```

### Transactions

```typescript
// Evictions are deferred until commit
await prisma.$transaction(async (tx) => {
  const user = await tx.user.create({
    data: { name: 'Alice', email: 'alice@example.com' },
  });

  await tx.post.create({
    data: { title: 'First Post', authorId: user.id },
  });

  // Evictions applied here (on successful commit)
});

// On rollback, evictions are discarded
```

### Nested Operations

```typescript
// Nested create
await prisma.post.create({
  data: {
    title: 'Post',
    author: {
      create: { name: 'Alice', email: 'alice@example.com' },
    },
    tags: {
      connect: [{ id: 'tag-1' }],
      create: [{ name: 'New Tag' }],
    },
  },
});

// Nested update
await prisma.post.update({
  where: { id: postId },
  data: {
    author: {
      update: { name: 'Bob' },
    },
    tags: {
      disconnect: [{ id: 'tag-1' }],
      connect: [{ id: 'tag-2' }],
    },
  },
});
```

## Diagnostics API

### Get Version Info

```typescript
const version = await prisma.$includeKit.getVersion();
console.log(version);
// { core: "0.1.0", contract: "1.0", abi: "1.0" }
```

### Get Cache Stats

```typescript
const stats = prisma.$includeKit.getCacheStats();
console.log(stats);
// { size: 1234, hitRate: 0.87 }
```

### Reset Engine

```typescript
// Clear all tracked queries in engine
await prisma.$includeKit.reset();
```

## Insights Events

Monitor cache behavior:

```typescript
const prisma = await withIncludeKit(new PrismaClient(), {
  cache,
  schema: { file: './schema.json' },
  insights: {
    emit: (event) => {
      console.log({
        type: event.eventType, // 'hit' | 'miss' | 'evict'
        shapeId: event.shapeId,
        timestamp: event.timestamp,
      });

      if (event.eventType === 'miss') {
        console.log('Dependencies:', event.dependenciesSummary);
      }
    },
  },
});
```

## Compatibility

- **Prisma**: v5.9 – v6.latest
- **Node.js**: v20.x (LTS) or v22.11+
- **TypeScript**: v5.3+

**Important:**
- Uses Prisma Client Extensions (Prisma 4.16+)
- **NOT** using `$use()` middleware (removed in Prisma 6.14.0)

## Advanced Usage

### Custom Engine

```typescript
import { loadEngine } from '@includekit/prisma';

const engine = await loadEngine('./custom/path/to/core.wasm');

const prisma = await withIncludeKit(new PrismaClient(), {
  engine, // Use pre-loaded engine
  cache,
  schema: { file: './schema.json' },
});
```

### Custom Cache Adapter

```typescript
import { Cache } from '@includekit/prisma';

class MyCacheAdapter implements Cache<any> {
  async get(key: string) {
    /* ... */
  }
  async set(key: string, value: any, ttlMs: number) {
    /* ... */
  }
  async del(key: string) {
    /* ... */
  }
}

const prisma = await withIncludeKit(new PrismaClient(), {
  cache: new MyCacheAdapter(),
  schema: { file: './schema.json' },
});
```

## Troubleshooting

### WASM Not Found

If you get "Failed to load WASM", ensure the WASM binary is available:

```typescript
// Option 1: Provide path to WASM file
const engine = await loadEngine('./path/to/core.wasm');

// Option 2: Use fetcher function
const engine = await loadEngine(async () => {
  const response = await fetch('https://cdn.example.com/core.wasm');
  return response.arrayBuffer();
});
```

### Schema Validation Errors

Common schema errors:

- **Missing version**: Ensure `"version": 1` is present
- **Empty models**: Provide at least one model
- **Missing id config**: Each model needs `id: { kind: "string" | "composite" }`
- **Composite ID without fields**: Include `fields: ["field1", "field2"]`

### Type Errors

Ensure your Prisma client is generated and up-to-date:

```bash
pnpm prisma generate
```

## Examples

See [`examples/prisma`](../../examples/prisma) for a complete working example.

## License

MIT
