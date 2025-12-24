import type { Statement, Mutation } from '@includekit/core';

/**
 * Caching service interface
 * Encapsulates all cache coordination logic
 */
export interface CachingService {
  /**
   * Execute a read operation with caching
   * - Checks cache first
   * - Calls execute() on miss
   * - Tracks in engine
   * - Stores in cache
   * - Handles singleflight
   */
  executeRead<T>(params: {
    statement: Statement;
    execute: () => Promise<T>;
    resultHint?: Record<string, any[]>;
  }): Promise<T>;

  /**
   * Execute a write operation with invalidation
   * - Calls execute() first (DB write)
   * - Gets eviction list from engine
   * - Handles transaction-local tracking or immediate eviction
   */
  executeWrite<T>(params: {
    mutation: Mutation;
    execute: () => Promise<T>;
    txContext?: any; // For transaction-local eviction tracking
  }): Promise<T>;

  /**
   * Commit transaction evictions
   * - Applies all collected evictions for this transaction
   */
  commitTransaction(txContext: any): Promise<void>;

  /**
   * Rollback transaction evictions
   * - Discards collected evictions without applying
   */
  rollbackTransaction(txContext: any): Promise<void>;
}
