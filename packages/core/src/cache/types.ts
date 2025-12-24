/**
 * Common cache interface
 */
export interface Cache<V> {
  get(key: string): Promise<V | undefined>;
  set(key: string, value: V, ttlMs: number): Promise<void>;
  del(key: string): Promise<void>;
}

/**
 * Cache value structure - stores query results
 */
export interface CacheValue {
  result: any;
  // DO NOT store dependencies - engine tracks them
}
