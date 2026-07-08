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
  test('enqueue — writes to Redis via idempotent eval (dedup Lua script)', async () => {
    const redis = makeMockRedis({ eval: jest.fn().mockResolvedValue(1) });
    const queue = new RedisDeliveryQueue(makeCacheStore(redis));
    const entry = makePayload({ messageId: 'redis-msg-1' });

    await queue.enqueue('user-r', entry);

    expect(redis.eval).toHaveBeenCalledWith(
      expect.stringContaining('RPUSH'),
      1,
      'delivery:queue:user-r',
      JSON.stringify(entry),
      entry.messageId,
      String(DELIVERY_QUEUE_TTL_SECONDS),
      'new'
    );
  });

  test('enqueue — falls back to memory when Redis eval throws', async () => {
    const redis = makeMockRedis({ eval: jest.fn().mockRejectedValue(new Error('conn reset')) });
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

  test('cleanup — removes only the stale entry by value, preserving the fresh one', async () => {
    const stale = makePayload({
      messageId: 'stale',
      enqueuedAt: new Date(Date.now() - 49 * 60 * 60 * 1000).toISOString(),
    });
    const fresh = makePayload({ messageId: 'fresh' });

    const redis = makeMockRedis({ eval: jest.fn().mockResolvedValue(1) });
    redis.scan.mockResolvedValue(['0', ['delivery:queue:user-r']]);
    redis.lrange.mockResolvedValue([JSON.stringify(stale), JSON.stringify(fresh)]);

    const queue = new RedisDeliveryQueue(makeCacheStore(redis));
    const removed = await queue.cleanup();

    expect(removed).toBe(1);
    // Value-targeted removal: only the stale entry is passed to LREM — the fresh
    // one is never in the ARGV list, and the whole key is never DEL'd.
    expect(redis.eval).toHaveBeenCalledWith(
      expect.stringContaining('LREM'),
      1,
      'delivery:queue:user-r',
      JSON.stringify(stale),
    );
    expect(redis.del).not.toHaveBeenCalled();
  });

  test('cleanup — removes every entry by value when all are stale', async () => {
    const stale = makePayload({
      messageId: 'all-stale',
      enqueuedAt: new Date(Date.now() - 49 * 60 * 60 * 1000).toISOString(),
    });

    const redis = makeMockRedis({ eval: jest.fn().mockResolvedValue(1) });
    redis.scan.mockResolvedValue(['0', ['delivery:queue:user-r']]);
    redis.lrange.mockResolvedValue([JSON.stringify(stale)]);

    const queue = new RedisDeliveryQueue(makeCacheStore(redis));
    const removed = await queue.cleanup();

    expect(removed).toBe(1);
    expect(redis.eval).toHaveBeenCalledWith(
      expect.stringContaining('LREM'),
      1,
      'delivery:queue:user-r',
      JSON.stringify(stale),
    );
    expect(redis.del).not.toHaveBeenCalled();
  });

  test('cleanup — never targets a message enqueued after the snapshot (race regression)', async () => {
    // The LRANGE snapshot cleanup reads contains only a stale entry. A message
    // that arrives AFTER that snapshot (a different value) must survive: the
    // atomic prune removes entries by exact value and never DELs the whole key,
    // so a concurrently-enqueued message can no longer be silently wiped.
    const stale = makePayload({
      messageId: 'stale',
      enqueuedAt: new Date(Date.now() - 49 * 60 * 60 * 1000).toISOString(),
    });
    const concurrent = makePayload({ messageId: 'arrives-during-cleanup' });

    const evalCalls: unknown[][] = [];
    const redis = makeMockRedis({
      eval: jest.fn().mockImplementation((...args: unknown[]) => {
        evalCalls.push(args);
        return Promise.resolve(1);
      }),
    });
    redis.scan.mockResolvedValue(['0', ['delivery:queue:user-r']]);
    redis.lrange.mockResolvedValue([JSON.stringify(stale)]); // snapshot predates `concurrent`

    const queue = new RedisDeliveryQueue(makeCacheStore(redis));
    await queue.cleanup();

    const prune = evalCalls.find(a => typeof a[0] === 'string' && (a[0] as string).includes('LREM'));
    expect(prune).toBeDefined();
    const targeted = (prune as unknown[]).slice(3);
    expect(targeted).toContain(JSON.stringify(stale));
    expect(targeted).not.toContain(JSON.stringify(concurrent));
    expect(redis.del).not.toHaveBeenCalled();
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

  test('cleanup — returns 0 and issues no removal when no entries are stale', async () => {
    const fresh = makePayload({ messageId: 'fresh-only', enqueuedAt: new Date().toISOString() });
    const redis = makeMockRedis();
    redis.scan.mockResolvedValue(['0', ['delivery:queue:user-r']]);
    redis.lrange.mockResolvedValue([JSON.stringify(fresh)]);

    const queue = new RedisDeliveryQueue(makeCacheStore(redis));
    const removed = await queue.cleanup();

    expect(removed).toBe(0);
    expect(redis.eval).not.toHaveBeenCalled();
    expect(redis.del).not.toHaveBeenCalled();
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
  test('enqueue uses idempotent eval and bypasses memory queue', async () => {
    const redis = makeMockRedis({ eval: jest.fn().mockResolvedValue(1) });
    const queue = new RedisDeliveryQueue(makeCacheStore(redis));
    const entry = makePayload({ messageId: 'r-1' });

    await queue.enqueue('user-redis', entry);

    expect(redis.eval).toHaveBeenCalledWith(
      expect.stringContaining('RPUSH'),
      1,
      expect.stringContaining('user-redis'),
      JSON.stringify(entry),
      entry.messageId,
      String(DELIVERY_QUEUE_TTL_SECONDS),
      'new',
    );
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

  test('cleanup scans Redis keys and removes expired entries by value', async () => {
    const fresh = makePayload({ messageId: 'fresh', enqueuedAt: new Date().toISOString() });
    const old = makePayload({
      messageId: 'old',
      enqueuedAt: new Date(Date.now() - 49 * 60 * 60 * 1000).toISOString(),
    });
    const redis = makeMockRedis({
      scan: jest.fn().mockResolvedValue(['0', ['delivery:queue:u1']]),
      lrange: jest.fn().mockResolvedValue([JSON.stringify(old), JSON.stringify(fresh)]),
      eval: jest.fn().mockResolvedValue(1),
    });
    const queue = new RedisDeliveryQueue(makeCacheStore(redis));

    const removed = await queue.cleanup();

    expect(removed).toBe(1);
    expect(redis.eval).toHaveBeenCalledWith(
      expect.stringContaining('LREM'),
      1,
      'delivery:queue:u1',
      JSON.stringify(old),
    );
    expect(redis.del).not.toHaveBeenCalled();
  });

  test('cleanup skips key when all entries are fresh (removed === 0)', async () => {
    const fresh = makePayload({ messageId: 'fresh', enqueuedAt: new Date().toISOString() });
    const redis = makeMockRedis({
      scan: jest.fn().mockResolvedValue(['0', ['delivery:queue:u-fresh']]),
      lrange: jest.fn().mockResolvedValue([JSON.stringify(fresh)]),
    });
    const queue = new RedisDeliveryQueue(makeCacheStore(redis));

    const removed = await queue.cleanup();

    expect(removed).toBe(0);
    expect(redis.eval).not.toHaveBeenCalled();
  });

  test('cleanup removes every entry by value when all are expired', async () => {
    const old = makePayload({
      messageId: 'old',
      enqueuedAt: new Date(Date.now() - 49 * 60 * 60 * 1000).toISOString(),
    });
    const redis = makeMockRedis({
      scan: jest.fn().mockResolvedValue(['0', ['delivery:queue:u-all-old']]),
      lrange: jest.fn().mockResolvedValue([JSON.stringify(old)]),
      eval: jest.fn().mockResolvedValue(1),
    });
    const queue = new RedisDeliveryQueue(makeCacheStore(redis));

    const removed = await queue.cleanup();

    expect(removed).toBe(1);
    expect(redis.eval).toHaveBeenCalledWith(
      expect.stringContaining('LREM'),
      1,
      'delivery:queue:u-all-old',
      JSON.stringify(old),
    );
    expect(redis.del).not.toHaveBeenCalled();
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
  test('enqueue falls back to memory when Redis eval throws', async () => {
    const redis = makeMockRedis({
      eval: jest.fn().mockRejectedValue(new Error('Redis down')),
      llen: jest.fn().mockRejectedValue(new Error('Redis down')),
    });
    const queue = new RedisDeliveryQueue(makeCacheStore(redis));
    const entry = makePayload({ messageId: 'fallback-1' });

    await queue.enqueue('user-fb', entry);

    // eval and llen both fail → memory used for enqueue and size
    const size = await queue.size('user-fb');
    expect(size).toBe(1);
  });

  test('drain falls back to memory when Redis eval throws', async () => {
    const failingRedis = makeMockRedis({
      eval: jest.fn()
        .mockRejectedValueOnce(new Error('Redis eval failed')) // enqueue eval → memory
        .mockRejectedValueOnce(new Error('Redis eval failed')), // drain eval → memory fallback
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
      eval: jest.fn().mockRejectedValue(new Error('eval fail')),
      lrange: jest.fn().mockRejectedValue(new Error('lrange error')),
    });
    const queue = new RedisDeliveryQueue(makeCacheStore(redis));

    // eval fails → enqueue uses memory; lrange fails → peek uses memory
    await queue.enqueue('user-pk', makePayload({ messageId: 'pk-1' }));
    await queue.enqueue('user-pk', makePayload({ messageId: 'pk-2' }));

    const result = await queue.peek('user-pk', 1);
    expect(result).toHaveLength(1);
    expect(result[0].messageId).toBe('pk-1');
  });

  test('size falls back to memory when Redis llen throws', async () => {
    const redis = makeMockRedis({
      eval: jest.fn().mockRejectedValue(new Error('eval fail')),
      llen: jest.fn().mockRejectedValue(new Error('llen fail')),
    });
    const queue = new RedisDeliveryQueue(makeCacheStore(redis));
    await queue.enqueue('user-sz', makePayload());

    const size = await queue.size('user-sz');
    expect(size).toBe(1);
  });

  test('cleanup falls back to memory when Redis scan throws', async () => {
    // Add to memory by failing eval on enqueue, then scan fails → memory cleanup
    const failRedis = makeMockRedis({
      eval: jest.fn().mockRejectedValue(new Error('eval fail')),
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

  test('dedup (memory): second enqueue with same messageId is ignored', async () => {
    const queue = new RedisDeliveryQueue(makeCacheStore(null));
    const entry = makePayload({ messageId: 'dup-msg' });
    await queue.enqueue('user-dup', entry);
    await queue.enqueue('user-dup', entry); // same messageId → should be ignored

    expect(await queue.size('user-dup')).toBe(1);
  });

  test('dedup (memory): different messageIds are both enqueued', async () => {
    const queue = new RedisDeliveryQueue(makeCacheStore(null));
    await queue.enqueue('user-dup2', makePayload({ messageId: 'msg-a' }));
    await queue.enqueue('user-dup2', makePayload({ messageId: 'msg-b' }));

    expect(await queue.size('user-dup2')).toBe(2);
  });

  test('dedup (memory): an "edited" event for a messageId is NOT dropped by a queued "new" for the same messageId', async () => {
    const queue = new RedisDeliveryQueue(makeCacheStore(null));
    const original = makePayload({ messageId: 'msg-edit-me', payload: { content: 'original' } });
    const edited = makePayload({ messageId: 'msg-edit-me', eventType: 'edited', payload: { content: 'edited content' } });

    await queue.enqueue('user-offline', original);
    await queue.enqueue('user-offline', edited);

    const drained = await queue.drain('user-offline');
    expect(drained).toHaveLength(2);
    expect(drained[0].payload.content).toBe('original');
    expect(drained[1].payload.content).toBe('edited content');
  });

  test('dedup (memory): a "deleted" event for a messageId is NOT dropped by a queued "new" for the same messageId', async () => {
    const queue = new RedisDeliveryQueue(makeCacheStore(null));
    const original = makePayload({ messageId: 'msg-delete-me' });
    const deleted = makePayload({ messageId: 'msg-delete-me', eventType: 'deleted' });

    await queue.enqueue('user-offline', original);
    await queue.enqueue('user-offline', deleted);

    const drained = await queue.drain('user-offline');
    expect(drained.map(d => d.eventType ?? 'new')).toEqual(['new', 'deleted']);
  });

  test('dedup (memory): a repeated "edited" event for the same messageId IS still collapsed to one entry', async () => {
    const queue = new RedisDeliveryQueue(makeCacheStore(null));
    const edited = makePayload({ messageId: 'msg-edit-twice', eventType: 'edited' });

    await queue.enqueue('user-offline', edited);
    await queue.enqueue('user-offline', edited);

    expect(await queue.size('user-offline')).toBe(1);
  });

  test('supersede (memory): two divergent "edited" events for the same message replay the LATEST content, not the first', async () => {
    const queue = new RedisDeliveryQueue(makeCacheStore(null));
    const original = makePayload({ messageId: 'msg-edit-divergent', payload: { content: 'hello' } });
    const firstEdit = makePayload({ messageId: 'msg-edit-divergent', eventType: 'edited', payload: { content: 'hello world' } });
    const secondEdit = makePayload({ messageId: 'msg-edit-divergent', eventType: 'edited', payload: { content: 'goodbye' } });

    await queue.enqueue('user-offline', original);
    await queue.enqueue('user-offline', firstEdit);
    await queue.enqueue('user-offline', secondEdit);

    // The first edit is superseded in place, not appended as a third entry —
    // the FIFO slot right after 'new' still carries the edit, just with the
    // sender's final content.
    const drained = await queue.drain('user-offline');
    expect(drained).toHaveLength(2);
    expect(drained.map(d => d.eventType ?? 'new')).toEqual(['new', 'edited']);
    expect(drained[1].payload.content).toBe('goodbye');
  });

  test('dedup (memory): two different reactors on the same message both queue, when dedupKey differs', async () => {
    const queue = new RedisDeliveryQueue(makeCacheStore(null));
    const reactorA = makePayload({
      messageId: 'msg-reacted',
      eventType: 'reaction-added',
      dedupKey: 'msg-reacted:participant-a:👍',
    });
    const reactorB = makePayload({
      messageId: 'msg-reacted',
      eventType: 'reaction-added',
      dedupKey: 'msg-reacted:participant-b:🔥',
    });

    await queue.enqueue('user-offline', reactorA);
    await queue.enqueue('user-offline', reactorB);

    // Same messageId+eventType would have collapsed to 1 under the old
    // messageId-only dedup — the exact bug this dedupKey exists to prevent.
    expect(await queue.size('user-offline')).toBe(2);
  });

  test('dedup (memory): a repeated entry with the same dedupKey IS still collapsed to one entry', async () => {
    const queue = new RedisDeliveryQueue(makeCacheStore(null));
    const reaction = makePayload({
      messageId: 'msg-reacted',
      eventType: 'reaction-added',
      dedupKey: 'msg-reacted:participant-a:👍',
    });

    await queue.enqueue('user-offline', reaction);
    await queue.enqueue('user-offline', reaction);

    expect(await queue.size('user-offline')).toBe(1);
  });
});

describe('RedisDeliveryQueue (Redis dedup via eval, eventType-aware)', () => {
  test('enqueue passes normalized eventType as ARGV[4] for new/edited/deleted', async () => {
    const redis = makeMockRedis({ eval: jest.fn().mockResolvedValue(1) });
    const queue = new RedisDeliveryQueue(makeCacheStore(redis));

    await queue.enqueue('user-evt', makePayload({ messageId: 'm1' }));
    await queue.enqueue('user-evt', makePayload({ messageId: 'm1', eventType: 'edited' }));
    await queue.enqueue('user-evt', makePayload({ messageId: 'm1', eventType: 'deleted' }));

    expect(redis.eval).toHaveBeenNthCalledWith(1, expect.any(String), 1, expect.any(String), expect.any(String), 'm1', expect.any(String), 'new');
    expect(redis.eval).toHaveBeenNthCalledWith(2, expect.any(String), 1, expect.any(String), expect.any(String), 'm1', expect.any(String), 'edited');
    expect(redis.eval).toHaveBeenNthCalledWith(3, expect.any(String), 1, expect.any(String), expect.any(String), 'm1', expect.any(String), 'deleted');
  });

  test('enqueue passes dedupKey (not messageId) as ARGV[2] when the entry sets one', async () => {
    const redis = makeMockRedis({ eval: jest.fn().mockResolvedValue(1) });
    const queue = new RedisDeliveryQueue(makeCacheStore(redis));

    await queue.enqueue('user-evt', makePayload({
      messageId: 'msg-reacted',
      eventType: 'reaction-added',
      dedupKey: 'msg-reacted:participant-a:👍',
    }));

    expect(redis.eval).toHaveBeenCalledWith(
      expect.any(String), 1, expect.any(String),
      expect.any(String), 'msg-reacted:participant-a:👍', expect.any(String), 'reaction-added'
    );
  });
});

describe('RedisDeliveryQueue (Redis dedup via eval)', () => {
  test('dedup (Redis): eval returns 0 when messageId already queued — no duplicate push', async () => {
    const redis = makeMockRedis({ eval: jest.fn().mockResolvedValue(0) });
    const queue = new RedisDeliveryQueue(makeCacheStore(redis));
    const entry = makePayload({ messageId: 'dup-redis' });

    await queue.enqueue('user-rd', entry);
    await queue.enqueue('user-rd', entry);

    // eval called twice, but both times returns 0 (already exists)
    expect(redis.eval).toHaveBeenCalledTimes(2);
    // Memory queue remains empty since Redis was available both times
    expect(await queue.size('user-rd')).toBe(0);
  });

  test('supersede (Redis): eval returns 2 (in-place replace) — handled without a memory fallback push', async () => {
    const redis = makeMockRedis({
      eval: jest.fn()
        .mockResolvedValueOnce(1)  // first edit: pushed
        .mockResolvedValueOnce(2), // second edit: superseded in place
      llen: jest.fn().mockResolvedValue(1),
    });
    const queue = new RedisDeliveryQueue(makeCacheStore(redis));

    await queue.enqueue('user-sup', makePayload({ messageId: 'm-sup', eventType: 'edited', payload: { content: 'v1' } }));
    await queue.enqueue('user-sup', makePayload({ messageId: 'm-sup', eventType: 'edited', payload: { content: 'v2' } }));

    expect(redis.eval).toHaveBeenCalledTimes(2);
    // Redis owned both enqueues — nothing leaks into the memory fallback.
    expect(await queue.size('user-sup')).toBe(1); // llen returns 1 (single collapsed entry)
  });

  test('dedup (Redis): eval returns 1 on first push, correctly logs dedup on second', async () => {
    const redis = makeMockRedis({
      eval: jest.fn()
        .mockResolvedValueOnce(1)  // first enqueue: pushed
        .mockResolvedValueOnce(0), // second enqueue: dedup'd
      llen: jest.fn().mockResolvedValue(1),
    });
    const queue = new RedisDeliveryQueue(makeCacheStore(redis));
    const entry = makePayload({ messageId: 'single-push' });

    await queue.enqueue('user-r2', entry);
    await queue.enqueue('user-r2', entry);

    expect(redis.eval).toHaveBeenCalledTimes(2);
    expect(await queue.size('user-r2')).toBe(1); // llen returns 1
  });
});

// ─── Malformed JSON resilience (new try-catch in drain/peek/cleanup) ──────────

describe('RedisDeliveryQueue (malformed JSON resilience)', () => {
  test('drain — drops malformed entry and returns only valid ones', async () => {
    const valid = makePayload({ messageId: 'valid-msg' });
    const redis = makeMockRedis({
      eval: jest.fn().mockResolvedValue([JSON.stringify(valid), 'not-valid-json{{{'])
    });
    const queue = new RedisDeliveryQueue(makeCacheStore(redis));

    const drained = await queue.drain('user-r');

    expect(drained).toHaveLength(1);
    expect(drained[0].messageId).toBe('valid-msg');
  });

  test('drain — returns empty array when all entries are malformed', async () => {
    const redis = makeMockRedis({
      eval: jest.fn().mockResolvedValue(['{bad', 'also-bad}'])
    });
    const queue = new RedisDeliveryQueue(makeCacheStore(redis));

    expect(await queue.drain('user-r')).toEqual([]);
  });

  test('peek — drops malformed entry and returns only valid ones', async () => {
    const valid = makePayload({ messageId: 'peek-valid' });
    const redis = makeMockRedis({
      lrange: jest.fn().mockResolvedValue(['{corrupt', JSON.stringify(valid)])
    });
    const queue = new RedisDeliveryQueue(makeCacheStore(redis));

    const peeked = await queue.peek('user-r');

    expect(peeked).toHaveLength(1);
    expect(peeked[0].messageId).toBe('peek-valid');
  });

  test('cleanup — drops malformed entry by value (counts as stale removal)', async () => {
    const valid = makePayload({ messageId: 'cleanup-valid', enqueuedAt: new Date().toISOString() });
    const redis = makeMockRedis({
      scan: jest.fn().mockResolvedValue(['0', ['delivery:queue:u1']]),
      lrange: jest.fn().mockResolvedValue(['{bad-json', JSON.stringify(valid)]),
      eval: jest.fn().mockResolvedValue(1),
    });
    const queue = new RedisDeliveryQueue(makeCacheStore(redis));

    const removed = await queue.cleanup();

    // Malformed entry is targeted for removal; the valid fresh entry is never in
    // the ARGV list, so it survives without a whole-key DEL.
    expect(removed).toBe(1);
    expect(redis.eval).toHaveBeenCalledWith(
      expect.stringContaining('LREM'),
      1,
      'delivery:queue:u1',
      '{bad-json',
    );
    expect(redis.del).not.toHaveBeenCalled();
  });
});

// ─── Memory/Redis reconciliation after a transient outage recovers ───────────
//
// Regression coverage for a bug where entries stashed in `memoryQueue` during a
// transient Redis outage were silently orphaned once Redis recovered: `drain()`
// and `cleanup()` used to `return` from their Redis branch without ever
// consulting `memoryQueue`, so those messages were never delivered and never
// swept — they just sat in memory until process restart.

describe('RedisDeliveryQueue (memory/Redis reconciliation)', () => {
  test('drain — surfaces memory-queued entries (stashed during an outage) alongside Redis-drained entries once Redis recovers', async () => {
    const duringOutage = makePayload({ messageId: 'during-outage' });
    const afterRecovery = makePayload({ messageId: 'after-recovery' });

    const failingRedis = makeMockRedis({ eval: jest.fn().mockRejectedValue(new Error('conn reset')) });
    const recoveredRedis = makeMockRedis({ eval: jest.fn().mockResolvedValue([JSON.stringify(afterRecovery)]) });

    const cacheStore: any = { getNativeClient: jest.fn() };
    cacheStore.getNativeClient
      .mockReturnValueOnce(failingRedis)  // enqueue during the outage → memory fallback
      .mockReturnValue(recoveredRedis);   // Redis is back for everything after

    const queue = new RedisDeliveryQueue(cacheStore);
    await queue.enqueue('user-recon', duringOutage);

    const drained = await queue.drain('user-recon');

    expect(drained.map(e => e.messageId)).toEqual(['during-outage', 'after-recovery']);

    // Both sources are now empty — nothing left orphaned in memory.
    const internalMap: Map<string, unknown[]> = (queue as any).memoryQueue;
    expect(internalMap.has('user-recon')).toBe(false);
  });

  test('drain — replays events in FIFO enqueuedAt order when a later edit fell back to memory after its `new` reached Redis', async () => {
    // A transient Redis blip BETWEEN two enqueues for the SAME message: the
    // `new` reached Redis while it was healthy, then the follow-up `edited`
    // fell back to memory when Redis briefly errored. Memory-first concatenation
    // would replay `edited` before `new` — the recipient's client drops an edit
    // for a message it hasn't received yet. They must replay in enqueue order.
    const newEntry = makePayload({
      messageId: 'M',
      eventType: 'new',
      enqueuedAt: '2026-01-01T00:00:00.000Z',
    });
    const editedEntry = makePayload({
      messageId: 'M',
      eventType: 'edited',
      enqueuedAt: '2026-01-01T00:00:01.000Z',
    });

    const healthyRedis = makeMockRedis({ eval: jest.fn().mockResolvedValue(1) });
    const failingRedis = makeMockRedis({ eval: jest.fn().mockRejectedValue(new Error('conn reset')) });
    const recoveredRedis = makeMockRedis({ eval: jest.fn().mockResolvedValue([JSON.stringify(newEntry)]) });

    const cacheStore: any = { getNativeClient: jest.fn() };
    cacheStore.getNativeClient
      .mockReturnValueOnce(healthyRedis)   // enqueue `new` → Redis
      .mockReturnValueOnce(failingRedis)   // enqueue `edited` → memory fallback
      .mockReturnValue(recoveredRedis);    // drain once Redis is back

    const queue = new RedisDeliveryQueue(cacheStore);
    await queue.enqueue('user-order', newEntry);
    await queue.enqueue('user-order', editedEntry);

    const drained = await queue.drain('user-order');

    expect(drained.map(e => e.eventType ?? 'new')).toEqual(['new', 'edited']);
    expect(drained.map(e => e.messageId)).toEqual(['M', 'M']);
  });

  test('cleanup — expires memory-queued entries even when Redis is reachable, instead of leaving them until process restart', async () => {
    const staleDuringOutage = makePayload({
      messageId: 'stale-during-outage',
      enqueuedAt: new Date(Date.now() - 49 * 60 * 60 * 1000).toISOString(),
    });

    const failingRedis = makeMockRedis({ eval: jest.fn().mockRejectedValue(new Error('conn reset')) });
    const healthyRedis = makeMockRedis(); // default scan resolves ['0', []] — nothing to clean in Redis

    const cacheStore: any = { getNativeClient: jest.fn() };
    cacheStore.getNativeClient
      .mockReturnValueOnce(failingRedis)  // enqueue during the outage → memory fallback
      .mockReturnValue(healthyRedis);     // cleanup runs once Redis is reachable again

    const queue = new RedisDeliveryQueue(cacheStore);
    await queue.enqueue('user-cleanup-recon', staleDuringOutage);

    const removed = await queue.cleanup();

    expect(removed).toBe(1);
    const internalMap: Map<string, unknown[]> = (queue as any).memoryQueue;
    expect(internalMap.has('user-cleanup-recon')).toBe(false);
  });
});
