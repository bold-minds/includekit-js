import type { Mutation, Change, AppSchema } from '@includekit/core';
import { StatementBuilder } from './statement-builder';

/**
 * Build Mutation from Prisma write args
 */
export class MutationBuilder {
  private statementBuilder: StatementBuilder;

  constructor(private schema: AppSchema) {
    this.statementBuilder = new StatementBuilder();
  }

  buildMutation(params: {
    model: string;
    operation: string;
    args: any;
  }): Mutation {
    const { model, operation, args } = params;
    const changes: Change[] = [];

    switch (operation) {
      case 'create':
        changes.push({
          action: 'insert',
          model,
          sets: this.extractSets(args.data, model),
        });
        // Extract nested operations
        changes.push(...this.extractNestedOperations(model, args.data, 0));
        break;

      case 'update':
        changes.push({
          action: 'update',
          model,
          where: this.statementBuilder['mapWhere'](args.where),
          sets: this.extractSets(args.data, model),
        });
        // Extract nested and relation operations
        changes.push(...this.extractNestedOperations(model, args.data, 0));
        changes.push(...this.extractRelationOperations(model, args.data));
        break;

      case 'delete':
        changes.push({
          action: 'delete',
          model,
          where: this.statementBuilder['mapWhere'](args.where),
        });
        break;

      case 'createMany':
        if (Array.isArray(args.data)) {
          for (const item of args.data) {
            changes.push({
              action: 'insert',
              model,
              sets: this.extractSets(item, model),
            });
          }
        }
        break;

      case 'updateMany':
        changes.push({
          action: 'update',
          model,
          where: this.statementBuilder['mapWhere'](args.where),
          sets: this.extractSets(args.data, model),
        });
        break;

      case 'deleteMany':
        changes.push({
          action: 'delete',
          model,
          where: this.statementBuilder['mapWhere'](args.where),
        });
        break;

      case 'upsert':
        // Upsert generates both insert and update changes
        changes.push({
          action: 'insert',
          model,
          sets: this.extractSets(args.create, model),
        });
        changes.push({
          action: 'update',
          model,
          where: this.statementBuilder['mapWhere'](args.where),
          sets: this.extractSets(args.update, model),
        });
        // Extract nested operations from both create and update
        changes.push(...this.extractNestedOperations(model, args.create, 0));
        changes.push(...this.extractNestedOperations(model, args.update, 0));
        changes.push(...this.extractRelationOperations(model, args.update));
        break;
    }

    return { changes };
  }

  /**
   * Extract simple field sets (non-relation fields)
   */
  private extractSets(data: any, modelName: string): Record<string, any> {
    if (!data || typeof data !== 'object') {
      return {};
    }

    const sets: Record<string, any> = {};

    for (const [field, value] of Object.entries(data)) {
      // Skip nested relation operations
      if (typeof value === 'object' && value !== null) {
        const hasRelationOp =
          'connect' in value ||
          'disconnect' in value ||
          'create' in value ||
          'update' in value ||
          'delete' in value ||
          'set' in value ||
          'connectOrCreate' in value ||
          'createMany' in value ||
          'upsert' in value;

        if (hasRelationOp) {
          continue;
        }
      }

      // Include the field in sets
      sets[field] = value;
    }

    return sets;
  }

  /**
   * Extract nested relation operations (create, update, etc.)
   */
  private extractNestedOperations(
    model: string,
    data: any,
    depth: number = 0,
    maxDepth: number = 10
  ): Change[] {
    if (depth >= maxDepth) {
      console.warn(`Max nesting depth ${maxDepth} reached for model ${model}`);
      return [];
    }

    if (!data || typeof data !== 'object') {
      return [];
    }

    const changes: Change[] = [];
    const modelDef = this.schema.models.find((m) => m.name === model);

    for (const [field, value] of Object.entries(data)) {
      if (typeof value !== 'object' || value === null) {
        continue;
      }

      const relation = modelDef?.relations?.find((r) => r.name === field);
      if (!relation) {
        continue;
      }

      // Handle nested create
      if ('create' in value) {
        const createData = Array.isArray(value.create) ? value.create : [value.create];
        for (const item of createData) {
          changes.push({
            action: 'insert',
            model: relation.model,
            sets: this.extractSets(item, relation.model),
          });
          // Recursively extract nested operations
          changes.push(...this.extractNestedOperations(relation.model, item, depth + 1, maxDepth));
        }
      }

      // Handle nested update
      if ('update' in value) {
        const updateData = Array.isArray(value.update) ? value.update : [value.update];
        for (const item of updateData) {
          changes.push({
            action: 'update',
            model: relation.model,
            where: this.statementBuilder['mapWhere'](item.where),
            sets: this.extractSets(item.data || item, relation.model),
          });
          changes.push(...this.extractNestedOperations(relation.model, item.data || item, depth + 1, maxDepth));
        }
      }

      // Handle nested upsert
      if ('upsert' in value) {
        const upsertData = Array.isArray(value.upsert) ? value.upsert : [value.upsert];
        for (const item of upsertData) {
          changes.push({
            action: 'insert',
            model: relation.model,
            sets: this.extractSets(item.create, relation.model),
          });
          changes.push({
            action: 'update',
            model: relation.model,
            where: this.statementBuilder['mapWhere'](item.where),
            sets: this.extractSets(item.update, relation.model),
          });
        }
      }

      // Handle nested delete
      if ('delete' in value) {
        const deleteData = Array.isArray(value.delete) ? value.delete : [value.delete];
        for (const item of deleteData) {
          changes.push({
            action: 'delete',
            model: relation.model,
            where: typeof item === 'boolean' ? undefined : this.statementBuilder['mapWhere'](item),
          });
        }
      }

      // Handle createMany
      if ('createMany' in value) {
        const createMany = value.createMany as any;
        const items = Array.isArray(createMany?.data) ? createMany.data : [];
        for (const item of items) {
          changes.push({
            action: 'insert',
            model: relation.model,
            sets: this.extractSets(item, relation.model),
          });
        }
      }
    }

    return changes;
  }

  /**
   * Extract relation operations (connect, disconnect, set)
   */
  private extractRelationOperations(model: string, data: any): Change[] {
    if (!data || typeof data !== 'object') {
      return [];
    }

    const changes: Change[] = [];
    const modelDef = this.schema.models.find((m) => m.name === model);

    for (const [field, value] of Object.entries(data)) {
      if (typeof value !== 'object' || value === null) {
        // Check for implicit FK changes
        const relation = modelDef?.relations?.find((r) => {
          const fkField = this.getForeignKeyField(r);
          return field === fkField;
        });

        if (relation) {
          changes.push({
            action: value === null ? 'unlink' : 'link',
            model,
            relation: relation.name,
            targetModel: relation.model,
            targetId: value,
          });
        }
        continue;
      }

      const relation = modelDef?.relations?.find((r) => r.name === field);
      if (!relation) {
        continue;
      }

      // Handle connect
      if ('connect' in value) {
        const connectData = Array.isArray(value.connect) ? value.connect : [value.connect];
        for (const item of connectData) {
          changes.push({
            action: 'link',
            model,
            relation: relation.name,
            targetModel: relation.model,
            targetId: this.extractId(item, relation.model),
          });
        }
      }

      // Handle disconnect
      if ('disconnect' in value) {
        const disconnectData = Array.isArray(value.disconnect)
          ? value.disconnect
          : [value.disconnect];
        for (const item of disconnectData) {
          if (typeof item === 'boolean' && item === true) {
            changes.push({
              action: 'unlink',
              model,
              relation: relation.name,
              targetModel: relation.model,
            });
          } else {
            changes.push({
              action: 'unlink',
              model,
              relation: relation.name,
              targetModel: relation.model,
              targetId: this.extractId(item, relation.model),
            });
          }
        }
      }

      // Handle set
      if ('set' in value) {
        const setData = Array.isArray(value.set) ? value.set : [value.set];
        for (const item of setData) {
          changes.push({
            action: 'link',
            model,
            relation: relation.name,
            targetModel: relation.model,
            targetId: this.extractId(item, relation.model),
          });
        }
      }

      // Handle connectOrCreate
      if ('connectOrCreate' in value) {
        const cocData = Array.isArray(value.connectOrCreate)
          ? value.connectOrCreate
          : [value.connectOrCreate];
        for (const item of cocData) {
          // Generate both insert and link
          changes.push({
            action: 'insert',
            model: relation.model,
            sets: this.extractSets(item.create, relation.model),
          });
          changes.push({
            action: 'link',
            model,
            relation: relation.name,
            targetModel: relation.model,
          });
        }
      }
    }

    return changes;
  }

  /**
   * Extract ID from where clause or direct ID field
   */
  private extractId(where: any, targetModel: string): string | string[] | undefined {
    if (!where) return undefined;
    if (typeof where === 'string') return where;
    if ('id' in where) return where.id;

    // Handle composite IDs
    const modelDef = this.schema.models.find((m) => m.name === targetModel);

    if (modelDef?.id.kind === 'composite' && modelDef.id.fields) {
      return modelDef.id.fields.map((f) => where[f]);
    }

    return undefined;
  }

  /**
   * Get foreign key field name for a relation
   */
  private getForeignKeyField(relation: { name: string; foreignKey?: string }): string {
    // Use explicit FK if provided in schema
    if (relation.foreignKey) {
      return relation.foreignKey;
    }

    // Convention: {relationName} + "Id" (camelCase)
    return `${relation.name}Id`;
  }
}
