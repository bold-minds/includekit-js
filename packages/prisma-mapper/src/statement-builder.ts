import type { Statement, Filter, Condition, OrderBy, Pagination, Include } from '@includekit/core';
import { mapPrismaOperator } from './operators';

/**
 * Build Statement from Prisma query args
 */
export class StatementBuilder {
  buildStatement(params: {
    model: string;
    operation: 'findUnique' | 'findFirst' | 'findMany';
    args: any;
  }): Statement {
    const { model, args } = params;

    return {
      model,
      select: this.mapSelect(args.select),
      where: this.mapWhere(args.where),
      orderBy: this.mapOrderBy(args.orderBy),
      pagination: this.mapPagination(args.take, args.skip),
      include: this.mapInclude(args.include),
      distinct: args.distinct || null,
      groupBy: args.groupBy ? this.mapGroupBy(args.groupBy) : null,
    };
  }

  private mapSelect(select: any): string[] | null {
    if (!select) return null;
    
    // Prisma select is an object with field names as keys
    const fields: string[] = [];
    for (const [field, value] of Object.entries(select)) {
      if (value === true) {
        fields.push(field);
      }
    }
    
    return fields.length > 0 ? fields : null;
  }

  private mapWhere(where: any): Filter | null {
    if (!where || typeof where !== 'object') {
      return null;
    }

    const filter: Filter = {};

    // Handle logical operators
    if (where.AND) {
      filter.AND = Array.isArray(where.AND)
        ? where.AND.map((w: any) => this.mapWhere(w)).filter((f): f is Filter => f !== null)
        : [this.mapWhere(where.AND)].filter((f): f is Filter => f !== null);
    }

    if (where.OR) {
      filter.OR = Array.isArray(where.OR)
        ? where.OR.map((w: any) => this.mapWhere(w)).filter((f): f is Filter => f !== null)
        : [this.mapWhere(where.OR)].filter((f): f is Filter => f !== null);
    }

    if (where.NOT) {
      const notFilter = Array.isArray(where.NOT)
        ? this.mapWhere(where.NOT[0])
        : this.mapWhere(where.NOT);
      if (notFilter) {
        filter.NOT = notFilter;
      }
    }

    // Handle field conditions
    const conditions: Condition[] = [];
    for (const [field, value] of Object.entries(where)) {
      if (field === 'AND' || field === 'OR' || field === 'NOT') {
        continue;
      }

      // Simple equality
      if (typeof value !== 'object' || value === null) {
        conditions.push({
          field,
          op: 'eq',
          value,
        });
        continue;
      }

      // Relation filters (some, every, none)
      if ('some' in value || 'every' in value || 'none' in value) {
        // These are handled in Include mapping, skip here
        continue;
      }

      // Field operators
      for (const [op, opValue] of Object.entries(value)) {
        // Handle JSON path queries
        if (op === 'path') {
          // Prisma: { meta: { path: ['settings'], equals: 'value' } }
          const pathValue = value as any;
          for (const [pathOp, pathOpValue] of Object.entries(pathValue)) {
            if (pathOp !== 'path') {
              conditions.push({
                field,
                field_path: pathValue.path,
                op: mapPrismaOperator(pathOp),
                value: pathOpValue,
              });
            }
          }
          break;
        }

        const mappedOp = mapPrismaOperator(op);
        conditions.push({
          field,
          op: mappedOp,
          value: opValue,
        });
      }
    }

    if (conditions.length > 0) {
      filter.conditions = conditions;
    }

    return Object.keys(filter).length > 0 ? filter : null;
  }

  private mapOrderBy(orderBy: any): OrderBy[] | null {
    if (!orderBy) return null;

    const orders: OrderBy[] = [];

    if (Array.isArray(orderBy)) {
      for (const order of orderBy) {
        orders.push(...this.extractOrderBy(order));
      }
    } else {
      orders.push(...this.extractOrderBy(orderBy));
    }

    return orders.length > 0 ? orders : null;
  }

  private extractOrderBy(order: any): OrderBy[] {
    const orders: OrderBy[] = [];

    for (const [field, direction] of Object.entries(order)) {
      if (typeof direction === 'string') {
        orders.push({
          field,
          direction: direction as 'asc' | 'desc',
        });
      }
    }

    return orders;
  }

  private mapPagination(take?: number, skip?: number): Pagination | null {
    if (take === undefined && skip === undefined) {
      return null;
    }

    return {
      limit: take,
      offset: skip,
    };
  }

  private mapInclude(include: any): Include[] | null {
    if (!include || typeof include !== 'object') {
      return null;
    }

    const includes: Include[] = [];

    for (const [relation, config] of Object.entries(include)) {
      if (config === true) {
        includes.push({ relation });
      } else if (typeof config === 'object') {
        includes.push({
          relation,
          where: this.mapWhere((config as any).where),
          orderBy: this.mapOrderBy((config as any).orderBy),
          pagination: this.mapPagination((config as any).take, (config as any).skip),
          includes: this.mapInclude((config as any).include),
        });
      }
    }

    return includes.length > 0 ? includes : null;
  }

  private mapGroupBy(groupBy: any): any {
    return {
      fields: Array.isArray(groupBy.by) ? groupBy.by : [groupBy.by],
      having: this.mapWhere(groupBy.having),
    };
  }
}
