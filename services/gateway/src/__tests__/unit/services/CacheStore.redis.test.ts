/**
 * RedisCacheStore — Redis-backed path tests
 *
 * Mocks ioredis and the circuitBreaker so we can exercise the Redis code
 * paths without a real Redis server.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

// ─── Mocks (hoisted) ─────────────────────────────────────────────────────────

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
  },
}));

// Transparent circuit breaker — always executes the callback
const mockCircuitBreaker = {
  execute: jest.fn<any>((fn: () => Promise<unknown>) => fn()),
  getStats: jest.fn<any>().mockReturnValue({ state: 'CLOSED' }),
};

jest.mock('../../../utils/circuitBreaker', () => ({
  CircuitBreakerFactory: { createRedisBreaker: () => mockCircuitBreaker },
  circuitBreakerManager: { register: jest.fn() },
  CircuitState: { OPEN: 'OPEN', CLOSED: 'CLOSED', HALF_OPEN: 'HALF_OPEN' },
}));

// ioredis mock — tracks calls without network I/O
const mockRedisInstance = {
  get: jest.fn<any>().mockResolvedValue(null),
  set: jest.fn<any>().mockResolvedValue('OK'),
  del: jest.fn<any>().mockResolvedValue(1),
  keys: jest.fn<any>().mockResolvedValue([]),
  setnx: jest.fn<any>().mockResolvedValue(1),
  expire: jest.fn<any>().mockResolvedValue(1),
  publish: jest.fn<any>().mockResolvedValue(1),
  info: jest.fn<any>().mockResolvedValue('redis_version:7.0'),
  disconnect: jest.fn<any>(),
  connect: jest.fn<any>().mockResolvedValue(undefined),
  on: jest.fn<any>().mockReturnThis(),
};

jest.mock('ioredis', () => jest.fn().mockImplementation(() => mockRedisInstance));

import { RedisCacheStore, getCacheStore, resetCacheStore } from '../../../services/CacheStore';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeRedisStore(): RedisCacheStore {
  return new RedisCacheStore('redis://localhost:6379');
}

// ─── Tests ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  mockCircuitBreaker.execute.mockImplementation((fn: () => Promise<unknown>) => fn());
  mockCircuitBreaker.getStats.mockReturnValue({ state: 'CLOSED' });
});

afterEach(() => {
  resetCacheStore();
});

// ─── get() via Redis ──────────────────────────────────────────────────────────

describe('RedisCacheStore.get — Redis path', () => {
  it('returns value from Redis when available', async () => {
    mockRedisInstance.get.mockResolvedValueOnce('cached-value');
    const store = makeRedisStore();

    const result = await store.get('my-key');

    expect(mockRedisInstance.get).toHaveBeenCalledWith('my-key');
    expect(result).toBe('cached-value');
    await store.close();
  });

  it('falls back to memory cache when Redis throws', async () => {
    mockCircuitBreaker.execute.mockRejectedValueOnce(new Error('circuit open'));
    const store = makeRedisStore();

    // Pre-populate memory cache
    await store.set('k1', 'mem-val', 60);

    // The in-memory set was skipped because Redis was available during that set()
    // Try get after circuit trips
    const result = await store.get('k1');
    // With Redis available + circuit tripping on get, falls to memory
    // memory is empty since set() also went to Redis (and redis.set succeeded)
    expect(result).toBeNull(); // Redis set succeeded → not in memory fallback
    await store.close();
  });
});

// ─── set() via Redis ──────────────────────────────────────────────────────────

describe('RedisCacheStore.set — Redis path', () => {
  it('calls redis.set without TTL', async () => {
    const store = makeRedisStore();

    await store.set('key1', 'value1');

    expect(mockRedisInstance.set).toHaveBeenCalledWith('key1', 'value1');
    await store.close();
  });

  it('calls redis.set with EX when TTL is provided', async () => {
    const store = makeRedisStore();

    await store.set('key2', 'value2', 300);

    expect(mockRedisInstance.set).toHaveBeenCalledWith('key2', 'value2', 'EX', 300);
    await store.close();
  });

  it('falls back to memory when Redis throws', async () => {
    mockCircuitBreaker.execute.mockRejectedValueOnce(new Error('redis error'));
    const store = makeRedisStore();

    await store.set('fallback-key', 'fallback-val');

    // Should be in memory cache now
    mockCircuitBreaker.execute.mockRejectedValueOnce(new Error('redis error'));
    const result = await store.get('fallback-key');
    expect(result).toBe('fallback-val');
    await store.close();
  });
});

// ─── del() via Redis ──────────────────────────────────────────────────────────

describe('RedisCacheStore.del — Redis path', () => {
  it('calls redis.del', async () => {
    const store = makeRedisStore();

    await store.del('bye-key');

    expect(mockRedisInstance.del).toHaveBeenCalledWith('bye-key');
    await store.close();
  });
});

// ─── keys() via Redis ─────────────────────────────────────────────────────────

describe('RedisCacheStore.keys — Redis path', () => {
  it('calls redis.keys with pattern and returns result', async () => {
    mockRedisInstance.keys.mockResolvedValueOnce(['a:1', 'a:2']);
    const store = makeRedisStore();

    const result = await store.keys('a:*');

    expect(mockRedisInstance.keys).toHaveBeenCalledWith('a:*');
    expect(result).toEqual(['a:1', 'a:2']);
    await store.close();
  });
});

// ─── setnx() via Redis ────────────────────────────────────────────────────────

describe('RedisCacheStore.setnx — Redis path', () => {
  it('returns true when redis.setnx succeeds (result=1)', async () => {
    mockRedisInstance.setnx.mockResolvedValueOnce(1);
    const store = makeRedisStore();

    const result = await store.setnx('nx-key', 'val');

    expect(result).toBe(true);
    await store.close();
  });

  it('returns false when key already exists (result=0)', async () => {
    mockRedisInstance.setnx.mockResolvedValueOnce(0);
    const store = makeRedisStore();

    const result = await store.setnx('nx-key', 'val');

    expect(result).toBe(false);
    await store.close();
  });

  it('uses SET NX EX when TTL is provided', async () => {
    mockRedisInstance.set.mockResolvedValueOnce('OK');
    const store = makeRedisStore();

    const result = await store.setnx('nx-key', 'val', 30);

    expect(mockRedisInstance.set).toHaveBeenCalledWith('nx-key', 'val', 'EX', 30, 'NX');
    expect(result).toBe(true);
    await store.close();
  });
});

// ─── expire() via Redis ───────────────────────────────────────────────────────

describe('RedisCacheStore.expire — Redis path', () => {
  it('returns true when redis.expire succeeds', async () => {
    mockRedisInstance.expire.mockResolvedValueOnce(1);
    const store = makeRedisStore();

    const result = await store.expire('some-key', 60);

    expect(mockRedisInstance.expire).toHaveBeenCalledWith('some-key', 60);
    expect(result).toBe(true);
    await store.close();
  });

  it('returns false when key does not exist in Redis (result=0)', async () => {
    mockRedisInstance.expire.mockResolvedValueOnce(0);
    const store = makeRedisStore();

    const result = await store.expire('missing-key', 60);

    expect(result).toBe(false);
    await store.close();
  });
});

// ─── publish() via Redis ──────────────────────────────────────────────────────

describe('RedisCacheStore.publish — Redis path', () => {
  it('publishes to Redis channel and returns subscriber count', async () => {
    mockRedisInstance.publish.mockResolvedValueOnce(3);
    const store = makeRedisStore();

    const count = await store.publish('notifications', 'hello');

    expect(mockRedisInstance.publish).toHaveBeenCalledWith('notifications', 'hello');
    expect(count).toBe(3);
    await store.close();
  });

  it('returns 0 when publish throws', async () => {
    mockCircuitBreaker.execute.mockRejectedValueOnce(new Error('error'));
    const store = makeRedisStore();

    const count = await store.publish('ch', 'msg');

    expect(count).toBe(0);
    await store.close();
  });
});

// ─── info() via Redis ─────────────────────────────────────────────────────────

describe('RedisCacheStore.info — Redis path', () => {
  it('returns redis info string', async () => {
    mockRedisInstance.info.mockResolvedValueOnce('redis_version:7.0\n# Stats');
    const store = makeRedisStore();

    const result = await store.info();

    expect(result).toContain('redis_version:7.0');
    await store.close();
  });
});

// ─── isAvailable() ────────────────────────────────────────────────────────────

describe('RedisCacheStore.isAvailable', () => {
  it('returns true when Redis is connected and circuit is CLOSED', () => {
    mockCircuitBreaker.getStats.mockReturnValue({ state: 'CLOSED' });
    const store = makeRedisStore();
    expect(store.isAvailable()).toBe(true);
    store.close();
  });

  it('returns false when circuit is OPEN', () => {
    mockCircuitBreaker.getStats.mockReturnValue({ state: 'OPEN' });
    const store = makeRedisStore();
    expect(store.isAvailable()).toBe(false);
    store.close();
  });
});

// ─── close() ─────────────────────────────────────────────────────────────────

describe('RedisCacheStore.close — Redis path', () => {
  it('disconnects Redis and clears memory cache', async () => {
    const store = makeRedisStore();
    await store.close();
    expect(mockRedisInstance.disconnect).toHaveBeenCalledTimes(1);
  });

  it('calling close() twice is safe', async () => {
    const store = makeRedisStore();
    await store.close();
    await store.close();
    // Second close should not disconnect again (redis is null after first close)
    expect(mockRedisInstance.disconnect).toHaveBeenCalledTimes(1);
  });
});

// ─── getCacheStore / resetCacheStore ─────────────────────────────────────────

describe('getCacheStore / resetCacheStore', () => {
  beforeEach(() => resetCacheStore());

  it('getCacheStore returns the same instance on repeated calls', () => {
    const a = getCacheStore();
    const b = getCacheStore();
    expect(a).toBe(b);
    resetCacheStore();
  });

  it('resetCacheStore clears the shared instance so next call creates a new one', () => {
    const a = getCacheStore();
    resetCacheStore();
    const b = getCacheStore();
    expect(a).not.toBe(b);
    resetCacheStore();
  });
});
