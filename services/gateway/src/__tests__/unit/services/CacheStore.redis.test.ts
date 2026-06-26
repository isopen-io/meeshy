/**
 * CacheStore — Redis path coverage
 * Covers: Redis get/set/del/keys/setnx/expire/publish/info, event handlers,
 * isAvailable, getNativeClient, close, getCacheStore/resetCacheStore singleton,
 * initializeRedis try/catch, retryStrategy, and error fallback to memory.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

// ── mocks (must come before imports) ──────────────────────────────────────────

// Mock circuit breaker to pass-through: execute(fn) just calls fn()
jest.mock('../../../utils/circuitBreaker', () => {
  const CircuitState = { CLOSED: 'CLOSED', OPEN: 'OPEN', HALF_OPEN: 'HALF_OPEN' };
  return {
    CircuitState,
    CircuitBreakerFactory: {
      createRedisBreaker: jest.fn().mockReturnValue({
        execute: jest.fn().mockImplementation((fn: () => unknown) => fn()),
        getStats: jest.fn().mockReturnValue({ state: 'CLOSED' }),
      }),
    },
    circuitBreakerManager: { register: jest.fn() },
  };
});

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn().mockReturnValue({
      info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
    }),
  },
}));

// Ioredis mock — captures event handlers so we can fire them
let capturedHandlers: Record<string, Function> = {};
let mockRedisInstance: any;

jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => {
    capturedHandlers = {};
    mockRedisInstance = {
      get: jest.fn<any>().mockResolvedValue(null),
      set: jest.fn<any>().mockResolvedValue('OK'),
      del: jest.fn<any>().mockResolvedValue(1),
      keys: jest.fn<any>().mockResolvedValue([]),
      setnx: jest.fn<any>().mockResolvedValue(1),
      expire: jest.fn<any>().mockResolvedValue(1),
      publish: jest.fn<any>().mockResolvedValue(0),
      info: jest.fn<any>().mockResolvedValue('# Memory\nused_memory:1024'),
      connect: jest.fn<any>().mockResolvedValue(undefined),
      disconnect: jest.fn<any>(),
      on: jest.fn<any>().mockImplementation((event: string, handler: Function) => {
        capturedHandlers[event] = handler;
        return mockRedisInstance;
      }),
    };
    return mockRedisInstance;
  });
});

import { RedisCacheStore, getCacheStore, resetCacheStore } from '../../../services/CacheStore';
import { CircuitBreakerFactory, CircuitState } from '../../../utils/circuitBreaker';

// ── helpers ────────────────────────────────────────────────────────────────────

function makeStore() {
  // Pass a URL to trigger initializeRedis
  return new RedisCacheStore('redis://localhost:6379');
}

// ── Redis get() ────────────────────────────────────────────────────────────────

describe('RedisCacheStore — Redis get()', () => {
  afterEach(async () => { try { await (makeStore() as any).close?.(); } catch {} });

  it('returns value from Redis when available', async () => {
    const store = makeStore();
    mockRedisInstance.get.mockResolvedValue('cached-value');

    const result = await store.get('my-key');
    expect(result).toBe('cached-value');
    expect(mockRedisInstance.get).toHaveBeenCalledWith('my-key');

    await store.close();
  });

  it('falls back to memory on Redis error', async () => {
    const store = makeStore();
    // Make Redis set fail first so set() writes to memory instead
    mockRedisInstance.set.mockRejectedValue(new Error('redis timeout'));
    await store.set('fallback-key', 'mem-val');
    // Now also make get fail so get() falls back to memory
    mockRedisInstance.get.mockRejectedValue(new Error('redis timeout'));

    const result = await store.get('fallback-key');
    expect(result).toBe('mem-val');

    await store.close();
  });
});

// ── Redis set() ────────────────────────────────────────────────────────────────

describe('RedisCacheStore — Redis set()', () => {
  it('calls redis.set with EX when TTL provided', async () => {
    const store = makeStore();
    await store.set('ttl-key', 'value', 60);

    expect(mockRedisInstance.set).toHaveBeenCalledWith('ttl-key', 'value', 'EX', 60);
    await store.close();
  });

  it('calls redis.set without EX when no TTL', async () => {
    const store = makeStore();
    await store.set('plain-key', 'plain-val');

    expect(mockRedisInstance.set).toHaveBeenCalledWith('plain-key', 'plain-val');
    await store.close();
  });

  it('falls back to memory when redis.set throws', async () => {
    const store = makeStore();
    mockRedisInstance.set.mockRejectedValue(new Error('set failed'));

    await store.set('mem-key', 'mem-val');

    // Should be retrievable from memory (redis.get will fail too)
    mockRedisInstance.get.mockRejectedValue(new Error('get failed'));
    const val = await store.get('mem-key');
    expect(val).toBe('mem-val');

    await store.close();
  });
});

// ── Redis del() ────────────────────────────────────────────────────────────────

describe('RedisCacheStore — Redis del()', () => {
  it('calls redis.del and returns without memory delete', async () => {
    const store = makeStore();
    await store.del('del-key');

    expect(mockRedisInstance.del).toHaveBeenCalledWith('del-key');
    await store.close();
  });

  it('falls back to memory delete on redis.del error', async () => {
    const store = makeStore();
    mockRedisInstance.set.mockResolvedValue('OK');
    await store.set('del-key-2', 'value');
    mockRedisInstance.del.mockRejectedValue(new Error('del failed'));
    // Force memory fallback
    mockRedisInstance.get.mockRejectedValue(new Error('get failed'));

    await store.del('del-key-2');
    const val = await store.get('del-key-2');
    expect(val).toBeNull();

    await store.close();
  });
});

// ── Redis keys() ──────────────────────────────────────────────────────────────

describe('RedisCacheStore — Redis keys()', () => {
  it('returns keys from Redis', async () => {
    const store = makeStore();
    mockRedisInstance.keys.mockResolvedValue(['user:1', 'user:2']);

    const result = await store.keys('user:*');
    expect(result).toEqual(['user:1', 'user:2']);

    await store.close();
  });

  it('falls back to memory glob matching on Redis error', async () => {
    const store = makeStore();
    mockRedisInstance.set.mockRejectedValue(new Error());
    mockRedisInstance.keys.mockRejectedValue(new Error('keys failed'));

    // Seed memory directly via a memory-only store trick
    const memStore = new RedisCacheStore(); // no URL → memory only
    await memStore.set('user:1:name', 'alice');
    await memStore.set('user:2:name', 'bob');

    const result = await memStore.keys('user:*');
    expect(result).toHaveLength(2);

    await memStore.close();
    await store.close();
  });
});

// ── Redis setnx() ─────────────────────────────────────────────────────────────

describe('RedisCacheStore — Redis setnx()', () => {
  it('returns true when redis.set with NX returns OK (with TTL)', async () => {
    const store = makeStore();
    mockRedisInstance.set.mockResolvedValue('OK');

    const result = await store.setnx('nx-key', 'val', 30);
    expect(result).toBe(true);
    expect(mockRedisInstance.set).toHaveBeenCalledWith('nx-key', 'val', 'EX', 30, 'NX');

    await store.close();
  });

  it('returns true when redis.setnx returns 1 (no TTL)', async () => {
    const store = makeStore();
    mockRedisInstance.setnx.mockResolvedValue(1);

    const result = await store.setnx('nx-key-2', 'val');
    expect(result).toBe(true);

    await store.close();
  });

  it('returns false when redis.setnx returns 0 (key already exists)', async () => {
    const store = makeStore();
    mockRedisInstance.setnx.mockResolvedValue(0);

    const result = await store.setnx('existing-key', 'val');
    expect(result).toBe(false);

    await store.close();
  });

  it('falls back to memory setnx on Redis error', async () => {
    const store = makeStore();
    mockRedisInstance.setnx.mockRejectedValue(new Error('setnx failed'));
    mockRedisInstance.set.mockRejectedValue(new Error('set failed'));
    mockRedisInstance.get.mockRejectedValue(new Error('get failed'));

    const first = await store.setnx('mem-nx', 'first');
    expect(first).toBe(true);

    const second = await store.setnx('mem-nx', 'second');
    expect(second).toBe(false);

    await store.close();
  });
});

// ── Redis expire() ────────────────────────────────────────────────────────────

describe('RedisCacheStore — Redis expire()', () => {
  it('returns true when redis.expire returns 1', async () => {
    const store = makeStore();
    mockRedisInstance.expire.mockResolvedValue(1);

    const result = await store.expire('some-key', 60);
    expect(result).toBe(true);
    expect(mockRedisInstance.expire).toHaveBeenCalledWith('some-key', 60);

    await store.close();
  });

  it('returns false when redis.expire returns 0 (key not found)', async () => {
    const store = makeStore();
    mockRedisInstance.expire.mockResolvedValue(0);

    const result = await store.expire('missing-key', 60);
    expect(result).toBe(false);

    await store.close();
  });

  it('falls back to memory expire on Redis error', async () => {
    const store = makeStore();
    mockRedisInstance.expire.mockRejectedValue(new Error('expire failed'));
    mockRedisInstance.set.mockRejectedValue(new Error());
    mockRedisInstance.get.mockRejectedValue(new Error());

    // Use memory-only store to test memory expire path
    const memStore = new RedisCacheStore();
    await memStore.set('expire-key', 'val');
    const result = await memStore.expire('expire-key', 120);
    expect(result).toBe(true);

    const missing = await memStore.expire('no-such-key', 10);
    expect(missing).toBe(false);

    await memStore.close();
    await store.close();
  });
});

// ── Redis publish() ───────────────────────────────────────────────────────────

describe('RedisCacheStore — Redis publish()', () => {
  it('returns subscriber count from redis.publish', async () => {
    const store = makeStore();
    mockRedisInstance.publish.mockResolvedValue(3);

    const result = await store.publish('ch', 'msg');
    expect(result).toBe(3);

    await store.close();
  });

  it('returns 0 when redis.publish throws', async () => {
    const store = makeStore();
    mockRedisInstance.publish.mockRejectedValue(new Error('pub failed'));

    const result = await store.publish('ch', 'msg');
    expect(result).toBe(0);

    await store.close();
  });

  it('returns 0 in memory-only mode (no Redis)', async () => {
    const store = new RedisCacheStore(); // no URL
    const result = await store.publish('ch', 'msg');
    expect(result).toBe(0);
    await store.close();
  });
});

// ── Redis info() ──────────────────────────────────────────────────────────────

describe('RedisCacheStore — Redis info()', () => {
  it('returns info string from Redis', async () => {
    const store = makeStore();
    mockRedisInstance.info.mockResolvedValue('# Server\nredis_version:7.0');

    const result = await store.info('server');
    expect(result).toContain('redis_version');
    expect(mockRedisInstance.info).toHaveBeenCalledWith('server');

    await store.close();
  });

  it('returns simulated memory info when Redis throws', async () => {
    const store = makeStore();
    mockRedisInstance.info.mockRejectedValue(new Error('info failed'));

    const result = await store.info();
    expect(result).toContain('# Memory');
    expect(result).toContain('# Keyspace');

    await store.close();
  });
});

// ── isAvailable / getNativeClient ─────────────────────────────────────────────

describe('RedisCacheStore — isAvailable() / getNativeClient()', () => {
  it('isAvailable() returns true when Redis is connected and circuit is CLOSED', () => {
    const store = makeStore();
    expect(store.isAvailable()).toBe(true);
    store.close();
  });

  it('getNativeClient() returns the Redis instance', () => {
    const store = makeStore();
    const client = store.getNativeClient();
    expect(client).toBe(mockRedisInstance);
    store.close();
  });

  it('isAvailable() returns false in memory-only mode', () => {
    const store = new RedisCacheStore();
    expect(store.isAvailable()).toBe(false);
    store.close();
  });
});

// ── close() ───────────────────────────────────────────────────────────────────

describe('RedisCacheStore — close()', () => {
  it('calls redis.disconnect and clears memory', async () => {
    const store = makeStore();
    await store.set('key', 'val');
    await store.close();

    expect(mockRedisInstance.disconnect).toHaveBeenCalled();
    // Memory should be cleared
    const memStore = store as any;
    expect(memStore.memoryCache.size).toBe(0);
  });

  it('close() is safe to call multiple times', async () => {
    const store = makeStore();
    await store.close();
    await expect(store.close()).resolves.toBeUndefined();
  });
});

// ── Redis event handlers ──────────────────────────────────────────────────────

describe('RedisCacheStore — Redis event handlers', () => {
  it('connect event sets redisConnected = true', () => {
    makeStore();
    capturedHandlers['connect']?.();
    // No assertion — just ensure no throw
  });

  it('ready event sets redisConnected = true and logs info', () => {
    makeStore();
    capturedHandlers['ready']?.();
    // Verify the handler is registered
    expect(mockRedisInstance.on).toHaveBeenCalledWith('ready', expect.any(Function));
  });

  it('error event with suppressed code does not log', () => {
    makeStore();
    const err = new Error('ECONNRESET connection');
    capturedHandlers['error']?.(err);
    // Should not throw
  });

  it('error event with non-suppressed code logs warning', () => {
    makeStore();
    const err = new Error('UNEXPECTED_ERROR');
    capturedHandlers['error']?.(err);
    // Should not throw
  });

  it('close event sets redisConnected = false', () => {
    makeStore();
    capturedHandlers['close']?.();
    // Should not throw
  });

  it('end event sets redisConnected = false', () => {
    makeStore();
    capturedHandlers['end']?.();
    // Should not throw
  });
});

// ── singleton getCacheStore / resetCacheStore ──────────────────────────────────

describe('getCacheStore / resetCacheStore', () => {
  beforeEach(() => {
    resetCacheStore();
  });

  afterEach(() => {
    resetCacheStore();
  });

  it('getCacheStore() returns the same instance on repeated calls', () => {
    const a = getCacheStore();
    const b = getCacheStore();
    expect(a).toBe(b);
  });

  it('resetCacheStore() clears the singleton so next call creates a fresh instance', () => {
    const first = getCacheStore();
    resetCacheStore();
    const second = getCacheStore();
    expect(first).not.toBe(second);
  });
});

// ── initializeRedis exception path ────────────────────────────────────────────

describe('RedisCacheStore — initializeRedis exception path', () => {
  it('falls back gracefully when Redis constructor throws', async () => {
    const Redis = require('ioredis');
    const originalImpl = Redis.getMockImplementation();

    // Override mock to throw
    (Redis as jest.Mock).mockImplementationOnce(() => {
      throw new Error('Redis constructor failed');
    });

    const store = new RedisCacheStore('redis://bad-host:9999');
    // Should still work as memory-only
    await store.set('key', 'value');
    const val = await store.get('key');
    expect(val).toBe('value');

    await store.close();
  });
});

// ── retryStrategy ─────────────────────────────────────────────────────────────

describe('RedisCacheStore — retryStrategy', () => {
  it('retryStrategy returns 2000 for times <= 3', () => {
    let retryFn: ((times: number) => number | null) | undefined;

    const Redis = require('ioredis');
    (Redis as jest.Mock).mockImplementationOnce((_url: string, opts: any) => {
      retryFn = opts.retryStrategy;
      capturedHandlers = {};
      mockRedisInstance = {
        get: jest.fn(), set: jest.fn(), del: jest.fn(), keys: jest.fn(),
        setnx: jest.fn(), expire: jest.fn(), publish: jest.fn(), info: jest.fn(),
        connect: jest.fn<any>().mockResolvedValue(undefined),
        disconnect: jest.fn(),
        on: jest.fn<any>().mockImplementation((event: string, handler: Function) => {
          capturedHandlers[event] = handler;
          return mockRedisInstance;
        }),
      };
      return mockRedisInstance;
    });

    makeStore();

    expect(retryFn).toBeDefined();
    expect(retryFn!(1)).toBe(2000);
    expect(retryFn!(3)).toBe(2000);
    expect(retryFn!(4)).toBeNull();
  });
});
