import { RedisDeliveryQueue } from '../../../services/RedisDeliveryQueue';
import { RedisCacheStore } from '../../../services/CacheStore';
import type { QueuedMessagePayload } from '@meeshy/shared/types/delivery-queue';

function makePayload(overrides: Partial<QueuedMessagePayload> = {}): QueuedMessagePayload {
  return {
    messageId: 'msg-001',
    conversationId: 'conv-001',
    payload: { content: 'hello', senderId: 'user-a' },
    enqueuedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('RedisDeliveryQueue (memory fallback)', () => {
  let cacheStore: RedisCacheStore;
  let queue: RedisDeliveryQueue;

  beforeEach(() => {
    cacheStore = new RedisCacheStore();
    queue = new RedisDeliveryQueue(cacheStore);
  });

  afterEach(async () => {
    await cacheStore.close();
  });

  test('enqueue adds message to queue', async () => {
    const entry = makePayload();
    await queue.enqueue('user-1', entry);

    const size = await queue.size('user-1');
    expect(size).toBe(1);
  });

  test('drain returns all messages and clears queue', async () => {
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
  });

  test('drain returns empty array when no messages', async () => {
    const drained = await queue.drain('user-nonexistent');
    expect(drained).toEqual([]);
  });

  test('enqueue multiple messages preserves FIFO order', async () => {
    const ids = ['msg-a', 'msg-b', 'msg-c', 'msg-d'];
    for (const id of ids) {
      await queue.enqueue('user-1', makePayload({ messageId: id }));
    }

    const drained = await queue.drain('user-1');
    expect(drained.map(d => d.messageId)).toEqual(ids);
  });

  test('size returns correct count', async () => {
    expect(await queue.size('user-1')).toBe(0);

    await queue.enqueue('user-1', makePayload({ messageId: 'msg-1' }));
    expect(await queue.size('user-1')).toBe(1);

    await queue.enqueue('user-1', makePayload({ messageId: 'msg-2' }));
    expect(await queue.size('user-1')).toBe(2);

    await queue.drain('user-1');
    expect(await queue.size('user-1')).toBe(0);
  });

  test('queues are isolated per user', async () => {
    await queue.enqueue('user-a', makePayload({ messageId: 'msg-for-a' }));
    await queue.enqueue('user-b', makePayload({ messageId: 'msg-for-b' }));

    const drainedA = await queue.drain('user-a');
    expect(drainedA).toHaveLength(1);
    expect(drainedA[0].messageId).toBe('msg-for-a');

    const drainedB = await queue.drain('user-b');
    expect(drainedB).toHaveLength(1);
    expect(drainedB[0].messageId).toBe('msg-for-b');
  });

  test('peek returns messages without removing them', async () => {
    await queue.enqueue('user-1', makePayload({ messageId: 'msg-1' }));
    await queue.enqueue('user-1', makePayload({ messageId: 'msg-2' }));

    const peeked = await queue.peek('user-1');
    expect(peeked).toHaveLength(2);

    const size = await queue.size('user-1');
    expect(size).toBe(2);
  });

  test('peek respects limit parameter', async () => {
    await queue.enqueue('user-1', makePayload({ messageId: 'msg-1' }));
    await queue.enqueue('user-1', makePayload({ messageId: 'msg-2' }));
    await queue.enqueue('user-1', makePayload({ messageId: 'msg-3' }));

    const peeked = await queue.peek('user-1', 2);
    expect(peeked).toHaveLength(2);
    expect(peeked[0].messageId).toBe('msg-1');
    expect(peeked[1].messageId).toBe('msg-2');
  });

  test('cleanup removes expired entries', async () => {
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
  });

  test('cleanup handles multiple users', async () => {
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
  });
});
