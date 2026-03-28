/**
 * Minimal bounded LRU cache. Evicts the oldest entry when capacity is exceeded.
 * Uses Map insertion-order iteration (guaranteed by ES2015+).
 */
export class LRUCache<K, V> {
  private readonly cache: Map<K, V>;

  constructor(private readonly maxSize: number) {
    this.cache = new Map();
  }

  get(key: K): V | undefined {
    const value = this.cache.get(key);
    if (value === undefined) return undefined;
    // Refresh recency: delete + re-insert moves to end
    this.cache.delete(key);
    this.cache.set(key, value);
    return value;
  }

  set(key: K, value: V): void {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      // Delete oldest (first) entry
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) this.cache.delete(firstKey);
    }
    this.cache.set(key, value);
  }

  has(key: K): boolean {
    return this.cache.has(key);
  }

  delete(key: K): void {
    this.cache.delete(key);
  }

  get size(): number {
    return this.cache.size;
  }

  values(): IterableIterator<V> {
    return this.cache.values();
  }

  clear(): void {
    this.cache.clear();
  }
}
