import type { Redis } from 'ioredis';
import { Cache } from './types';
import type { Logger } from '../logger';
import { consoleLogger } from '../logger';

export interface RedisCacheConfig {
  client: Redis;
  prefix?: string; // Default: "ik:"
  defaultTtlMs?: number; // Default: 300,000 (5 minutes)
  logger?: Logger; // Default: consoleLogger
}

/**
 * Redis-based cache implementation
 * 
 * Error handling: All errors are logged but not thrown
 * - get() on error → return undefined (cache miss)
 * - set() on error → silently fail (log warning)
 * - del() on error → silently fail (log warning)
 */
export class RedisCache<V> implements Cache<V> {
  private readonly client: Redis;
  private readonly prefix: string;
  private readonly defaultTtlMs: number;
  private readonly logger: Logger;

  constructor(config: RedisCacheConfig) {
    this.client = config.client;
    this.prefix = config.prefix ?? 'ik:';
    this.defaultTtlMs = config.defaultTtlMs ?? 300000;
    this.logger = config.logger ?? consoleLogger;
  }

  async get(key: string): Promise<V | undefined> {
    try {
      const prefixedKey = this.prefix + key;
      const value = await this.client.get(prefixedKey);

      if (value === null) {
        return undefined;
      }

      return JSON.parse(value) as V;
    } catch (error) {
      this.logger.warn(`RedisCache.get error for key ${key}:`, error);
      return undefined; // Treat as cache miss
    }
  }

  async set(key: string, value: V, ttlMs: number): Promise<void> {
    try {
      const prefixedKey = this.prefix + key;
      const serialized = JSON.stringify(value);
      const ttlSeconds = Math.ceil((ttlMs || this.defaultTtlMs) / 1000);

      // Use SETEX for atomic set + expiration
      await this.client.setex(prefixedKey, ttlSeconds, serialized);
    } catch (error) {
      this.logger.warn(`RedisCache.set error for key ${key}:`, error);
      // Silently fail - don't throw
    }
  }

  async del(key: string): Promise<void> {
    try {
      const prefixedKey = this.prefix + key;
      await this.client.del(prefixedKey);
    } catch (error) {
      this.logger.warn(`RedisCache.del error for key ${key}:`, error);
      // Silently fail - don't throw
    }
  }

  /**
   * Clear all keys with this cache's prefix (use with caution)
   * Note: Not atomic - keys may be added/removed during scan
   */
  async clear(): Promise<void> {
    this.logger.warn?.('RedisCache.clear() is not atomic and may miss keys added during scan');
    try {
      const pattern = this.prefix + '*';
      let cursor = '0';

      do {
        const [newCursor, keys] = await this.client.scan(
          cursor,
          'MATCH',
          pattern,
          'COUNT',
          100
        );
        cursor = newCursor;

        if (keys.length > 0) {
          await this.client.del(...keys);
        }
      } while (cursor !== '0');
    } catch (error) {
      this.logger.warn('RedisCache.clear error:', error);
    }
  }
}
