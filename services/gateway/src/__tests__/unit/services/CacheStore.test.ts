import { RedisCacheStore } from '../../../services/CacheStore';

describe('RedisCacheStore (memory-only mode)', () => {
  let store: RedisCacheStore;

  beforeEach(() => {
    store = new RedisCacheStore();
  });

  afterEach(async () => {
    await store.close();
  });

  test('get returns null for missing key', async () => {
    const result = await store.get('nonexistent');
    expect(result).toBeNull();
  });

  test('set and get round-trip', async () => {
    await store.set('greeting', 'hello');
    const result = await store.get('greeting');
    expect(result).toBe('hello');
  });

  test('set with TTL expires entry', async () => {
    await store.set('ephemeral', 'value', 1);
    const before = await store.get('ephemeral');
    expect(before).toBe('value');

    await new Promise(resolve => setTimeout(resolve, 1100));

    const after = await store.get('ephemeral');
    expect(after).toBeNull();
  });

  test('del removes entry', async () => {
    await store.set('toDelete', 'value');
    await store.del('toDelete');
    const result = await store.get('toDelete');
    expect(result).toBeNull();
  });

  test('setnx returns true on new key, false on existing', async () => {
    const first = await store.setnx('unique', 'v1');
    expect(first).toBe(true);

    const second = await store.setnx('unique', 'v2');
    expect(second).toBe(false);

    const value = await store.get('unique');
    expect(value).toBe('v1');
  });

  test('keys returns matching keys with glob pattern', async () => {
    await store.set('user:1:name', 'alice');
    await store.set('user:2:name', 'bob');
    await store.set('post:1:title', 'hello');

    const userKeys = await store.keys('user:*');
    expect(userKeys).toHaveLength(2);
    expect(userKeys).toContain('user:1:name');
    expect(userKeys).toContain('user:2:name');

    const allKeys = await store.keys('*');
    expect(allKeys).toHaveLength(3);
  });

  test('isAvailable returns false without Redis', () => {
    expect(store.isAvailable()).toBe(false);
  });

  test('expire() updates TTL for an existing memory key and returns true', async () => {
    await store.set('ttl-key', 'value', 300);
    const result = await store.expire('ttl-key', 7200);
    expect(result).toBe(true);
  });

  test('expire() returns false when key is not in memory', async () => {
    const result = await store.expire('nonexistent-key', 60);
    expect(result).toBe(false);
  });

  test('publish() returns 0 without Redis', async () => {
    const result = await store.publish('my-channel', 'hello');
    expect(result).toBe(0);
  });

  test('info() returns simulated memory stats without Redis', async () => {
    const result = await store.info();
    expect(result).toContain('# Memory');
  });
});

describe('RedisCacheStore — startMemoryCacheCleanup interval', () => {
  it('removes expired entries but keeps live ones when the cleanup interval fires', () => {
    jest.useFakeTimers();
    try {
      const store = new RedisCacheStore();
      const cache = (store as any).memoryCache as Map<string, { value: string; expiresAt: number }>;
      cache.set('stale', { value: 'v', expiresAt: Date.now() - 1 });
      cache.set('live', { value: 'v', expiresAt: Date.now() + 100_000 });

      jest.advanceTimersByTime(60_001);

      expect(cache.has('stale')).toBe(false);
      expect(cache.has('live')).toBe(true);

      store.close();
    } finally {
      jest.useRealTimers();
    }
  });
});
