import { loadEngine, type Engine, type Cache, type InsightsEvent } from '@includekit/core';
import { loadSchema, type SchemaConfig } from './schema';
import type { CachingService } from './types';
import type { ORMMapper } from './mapper-interface';

export interface OrchestratorOptions<TClient> {
  schema: SchemaConfig;
  cache: Cache<any>;
  defaultTtlMs?: number; // Default: 300000 (5 minutes)
  singleflightTimeoutMs?: number; // Default: 30000 (30 seconds)
  engine?: Engine;
  mapper: ORMMapper<TClient, any, any>;
  insights?: {
    emit?: (event: InsightsEvent) => void;
  };
}

/**
 * Extend ORM client with IncludeKit caching
 * 
 * This is the core orchestrator that:
 * - Loads schema and initializes engine
 * - Creates caching service (coordination layer)
 * - Uses mapper to extend the client
 * - Exposes transaction and diagnostic methods
 */
export async function withORM<TClient>(
  client: TClient,
  options: OrchestratorOptions<TClient>
): Promise<TClient> {
  // 1. Load and validate schema
  const schema = await loadSchema(options.schema);

  // 2. Initialize engine
  const engine = options.engine || (await loadEngine('./core.wasm'));
  await engine.setSchema(schema);

  // 3. Setup coordination state
  const inflightRequests = new Map<string, Promise<any>>(); // Singleflight
  const txEvictions = new WeakMap<any, Set<string>>(); // Transaction-local evictions

  // Cache stats tracking
  let totalRequests = 0;
  let cacheHits = 0;

  const defaultTtlMs = options.defaultTtlMs ?? 300000;
  const singleflightTimeout = options.singleflightTimeoutMs ?? 30000;

  // 4. Create caching service (orchestrator owns all coordination)
  const cachingService: CachingService = {
    async executeRead<T>({ statement, execute, resultHint }): Promise<T> {
      // Compute shapeId
      const { shapeId } = await engine.computeShapeId(statement);

      // Track request
      totalRequests++;

      // Check cache
      const cached = await options.cache.get(shapeId);
      if (cached) {
        cacheHits++;
        options.insights?.emit?.({
          shapeId,
          eventType: 'hit',
          timestamp: Date.now(),
        });
        return cached.result;
      }

      // Singleflight: check if request is in-flight
      if (inflightRequests.has(shapeId)) {
        return inflightRequests.get(shapeId)!;
      }

      // Execute query (mapper provides this) with timeout protection
      const executePromise = (async () => {
        const result = await execute();

        // Track in engine
        const { dependencies } = await engine.addQuery({
          shape: statement,
          resultHint: resultHint || result,
        });

        // Cache result
        await options.cache.set(shapeId, { result }, defaultTtlMs);

        // Emit miss event with dependencies summary
        if (options.insights?.emit) {
          const modelCount = Object.keys(dependencies.models || {}).length;
          const recordCount = Object.values(dependencies.records || {}).reduce(
            (sum: number, ids) => sum + (Array.isArray(ids) ? ids.length : 0),
            0
          );

          options.insights.emit({
            shapeId,
            eventType: 'miss',
            timestamp: Date.now(),
            dependenciesSummary: {
              modelCount,
              recordCount,
            },
          });
        }

        return result;
      })();

      // Add timeout to prevent memory leaks from hanging promises
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error(`Query timeout after ${singleflightTimeout}ms`)), singleflightTimeout);
      });

      const promise = Promise.race([executePromise, timeoutPromise]);

      inflightRequests.set(shapeId, promise);
      try {
        return await promise;
      } finally {
        inflightRequests.delete(shapeId);
      }
    },

    async executeWrite<T>({ mutation, execute, txContext }): Promise<T> {
      // Get eviction list BEFORE executing write
      const { evict } = await engine.invalidate(mutation);

      // Execute write (mapper provides this)
      let result: T;
      try {
        result = await execute();
      } catch (error) {
        // Write failed - don't evict anything
        throw error;
      }

      // Only evict if write succeeded
      if (txContext && txEvictions.has(txContext)) {
        // In transaction: collect evictions for later
        const pending = txEvictions.get(txContext)!;
        evict.forEach((shapeId) => pending.add(shapeId));
      } else {
        // Not in transaction (or batch transaction): evict immediately
        await Promise.all(
          evict.map((shapeId) => options.cache.del(shapeId))
        );
        evict.forEach((shapeId) => {
          options.insights?.emit?.({
            shapeId,
            eventType: 'evict',
            timestamp: Date.now(),
          });
        });
      }

      return result;
    },

    async commitTransaction(txContext: any): Promise<void> {
      const pending = txEvictions.get(txContext);
      if (pending) {
        await Promise.all(
          Array.from(pending).map((shapeId) => options.cache.del(shapeId))
        );
        pending.forEach((shapeId) => {
          options.insights?.emit?.({
            shapeId,
            eventType: 'evict',
            timestamp: Date.now(),
          });
        });
        txEvictions.delete(txContext);
      }
    },

    async rollbackTransaction(txContext: any): Promise<void> {
      // Just discard collected evictions
      txEvictions.delete(txContext);
    },
  };

  // 5. Extend client via mapper (mapper uses caching service)
  const extendedClient = options.mapper.extendClient(client, cachingService);

  // 6. Return extended client with transaction methods and diagnostics exposed
  return Object.assign(extendedClient as any, {
    __includekit_initTransaction: (txContext: any) => {
      txEvictions.set(txContext, new Set());
    },
    __includekit_commitTransaction: cachingService.commitTransaction,
    __includekit_rollbackTransaction: cachingService.rollbackTransaction,
    __includekit_getCacheStats: () => {
      // Get actual size from cache if available, otherwise use tracked size
      const actualSize = options.cache.size?.() ?? 0;
      return {
        size: actualSize,
        hitRate: totalRequests > 0 ? cacheHits / totalRequests : 0,
      };
    },
    __includekit_getEngine: () => engine,
  }) as TClient;
}
