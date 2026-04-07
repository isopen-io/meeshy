import { RedisDeliveryQueue, type SerializedDeliveryItem } from '../../delivery/redis-delivery-queue';
import type { PendingMessage, PendingReaction } from '../../graph/state';

function createMockRedis() {
  const store = new Map<string, string>();
  const sortedSets = new Map<string, Map<string, number>>();
  const sets = new Map<string, Set<string>>();
  const expiry = new Map<string, number>();

  function getSortedSet(key: string): Map<string, number> {
    if (!sortedSets.has(key)) sortedSets.set(key, new Map());
    return sortedSets.get(key)!;
  }

  function getSet(key: string): Set<string> {
    if (!sets.has(key)) sets.set(key, new Set());
    return sets.get(key)!;
  }

  return {
    _store: store,
    _sortedSets: sortedSets,
    _sets: sets,

    async set(key: string, value: string, ..._args: unknown[]): Promise<string> {
      store.set(key, value);
      return 'OK';
    },
    async get(key: string): Promise<string | null> {
      return store.get(key) ?? null;
    },
    async del(...keys: string[]): Promise<number> {
      let count = 0;
      for (const key of keys) {
        if (store.delete(key)) count++;
      }
      return count;
    },
    async zadd(key: string, score: number, member: string): Promise<number> {
      const ss = getSortedSet(key);
      const isNew = !ss.has(member);
      ss.set(member, score);
      return isNew ? 1 : 0;
    },
    async zrangebyscore(key: string, min: number | string, max: number | string, ...args: unknown[]): Promise<string[]> {
      const ss = getSortedSet(key);
      const minVal = min === '-inf' ? -Infinity : Number(min);
      const maxVal = max === '+inf' ? Infinity : Number(max);
      const results: Array<[string, number]> = [];
      for (const [member, score] of ss) {
        if (score >= minVal && score <= maxVal) {
          results.push([member, score]);
        }
      }
      results.sort((a, b) => a[1] - b[1]);
      let items = results.map(([member]) => member);
      const limitIdx = args.indexOf('LIMIT');
      if (limitIdx !== -1) {
        const offset = Number(args[limitIdx + 1]);
        const count = Number(args[limitIdx + 2]);
        items = items.slice(offset, offset + count);
      }
      return items;
    },
    async zrem(key: string, ...members: string[]): Promise<number> {
      const ss = getSortedSet(key);
      let count = 0;
      for (const member of members) {
        if (ss.delete(member)) count++;
      }
      return count;
    },
    async zscore(key: string, member: string): Promise<string | null> {
      const ss = getSortedSet(key);
      const score = ss.get(member);
      return score !== undefined ? String(score) : null;
    },
    async zcard(key: string): Promise<number> {
      return getSortedSet(key).size;
    },
    async sadd(key: string, ...members: string[]): Promise<number> {
      const s = getSet(key);
      let count = 0;
      for (const member of members) {
        if (!s.has(member)) {
          s.add(member);
          count++;
        }
      }
      return count;
    },
    async smembers(key: string): Promise<string[]> {
      return [...getSet(key)];
    },
    async srem(key: string, ...members: string[]): Promise<number> {
      const s = getSet(key);
      let count = 0;
      for (const member of members) {
        if (s.delete(member)) count++;
      }
      return count;
    },
    async expire(_key: string, _seconds: number): Promise<number> {
      return 1;
    },

    multi() {
      const ops: Array<() => Promise<unknown>> = [];
      const chainable = {
        set(key: string, value: string, ..._args: unknown[]) {
          ops.push(async () => { store.set(key, value); return 'OK'; });
          return chainable;
        },
        zadd(key: string, score: number, member: string) {
          ops.push(async () => { getSortedSet(key).set(member, score); return 1; });
          return chainable;
        },
        sadd(key: string, ...members: string[]) {
          ops.push(async () => {
            const s = getSet(key);
            let count = 0;
            for (const m of members) { if (!s.has(m)) { s.add(m); count++; } }
            return count;
          });
          return chainable;
        },
        expire(_key: string, _seconds: number) {
          ops.push(async () => 1);
          return chainable;
        },
        zrem(key: string, ...members: string[]) {
          ops.push(async () => {
            const ss = getSortedSet(key);
            let count = 0;
            for (const m of members) { if (ss.delete(m)) count++; }
            return count;
          });
          return chainable;
        },
        del(...keys: string[]) {
          ops.push(async () => {
            let count = 0;
            for (const k of keys) { if (store.delete(k)) count++; }
            return count;
          });
          return chainable;
        },
        srem(key: string, ...members: string[]) {
          ops.push(async () => {
            const s = getSet(key);
            let count = 0;
            for (const m of members) { if (s.delete(m)) count++; }
            return count;
          });
          return chainable;
        },
        async runAll() {
          const results: Array<[Error | null, unknown]> = [];
          for (const op of ops) {
            const result = await op();
            results.push([null, result]);
          }
          return results;
        },
      };
      // ioredis multi().exec() pattern
      (chainable as any).exec = chainable.runAll;
      return chainable;
    },
  };
}

function makePublisher() {
  return {
    publish: jest.fn().mockResolvedValue(undefined),
    publishReaction: jest.fn().mockResolvedValue(undefined),
  } as any;
}

function makePersistence(recentCount = 0) {
  return { getRecentMessageCount: jest.fn().mockResolvedValue(recentCount) } as any;
}

function makeMessage(overrides: Partial<PendingMessage> = {}): PendingMessage {
  return {
    type: 'message',
    asUserId: 'bot1',
    content: 'Bonjour !',
    originalLanguage: 'fr',
    mentionedUsernames: [],
    delaySeconds: 0,
    delayCategory: 'immediate',
    topicCategory: 'general',
    topicHash: 'hash1',
    messageSource: 'agent',
    ...overrides,
  };
}

function makeReaction(overrides: Partial<PendingReaction> = {}): PendingReaction {
  return {
    type: 'reaction',
    asUserId: 'bot1',
    targetMessageId: 'm1',
    emoji: '👍',
    delaySeconds: 0,
    delayCategory: 'immediate',
    topicCategory: 'reaction-general',
    topicHash: 'rhash1',
    ...overrides,
  };
}

describe('RedisDeliveryQueue — basic enqueue', () => {
  it('stores action in sorted set with scheduledAt as score', async () => {
    const redis = createMockRedis();
    const queue = new RedisDeliveryQueue(redis as any, makePublisher(), makePersistence());

    const id = await queue.enqueue('conv-1', makeMessage({ delaySeconds: 30 }));

    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);

    const count = await queue.pendingCount;
    expect(count).toBe(1);

    const items = await queue.getAll();
    expect(items).toHaveLength(1);
    expect(items[0].conversationId).toBe('conv-1');
    expect(items[0].action.type).toBe('message');
    expect(items[0].mergeCount).toBe(0);
  });

  it('stores item payload in Redis hash with correct fields', async () => {
    const redis = createMockRedis();
    const queue = new RedisDeliveryQueue(redis as any, makePublisher(), makePersistence());

    const id = await queue.enqueue('conv-1', makeMessage());

    const raw = await redis.get(`agent:delivery:item:${id}`);
    expect(raw).not.toBeNull();

    const item = JSON.parse(raw!);
    expect(item.id).toBe(id);
    expect(item.conversationId).toBe('conv-1');
    expect(item.action.type).toBe('message');
    expect(typeof item.scheduledAt).toBe('number');
  });

  it('adds item to user index set', async () => {
    const redis = createMockRedis();
    const queue = new RedisDeliveryQueue(redis as any, makePublisher(), makePersistence());

    const id = await queue.enqueue('conv-1', makeMessage({ asUserId: 'bot-alice' }));

    const members = await redis.smembers('agent:delivery:user:conv-1:bot-alice');
    expect(members).toContain(id);
  });
});

describe('RedisDeliveryQueue — topic dedup', () => {
  it('merges same topicCategory for same user on same day instead of adding', async () => {
    const redis = createMockRedis();
    const queue = new RedisDeliveryQueue(redis as any, makePublisher(), makePersistence());

    const id1 = await queue.enqueue('conv-1', makeMessage({ asUserId: 'bot1', topicCategory: 'weather' }));
    const id2 = await queue.enqueue('conv-1', makeMessage({ asUserId: 'bot1', topicCategory: 'weather' }));

    expect(id2).toBe(id1);

    const count = await queue.pendingCount;
    expect(count).toBe(1);

    const items = await queue.getAll();
    expect(items[0].mergeCount).toBe(1);
  });

  it('allows different topicCategory for same user', async () => {
    const redis = createMockRedis();
    const queue = new RedisDeliveryQueue(redis as any, makePublisher(), makePersistence());

    await queue.enqueue('conv-1', makeMessage({ asUserId: 'bot1', topicCategory: 'weather' }));
    await queue.enqueue('conv-1', makeMessage({ asUserId: 'bot1', topicCategory: 'sports' }));

    const count = await queue.pendingCount;
    expect(count).toBe(2);
  });

  it('allows same topicCategory for different users', async () => {
    const redis = createMockRedis();
    const queue = new RedisDeliveryQueue(redis as any, makePublisher(), makePersistence());

    await queue.enqueue('conv-1', makeMessage({ asUserId: 'bot1', topicCategory: 'weather' }));
    await queue.enqueue('conv-1', makeMessage({ asUserId: 'bot2', topicCategory: 'weather' }));

    const count = await queue.pendingCount;
    expect(count).toBe(2);
  });
});

describe('RedisDeliveryQueue — rate limit', () => {
  it('delays action when user has too many in 10min window', async () => {
    const redis = createMockRedis();
    const queue = new RedisDeliveryQueue(redis as any, makePublisher(), makePersistence(), {
      maxMessagesPerUserPer10Min: 2,
    });

    const now = Date.now();

    // Use short content so tempo gap is small (10s for <=4 words)
    await queue.enqueue('conv-1', makeMessage({ asUserId: 'bot1', topicCategory: 'a', delaySeconds: 0, content: 'Hi' }));
    await queue.enqueue('conv-1', makeMessage({ asUserId: 'bot1', topicCategory: 'b', delaySeconds: 0, content: 'Ok' }));
    await queue.enqueue('conv-1', makeMessage({ asUserId: 'bot1', topicCategory: 'c', delaySeconds: 0, content: 'Yo' }));

    const items = await queue.getScheduledForUser('conv-1', 'bot1');
    expect(items).toHaveLength(3);

    // The third message should be pushed beyond the 10-minute window
    // because rate limit caps at 2 per 10 minutes
    const scheduledTimes = items.map((i) => i.scheduledAt).sort((a, b) => a - b);
    const thirdTime = scheduledTimes[2];
    const firstTime = scheduledTimes[0];
    // Third must be at least ~10 min after the first (rate limited).
    // Allow 2s tolerance for execution time between enqueue calls.
    const tenMinMs = 10 * 60 * 1000;
    expect(thirdTime - firstTime).toBeGreaterThanOrEqual(tenMinMs - 2000);
  });
});

describe('RedisDeliveryQueue — tempo minimum', () => {
  it('enforces minimum gap between messages from same user', async () => {
    const redis = createMockRedis();
    const queue = new RedisDeliveryQueue(redis as any, makePublisher(), makePersistence());

    await queue.enqueue('conv-1', makeMessage({ asUserId: 'bot1', topicCategory: 'a', delaySeconds: 0 }));
    await queue.enqueue('conv-1', makeMessage({
      asUserId: 'bot1',
      topicCategory: 'b',
      delaySeconds: 0,
      content: 'Un message un peu plus long pour tester le gap entre messages',
    }));

    const items = await queue.getScheduledForUser('conv-1', 'bot1');
    expect(items).toHaveLength(2);

    const sorted = items.sort((a, b) => a.scheduledAt - b.scheduledAt);
    const gap = sorted[1].scheduledAt - sorted[0].scheduledAt;
    expect(gap).toBeGreaterThanOrEqual(10_000);
  });
});

describe('RedisDeliveryQueue — poll delivers ready items', () => {
  it('delivers messages that are past their scheduledAt', async () => {
    const redis = createMockRedis();
    const publisher = makePublisher();
    const queue = new RedisDeliveryQueue(redis as any, publisher, makePersistence());

    await queue.enqueue('conv-1', makeMessage({ delaySeconds: 0 }));

    const delivered = await queue.poll();
    expect(delivered).toBe(1);
    expect(publisher.publish).toHaveBeenCalledTimes(1);

    const remaining = await queue.pendingCount;
    expect(remaining).toBe(0);
  });

  it('delivers reactions via publishReaction', async () => {
    const redis = createMockRedis();
    const publisher = makePublisher();
    const queue = new RedisDeliveryQueue(redis as any, publisher, makePersistence());

    await queue.enqueue('conv-1', makeReaction({ delaySeconds: 0 }));

    const delivered = await queue.poll();
    expect(delivered).toBe(1);
    expect(publisher.publishReaction).toHaveBeenCalledTimes(1);
  });

  it('does not deliver items scheduled in the future', async () => {
    const redis = createMockRedis();
    const publisher = makePublisher();
    const queue = new RedisDeliveryQueue(redis as any, publisher, makePersistence());

    await queue.enqueue('conv-1', makeMessage({ delaySeconds: 3600 }));

    const delivered = await queue.poll();
    expect(delivered).toBe(0);
    expect(publisher.publish).not.toHaveBeenCalled();

    const remaining = await queue.pendingCount;
    expect(remaining).toBe(1);
  });

  it('skips message delivery when human activity detected', async () => {
    const redis = createMockRedis();
    const publisher = makePublisher();
    const queue = new RedisDeliveryQueue(redis as any, publisher, makePersistence(5));

    await queue.enqueue('conv-1', makeMessage({ delaySeconds: 0 }));

    const delivered = await queue.poll();
    expect(delivered).toBe(1);
    expect(publisher.publish).not.toHaveBeenCalled();
  });

  it('publishes correct AgentResponse shape', async () => {
    const redis = createMockRedis();
    const publisher = makePublisher();
    const queue = new RedisDeliveryQueue(redis as any, publisher, makePersistence());

    await queue.enqueue('conv-1', makeMessage({
      content: 'Salut Alice !',
      asUserId: 'bot1',
      originalLanguage: 'fr',
      replyToId: 'm5',
      mentionedUsernames: ['alice'],
    }));

    await queue.poll();

    expect(publisher.publish.mock.calls[0][0]).toEqual({
      type: 'agent:response',
      conversationId: 'conv-1',
      asUserId: 'bot1',
      content: 'Salut Alice !',
      originalLanguage: 'fr',
      replyToId: 'm5',
      mentionedUsernames: ['alice'],
      messageSource: 'agent',
      metadata: { agentType: 'orchestrator', roleConfidence: 1.0 },
    });
  });
});

describe('RedisDeliveryQueue — getAll', () => {
  it('returns all items sorted by scheduledAt', async () => {
    const redis = createMockRedis();
    const queue = new RedisDeliveryQueue(redis as any, makePublisher(), makePersistence());

    await queue.enqueue('conv-1', makeMessage({ delaySeconds: 60, topicCategory: 'a' }));
    await queue.enqueue('conv-2', makeMessage({ delaySeconds: 30, topicCategory: 'b' }));

    const items = await queue.getAll();
    expect(items).toHaveLength(2);
    expect(items[0].scheduledAt).toBeLessThanOrEqual(items[1].scheduledAt);
  });

  it('returns items with id and remainingMs', async () => {
    const redis = createMockRedis();
    const queue = new RedisDeliveryQueue(redis as any, makePublisher(), makePersistence());

    await queue.enqueue('conv-1', makeMessage({ delaySeconds: 60 }));

    const items = await queue.getAll();
    expect(items).toHaveLength(1);
    expect(items[0].id).toBeDefined();
    expect(typeof items[0].id).toBe('string');
    expect(items[0].remainingMs).toBeGreaterThanOrEqual(0);
    expect(items[0].conversationId).toBe('conv-1');
  });

  it('returns empty array when queue is empty', async () => {
    const redis = createMockRedis();
    const queue = new RedisDeliveryQueue(redis as any, makePublisher(), makePersistence());
    expect(await queue.getAll()).toEqual([]);
  });
});

describe('RedisDeliveryQueue — deleteById', () => {
  it('removes item from sorted set and user index', async () => {
    const redis = createMockRedis();
    const queue = new RedisDeliveryQueue(redis as any, makePublisher(), makePersistence());

    const id = await queue.enqueue('conv-1', makeMessage({ asUserId: 'bot-alice' }));
    const deleted = await queue.deleteById(id);

    expect(deleted).toBe(true);
    expect(await queue.pendingCount).toBe(0);

    const members = await redis.smembers('agent:delivery:user:conv-1:bot-alice');
    expect(members).not.toContain(id);
  });

  it('returns false for unknown id', async () => {
    const redis = createMockRedis();
    const queue = new RedisDeliveryQueue(redis as any, makePublisher(), makePersistence());

    await queue.enqueue('conv-1', makeMessage());
    expect(await queue.deleteById('nonexistent-id')).toBe(false);
    expect(await queue.pendingCount).toBe(1);
  });
});

describe('RedisDeliveryQueue — editMessageById', () => {
  it('edits message content and preserves scheduledAt', async () => {
    const redis = createMockRedis();
    const queue = new RedisDeliveryQueue(redis as any, makePublisher(), makePersistence());

    const id = await queue.enqueue('conv-1', makeMessage({ content: 'Original', delaySeconds: 60 }));

    const updated = await queue.editMessageById(id, 'Modified content');
    expect(updated).not.toBeNull();
    expect(updated!.action.type).toBe('message');
    expect((updated!.action as PendingMessage).content).toBe('Modified content');
    expect(updated!.id).toBe(id);
  });

  it('returns null for unknown id', async () => {
    const redis = createMockRedis();
    const queue = new RedisDeliveryQueue(redis as any, makePublisher(), makePersistence());
    expect(await queue.editMessageById('nonexistent', 'New')).toBeNull();
  });

  it('returns null when trying to edit a reaction', async () => {
    const redis = createMockRedis();
    const queue = new RedisDeliveryQueue(redis as any, makePublisher(), makePersistence());

    const id = await queue.enqueue('conv-1', makeReaction());
    expect(await queue.editMessageById(id, 'New content')).toBeNull();
  });
});

describe('RedisDeliveryQueue — getByConversation', () => {
  it('filters to the right conversation', async () => {
    const redis = createMockRedis();
    const queue = new RedisDeliveryQueue(redis as any, makePublisher(), makePersistence());

    await queue.enqueue('conv-1', makeMessage({ topicCategory: 'a' }));
    await queue.enqueue('conv-2', makeMessage({ topicCategory: 'b' }));
    await queue.enqueue('conv-1', makeReaction());

    const items = await queue.getByConversation('conv-1');
    expect(items).toHaveLength(2);
    expect(items.every((i: SerializedDeliveryItem) => i.conversationId === 'conv-1')).toBe(true);
  });

  it('returns empty for unknown conversation', async () => {
    const redis = createMockRedis();
    const queue = new RedisDeliveryQueue(redis as any, makePublisher(), makePersistence());
    expect(await queue.getByConversation('unknown')).toEqual([]);
  });
});

describe('RedisDeliveryQueue — getScheduledTopicsForConversation', () => {
  it('returns topic summaries for conversation', async () => {
    const redis = createMockRedis();
    const queue = new RedisDeliveryQueue(redis as any, makePublisher(), makePersistence());

    await queue.enqueue('conv-1', makeMessage({ asUserId: 'bot1', topicCategory: 'weather' }));
    await queue.enqueue('conv-1', makeMessage({ asUserId: 'bot2', topicCategory: 'sports' }));

    const topics = await queue.getScheduledTopicsForConversation('conv-1');
    expect(topics).toHaveLength(2);
    expect(topics.map((t) => t.topicCategory).sort()).toEqual(['sports', 'weather']);
  });
});

describe('RedisDeliveryQueue — cancelForConversation', () => {
  it('removes all items for a conversation', async () => {
    const redis = createMockRedis();
    const queue = new RedisDeliveryQueue(redis as any, makePublisher(), makePersistence());

    await queue.enqueue('conv-1', makeMessage({ topicCategory: 'a', delaySeconds: 60 }));
    await queue.enqueue('conv-1', makeReaction({ delaySeconds: 30 }));
    await queue.enqueue('conv-2', makeMessage({ topicCategory: 'b', delaySeconds: 60 }));

    const cancelled = await queue.cancelForConversation('conv-1');
    expect(cancelled).toBe(2);
    expect(await queue.pendingCount).toBe(1);
  });
});

describe('RedisDeliveryQueue — clearAll', () => {
  it('removes all items from queue', async () => {
    const redis = createMockRedis();
    const queue = new RedisDeliveryQueue(redis as any, makePublisher(), makePersistence());

    await queue.enqueue('conv-1', makeMessage({ topicCategory: 'a' }));
    await queue.enqueue('conv-2', makeMessage({ topicCategory: 'b' }));

    await queue.clearAll();
    expect(await queue.pendingCount).toBe(0);
    expect(await queue.getAll()).toEqual([]);
  });
});

describe('RedisDeliveryQueue — polling lifecycle', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('startPolling and stopPolling control the interval', () => {
    const redis = createMockRedis();
    const queue = new RedisDeliveryQueue(redis as any, makePublisher(), makePersistence());

    queue.startPolling(5000);
    queue.stopPolling();
  });
});
