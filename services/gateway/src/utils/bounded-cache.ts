/**
 * Generic size-bounded, optionally TTL-expiring in-process cache.
 *
 * Single source of truth for the "bounded map" idiom that had been copy-pasted
 * across the gateway hot paths:
 *  - `conversation-id-cache` / `socket-helpers.normalizeConversationId` /
 *    `MeeshySocketIOManager.normalizeConversationId` — immutable
 *    identifier → ObjectId maps (pure size bound, no TTL).
 *  - `StatusHandler` identity cache and `participant-lookup-cache` — short-lived
 *    memoization that must stay fresh (size bound + TTL sweep).
 *
 * Two eviction concerns are handled together:
 *  - Freshness: when `ttlMs` is set, `get` lazily drops an entry read after its
 *    TTL elapsed, and `evictExpired` sweeps cold entries in bulk (for a periodic
 *    timer). Omit `ttlMs` for immutable data that never goes stale.
 *  - Memory: `set` caps the map at `maxSize`. A lazily-checked TTL only reclaims
 *    a key when the SAME key is read again, so a one-shot key would leak forever;
 *    on inserting a NEW key at capacity we first sweep expired entries, then
 *    FIFO-evict the oldest. Refreshing an EXISTING key never evicts.
 */

export type BoundedTtlCacheOptions = {
  maxSize: number;
  /**
   * When set, entries expire this many milliseconds after insertion. Omit for a
   * pure size-bounded (FIFO) cache of immutable values that never go stale.
   */
  ttlMs?: number;
};

type Entry<V> = { value: V; expiresAt: number };

export class BoundedTtlCache<K, V> {
  private readonly store = new Map<K, Entry<V>>();
  private readonly maxSize: number;
  private readonly ttlMs: number | undefined;

  constructor({ maxSize, ttlMs }: BoundedTtlCacheOptions) {
    this.maxSize = maxSize;
    this.ttlMs = ttlMs;
  }

  get size(): number {
    return this.store.size;
  }

  get(key: K): V | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  has(key: K): boolean {
    return this.get(key) !== undefined;
  }

  set(key: K, value: V): void {
    if (!this.store.has(key) && this.store.size >= this.maxSize) {
      this.evictExpired();
      if (this.store.size >= this.maxSize) {
        const oldestKey = this.store.keys().next().value;
        if (oldestKey !== undefined) this.store.delete(oldestKey);
      }
    }
    this.store.set(key, {
      value,
      expiresAt: this.ttlMs === undefined ? Infinity : Date.now() + this.ttlMs
    });
  }

  delete(key: K): void {
    this.store.delete(key);
  }

  /** Live keys, unfiltered by TTL (a caller doing prefix-matched bulk invalidation
   *  may still want to delete an entry that's technically expired but not yet swept). */
  keys(): IterableIterator<K> {
    return this.store.keys();
  }

  clear(): void {
    this.store.clear();
  }

  /** Drop every entry whose TTL has elapsed. No-op for a TTL-less cache. */
  evictExpired(): void {
    if (this.ttlMs === undefined) return;
    const now = Date.now();
    for (const [key, entry] of this.store) {
      if (entry.expiresAt <= now) this.store.delete(key);
    }
  }
}
