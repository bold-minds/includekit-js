/**
 * Core types for IncludeKit SDK
 * These types define the schema, query, and mutation structures
 */

// Re-export spec types if available, otherwise define them here
export interface Statement {
  model: string;
  select?: string[] | null;
  where?: Filter | null;
  orderBy?: OrderBy[] | null;
  pagination?: Pagination | null;
  include?: Include[] | null;
  distinct?: string[] | null;
  groupBy?: GroupBy | null;
}

export interface Filter {
  AND?: Filter[];
  OR?: Filter[];
  NOT?: Filter;
  conditions?: Condition[];
}

export interface Condition {
  field: string;
  field_path?: string[];
  op: string;
  value?: any;
}

export interface OrderBy {
  field: string;
  direction: 'asc' | 'desc';
}

export interface Pagination {
  limit?: number;
  offset?: number;
}

export interface Include {
  relation: string;
  where?: Filter | null;
  orderBy?: OrderBy[] | null;
  pagination?: Pagination | null;
  includes?: Include[] | null;
}

export interface GroupBy {
  fields: string[];
  having?: Filter | null;
}

export interface Mutation {
  changes: Change[];
}

export interface Change {
  action: 'insert' | 'update' | 'delete' | 'link' | 'unlink';
  model: string;
  id?: string | string[];
  where?: Filter;
  sets?: Record<string, any>;
  relation?: string;
  targetModel?: string;
  targetId?: string | string[];
}

export interface Dependencies {
  models?: Record<string, string[]>; // model -> record IDs
  filters?: Filter[];
  records?: Record<string, string[]>;
}

export interface AppSchema {
  version: number;
  models: Array<{
    name: string;
    id: {
      kind: 'string' | 'composite';
      fields?: string[];
    };
    relations?: Array<{
      name: string;
      model: string;
      cardinality: 'one-to-many' | 'many-to-one' | 'many-to-many';
      foreignKey?: string;
    }>;
  }>;
}

export interface InsightsEvent {
  shapeId: string;
  eventType: 'hit' | 'miss' | 'evict';
  timestamp: number;
  dependenciesSummary?: {
    modelCount: number;
    recordCount: number;
  };
}

/**
 * Calculate the depth of nested includes
 */
export function calculateIncludeDepth(includes?: Include[]): number {
  if (!includes || includes.length === 0) return 0;
  return 1 + Math.max(0, ...includes.map((inc) => calculateIncludeDepth(inc.includes)));
}
