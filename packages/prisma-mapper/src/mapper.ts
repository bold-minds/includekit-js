import type { Statement, Mutation, AppSchema } from '@includekit/core';
import type { ORMMapper, CachingService } from '@includekit/orchestrator';
import { StatementBuilder } from './statement-builder';
import { MutationBuilder } from './mutation-builder';

/**
 * Prisma ORM mapper implementation
 */
export class PrismaMapper implements ORMMapper<any, any, any> {
  private statementBuilder: StatementBuilder;
  private mutationBuilder: MutationBuilder;

  constructor(private schema: AppSchema) {
    this.statementBuilder = new StatementBuilder();
    this.mutationBuilder = new MutationBuilder(schema);
  }

  buildStatement(params: {
    model: string;
    operation: 'findUnique' | 'findFirst' | 'findMany';
    args: any;
  }): Statement {
    return this.statementBuilder.buildStatement(params);
  }

  buildMutation(params: {
    model: string;
    operation: string;
    args: any;
  }): Mutation {
    return this.mutationBuilder.buildMutation(params);
  }

  extendClient(client: any, cachingService: CachingService): any {
    const self = this;

    // Use Prisma Client Extensions to intercept operations
    return client.$extends({
      query: {
        $allModels: {
          // Read operations
          async findMany(this: any, { model, operation, args, query }: any) {
            // 1. Build statement (mapper's job)
            const statement = self.buildStatement({ model, operation, args });

            // 2. Use orchestrator's caching service
            return cachingService.executeRead({
              statement,
              execute: () => query(args), // Provide DB execution function
              resultHint: undefined,
            });
          },

          async findFirst(this: any, { model, operation, args, query }: any) {
            const statement = self.buildStatement({ model, operation, args });
            return cachingService.executeRead({
              statement,
              execute: () => query(args),
            });
          },

          async findUnique(this: any, { model, operation, args, query }: any) {
            const statement = self.buildStatement({ model, operation, args });
            return cachingService.executeRead({
              statement,
              execute: () => query(args),
            });
          },

          // Write operations
          async create(this: any, { model, operation, args, query }: any) {
            // 1. Build mutation (mapper's job)
            const mutation = self.buildMutation({ model, operation, args });

            // 2. Use 'this' as transaction context
            const txContext = this;

            // 3. Use orchestrator's write service
            return cachingService.executeWrite({
              mutation,
              execute: () => query(args),
              txContext, // Always pass; orchestrator determines if it's tracking
            });
          },

          async update(this: any, { model, operation, args, query }: any) {
            const mutation = self.buildMutation({ model, operation, args });
            const txContext = this;

            return cachingService.executeWrite({
              mutation,
              execute: () => query(args),
              txContext,
            });
          },

          async delete(this: any, { model, operation, args, query }: any) {
            const mutation = self.buildMutation({ model, operation, args });
            const txContext = this;

            return cachingService.executeWrite({
              mutation,
              execute: () => query(args),
              txContext,
            });
          },

          async createMany(this: any, { model, operation, args, query }: any) {
            const mutation = self.buildMutation({ model, operation, args });
            const txContext = this;

            return cachingService.executeWrite({
              mutation,
              execute: () => query(args),
              txContext,
            });
          },

          async updateMany(this: any, { model, operation, args, query }: any) {
            const mutation = self.buildMutation({ model, operation, args });
            const txContext = this;

            return cachingService.executeWrite({
              mutation,
              execute: () => query(args),
              txContext,
            });
          },

          async deleteMany(this: any, { model, operation, args, query }: any) {
            const mutation = self.buildMutation({ model, operation, args });
            const txContext = this;

            return cachingService.executeWrite({
              mutation,
              execute: () => query(args),
              txContext,
            });
          },

          async upsert(this: any, { model, operation, args, query }: any) {
            const mutation = self.buildMutation({ model, operation, args });
            const txContext = this;

            return cachingService.executeWrite({
              mutation,
              execute: () => query(args),
              txContext,
            });
          },
        },
      },
    });
  }
}
