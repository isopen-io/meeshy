/**
 * Unit tests for MultiLevelCache<T>
 *
 * Covers:
 *  - Memory-only mode: set/get/getAndDelete/has/delete/clear/getStats/disconnect
 *  - Expired-entry eviction in get/getAndDelete
 *  - cleanupExpiredMemoryEntries via setInterval
 *  - Store-backed mode (all operations that involve the remote store)
 *  - Error paths: set throws, get error (returns null), getAndDelete error (returns null)
 *  - Custom serialize/deserialize options
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: () => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    }),
  },
}));

import { MultiLevelCache } from '../../../services/MultiLevelCache';
import type { CacheStore } from '../../../services/CacheStore';

// ── Mock CacheStore ───────────────────────────────────────────────────────────

function makeMockStore() {
  return {
    get: jest.fn<any>().mockResolvedValue(null),
    set: jest.fn<any>().mockResolvedValue(undefined),
    del: jest.fn<any>().mockResolvedValue(undefined),
    setnx: jest.fn<any>().mockResolvedValue(false),
    keys: jest.fn<any>().mockResolvedValue([]),
    expire: jest.fn<any>().mockResolvedValue(true),
    publish: jest.fn<any>().mockResolvedValue(0),
    info: jest.fn<any>().mockResolvedValue(''),
    isAvailable: jest.fn<any>().mockReturnValue(true),
    close: jest.fn<any>().mockResolvedValue(undefined),
    getNativeClient: jest.fn<any>().mockReturnValue(null),
  };
}

// ── Memory-only mode ──────────────────────────────────────────────────────────

describe('MultiLevelCache — memory-only mode', () => {
  let cache: MultiLevelCache<string>;

  beforeEach(() => {
    jest.useFakeTimers();
    cache = new MultiLevelCache<string>({ name: 'TestCache' });
  });

  afterEach(async () => {
    await cache.disconnect();
    jest.useRealTimers();
  });

  it('set and get return the stored value', async () => {
    await cache.set('k1', 'hello');
    const result = await cache.get('k1');
    expect(result).toBe('hello');
  });

  it('get returns null for an unknown key', async () => {
    const result = await cache.get('missing');
    expect(result).toBeNull();
  });

  it('get evicts and returns null for an expired entry', async () => {
    await cache.set('exp', 'val');
    // Advance time past the 30-minute default TTL
    jest.advanceTimersByTime(31 * 60 * 1000);
    const result = await cache.get('exp');
    expect(result).toBeNull();
  });

  it('getAndDelete returns value and removes it from memory', async () => {
    await cache.set('del', 'data');
    const first = await cache.getAndDelete('del');
    const second = await cache.getAndDelete('del');
    expect(first).toBe('data');
    expect(second).toBeNull();
  });

  it('getAndDelete evicts expired entry and returns null', async () => {
    await cache.set('expDel', 'v');
    jest.advanceTimersByTime(31 * 60 * 1000);
    const result = await cache.getAndDelete('expDel');
    expect(result).toBeNull();
  });

  it('has returns true when key exists and false when not', async () => {
    await cache.set('present', 'x');
    expect(await cache.has('present')).toBe(true);
    expect(await cache.has('absent')).toBe(false);
  });

  it('delete returns true when key existed and removes it', async () => {
    await cache.set('toRemove', 'y');
    const removed = await cache.delete('toRemove');
    expect(removed).toBe(true);
    expect(await cache.get('toRemove')).toBeNull();
  });

  it('delete returns false when key did not exist', async () => {
    const result = await cache.delete('ghost');
    expect(result).toBe(false);
  });

  it('clear empties all entries', async () => {
    await cache.set('a', 'v1');
    await cache.set('b', 'v2');
    await cache.clear();
    expect(await cache.get('a')).toBeNull();
    expect(await cache.get('b')).toBeNull();
  });

  it('getStats returns memorySize and memoryCapacity', async () => {
    await cache.set('s', 'val');
    const stats = cache.getStats();
    expect(stats.memorySize).toBe(1);
    expect(stats.memoryCapacity).toBe(Infinity);
  });

  it('disconnect clears the memory cache and stops the interval', async () => {
    await cache.set('d', 'val');
    await cache.disconnect();
    // After disconnect the cache is empty
    expect(cache.getStats().memorySize).toBe(0);
  });

  it('cleanupExpiredMemoryEntries removes expired entries when the interval fires', async () => {
    const shortCache = new MultiLevelCache<string>({
      name: 'ShortCache',
      memoryTtlMs: 1000,
      cleanupIntervalMs: 500,
    });
    await shortCache.set('old', 'value');
    jest.advanceTimersByTime(1500); // expire entry + trigger cleanup
    // After cleanup interval fires, memory size should be 0
    expect(shortCache.getStats().memorySize).toBe(0);
    await shortCache.disconnect();
  });
});

// ── Store-backed mode ─────────────────────────────────────────────────────────

describe('MultiLevelCache — store-backed mode', () => {
  let cache: MultiLevelCache<string>;
  let store: ReturnType<typeof makeMockStore>;

  beforeEach(() => {
    jest.useFakeTimers();
    store = makeMockStore();
    cache = new MultiLevelCache<string>({
      name: 'StoreCache',
      store,
      keyPrefix: 'test:',
    });
  });

  afterEach(async () => {
    await cache.disconnect();
    jest.useRealTimers();
  });

  it('set calls store.set with prefixed key and serialized value', async () => {
    await cache.set('k1', 'hello');
    expect(store.set).toHaveBeenCalledWith('test:k1', JSON.stringify('hello'), expect.any(Number));
  });

  it('get returns value from store on memory miss', async () => {
    store.get.mockResolvedValue(JSON.stringify('from-store') as any);
    // Don't set in memory — must go to store
    const result = await cache.get('remote-key');
    expect(store.get).toHaveBeenCalledWith('test:remote-key');
    expect(result).toBe('from-store');
  });

  it('get caches value locally after fetching from store', async () => {
    store.get.mockResolvedValueOnce(JSON.stringify('cached') as any);
    await cache.get('cache-me');
    // Second call should hit memory, not store
    store.get.mockClear();
    const second = await cache.get('cache-me');
    expect(store.get).not.toHaveBeenCalled();
    expect(second).toBe('cached');
  });

  it('get returns null when store also misses', async () => {
    store.get.mockResolvedValue(null as any);
    const result = await cache.get('total-miss');
    expect(result).toBeNull();
  });

  it('getAndDelete also calls store.del on memory hit', async () => {
    await cache.set('del-key', 'data');
    await cache.getAndDelete('del-key');
    expect(store.del).toHaveBeenCalledWith('test:del-key');
  });

  it('getAndDelete fetches from store and deletes when memory misses', async () => {
    store.get.mockResolvedValue(JSON.stringify('store-val') as any);
    const result = await cache.getAndDelete('store-del');
    expect(result).toBe('store-val');
    expect(store.del).toHaveBeenCalledWith('test:store-del');
  });

  it('delete also calls store.del when store is present', async () => {
    await cache.set('rm', 'val');
    await cache.delete('rm');
    expect(store.del).toHaveBeenCalledWith('test:rm');
  });

  it('clear calls store.keys then del for each matching key', async () => {
    store.keys.mockResolvedValue(['test:a', 'test:b'] as any);
    await cache.clear();
    expect(store.keys).toHaveBeenCalledWith('test:*');
    expect(store.del).toHaveBeenCalledWith('test:a');
    expect(store.del).toHaveBeenCalledWith('test:b');
  });
});

// ── Error paths ───────────────────────────────────────────────────────────────

describe('MultiLevelCache — error paths', () => {
  let store: ReturnType<typeof makeMockStore>;

  afterEach(async () => {
    jest.useRealTimers();
  });

  it('set propagates errors from store', async () => {
    store = makeMockStore();
    store.set.mockRejectedValue(new Error('redis down') as never);
    const cache = new MultiLevelCache<string>({ name: 'ErrCache', store });

    await expect(cache.set('k', 'v')).rejects.toThrow('redis down');
    await cache.disconnect();
  });

  it('get returns null and does not throw when store.get fails', async () => {
    store = makeMockStore();
    store.get.mockRejectedValue(new Error('redis error') as never);
    const cache = new MultiLevelCache<string>({ name: 'ErrGet', store });

    const result = await cache.get('key');
    expect(result).toBeNull();
    await cache.disconnect();
  });

  it('getAndDelete returns null and does not throw when store throws', async () => {
    store = makeMockStore();
    store.get.mockRejectedValue(new Error('redis error') as never);
    const cache = new MultiLevelCache<string>({ name: 'ErrGetDel', store });

    const result = await cache.getAndDelete('key');
    expect(result).toBeNull();
    await cache.disconnect();
  });
});

// ── Custom serialize/deserialize ──────────────────────────────────────────────

describe('MultiLevelCache — custom serialization', () => {
  it('uses provided serialize/deserialize functions', async () => {
    const store = makeMockStore();
    const serialize = jest.fn((v: string) => `custom:${v}`);
    const deserialize = jest.fn((s: string) => s.replace('custom:', ''));
    store.get.mockResolvedValue('custom:world' as any);

    const cache = new MultiLevelCache<string>({
      name: 'CustomSer',
      store,
      serialize,
      deserialize,
    });

    await cache.set('k', 'hello');
    expect(serialize).toHaveBeenCalledWith('hello');

    const result = await cache.get('missing-in-memory');
    expect(deserialize).toHaveBeenCalledWith('custom:world');
    expect(result).toBe('world');
    await cache.disconnect();
  });
});
