/**
 * Unit tests for MultiLevelCache
 * Covers: memory-only get/set/delete/clear, remote store fallback,
 * TTL expiry (fake timers), getAndDelete, has, getStats,
 * custom serialize/deserialize, cleanup interval, disconnect.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
  },
}));

import { MultiLevelCache } from '../../../services/MultiLevelCache';

// ─── Factories ───────────────────────────────────────────────────────────────

function makeStore(overrides: Record<string, any> = {}) {
  return {
    get: jest.fn<any>().mockResolvedValue(null),
    set: jest.fn<any>().mockResolvedValue(undefined),
    del: jest.fn<any>().mockResolvedValue(undefined),
    keys: jest.fn<any>().mockResolvedValue([]),
    ...overrides,
  };
}

function makeCache<T = any>(
  options: Partial<{
    store: any;
    memoryTtlMs: number;
    remoteTtlSeconds: number;
    keyPrefix: string;
    cleanupIntervalMs: number;
    serialize: (d: T) => string;
    deserialize: (s: string) => T;
  }> = {}
) {
  return new MultiLevelCache<T>({
    name: 'test-cache',
    cleanupIntervalMs: 60_000,
    ...options,
  });
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('MultiLevelCache', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(async () => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  // ── Memory-only (no remote store) ────────────────────────────────────────

  describe('memory-only mode (no store)', () => {
    it('set then get returns stored value', async () => {
      const cache = makeCache();

      await cache.set('k1', { x: 1 });
      const result = await cache.get('k1');

      expect(result).toEqual({ x: 1 });
    });

    it('get returns null for missing key', async () => {
      const cache = makeCache();

      expect(await cache.get('missing')).toBeNull();
    });

    it('delete removes key and returns true', async () => {
      const cache = makeCache();
      await cache.set('k1', 'hello');

      const deleted = await cache.delete('k1');

      expect(deleted).toBe(true);
      expect(await cache.get('k1')).toBeNull();
    });

    it('delete returns false for missing key', async () => {
      const cache = makeCache();

      const deleted = await cache.delete('no-such-key');

      expect(deleted).toBe(false);
    });

    it('clear empties the memory cache', async () => {
      const cache = makeCache();
      await cache.set('a', 1);
      await cache.set('b', 2);

      await cache.clear();

      expect(await cache.get('a')).toBeNull();
      expect(await cache.get('b')).toBeNull();
    });

    it('has returns true for existing key and false for missing key', async () => {
      const cache = makeCache();
      await cache.set('exists', true);

      expect(await cache.has('exists')).toBe(true);
      expect(await cache.has('missing')).toBe(false);
    });

    it('getAndDelete returns value and removes key', async () => {
      const cache = makeCache();
      await cache.set('tok', 'secret');

      const val = await cache.getAndDelete('tok');

      expect(val).toBe('secret');
      expect(await cache.get('tok')).toBeNull();
    });

    it('getAndDelete returns null for missing key', async () => {
      const cache = makeCache();

      expect(await cache.getAndDelete('missing')).toBeNull();
    });

    it('getStats reports correct memorySize', async () => {
      const cache = makeCache();
      await cache.set('a', 1);
      await cache.set('b', 2);

      const stats = cache.getStats();

      expect(stats.name).toBe('test-cache');
      expect(stats.memorySize).toBe(2);
    });
  });

  // ── TTL expiry ───────────────────────────────────────────────────────────

  describe('TTL expiry', () => {
    it('returns null after memoryTtlMs has elapsed', async () => {
      const cache = makeCache({ memoryTtlMs: 5_000 });
      await cache.set('k', 'value');

      jest.advanceTimersByTime(5_001);

      expect(await cache.get('k')).toBeNull();
    });

    it('returns value before TTL expires', async () => {
      const cache = makeCache({ memoryTtlMs: 10_000 });
      await cache.set('k', 'value');

      jest.advanceTimersByTime(9_999);

      expect(await cache.get('k')).toBe('value');
    });

    it('getAndDelete returns null for expired entry', async () => {
      const cache = makeCache({ memoryTtlMs: 3_000 });
      await cache.set('k', 'val');

      jest.advanceTimersByTime(3_001);

      expect(await cache.getAndDelete('k')).toBeNull();
    });
  });

  // ── Cleanup interval ─────────────────────────────────────────────────────

  describe('cleanup interval', () => {
    it('evicts expired entries on cleanup tick', async () => {
      const cache = makeCache({ memoryTtlMs: 1_000, cleanupIntervalMs: 2_000 });
      await cache.set('old', 'data');

      jest.advanceTimersByTime(1_500); // entry expired
      jest.advanceTimersByTime(2_000); // cleanup tick fires

      expect(cache.getStats().memorySize).toBe(0);
    });
  });

  // ── Remote store integration ─────────────────────────────────────────────

  describe('with remote store', () => {
    it('set writes to remote store with keyPrefix', async () => {
      const store = makeStore();
      const cache = makeCache({ store, keyPrefix: 'myns:' });

      await cache.set('key1', 'hello');

      expect(store.set).toHaveBeenCalledWith('myns:key1', '"hello"', expect.any(Number));
    });

    it('get reads from remote store when memory miss', async () => {
      const store = makeStore({ get: jest.fn<any>().mockResolvedValue('"remote-value"') });
      const cache = makeCache({ store, memoryTtlMs: 1_000 });
      // populate then expire memory
      await cache.set('k', 'stale');
      jest.advanceTimersByTime(1_001);

      const result = await cache.get('k');

      expect(result).toBe('remote-value');
      expect(store.get).toHaveBeenCalled();
    });

    it('get re-populates memory from remote value', async () => {
      const store = makeStore({ get: jest.fn<any>().mockResolvedValue('"remote"') });
      const cache = makeCache({ store, memoryTtlMs: 1_000 });
      // cold start — no memory entry
      const result = await cache.get('cold');

      expect(result).toBe('remote');
    });

    it('delete calls store.del', async () => {
      const store = makeStore();
      const cache = makeCache({ store, keyPrefix: 'p:' });
      await cache.set('k', 1);

      await cache.delete('k');

      expect(store.del).toHaveBeenCalledWith('p:k');
    });

    it('clear calls store.keys then del for each key', async () => {
      const store = makeStore({
        keys: jest.fn<any>().mockResolvedValue(['ns:a', 'ns:b']),
      });
      const cache = makeCache({ store, keyPrefix: 'ns:' });

      await cache.clear();

      expect(store.del).toHaveBeenCalledWith('ns:a');
      expect(store.del).toHaveBeenCalledWith('ns:b');
    });

    it('getAndDelete deletes from remote store when memory entry exists', async () => {
      const store = makeStore();
      const cache = makeCache({ store, keyPrefix: 'p:' });
      await cache.set('tok', 'secret');

      await cache.getAndDelete('tok');

      expect(store.del).toHaveBeenCalledWith('p:tok');
    });

    it('getAndDelete reads remote store when memory entry is expired', async () => {
      const store = makeStore({ get: jest.fn<any>().mockResolvedValue('"remote-tok"') });
      const cache = makeCache({ store, memoryTtlMs: 500, keyPrefix: 'p:' });
      await cache.set('tok', 'stale');
      jest.advanceTimersByTime(600);

      const val = await cache.getAndDelete('tok');

      expect(val).toBe('remote-tok');
      expect(store.del).toHaveBeenCalledWith('p:tok');
    });

    it('returns null and does not throw when remote store.get throws', async () => {
      const store = makeStore({ get: jest.fn<any>().mockRejectedValue(new Error('redis down')) });
      const cache = makeCache({ store, memoryTtlMs: 100 });
      jest.advanceTimersByTime(200); // ensure memory miss

      await expect(cache.get('k')).resolves.toBeNull();
    });
  });

  // ── Custom serialization ─────────────────────────────────────────────────

  describe('custom serialize/deserialize', () => {
    it('uses provided serialize and deserialize functions', async () => {
      const serialize = jest.fn<any>((v: number[]) => v.join(','));
      const deserialize = jest.fn<any>((s: string) => s.split(',').map(Number));
      const store = makeStore({ get: jest.fn<any>().mockResolvedValue('1,2,3') });
      const cache = makeCache<number[]>({ store, serialize, deserialize, memoryTtlMs: 100 });

      await cache.set('nums', [1, 2, 3]);
      jest.advanceTimersByTime(200); // expire memory

      const result = await cache.get('nums');

      expect(serialize).toHaveBeenCalledWith([1, 2, 3]);
      expect(result).toEqual([1, 2, 3]);
    });
  });

  // ── disconnect ───────────────────────────────────────────────────────────

  describe('disconnect', () => {
    it('clears memory and stops cleanup interval', async () => {
      const cache = makeCache({ memoryTtlMs: 10_000 });
      await cache.set('k', 'v');

      await cache.disconnect();

      expect(cache.getStats().memorySize).toBe(0);
    });
  });
});
