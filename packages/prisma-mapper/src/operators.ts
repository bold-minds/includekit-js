/**
 * Prisma to IncludeKit operator mapping
 */

import type { Logger } from '@includekit/core';
import { consoleLogger } from '@includekit/core';

let operatorLogger: Logger = consoleLogger;

/**
 * Set custom logger for operator warnings
 */
export function setOperatorLogger(logger: Logger): void {
  operatorLogger = logger;
}

export const SPEC_OPERATORS: Record<string, string> = {
  // Comparison
  equals: 'eq',
  not: 'ne',
  in: 'in',
  notIn: 'notIn',
  lt: 'lt',
  lte: 'lte',
  gt: 'gt',
  gte: 'gte',

  // String
  contains: 'contains',
  startsWith: 'startsWith',
  endsWith: 'endsWith',

  // Array
  has: 'has',
  hasEvery: 'hasEvery',
  hasSome: 'hasSome',

  // Null checks
  isNull: 'isNull',
  isSet: 'exists',
};

/**
 * Map Prisma operator to IncludeKit operator
 * Handles unsupported and unknown operators gracefully
 */
export function mapPrismaOperator(prismaOp: string): string {
  // Try direct mapping first
  if (SPEC_OPERATORS[prismaOp]) {
    return SPEC_OPERATORS[prismaOp];
  }

  // Known unsupported features
  if (prismaOp === 'search') {
    return 'unsupported:search';
  }

  // Truly unknown - log and use conservative invalidation
  operatorLogger.warn(
    `Unknown Prisma operator '${prismaOp}'. ` +
      `Using conservative invalidation. Please report this to IncludeKit team.`
  );
  return `unknown:${prismaOp}`;
}
