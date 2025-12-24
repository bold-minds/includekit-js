/**
 * @includekit/prisma
 * 
 * Main integration package for Prisma ORM with IncludeKit caching
 */

// Main integration function
export { withIncludeKit } from './integration';
export type { IncludeKitPrismaOptions, IncludeKitDiagnostics } from './integration';

// Re-export core types for convenience
export type {
  Cache,
  CacheValue,
  Engine,
  AppSchema,
  Statement,
  Mutation,
  InsightsEvent,
} from '@includekit/core';

// Re-export cache implementations
export { MemoryLRU, RedisCache } from '@includekit/core';
export type { MemoryLRUConfig, RedisCacheConfig } from '@includekit/core';
