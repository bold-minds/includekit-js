import { withORM, loadSchema, type SchemaConfig } from '@includekit/orchestrator';
import type { Engine, Cache, InsightsEvent } from '@includekit/core';
import { PrismaMapper } from '@includekit/prisma-mapper';

export interface IncludeKitPrismaOptions {
  schema: SchemaConfig;
  cache: Cache<any>;
  engine?: Engine;
  defaultTtlMs?: number;
  insights?: {
    emit?: (event: InsightsEvent) => void;
  };
}

export interface IncludeKitDiagnostics {
  getVersion(): Promise<{ core: string; contract: string; abi: string }>;
  getCacheStats(): { size: number; hitRate: number };
  reset(): Promise<void>;
  destroy(): Promise<void>;
}

/**
 * Extend Prisma client with IncludeKit caching
 * 
 * @param prisma - Prisma client instance
 * @param options - IncludeKit configuration
 * @returns Extended Prisma client with caching and $includeKit diagnostics
 */
export async function withIncludeKit<T extends { $extends: any; $transaction: any }>(
  prisma: T,
  options: IncludeKitPrismaOptions
): Promise<T & { $includeKit: IncludeKitDiagnostics }> {
  // Load schema
  const schema = await loadSchema(options.schema);

  // Create Prisma mapper
  const mapper = new PrismaMapper(schema);

  // Get orchestrator + mapper extended client
  const extended = await withORM(prisma, {
    ...options,
    schema: options.schema,
    mapper,
  });

  // Get internal methods from extended client
  const initTx = (extended as any).__includekit_initTransaction;
  const commitTx = (extended as any).__includekit_commitTransaction;
  const rollbackTx = (extended as any).__includekit_rollbackTransaction;
  const getCacheStats = (extended as any).__includekit_getCacheStats;
  const getEngine = (extended as any).__includekit_getEngine;

  // Create diagnostics API
  const diagnostics: IncludeKitDiagnostics = {
    getVersion: async () => {
      const engine = getEngine();
      return engine.version();
    },
    getCacheStats: () => getCacheStats(),
    reset: async () => {
      const engine = getEngine();
      await engine.reset();
      // Clear cache as well
      if ('clear' in options.cache && typeof options.cache.clear === 'function') {
        await options.cache.clear();
      }
    },
    destroy: async () => {
      // Cleanup resources
      if ('destroy' in options.cache && typeof (options.cache as any).destroy === 'function') {
        (options.cache as any).destroy();
      }
    },
  };

  // Wrap $transaction to handle commit/rollback
  // NOTE: Can't use extensions.client to override $transaction, use Proxy instead
  return new Proxy(extended, {
    get(target, prop) {
      if (prop === '$includeKit') {
        return diagnostics;
      }

      if (prop === '$transaction') {
        return async (arg: any, options?: any) => {
          if (typeof arg === 'function') {
            // Interactive transaction: wrap callback
            return (target as any).$transaction(async (tx: any) => {
              // Initialize transaction tracking BEFORE user callback
              initTx(tx);

              try {
                const result = await arg(tx);
                // On success: commit collected evictions
                await commitTx(tx);
                return result;
              } catch (error) {
                // On failure: rollback (discard evictions)
                await rollbackTx(tx);
                throw error;
              }
            }, options);
          } else {
            // Batch transaction: operations use base client, evict immediately
            // (Prisma batch transactions don't provide a tx client to operations)
            return (target as any).$transaction(arg, options);
          }
        };
      }

      return (target as any)[prop];
    },
  }) as T & { $includeKit: IncludeKitDiagnostics };
}
