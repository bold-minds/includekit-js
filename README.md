# IncludeKit JS/TS SDK

Production-ready TypeScript SDK for [IncludeKit](https://includekit.com) - intelligent caching with automatic invalidation for Prisma and other ORMs.

## Features

- ✅ **Automatic invalidation** - Writes intelligently evict affected cached queries
- ✅ **Prisma integration** - Drop-in wrapper using Client Extensions
- ✅ **Transaction support** - Evictions deferred until commit
- ✅ **ORM-agnostic architecture** - Easy to add Drizzle, TypeORM, etc.
- ✅ **Multiple cache backends** - In-memory LRU, Redis, or custom
- ✅ **WASM engine** - Stateful dependency tracking (engine maintains source of truth)
- ✅ **TypeScript** - Full type safety
- ✅ **Production ready** - Comprehensive tests, error handling, diagnostics

## Packages

This is a monorepo with 4 packages:

| Package | Description |
|---------|-------------|
| `@includekit/core` | WASM engine loader + cache adapters (ORM-agnostic) |
| `@includekit/orchestrator` | Coordination layer: cache, eviction, singleflight (ORM-agnostic) |
| `@includekit/prisma-mapper` | Prisma-specific Statement/Mutation mapping |
| `@includekit/prisma` | **Main integration package** (orchestrator + prisma-mapper) |

## Quick Start

### Installation

```bash
pnpm add @includekit/prisma
# or: npm install @includekit/prisma
# or: yarn add @includekit/prisma
```

### Basic Usage

```typescript
import { PrismaClient } from '@prisma/client';
import { withIncludeKit, MemoryLRU } from '@includekit/prisma';

// Initialize Prisma
const prisma = new PrismaClient();

// Wrap with IncludeKit
const cachedPrisma = await withIncludeKit(prisma, {
  schema: {
    file: './includekit-schema.json', // Your IncludeKit schema
  },
  cache: new MemoryLRU({
    maxItems: 10000,
    defaultTtlMs: 300000, // 5 minutes
  }),
});

// Use normally - reads are automatically cached
const users = await cachedPrisma.user.findMany({
  include: { posts: true },
});

// Writes automatically invalidate affected queries
await cachedPrisma.post.create({
  data: { title: 'New Post', authorId: users[0].id },
});

// Diagnostics
const stats = cachedPrisma.$includeKit.getCacheStats();
console.log(`Cache hit rate: ${(stats.hitRate * 100).toFixed(1)}%`);
```

### With Redis

```typescript
import Redis from 'ioredis';
import { RedisCache } from '@includekit/prisma';

const redis = new Redis();
const cache = new RedisCache({
  client: redis,
  prefix: 'ik:',
  defaultTtlMs: 300000,
});

const cachedPrisma = await withIncludeKit(prisma, {
  schema: { file: './includekit-schema.json' },
  cache,
});
```

## Schema Definition

IncludeKit requires a schema that describes your models and relations:

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

**Note:** You only need to include models you want to cache. Partial schemas are supported!

## Documentation

- **[Architecture](./ARCHITECTURE.md)** - Design decisions and internals
- **[Testing](./TESTING.md)** - Test strategy and acceptance criteria
- **[Caching Guide](./CACHING.md)** - Cache backends and configuration
- **[Schema Documentation](./SCHEMA-LOAD.md)** - Schema format and validation
- **[SDK API Reference](./SDK-API.md)** - Complete API documentation

### Package Documentation

- [`@includekit/core`](./packages/core/README.md)
- [`@includekit/orchestrator`](./packages/orchestrator/README.md)
- [`@includekit/prisma-mapper`](./packages/prisma-mapper/README.md)
- [`@includekit/prisma`](./packages/prisma/README.md)

## Examples

See [`examples/prisma`](./examples/prisma) for a complete working example with:
- Cache hits and misses
- Automatic invalidation
- Transaction support
- Diagnostics API

## Requirements

- **Node.js**: v20.x (LTS) or v22.11+ (Prisma v6 required for Node 22)
- **Prisma**: v5.9 – v6.latest
- **TypeScript**: v5.3+

## Development

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run tests
pnpm test

# Run linter
pnpm lint

# Run example
cd examples/prisma
pnpm prisma:generate
pnpm prisma:push
pnpm prisma:seed
pnpm dev
```

## Architecture Highlights

### ORM-Agnostic Design

The SDK is designed to support multiple ORMs. To add a new ORM:

1. Create `@includekit/YOUR_ORM-mapper` implementing `ORMMapper` interface
2. Create `@includekit/YOUR_ORM` thin wrapper
3. **Reuse 100% of orchestration logic** (caching, eviction, singleflight)

### Stateful Engine

The WASM engine **tracks all queries internally**. The SDK never maintains dependency maps:

- **SDK stores**: Query results (in cache)
- **Engine stores**: Dependencies, filter conditions, query metadata
- **Invalidation**: Engine computes eviction list; SDK applies it

### Transaction Handling

Uses WeakMap + Proxy pattern for transaction-local eviction tracking:

- Evictions collected during transaction
- Applied atomically on commit
- Discarded on rollback
- No memory leaks (WeakMap auto-cleanup)

## Contributing

This SDK follows the IncludeKit contract specification. See [Engine ABI](./ENGINE-ABI.md) for WASM interface details.

## License

MIT
