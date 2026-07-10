jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: () => ({
      info: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
    }),
  },
}));

import { MultiLevelCache } from '../../../services/MultiLevelCache';

function makeStore(overrides: Partial<{
  get: (k: string) => Promise<string | null>;
  set: (k: string, v: string, ttl: number) => Promise<void>;
  del: (k: string) => Promise<void>;
  keys: (pattern: string) => Promise<string[]>;
}> = {}) {
  return {
    get: jest.fn(overrides.get ?? (() => Promise.resolve(null))),
    set: jest.fn(overrides.set ?? (() => Promise.resolve())),
    del: jest.fn(overrides.del ?? (() => Promise.resolve())),
    keys: jest.fn(overrides.keys ?? (() => Promise.resolve([]))),
  };
}

describe('MultiLevelCache', () => {
  let cache: MultiLevelCache<string>;

  beforeEach(() => {
    jest.useFakeTimers();
    cache = new MultiLevelCache<string>({
      name: 'test-cache',
      memoryTtlMs: 5000,
      cleanupIntervalMs: 30000,
    });
  });

  afterEach(async () => {
    await cache.disconnect();
    jest.useRealTimers();
  });

  // ─── set / get ─────────────────────────────────────────────────────────────

  describe('set and get', () => {
    it('stores and retrieves a value from memory', async () => {
      await cache.set('key1', 'value1');
      expect(await cache.get('key1')).toBe('value1');
    });

    it('returns null for an unknown key', async () => {
      expect(await cache.get('missing')).toBeNull();
    });

    it('returns null for an expired memory entry', async () => {
      await cache.set('key1', 'value1');
      jest.advanceTimersByTime(6000); // past 5s TTL
      expect(await cache.get('key1')).toBeNull();
    });

    it('writes to remote store when store is provided', async () => {
      const store = makeStore();
      const c = new MultiLevelCache<string>({ name: 'c2', store: store as any, memoryTtlMs: 5000 });
      await c.set('k', 'v');
      expect(store.set).toHaveBeenCalledWith(expect.stringContaining('k'), JSON.stringify('v'), expect.any(Number));
      await c.disconnect();
    });

    it('reads from remote store when memory entry is expired', async () => {
      const store = makeStore({ get: () => Promise.resolve(JSON.stringify('remote-value')) });
      const c = new MultiLevelCache<string>({
        name: 'c3',
        store: store as any,
        memoryTtlMs: 100,
        serialize: JSON.stringify,
        deserialize: JSON.parse,
      });
      await c.set('k', 'local-value');
      jest.advanceTimersByTime(200); // expire memory
      const value = await c.get('k');
      expect(value).toBe('remote-value');
      await c.disconnect();
    });

    it('warms memory cache after remote hit', async () => {
      const store = makeStore({ get: () => Promise.resolve(JSON.stringify('warm')) });
      const c = new MultiLevelCache<string>({
        name: 'c4',
        store: store as any,
        memoryTtlMs: 100,
        serialize: JSON.stringify,
        deserialize: JSON.parse,
      });
      jest.advanceTimersByTime(200); // memory is cold
      await c.get('k'); // remote hit warms memory
      // Second get should NOT call remote store again
      store.get.mockResolvedValue(null);
      const val = await c.get('k');
      expect(val).toBe('warm');
      await c.disconnect();
    });

    it('returns null (does not throw) when store.get fails', async () => {
      const store = makeStore({ get: () => Promise.reject(new Error('Redis down')) });
      const c = new MultiLevelCache<string>({ name: 'c5', store: store as any, memoryTtlMs: 1 });
      jest.advanceTimersByTime(100);
      const val = await c.get('k');
      expect(val).toBeNull();
      await c.disconnect();
    });

    it('throws when store.set fails', async () => {
      const store = makeStore({ set: () => Promise.reject(new Error('Redis write error')) });
      const c = new MultiLevelCache<string>({ name: 'c6', store: store as any });
      await expect(c.set('k', 'v')).rejects.toThrow('Redis write error');
      await c.disconnect();
    });
  });

  // ─── getAndDelete ──────────────────────────────────────────────────────────

  describe('getAndDelete', () => {
    it('returns the value and removes it from memory', async () => {
      await cache.set('k', 'v');
      const val = await cache.getAndDelete('k');
      expect(val).toBe('v');
      expect(await cache.get('k')).toBeNull();
    });

    it('returns null when key does not exist', async () => {
      expect(await cache.getAndDelete('missing')).toBeNull();
    });

    it('reads from remote and deletes when memory is expired', async () => {
      const store = makeStore({ get: () => Promise.resolve(JSON.stringify('remote')) });
      const c = new MultiLevelCache<string>({
        name: 'c7',
        store: store as any,
        memoryTtlMs: 1,
        serialize: JSON.stringify,
        deserialize: JSON.parse,
      });
      jest.advanceTimersByTime(100);
      const val = await c.getAndDelete('k');
      expect(val).toBe('remote');
      expect(store.del).toHaveBeenCalled();
      await c.disconnect();
    });

    it('also removes from remote when memory entry is live', async () => {
      const store = makeStore();
      const c = new MultiLevelCache<string>({ name: 'c8', store: store as any, memoryTtlMs: 5000 });
      await c.set('k', 'v');
      await c.getAndDelete('k');
      expect(store.del).toHaveBeenCalled();
      await c.disconnect();
    });

    it('returns null and does not throw on error', async () => {
      const store = makeStore({ get: () => Promise.reject(new Error('bang')) });
      const c = new MultiLevelCache<string>({ name: 'c9', store: store as any, memoryTtlMs: 1 });
      jest.advanceTimersByTime(100);
      const val = await c.getAndDelete('k');
      expect(val).toBeNull();
      await c.disconnect();
    });
  });

  // ─── has ──────────────────────────────────────────────────────────────────

  describe('has', () => {
    it('returns true when key exists in memory', async () => {
      await cache.set('k', 'v');
      expect(await cache.has('k')).toBe(true);
    });

    it('returns false when key does not exist', async () => {
      expect(await cache.has('missing')).toBe(false);
    });
  });

  // ─── delete ───────────────────────────────────────────────────────────────

  describe('delete', () => {
    it('returns true when memory key is removed', async () => {
      await cache.set('k', 'v');
      expect(await cache.delete('k')).toBe(true);
      expect(await cache.get('k')).toBeNull();
    });

    it('returns false for a key that was never set', async () => {
      expect(await cache.delete('never-set')).toBe(false);
    });

    it('calls store.del when store is available', async () => {
      const store = makeStore();
      const c = new MultiLevelCache<string>({ name: 'c10', store: store as any, memoryTtlMs: 5000 });
      await c.set('k', 'v');
      await c.delete('k');
      expect(store.del).toHaveBeenCalled();
      await c.disconnect();
    });
  });

  // ─── clear ────────────────────────────────────────────────────────────────

  describe('clear', () => {
    it('removes all memory entries', async () => {
      await cache.set('k1', 'v1');
      await cache.set('k2', 'v2');
      await cache.clear();
      expect(await cache.get('k1')).toBeNull();
      expect(await cache.get('k2')).toBeNull();
    });

    it('calls del for all remote keys returned by store.keys', async () => {
      const store = makeStore({ keys: () => Promise.resolve(['prefix:k1', 'prefix:k2']) });
      const c = new MultiLevelCache<string>({ name: 'c11', store: store as any, memoryTtlMs: 5000 });
      await c.clear();
      expect(store.del).toHaveBeenCalledTimes(2);
      await c.disconnect();
    });
  });

  // ─── getStats ─────────────────────────────────────────────────────────────

  describe('getStats', () => {
    it('returns name and memorySize', async () => {
      await cache.set('k', 'v');
      const stats = cache.getStats();
      expect(stats.name).toBe('test-cache');
      expect(stats.memorySize).toBe(1);
      expect(stats.memoryCapacity).toBe(Infinity);
    });
  });

  // ─── cleanup interval ─────────────────────────────────────────────────────

  describe('cleanup interval', () => {
    it('removes expired entries on cleanup tick', async () => {
      await cache.set('k', 'v');
      jest.advanceTimersByTime(6000); // expire the entry (5s TTL)
      jest.advanceTimersByTime(30000); // fire cleanup interval
      expect(cache.getStats().memorySize).toBe(0);
    });
  });

  // ─── disconnect ───────────────────────────────────────────────────────────

  describe('disconnect', () => {
    it('clears memory and stops the cleanup interval', async () => {
      await cache.set('k', 'v');
      await cache.disconnect();
      expect(await cache.get('k')).toBeNull();
    });

    it('can be called multiple times without throwing', async () => {
      await cache.disconnect();
      await expect(cache.disconnect()).resolves.toBeUndefined();
    });
  });

  // ─── key prefix ───────────────────────────────────────────────────────────

  describe('key prefix', () => {
    it('uses custom keyPrefix when provided', async () => {
      const store = makeStore();
      const c = new MultiLevelCache<string>({ name: 'c12', store: store as any, keyPrefix: 'my-prefix:' });
      await c.set('k', 'v');
      expect(store.set).toHaveBeenCalledWith('my-prefix:k', expect.any(String), expect.any(Number));
      await c.disconnect();
    });
  });

  // ─── custom serialize/deserialize ─────────────────────────────────────────

  describe('custom serialize / deserialize', () => {
    it('uses custom serialize/deserialize', async () => {
      const store = makeStore({ get: () => Promise.resolve('__custom__') });
      const deserialize = jest.fn(() => 'deserialized');
      const serialize = jest.fn((v: string) => `<<${v}>>`);
      const c = new MultiLevelCache<string>({
        name: 'c13',
        store: store as any,
        serialize,
        deserialize,
        memoryTtlMs: 1,
      });
      await c.set('k', 'original');
      expect(serialize).toHaveBeenCalledWith('original');
      jest.advanceTimersByTime(100); // expire memory
      const val = await c.get('k');
      expect(val).toBe('deserialized');
      await c.disconnect();
    });
  });
});
