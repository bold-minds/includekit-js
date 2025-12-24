import { AppSchema, Statement, Mutation, Dependencies } from '../types';

/**
 * Engine interface - abstracts WASM implementation
 */
export interface Engine {
  version(): Promise<{ core: string; contract: string; abi: string }>;
  setSchema(schema: AppSchema): Promise<void>;
  computeShapeId(statement: Statement): Promise<{ shapeId: string }>;
  addQuery(input: {
    shape: Statement;
    resultHint?: Record<string, any[]>;
  }): Promise<{
    shapeId: string;
    dependencies: Dependencies;
  }>;
  invalidate(mutation: Mutation): Promise<{ evict: string[] }>;
  explainInvalidation(input: {
    mutation: Mutation;
    shapeId: string;
  }): Promise<{
    invalidate: boolean;
    reasons: string[];
  }>;
  reset(): Promise<void>;
}

/**
 * Engine status codes (from WASM)
 */
export enum EngineStatus {
  OK = 0,
  ABI_MISMATCH = 1,
  CONTRACT_VERSION_MISMATCH = 2,
  SCHEMA_INVALID = 3,
  QUERY_INVALID = 4,
  RESULT_SHAPE_MISMATCH = 5,
  MUTATION_INVALID = 6,
  UNSUPPORTED_OPERATOR = 7,
  ENGINE_STATE = 8,
  INTERNAL = 255,
}

/**
 * Engine error response
 */
export interface EngineError {
  code: string;
  message: string;
}

/**
 * Map status code to error code string
 */
export function statusToErrorCode(status: number): string {
  switch (status) {
    case EngineStatus.ABI_MISMATCH:
      return 'ABI_MISMATCH';
    case EngineStatus.CONTRACT_VERSION_MISMATCH:
      return 'CONTRACT_VERSION_MISMATCH';
    case EngineStatus.SCHEMA_INVALID:
      return 'SCHEMA_INVALID';
    case EngineStatus.QUERY_INVALID:
      return 'QUERY_INVALID';
    case EngineStatus.RESULT_SHAPE_MISMATCH:
      return 'RESULT_SHAPE_MISMATCH';
    case EngineStatus.MUTATION_INVALID:
      return 'MUTATION_INVALID';
    case EngineStatus.UNSUPPORTED_OPERATOR:
      return 'UNSUPPORTED_OPERATOR';
    case EngineStatus.ENGINE_STATE:
      return 'ENGINE_STATE';
    case EngineStatus.INTERNAL:
      return 'INTERNAL';
    default:
      return 'UNKNOWN';
  }
}
