# @includekit/prisma-mapper

Prisma-specific mapping logic for IncludeKit - translates Prisma query arguments to IncludeKit Statements and Mutations.

## Installation

```bash
pnpm add @includekit/prisma-mapper @includekit/orchestrator @includekit/core
```

## Overview

This package implements the `ORMMapper` interface for Prisma ORM:

- **StatementBuilder** - Maps Prisma query args → IncludeKit Statement
- **MutationBuilder** - Maps Prisma write args → IncludeKit Mutation
- **PrismaMapper** - Integrates with Prisma Client Extensions

## Usage

```typescript
import { PrismaMapper } from '@includekit/prisma-mapper';
import { withORM } from '@includekit/orchestrator';

const schema = {
  version: 1,
  models: [
    /* ... */
  ],
};

const mapper = new PrismaMapper(schema);
const cachedPrisma = await withORM(prisma, {
  mapper,
  cache,
  schema: { json: schema },
});
```

**Note:** You typically won't use this package directly. Use `@includekit/prisma` instead, which wraps this mapper for you.

## Features

### Operator Mapping

The mapper supports all Prisma operators with precise invalidation:

#### Supported Operators

```typescript
// Comparison
equals, not, in, notIn, lt, lte, gt, gte

// String
contains, startsWith, endsWith

// Array
has, hasEvery, hasSome

// Null checks
isNull, isSet
```

#### JSON Path Queries

```typescript
// Prisma
await prisma.user.findMany({
  where: {
    meta: {
      path: ['settings', 'theme'],
      equals: 'dark',
    },
  },
});

// Mapped to:
{
  field: 'meta',
  field_path: ['settings', 'theme'],
  op: 'eq',
  value: 'dark'
}
```

#### Unsupported Operators

Operators not yet supported use conservative invalidation:

```typescript
// Full-text search
search: 'unsupported:search';

// Any unknown operator
unknownOp: 'unknown:unknownOp';
```

**Behavior:** Queries always work. Unknown operators trigger conservative invalidation (any mutation to the model invalidates ALL queries using that operator).

### Nested Operations

The mapper fully supports nested operations:

#### Nested Create

```typescript
await prisma.post.create({
  data: {
    title: 'Post',
    author: {
      create: { name: 'Alice' },
    },
  },
});

// Generates:
// - Change 1: { action: 'insert', model: 'User', sets: { name: 'Alice' } }
// - Change 2: { action: 'insert', model: 'Post', sets: { title: 'Post' } }
// - Change 3: { action: 'link', model: 'Post', relation: 'author', ... }
```

#### Nested Update/Upsert

```typescript
await prisma.post.update({
  where: { id },
  data: {
    title: 'Updated',
    author: {
      update: { name: 'Bob' },
    },
  },
});
```

#### Relation Operations

```typescript
// Connect
connect: { id: 'user-123' };

// Disconnect
disconnect: true;

// Set (replace all)
set: [{ id: 'tag-1' }, { id: 'tag-2' }];

// ConnectOrCreate
connectOrCreate: {
  where: { email },
  create: { email, name },
};
```

### Implicit FK Detection

The mapper detects foreign key field updates:

```typescript
await prisma.post.update({
  where: { id },
  data: {
    authorId: 'new-author-id', // Implicit relation change
  },
});

// Mapped to:
{
  action: 'link',
  model: 'Post',
  relation: 'author',
  targetModel: 'User',
  targetId: 'new-author-id'
}
```

**Requirement:** Schema must include FK info:

```json
{
  "name": "Post",
  "relations": [
    {
      "name": "author",
      "model": "User",
      "cardinality": "many-to-one",
      "foreignKey": "authorId" // Optional: defaults to {name}Id
    }
  ]
}
```

### Include Mapping

The mapper supports nested includes at any depth:

```typescript
await prisma.user.findMany({
  include: {
    posts: {
      where: { published: true },
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: {
        tags: true,
        comments: {
          include: {
            author: true,
          },
        },
      },
    },
  },
});
```

## Prisma Client Extensions

The mapper uses Prisma Client Extensions (not middleware):

```typescript
client.$extends({
  query: {
    $allModels: {
      async findMany({ model, operation, args, query }) {
        // Intercept and cache
      },
      async create({ model, operation, args, query }) {
        // Intercept and invalidate
      },
      // ... all operations
    },
  },
});
```

**Compatibility:**
- ✅ Prisma 4.16+ (Client Extensions introduced)
- ✅ Prisma 5.9+
- ✅ Prisma 6.0+ (including 6.14+ where middleware was removed)

## Supported Operations

### Read Operations

- `findUnique`
- `findFirst`
- `findMany`

### Write Operations

- `create`
- `update`
- `delete`
- `createMany`
- `updateMany`
- `deleteMany`
- `upsert`

## Mapping Internals

### Statement Building

```typescript
// Prisma args
{
  where: { status: 'active', posts: { some: { published: true } } },
  include: { posts: true },
  orderBy: { name: 'asc' },
  take: 10,
  skip: 5
}

// Maps to:
{
  model: 'User',
  where: {
    conditions: [
      { field: 'status', op: 'eq', value: 'active' }
    ]
  },
  include: [
    { relation: 'posts' }
  ],
  orderBy: [
    { field: 'name', direction: 'asc' }
  ],
  pagination: { limit: 10, offset: 5 }
}
```

### Mutation Building

```typescript
// Prisma args
{
  where: { id: '123' },
  data: {
    status: 'archived',
    authorId: '456'
  }
}

// Maps to:
{
  changes: [
    {
      action: 'update',
      model: 'Post',
      where: { conditions: [{ field: 'id', op: 'eq', value: '123' }] },
      sets: { status: 'archived' }
    },
    {
      action: 'link',
      model: 'Post',
      relation: 'author',
      targetModel: 'User',
      targetId: '456'
    }
  ]
}
```

## License

MIT
