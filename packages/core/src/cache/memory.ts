import { Cache } from './types';

export interface MemoryLRUConfig {
  maxItems?: number; // Default: 10,000
  defaultTtlMs?: number; // Default: 300,000 (5 minutes)
  enableBackgroundCleanup?: boolean; // Default: true
  cleanupIntervalMs?: number; // Default: 60,000 (1 minute)
}

interface CacheEntry<V> {
  value: V;
  expiresAt: number;
  lastAccessed: number;
}

/**
 * In-memory LRU cache with TTL support
 * Uses Map insertion order to optimize LRU eviction (O(1) instead of O(n))
 */
export class MemoryLRU<V> implements Cache<V> {
  private cache: Map<string, CacheEntry<V>>;
  private readonly maxItems: number;
  private readonly defaultTtlMs: number;
  private cleanupTimer?: NodeJS.Timeout;

  constructor(config: MemoryLRUConfig = {}) {
    this.cache = new Map();
    this.maxItems = config.maxItems ?? 10000;
    this.defaultTtlMs = config.defaultTtlMs ?? 300000;

    const enableCleanup = config.enableBackgroundCleanup ?? true;
    if (enableCleanup) {
      const interval = config.cleanupIntervalMs ?? 60000;
      this.cleanupTimer = setInterval(() => this.pruneExpired(), interval);
      // Allow process to exit even if timer is active
      this.cleanupTimer.unref?.();
    }
  }

  async get(key: string): Promise<V | undefined> {
    const entry = this.cache.get(key);
    if (!entry) {
      return undefined;
    }

    // Check expiration
    const now = Date.now();
    if (now >= entry.expiresAt) {
      this.cache.delete(key);
      return undefined;
    }

    // Update access time and move to end (most recent)
    entry.lastAccessed = now;
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.value;
  }

  async set(key: string, value: V, ttlMs: number): Promise<void> {
    const now = Date.now();
    const expiresAt = now + (ttlMs || this.defaultTtlMs);

    // Evict oldest if at capacity
    if (this.cache.size >= this.maxItems && !this.cache.has(key)) {
      this.evictOldest();
    }

    this.cache.set(key, {
      value,
      expiresAt,
      lastAccessed: now,
    });
  }

  async del(key: string): Promise<void> {
    this.cache.delete(key);
  }

  /**
   * Remove expired entries
   */
  private pruneExpired(): void {
    const now = Date.now();
    const toDelete: string[] = [];

    for (const [key, entry] of this.cache.entries()) {
      if (now >= entry.expiresAt) {
        toDelete.push(key);
      }
    }

    for (const key of toDelete) {
      this.cache.delete(key);
    }
  }

  /**
   * Evict the least recently used entry
   * Map maintains insertion order, so first entry is the oldest
   */
  private evictOldest(): void {
    const firstKey = this.cache.keys().next().value;
    if (firstKey !== undefined) {
      this.cache.delete(firstKey);
    }
  }

  /**
   * Clear all entries
   */
  async clear(): Promise<void> {
    this.cache.clear();
  }

  /**
   * Get current cache size
   */
  size(): number {
    return this.cache.size;
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
    this.cache.clear();
  }
}
