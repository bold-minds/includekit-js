# Contributing to IncludeKit JS/TS SDK

Thank you for your interest in contributing! This document provides guidelines for contributing to the IncludeKit SDK.

## Development Setup

### Prerequisites

- Node.js v20.x (LTS) or v22.11+
- pnpm v8+
- Git

### Getting Started

1. Fork and clone the repository:
```bash
git clone https://github.com/your-username/includekit-js.git
cd includekit-js
```

2. Install dependencies:
```bash
pnpm install
```

3. Build all packages:
```bash
pnpm build
```

4. Run tests:
```bash
pnpm test
```

## Project Structure

```
includekit-js/
├── packages/
│   ├── core/              # WASM engine + cache adapters
│   ├── orchestrator/      # ORM-agnostic coordination
│   ├── prisma-mapper/     # Prisma-specific mapping
│   └── prisma/            # Integration package
├── examples/
│   └── prisma/            # Example application
└── .github/
    └── workflows/         # CI configuration
```

## Development Workflow

### Making Changes

1. Create a feature branch:
```bash
git checkout -b feature/your-feature-name
```

2. Make your changes following our coding standards (see below)

3. Add tests for new functionality

4. Ensure all tests pass:
```bash
pnpm test
```

5. Lint your code:
```bash
pnpm lint
```

6. Build to verify no type errors:
```bash
pnpm build
```

### Coding Standards

- **TypeScript**: Use strict mode, avoid `any` except where necessary
- **Formatting**: Prettier (2 spaces, single quotes)
- **Naming**: 
  - camelCase for variables and functions
  - PascalCase for classes and types
  - UPPER_SNAKE_CASE for constants
- **Comments**: JSDoc for public APIs, inline comments for complex logic
- **Imports**: Organize imports (types first, then dependencies, then local)

### Testing

- Write tests for all new functionality
- Maintain >80% code coverage
- Use descriptive test names: `should <expected behavior> when <condition>`
- Place tests next to source files with `.test.ts` suffix

Example:
```typescript
// packages/core/src/cache/memory.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MemoryLRU } from './memory';

describe('MemoryLRU', () => {
  let cache: MemoryLRU<any>;

  beforeEach(() => {
    cache = new MemoryLRU({ maxItems: 100 });
  });

  afterEach(() => {
    cache.destroy();
  });

  it('should store and retrieve values', async () => {
    await cache.set('key', { data: 'value' }, 1000);
    const result = await cache.get('key');
    expect(result).toEqual({ data: 'value' });
  });

  it('should return undefined for non-existent keys', async () => {
    const result = await cache.get('missing');
    expect(result).toBeUndefined();
  });
});
```

### Documentation

- Update relevant README files for API changes
- Add JSDoc comments for public APIs
- Update ARCHITECTURE.md for design changes
- Include examples in package READMEs

## Pull Request Process

1. **Before submitting:**
   - Ensure all tests pass
   - Update documentation
   - Add changeset if needed (for releases)
   - Rebase on latest main

2. **PR Description should include:**
   - What changes were made
   - Why they were necessary
   - How to test the changes
   - Any breaking changes

3. **PR Review:**
   - At least one maintainer approval required
   - All CI checks must pass
   - Address review feedback

4. **After merge:**
   - Delete your feature branch
   - Pull latest main

## Adding a New ORM

To add support for a new ORM (e.g., Drizzle):

1. **Create mapper package** (`packages/drizzle-mapper/`):
   - Implement `ORMMapper` interface
   - Map ORM args → Statement/Mutation
   - Add ORM interception logic

2. **Create integration package** (`packages/drizzle/`):
   - Thin wrapper using orchestrator + mapper
   - Handle ORM-specific transaction wrapping
   - Export convenience functions

3. **Add tests:**
   - Mapper unit tests
   - Integration tests with real ORM
   - Acceptance tests

4. **Documentation:**
   - Package README
   - Usage examples
   - Update main README

## Acceptance Criteria

All PRs must pass these acceptance tests:

1. **Cache hit** - Second identical query uses cache
2. **Filter crossing** - Update moving record between filters evicts
3. **Relation invalidation** - Relation changes evict dependent queries
4. **OrderBy boundary** - Updates affecting order evict sorted queries
5. **Transaction rollback** - Failed transactions don't evict cache
6. **Transaction commit** - Successful transactions apply evictions
7. **Schema reload** - Schema changes clear engine and cache
8. **MemoryLRU limit** - Exceeding maxItems triggers LRU eviction
9. **Redis TTL** - Entries expire after TTL
10. **Partial schema** - Unknown query fields fail, unknown mutation fields ignored

## Release Process

Releases are handled by maintainers:

1. Version bump via changesets
2. Update CHANGELOG.md
3. Tag release
4. Publish to npm
5. Create GitHub release

## Getting Help

- **Questions**: Open a discussion
- **Bugs**: Open an issue with reproduction
- **Features**: Open an issue for discussion first

## Code of Conduct

- Be respectful and inclusive
- Provide constructive feedback
- Focus on code quality and clarity
- Help others learn and grow

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
