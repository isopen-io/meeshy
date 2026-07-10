import { RedisDeliveryQueue } from '../../../services/RedisDeliveryQueue';
import { RedisCacheStore } from '../../../services/CacheStore';
import type { CacheStore } from '../../../services/CacheStore';
import type { QueuedMessagePayload } from '@meeshy/shared/types/delivery-queue';
import { DELIVERY_QUEUE_TTL_SECONDS } from '@meeshy/shared/types/delivery-queue';

function makePayload(overrides: Partial<QueuedMessagePayload> = {}): QueuedMessagePayload {
  return {
    messageId: 'msg-001',
    conversationId: 'conv-001',
    payload: { content: 'hello', senderId: 'user-a' },
    enqueuedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeMemoryQueue() {
  const cacheStore = new RedisCacheStore();
  const queue = new RedisDeliveryQueue(cacheStore);
  return { cacheStore, queue };
}

describe('RedisDeliveryQueue (memory fallback)', () => {
  test('enqueue adds message to queue', async () => {
    const { cacheStore, queue } = makeMemoryQueue();
    try {
      const entry = makePayload();
      await queue.enqueue('user-1', entry);

      const size = await queue.size('user-1');
      expect(size).toBe(1);
    } finally {
      await cacheStore.close();
    }
  });

  test('drain returns all messages and clears queue', async () => {
    const { cacheStore, queue } = makeMemoryQueue();
    try {
      const entry1 = makePayload({ messageId: 'msg-001' });
      const entry2 = makePayload({ messageId: 'msg-002' });

      await queue.enqueue('user-1', entry1);
      await queue.enqueue('user-1', entry2);

      const drained = await queue.drain('user-1');
      expect(drained).toHaveLength(2);
      expect(drained[0].messageId).toBe('msg-001');
      expect(drained[1].messageId).toBe('msg-002');

      const remaining = await queue.size('user-1');
      expect(remaining).toBe(0);
    } finally {
      await cacheStore.close();
    }
  });

  test('drain returns empty array when no messages', async () => {
    const { cacheStore, queue } = makeMemoryQueue();
    try {
      const drained = await queue.drain('user-nonexistent');
      expect(drained).toEqual([]);
    } finally {
      await cacheStore.close();
    }
  });

  test('enqueue multiple messages preserves FIFO order', async () => {
    const { cacheStore, queue } = makeMemoryQueue();
    try {
      const ids = ['msg-a', 'msg-b', 'msg-c', 'msg-d'];
      for (const id of ids) {
        await queue.enqueue('user-1', makePayload({ messageId: id }));
      }

      const drained = await queue.drain('user-1');
      expect(drained.map(d => d.messageId)).toEqual(ids);
    } finally {
      await cacheStore.close();
    }
  });

  test('size returns correct count', async () => {
    const { cacheStore, queue } = makeMemoryQueue();
    try {
      expect(await queue.size('user-1')).toBe(0);

      await queue.enqueue('user-1', makePayload({ messageId: 'msg-1' }));
      expect(await queue.size('user-1')).toBe(1);

      await queue.enqueue('user-1', makePayload({ messageId: 'msg-2' }));
      expect(await queue.size('user-1')).toBe(2);

      await queue.drain('user-1');
      expect(await queue.size('user-1')).toBe(0);
    } finally {
      await cacheStore.close();
    }
  });

  test('queues are isolated per user', async () => {
    const { cacheStore, queue } = makeMemoryQueue();
    try {
      await queue.enqueue('user-a', makePayload({ messageId: 'msg-for-a' }));
      await queue.enqueue('user-b', makePayload({ messageId: 'msg-for-b' }));

      const drainedA = await queue.drain('user-a');
      expect(drainedA).toHaveLength(1);
      expect(drainedA[0].messageId).toBe('msg-for-a');

      const drainedB = await queue.drain('user-b');
      expect(drainedB).toHaveLength(1);
      expect(drainedB[0].messageId).toBe('msg-for-b');
    } finally {
      await cacheStore.close();
    }
  });

  test('peek returns messages without removing them', async () => {
    const { cacheStore, queue } = makeMemoryQueue();
    try {
      await queue.enqueue('user-1', makePayload({ messageId: 'msg-1' }));
      await queue.enqueue('user-1', makePayload({ messageId: 'msg-2' }));

      const peeked = await queue.peek('user-1');
      expect(peeked).toHaveLength(2);

      const size = await queue.size('user-1');
      expect(size).toBe(2);
    } finally {
      await cacheStore.close();
    }
  });

  test('peek respects limit parameter', async () => {
    const { cacheStore, queue } = makeMemoryQueue();
    try {
      await queue.enqueue('user-1', makePayload({ messageId: 'msg-1' }));
      await queue.enqueue('user-1', makePayload({ messageId: 'msg-2' }));
      await queue.enqueue('user-1', makePayload({ messageId: 'msg-3' }));

      const peeked = await queue.peek('user-1', 2);
      expect(peeked).toHaveLength(2);
      expect(peeked[0].messageId).toBe('msg-1');
      expect(peeked[1].messageId).toBe('msg-2');
    } finally {
      await cacheStore.close();
    }
  });

  test('cleanup removes expired entries', async () => {
    const { cacheStore, queue } = makeMemoryQueue();
    try {
      const expired = makePayload({
        messageId: 'old-msg',
        enqueuedAt: new Date(Date.now() - 49 * 60 * 60 * 1000).toISOString(),
      });
      const fresh = makePayload({
        messageId: 'new-msg',
        enqueuedAt: new Date().toISOString(),
      });

      await queue.enqueue('user-1', expired);
      await queue.enqueue('user-1', fresh);

      const removed = await queue.cleanup();
      expect(removed).toBe(1);

      const remaining = await queue.drain('user-1');
      expect(remaining).toHaveLength(1);
      expect(remaining[0].messageId).toBe('new-msg');
    } finally {
      await cacheStore.close();
    }
  });

  test('cleanup handles multiple users', async () => {
    const { cacheStore, queue } = makeMemoryQueue();
    try {
      const expired = makePayload({
        messageId: 'old',
        enqueuedAt: new Date(Date.now() - 49 * 60 * 60 * 1000).toISOString(),
      });

      await queue.enqueue('user-a', expired);
      await queue.enqueue('user-b', expired);
      await queue.enqueue('user-a', makePayload({ messageId: 'fresh' }));

      const removed = await queue.cleanup();
      expect(removed).toBe(2);

      expect(await queue.size('user-a')).toBe(1);
      expect(await queue.size('user-b')).toBe(0);
    } finally {
      await cacheStore.close();
    }
  });
});

// ---------------------------------------------------------------------------
// Redis-backed paths — gap fill
// ---------------------------------------------------------------------------

describe('RedisDeliveryQueue (Redis-backed paths)', () => {
  test('enqueue — writes to Redis via pipeline (rpush + expire in one round-trip)', async () => {
    const pipeline = makePipeline();
    pipeline.exec.mockResolvedValue([[null, 1], [null, 1]]);
    const redis = makeMockRedis({ pipeline: jest.fn().mockReturnValue(pipeline) });
    const queue = new RedisDeliveryQueue(makeCacheStore(redis));
    const entry = makePayload({ messageId: 'redis-msg-1' });

    await queue.enqueue('user-r', entry);

    expect(redis.pipeline).toHaveBeenCalled();
    expect(pipeline.rpush).toHaveBeenCalledWith(
      'delivery:queue:user-r',
      JSON.stringify(entry)
    );
    expect(pipeline.expire).toHaveBeenCalledWith(
      'delivery:queue:user-r',
      expect.any(Number)
    );
    expect(pipeline.exec).toHaveBeenCalled();
  });

  test('enqueue — falls back to memory when Redis pipeline exec throws', async () => {
    const pipeline = makeFailingEnqueuePipeline(new Error('conn reset'));
    const redis = makeMockRedis({ pipeline: jest.fn().mockReturnValue(pipeline) });
    redis.llen.mockRejectedValue(new Error('conn reset'));
    const queue = new RedisDeliveryQueue(makeCacheStore(redis));

    await queue.enqueue('user-fallback', makePayload({ messageId: 'fb-msg' }));

    // size also falls back to memory because llen throws
    const size = await queue.size('user-fallback');
    expect(size).toBe(1);
  });

  test('drain — uses atomic Lua eval and returns parsed entries', async () => {
    const entry = makePayload({ messageId: 'drain-redis' });
    const redis = makeMockRedis({ eval: jest.fn().mockResolvedValue([JSON.stringify(entry)]) });
    const queue = new RedisDeliveryQueue(makeCacheStore(redis));

    const drained = await queue.drain('user-r');

    expect(redis.eval).toHaveBeenCalledWith(expect.any(String), 1, 'delivery:queue:user-r');
    expect(drained).toHaveLength(1);
    expect(drained[0].messageId).toBe('drain-redis');
  });

  test('drain — returns empty array when eval returns non-array', async () => {
    const redis = makeMockRedis({ eval: jest.fn().mockResolvedValue(null) });
    const queue = new RedisDeliveryQueue(makeCacheStore(redis));

    expect(await queue.drain('user-r')).toEqual([]);
  });

  test('drain — falls back to memory when Redis eval throws', async () => {
    const entry = makePayload({ messageId: 'drain-fallback' });
    const redis = makeMockRedis({ eval: jest.fn().mockRejectedValue(new Error('eval fail')) });

    const cacheStore: any = { getNativeClient: jest.fn() };
    // First call (enqueue) returns null → memory path
    cacheStore.getNativeClient
      .mockReturnValueOnce(null)
      .mockReturnValue(redis);

    const queue = new RedisDeliveryQueue(cacheStore);
    await queue.enqueue('user-r', entry);

    const drained = await queue.drain('user-r');
    expect(drained).toHaveLength(1);
    expect(drained[0].messageId).toBe('drain-fallback');
  });

  test('peek — queries lrange(0, limit-1) when limit specified', async () => {
    const entries = [
      makePayload({ messageId: 'p1' }),
      makePayload({ messageId: 'p2' }),
    ];
    const redis = makeMockRedis();
    redis.lrange.mockResolvedValue(entries.map(e => JSON.stringify(e)));
    const queue = new RedisDeliveryQueue(makeCacheStore(redis));

    const peeked = await queue.peek('user-r', 2);

    expect(redis.lrange).toHaveBeenCalledWith('delivery:queue:user-r', 0, 1);
    expect(peeked).toHaveLength(2);
    expect(peeked[0].messageId).toBe('p1');
  });

  test('peek — queries lrange(0, -1) when no limit specified', async () => {
    const redis = makeMockRedis();
    redis.lrange.mockResolvedValue([]);
    const queue = new RedisDeliveryQueue(makeCacheStore(redis));

    await queue.peek('user-r');

    expect(redis.lrange).toHaveBeenCalledWith('delivery:queue:user-r', 0, -1);
  });

  test('peek — falls back to memory when Redis lrange throws', async () => {
    const entry = makePayload({ messageId: 'peek-fallback' });
    const redis = makeMockRedis();
    redis.lrange.mockRejectedValue(new Error('lrange fail'));

    const cacheStore: any = { getNativeClient: jest.fn() };
    cacheStore.getNativeClient
      .mockReturnValueOnce(null)  // enqueue → memory
      .mockReturnValue(redis);    // peek → failing Redis → memory fallback

    const queue = new RedisDeliveryQueue(cacheStore);
    await queue.enqueue('user-r', entry);
    const peeked = await queue.peek('user-r');

    expect(peeked).toHaveLength(1);
    expect(peeked[0].messageId).toBe('peek-fallback');
  });

  test('size — calls Redis llen and returns the count', async () => {
    const redis = makeMockRedis();
    redis.llen.mockResolvedValue(7);
    const queue = new RedisDeliveryQueue(makeCacheStore(redis));

    expect(await queue.size('user-r')).toBe(7);
    expect(redis.llen).toHaveBeenCalledWith('delivery:queue:user-r');
  });

  test('size — falls back to memory when Redis llen throws', async () => {
    const redis = makeMockRedis();
    redis.llen.mockRejectedValue(new Error('llen fail'));

    const cacheStore: any = { getNativeClient: jest.fn() };
    cacheStore.getNativeClient
      .mockReturnValueOnce(null)  // enqueue → memory
      .mockReturnValue(redis);    // size → failing Redis → memory fallback

    const queue = new RedisDeliveryQueue(cacheStore);
    await queue.enqueue('user-r', makePayload());
    expect(await queue.size('user-r')).toBe(1);
  });

  test('cleanup — scans keys and rebuilds list after removing stale entries', async () => {
    const stale = makePayload({
      messageId: 'stale',
      enqueuedAt: new Date(Date.now() - 49 * 60 * 60 * 1000).toISOString(),
    });
    const fresh = makePayload({ messageId: 'fresh' });
    const pipeline = makePipeline();
    pipeline.exec.mockResolvedValue([[null, 1], [null, 1], [null, 1]]);

    const redis = makeMockRedis({ pipeline: jest.fn().mockReturnValue(pipeline) });
    redis.scan.mockResolvedValue(['0', ['delivery:queue:user-r']]);
    redis.lrange.mockResolvedValue([JSON.stringify(stale), JSON.stringify(fresh)]);

    const queue = new RedisDeliveryQueue(makeCacheStore(redis));
    const removed = await queue.cleanup();

    expect(removed).toBe(1);
    expect(pipeline.del).toHaveBeenCalled();
    expect(pipeline.rpush).toHaveBeenCalled();
    expect(pipeline.expire).toHaveBeenCalled();
  });

  test('cleanup — removes entire key when all entries are stale', async () => {
    const stale = makePayload({
      messageId: 'all-stale',
      enqueuedAt: new Date(Date.now() - 49 * 60 * 60 * 1000).toISOString(),
    });
    const pipeline = makePipeline();
    pipeline.exec.mockResolvedValue([[null, 1]]);

    const redis = makeMockRedis({ pipeline: jest.fn().mockReturnValue(pipeline) });
    redis.scan.mockResolvedValue(['0', ['delivery:queue:user-r']]);
    redis.lrange.mockResolvedValue([JSON.stringify(stale)]);

    const queue = new RedisDeliveryQueue(makeCacheStore(redis));
    const removed = await queue.cleanup();

    expect(removed).toBe(1);
    expect(pipeline.del).toHaveBeenCalled();
    expect(pipeline.rpush).not.toHaveBeenCalled();
  });

  test('cleanup — falls back to memory when Redis scan throws', async () => {
    const redis = makeMockRedis();
    redis.scan.mockRejectedValue(new Error('scan fail'));

    const stale = makePayload({
      messageId: 'mem-stale',
      enqueuedAt: new Date(Date.now() - 49 * 60 * 60 * 1000).toISOString(),
    });

    const cacheStore: any = { getNativeClient: jest.fn() };
    cacheStore.getNativeClient
      .mockReturnValueOnce(null)  // enqueue → memory
      .mockReturnValue(redis);    // cleanup → failing Redis → memory fallback

    const queue = new RedisDeliveryQueue(cacheStore);
    await queue.enqueue('user-r', stale);

    expect(await queue.cleanup()).toBe(1);
  });
});

describe('RedisDeliveryQueue (memory capacity limits)', () => {
  test('evicts oldest user bucket when MEMORY_QUEUE_MAX_USERS is reached', async () => {
    const queue = new RedisDeliveryQueue(makeCacheStore(null));
    const memQueue: Map<string, any[]> = (queue as any).memoryQueue;

    for (let i = 0; i < 1000; i++) {
      memQueue.set(`slot-${i}`, [makePayload({ messageId: `m${i}` })]);
    }
    expect(memQueue.size).toBe(1000);

    await queue.enqueue('overflow-user', makePayload({ messageId: 'overflow' }));

    expect(memQueue.size).toBe(1000);
    expect(memQueue.has('overflow-user')).toBe(true);
    expect(memQueue.has('slot-0')).toBe(false);
  });

  test('truncates oldest entries when MEMORY_QUEUE_MAX_PER_USER is reached', async () => {
    const queue = new RedisDeliveryQueue(makeCacheStore(null));

    for (let i = 0; i < 50; i++) {
      await queue.enqueue('user-cap', makePayload({ messageId: `msg-${i}` }));
    }
    expect(await queue.size('user-cap')).toBe(50);

    await queue.enqueue('user-cap', makePayload({ messageId: 'msg-overflow' }));

    expect(await queue.size('user-cap')).toBe(50);
    const items = await queue.drain('user-cap');
    expect(items[0].messageId).toBe('msg-1');
    expect(items[49].messageId).toBe('msg-overflow');
  });
});

// ---------------------------------------------------------------------------
// Branch gap-fill: rangeError throw path + cleanup no-stale + drain null[0]
// ---------------------------------------------------------------------------

describe('RedisDeliveryQueue (branch gap-fill)', () => {
  test('drain — falls back to memory when eval throws (legacy: rangeError path)', async () => {
    const entry = makePayload({ messageId: 'range-err-fallback' });
    const redis = makeMockRedis({ eval: jest.fn().mockRejectedValue(new Error('eval error')) });

    const cacheStore: any = { getNativeClient: jest.fn() };
    cacheStore.getNativeClient
      .mockReturnValueOnce(null) // enqueue → memory
      .mockReturnValue(redis);   // drain → eval throws → memory fallback

    const queue = new RedisDeliveryQueue(cacheStore);
    await queue.enqueue('user-r', entry);

    const drained = await queue.drain('user-r');
    expect(drained).toHaveLength(1);
    expect(drained[0].messageId).toBe('range-err-fallback');
  });

  test('drain — returns empty when eval returns non-array (null)', async () => {
    const redis = makeMockRedis({ eval: jest.fn().mockResolvedValue(null) });
    const queue = new RedisDeliveryQueue(makeCacheStore(redis));

    expect(await queue.drain('user-r')).toEqual([]);
  });

  test('cleanup — returns 0 and skips rebuild when no entries are stale', async () => {
    const fresh = makePayload({ messageId: 'fresh-only', enqueuedAt: new Date().toISOString() });
    const pipeline = makePipeline();
    const redis = makeMockRedis({ pipeline: jest.fn().mockReturnValue(pipeline) });
    redis.scan.mockResolvedValue(['0', ['delivery:queue:user-r']]);
    redis.lrange.mockResolvedValue([JSON.stringify(fresh)]);

    const queue = new RedisDeliveryQueue(makeCacheStore(redis));
    const removed = await queue.cleanup();

    expect(removed).toBe(0);
    expect(pipeline.del).not.toHaveBeenCalled();
    expect(pipeline.rpush).not.toHaveBeenCalled();
  });
});

// ─── Helpers for Redis-path tests ─────────────────────────────────────────────

type MockPipeline = {
  lrange: jest.MockedFunction<() => MockPipeline>;
  del: jest.MockedFunction<() => MockPipeline>;
  rpush: jest.MockedFunction<(...args: unknown[]) => MockPipeline>;
  expire: jest.MockedFunction<() => MockPipeline>;
  exec: jest.MockedFunction<() => Promise<unknown>>;
};

function makePipeline(execResult: unknown = [[null, []], [null, 1]]): MockPipeline {
  const pipeline: MockPipeline = {
    lrange: jest.fn().mockReturnThis(),
    del: jest.fn().mockReturnThis(),
    rpush: jest.fn().mockReturnThis(),
    expire: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue(execResult),
  } as unknown as MockPipeline;
  return pipeline;
}

function makeFailingEnqueuePipeline(error = new Error('pipeline exec fail')): MockPipeline {
  return {
    lrange: jest.fn().mockReturnThis(),
    del: jest.fn().mockReturnThis(),
    rpush: jest.fn().mockReturnThis(),
    expire: jest.fn().mockReturnThis(),
    exec: jest.fn().mockRejectedValue(error),
  } as unknown as MockPipeline;
}

function makeMockRedis(overrides: Record<string, unknown> = {}) {
  const pipeline = makePipeline();
  return {
    rpush: jest.fn().mockResolvedValue(1),
    expire: jest.fn().mockResolvedValue(1),
    lrange: jest.fn().mockResolvedValue([]),
    del: jest.fn().mockResolvedValue(1),
    llen: jest.fn().mockResolvedValue(0),
    scan: jest.fn().mockResolvedValue(['0', []]),
    eval: jest.fn().mockResolvedValue([]),
    pipeline: jest.fn().mockReturnValue(pipeline),
    _pipeline: pipeline,
    ...overrides,
  };
}

function makeCacheStore(redis: unknown = null): CacheStore {
  return {
    getNativeClient: jest.fn().mockReturnValue(redis),
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    keys: jest.fn(),
    setnx: jest.fn(),
    expire: jest.fn(),
    publish: jest.fn(),
    info: jest.fn(),
    isAvailable: jest.fn(),
    close: jest.fn().mockResolvedValue(undefined),
  } as unknown as CacheStore;
}

// ─── Redis-path tests ──────────────────────────────────────────────────────────

describe('RedisDeliveryQueue (Redis path)', () => {
  test('enqueue calls rpush + expire via pipeline and bypasses memory queue', async () => {
    const pipeline = makePipeline([[null, 1], [null, 1]]);
    const redis = makeMockRedis({ pipeline: jest.fn().mockReturnValue(pipeline) });
    const queue = new RedisDeliveryQueue(makeCacheStore(redis));
    const entry = makePayload({ messageId: 'r-1' });

    await queue.enqueue('user-redis', entry);

    expect(redis.pipeline).toHaveBeenCalled();
    expect(pipeline.rpush).toHaveBeenCalledWith(
      expect.stringContaining('user-redis'),
      JSON.stringify(entry),
    );
    expect(pipeline.expire).toHaveBeenCalledWith(
      expect.stringContaining('user-redis'),
      DELIVERY_QUEUE_TTL_SECONDS,
    );
    expect(pipeline.exec).toHaveBeenCalled();
    // memory fallback was NOT used
    expect(await queue.size('user-redis')).toBe(0);
  });

  test('drain uses atomic eval and returns parsed entries', async () => {
    const entry = makePayload({ messageId: 'drain-1' });
    const redis = makeMockRedis({ eval: jest.fn().mockResolvedValue([JSON.stringify(entry)]) });
    const queue = new RedisDeliveryQueue(makeCacheStore(redis));

    const result = await queue.drain('user-drain');

    expect(result).toHaveLength(1);
    expect(result[0].messageId).toBe('drain-1');
    expect(redis.eval).toHaveBeenCalledWith(
      expect.stringContaining('LRANGE'),
      1,
      expect.stringContaining('user-drain'),
    );
  });

  test('drain returns [] when eval returns null', async () => {
    const redis = makeMockRedis({ eval: jest.fn().mockResolvedValue(null) });
    const queue = new RedisDeliveryQueue(makeCacheStore(redis));

    const result = await queue.drain('user-null');
    expect(result).toEqual([]);
  });

  test('drain returns [] when eval returns empty array (key did not exist)', async () => {
    const redis = makeMockRedis({ eval: jest.fn().mockResolvedValue([]) });
    const queue = new RedisDeliveryQueue(makeCacheStore(redis));

    const result = await queue.drain('user-empty');
    expect(result).toEqual([]);
  });

  test('drain falls back to memory when eval throws', async () => {
    const redis = makeMockRedis({ eval: jest.fn().mockRejectedValue(new Error('eval error')) });
    const queue = new RedisDeliveryQueue(makeCacheStore(redis));

    // eval fails → falls back to memory (empty for this key)
    const result = await queue.drain('user-err');
    expect(result).toEqual([]);
  });

  test('drain — concurrent callers: second receives empty (atomic semantics)', async () => {
    const entry = makePayload({ messageId: 'concurrent-msg' });
    let callCount = 0;
    const redis = makeMockRedis({
      eval: jest.fn().mockImplementation(() => {
        callCount++;
        return callCount === 1
          ? Promise.resolve([JSON.stringify(entry)])
          : Promise.resolve([]);
      }),
    });
    const cacheStore = makeCacheStore(redis);
    const q1 = new RedisDeliveryQueue(cacheStore);
    const q2 = new RedisDeliveryQueue(cacheStore);

    const [r1, r2] = await Promise.all([
      q1.drain('user-concurrent'),
      q2.drain('user-concurrent'),
    ]);

    expect([...r1, ...r2]).toHaveLength(1);
    expect(redis.eval).toHaveBeenCalledTimes(2);
  });

  test('peek with limit calls lrange(key, 0, limit-1)', async () => {
    const e1 = makePayload({ messageId: 'p-1' });
    const e2 = makePayload({ messageId: 'p-2' });
    const redis = makeMockRedis({
      lrange: jest.fn().mockResolvedValue([JSON.stringify(e1), JSON.stringify(e2)]),
    });
    const queue = new RedisDeliveryQueue(makeCacheStore(redis));

    const result = await queue.peek('user-peek', 2);

    expect(redis.lrange).toHaveBeenCalledWith(expect.any(String), 0, 1);
    expect(result).toHaveLength(2);
    expect(result[0].messageId).toBe('p-1');
  });

  test('peek without limit calls lrange(key, 0, -1)', async () => {
    const redis = makeMockRedis({ lrange: jest.fn().mockResolvedValue([]) });
    const queue = new RedisDeliveryQueue(makeCacheStore(redis));

    await queue.peek('user-peek-nolimit');

    expect(redis.lrange).toHaveBeenCalledWith(expect.any(String), 0, -1);
  });

  test('size calls llen and returns the count', async () => {
    const redis = makeMockRedis({ llen: jest.fn().mockResolvedValue(7) });
    const queue = new RedisDeliveryQueue(makeCacheStore(redis));

    expect(await queue.size('user-size')).toBe(7);
    expect(redis.llen).toHaveBeenCalled();
  });

  test('cleanup scans Redis keys and removes expired entries', async () => {
    const fresh = makePayload({ messageId: 'fresh', enqueuedAt: new Date().toISOString() });
    const old = makePayload({
      messageId: 'old',
      enqueuedAt: new Date(Date.now() - 49 * 60 * 60 * 1000).toISOString(),
    });
    const pipeline = makePipeline([[null, 1]]);
    const redis = makeMockRedis({
      scan: jest.fn().mockResolvedValue(['0', ['delivery:queue:u1']]),
      lrange: jest.fn().mockResolvedValue([JSON.stringify(old), JSON.stringify(fresh)]),
      pipeline: jest.fn().mockReturnValue(pipeline),
    });
    const queue = new RedisDeliveryQueue(makeCacheStore(redis));

    const removed = await queue.cleanup();

    expect(removed).toBe(1);
    expect(pipeline.del).toHaveBeenCalled();
    expect(pipeline.rpush).toHaveBeenCalled();
    expect(pipeline.expire).toHaveBeenCalledWith(
      expect.any(String),
      DELIVERY_QUEUE_TTL_SECONDS,
    );
  });

  test('cleanup skips key when all entries are fresh (removed === 0)', async () => {
    const fresh = makePayload({ messageId: 'fresh', enqueuedAt: new Date().toISOString() });
    const pipeline = makePipeline([[null, 1]]);
    const redis = makeMockRedis({
      scan: jest.fn().mockResolvedValue(['0', ['delivery:queue:u-fresh']]),
      lrange: jest.fn().mockResolvedValue([JSON.stringify(fresh)]),
      pipeline: jest.fn().mockReturnValue(pipeline),
    });
    const queue = new RedisDeliveryQueue(makeCacheStore(redis));

    const removed = await queue.cleanup();

    expect(removed).toBe(0);
    expect(pipeline.exec).not.toHaveBeenCalled();
  });

  test('cleanup deletes key when all entries are expired and no fresh remain', async () => {
    const old = makePayload({
      messageId: 'old',
      enqueuedAt: new Date(Date.now() - 49 * 60 * 60 * 1000).toISOString(),
    });
    const pipeline = makePipeline([[null, 1]]);
    const redis = makeMockRedis({
      scan: jest.fn().mockResolvedValue(['0', ['delivery:queue:u-all-old']]),
      lrange: jest.fn().mockResolvedValue([JSON.stringify(old)]),
      pipeline: jest.fn().mockReturnValue(pipeline),
    });
    const queue = new RedisDeliveryQueue(makeCacheStore(redis));

    const removed = await queue.cleanup();

    expect(removed).toBe(1);
    expect(pipeline.del).toHaveBeenCalled();
    expect(pipeline.rpush).not.toHaveBeenCalled();
  });

  test('cleanup iterates multiple cursor pages', async () => {
    const fresh = makePayload({ messageId: 'f', enqueuedAt: new Date().toISOString() });
    let scanCall = 0;
    const redis = makeMockRedis({
      scan: jest.fn().mockImplementation(() => {
        scanCall += 1;
        return scanCall === 1
          ? Promise.resolve(['cursor1', ['delivery:queue:page1']])
          : Promise.resolve(['0', ['delivery:queue:page2']]);
      }),
      lrange: jest.fn().mockResolvedValue([JSON.stringify(fresh)]),
    });
    const queue = new RedisDeliveryQueue(makeCacheStore(redis));

    await queue.cleanup();

    expect(redis.scan).toHaveBeenCalledTimes(2);
  });
});

// ─── Redis-error fallback tests ────────────────────────────────────────────────

describe('RedisDeliveryQueue (Redis error → memory fallback)', () => {
  test('enqueue falls back to memory when Redis pipeline.exec throws', async () => {
    const redis = makeMockRedis({
      pipeline: jest.fn().mockReturnValue(makeFailingEnqueuePipeline(new Error('Redis down'))),
      llen: jest.fn().mockRejectedValue(new Error('Redis down')),
    });
    const queue = new RedisDeliveryQueue(makeCacheStore(redis));
    const entry = makePayload({ messageId: 'fallback-1' });

    await queue.enqueue('user-fb', entry);

    // pipeline.exec and llen both fail → memory used for enqueue and size
    const size = await queue.size('user-fb');
    expect(size).toBe(1);
  });

  test('drain falls back to memory when Redis eval throws', async () => {
    const failingRedis = makeMockRedis({
      pipeline: jest.fn().mockReturnValue(makeFailingEnqueuePipeline(new Error('down'))),
      eval: jest.fn().mockRejectedValue(new Error('Redis eval failed')),
    });
    const q2 = new RedisDeliveryQueue(makeCacheStore(failingRedis));
    await q2.enqueue('user-d', makePayload({ messageId: 'mem-1' }));

    // Drain should fall back to memory
    const result = await q2.drain('user-d');
    expect(result).toHaveLength(1);
    expect(result[0].messageId).toBe('mem-1');
  });

  test('peek falls back to memory when Redis lrange throws', async () => {
    const redis = makeMockRedis({
      pipeline: jest.fn().mockReturnValue(makeFailingEnqueuePipeline(new Error('rpush fail'))),
      lrange: jest.fn().mockRejectedValue(new Error('lrange error')),
    });
    const queue = new RedisDeliveryQueue(makeCacheStore(redis));

    // pipeline.exec fails → enqueue uses memory; lrange fails → peek uses memory
    await queue.enqueue('user-pk', makePayload({ messageId: 'pk-1' }));
    await queue.enqueue('user-pk', makePayload({ messageId: 'pk-2' }));

    const result = await queue.peek('user-pk', 1);
    expect(result).toHaveLength(1);
    expect(result[0].messageId).toBe('pk-1');
  });

  test('size falls back to memory when Redis llen throws', async () => {
    const redis = makeMockRedis({
      pipeline: jest.fn().mockReturnValue(makeFailingEnqueuePipeline(new Error('rpush fail'))),
      llen: jest.fn().mockRejectedValue(new Error('llen fail')),
    });
    const queue = new RedisDeliveryQueue(makeCacheStore(redis));
    await queue.enqueue('user-sz', makePayload());

    const size = await queue.size('user-sz');
    expect(size).toBe(1);
  });

  test('cleanup falls back to memory when Redis scan throws', async () => {
    // Add to memory by failing pipeline.exec on enqueue, then scan fails → memory cleanup
    const failRedis = makeMockRedis({
      pipeline: jest.fn().mockReturnValue(makeFailingEnqueuePipeline(new Error('rpush fail'))),
      scan: jest.fn().mockRejectedValue(new Error('scan error')),
    });
    const q2 = new RedisDeliveryQueue(makeCacheStore(failRedis));
    const expired = makePayload({
      messageId: 'expired',
      enqueuedAt: new Date(Date.now() - 49 * 60 * 60 * 1000).toISOString(),
    });
    await q2.enqueue('user-cl', expired);

    const removed = await q2.cleanup();
    expect(removed).toBe(1);
  });
});

// ─── Memory boundary tests ─────────────────────────────────────────────────────

describe('RedisDeliveryQueue (memory boundary conditions)', () => {
  test('evicts oldest user bucket when MEMORY_QUEUE_MAX_USERS (1000) is reached', async () => {
    const queue = new RedisDeliveryQueue(makeCacheStore(null));
    const internalMap: Map<string, QueuedMessagePayload[]> = (queue as unknown as { memoryQueue: Map<string, QueuedMessagePayload[]> }).memoryQueue;

    // Fill exactly 1000 user buckets directly (avoiding 1000 async calls)
    for (let i = 0; i < 1000; i++) {
      internalMap.set(`preloaded-${i}`, [makePayload()]);
    }
    expect(internalMap.size).toBe(1000);

    // Enqueueing a new user triggers eviction of the first inserted key
    await queue.enqueue('brand-new-user', makePayload({ messageId: 'evicted-test' }));

    expect(internalMap.size).toBe(1000);
    expect(internalMap.has('preloaded-0')).toBe(false);
    expect(internalMap.has('brand-new-user')).toBe(true);
  });

  test('does NOT evict when enqueueing for an existing user at capacity', async () => {
    const queue = new RedisDeliveryQueue(makeCacheStore(null));
    const internalMap: Map<string, QueuedMessagePayload[]> = (queue as unknown as { memoryQueue: Map<string, QueuedMessagePayload[]> }).memoryQueue;

    for (let i = 0; i < 1000; i++) {
      internalMap.set(`user-${i}`, [makePayload()]);
    }

    // Existing user 'user-0' re-enqueues — no eviction
    await queue.enqueue('user-0', makePayload({ messageId: 'extra-for-existing' }));

    expect(internalMap.size).toBe(1000);
    expect(internalMap.has('user-0')).toBe(true);
  });

  test('caps per-user queue at MEMORY_QUEUE_MAX_PER_USER (50) and drops oldest', async () => {
    const queue = new RedisDeliveryQueue(makeCacheStore(null));

    for (let i = 0; i < 50; i++) {
      await queue.enqueue('user-cap', makePayload({ messageId: `msg-${i}` }));
    }
    expect(await queue.size('user-cap')).toBe(50);

    await queue.enqueue('user-cap', makePayload({ messageId: 'msg-50' }));

    const entries = await queue.drain('user-cap');
    expect(entries).toHaveLength(50);
    expect(entries[0].messageId).toBe('msg-1');
    expect(entries[49].messageId).toBe('msg-50');
  });

  test('exactly at per-user cap does not drop (50th message is kept)', async () => {
    const queue = new RedisDeliveryQueue(makeCacheStore(null));

    for (let i = 0; i < 49; i++) {
      await queue.enqueue('user-edge', makePayload({ messageId: `msg-${i}` }));
    }
    await queue.enqueue('user-edge', makePayload({ messageId: 'msg-49' }));

    expect(await queue.size('user-edge')).toBe(50);
    const entries = await queue.drain('user-edge');
    expect(entries[0].messageId).toBe('msg-0');
    expect(entries[49].messageId).toBe('msg-49');
  });

  test('peek on an unknown userId returns empty array (memory ?? [] branch)', async () => {
    const queue = new RedisDeliveryQueue(makeCacheStore(null));
    const result = await queue.peek('unknown-user-peek');
    expect(result).toEqual([]);
  });
});
