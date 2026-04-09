/**
 * Cache Manager
 *
 * Simple in-memory caching with TTL support for reducing redundant operations.
 */

/** Cache entry */
interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

/** Cache options */
export interface CacheOptions {
  /** Time to live in milliseconds (default: 5 minutes) */
  ttl?: number;
  /** Maximum number of entries (default: 1000) */
  maxEntries?: number;
}

/** Cache manager */
export class CacheManager<T> {
  private cache = new Map<string, CacheEntry<T>>();
  private defaultTtl: number;
  private maxEntries: number;

  constructor(options: CacheOptions = {}) {
    this.defaultTtl = options.ttl ?? 5 * 60 * 1000; // 5 minutes
    this.maxEntries = options.maxEntries ?? 1000;
  }

  /**
   * Get a value from cache.
   * Returns undefined if not found or expired.
   */
  get(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) {
      return undefined;
    }

    // Check if expired
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return undefined;
    }

    return entry.value;
  }

  /**
   * Set a value in cache with optional TTL.
   */
  set(key: string, value: T, ttl?: number): void {
    // Enforce max entries by evicting oldest
    if (this.cache.size >= this.maxEntries && !this.cache.has(key)) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }

    this.cache.set(key, {
      value,
      expiresAt: Date.now() + (ttl ?? this.defaultTtl),
    });
  }

  /**
   * Delete a specific entry from cache.
   */
  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  /**
   * Clear all entries from cache.
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get the number of entries in cache.
   */
  get size(): number {
    // Clean expired entries first
    this.cleanExpired();
    return this.cache.size;
  }

  /**
   * Clean expired entries.
   */
  private cleanExpired(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Get or set a value (pattern commonly used for memoization).
   */
  async getOrSet(key: string, factory: () => Promise<T>, ttl?: number): Promise<T> {
    const cached = this.get(key);
    if (cached !== undefined) {
      return cached;
    }

    const value = await factory();
    this.set(key, value, ttl);
    return value;
  }
}

/** Global cache instances */
export const globalCaches = {
  /** Cache for tenant access tokens */
  tenantTokens: new CacheManager<string>({ ttl: 60 * 60 * 1000 }), // 1 hour

  /** Cache for bot identities */
  botIdentities: new CacheManager<{ openId: string; userId: string; unionId: string }>({
    ttl: 24 * 60 * 60 * 1000, // 24 hours
  }),

  /** Cache for user information */
  userInfo: new CacheManager<{ name: string; avatar?: string }>({
    ttl: 30 * 60 * 1000, // 30 minutes
  }),

  /** Cache for API responses */
  apiResponses: new CacheManager<any>({ ttl: 5 * 60 * 1000 }), // 5 minutes
};
