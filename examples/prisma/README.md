# IncludeKit Prisma Example

This example demonstrates how to use IncludeKit with Prisma ORM.

## Setup

1. Install dependencies:
```bash
pnpm install
```

2. Generate Prisma client:
```bash
pnpm prisma:generate
```

3. Push schema to database:
```bash
pnpm prisma:push
```

4. Seed the database:
```bash
pnpm prisma:seed
```

## Run

```bash
pnpm dev
```

## What it demonstrates

- Cache hits and misses
- Automatic invalidation on writes
- Transaction support
- Diagnostics API
- Insights events

## Schema

The example uses a simple blog schema:
- **User** - has many posts
- **Post** - belongs to user, has many tags
- **Tag** - has many posts (many-to-many)
