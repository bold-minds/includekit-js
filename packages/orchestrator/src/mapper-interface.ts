import type { Statement, Mutation } from '@includekit/core';
import type { CachingService } from './types';

/**
 * ORM Mapper interface
 * Provides ORM-specific translation logic
 */
export interface ORMMapper<TClient, TArgs, TResult> {
  /**
   * Build Statement from ORM query args
   */
  buildStatement(params: {
    model: string;
    operation: 'findUnique' | 'findFirst' | 'findMany';
    args: TArgs;
  }): Statement;

  /**
   * Build Mutation from ORM write args
   */
  buildMutation(params: {
    model: string;
    operation:
      | 'create'
      | 'update'
      | 'delete'
      | 'createMany'
      | 'updateMany'
      | 'deleteMany'
      | 'upsert';
    args: TArgs;
  }): Mutation;

  /**
   * Extend client with caching integration
   * Returns a new client instance with interception logic
   */
  extendClient(client: TClient, cachingService: CachingService): TClient;
}
