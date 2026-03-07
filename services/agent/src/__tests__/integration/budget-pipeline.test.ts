import { DailyBudgetManager } from '../../scheduler/daily-budget';
import { ConfigCache } from '../../config/config-cache';
import type { MongoPersistence } from '../../memory/mongo-persistence';

function makeRedisStore() {
  const store = new Map<string, string>();
  const sets = new Map<string, Set<string>>();
  return {
    store,
    sets,
    get: jest.fn(async (key: string) => store.get(key) ?? null),
    set: jest.fn(async (key: string, value: string, _mode?: string, _ttl?: number) => {
      store.set(key, value);
      return 'OK';
    }),
    del: jest.fn(async (key: string) => {
      store.delete(key);
      return 1;
    }),
    incr: jest.fn(async (key: string) => {
      const current = parseInt(store.get(key) ?? '0', 10);
      const next = current + 1;
      store.set(key, String(next));
      return next;
    }),
    expire: jest.fn(async () => 1),
    sadd: jest.fn(async (key: string, member: string) => {
      const s = sets.get(key) ?? new Set<string>();
      const isNew = !s.has(member);
      s.add(member);
      sets.set(key, s);
      return isNew ? 1 : 0;
    }),
    scard: jest.fn(async (key: string) => sets.get(key)?.size ?? 0),
    duplicate: jest.fn(() => ({
      subscribe: jest.fn(),
      unsubscribe: jest.fn(),
      quit: jest.fn(),
      on: jest.fn(),
    })),
  };
}

describe('Budget + Cache Integration', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-03-07T14:00:00Z')); // Saturday
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('config cache serves cached config then budget blocks after max', async () => {
    const config = {
      id: 'cfg-1',
      conversationId: 'conv-1',
      enabled: true,
      weekdayMaxMessages: 10,
      weekendMaxMessages: 25,
      weekdayMaxUsers: 4,
      weekendMaxUsers: 6,
    };

    const redis = makeRedisStore();
    const persistence = {
      getAgentConfig: jest.fn().mockResolvedValue(config),
      getGlobalConfig: jest.fn().mockResolvedValue(null),
    } as unknown as MongoPersistence;

    const cache = new ConfigCache(redis as any, persistence);
    const budget = new DailyBudgetManager(redis as any);

    // First call: cache miss → DB fetch
    const first = await cache.getConfig('conv-1');
    expect(first).toEqual(config);
    expect(persistence.getAgentConfig).toHaveBeenCalledTimes(1);

    // Second call: cache hit → no DB call
    const second = await cache.getConfig('conv-1');
    expect(second).toEqual(config);
    expect(persistence.getAgentConfig).toHaveBeenCalledTimes(1);

    // Budget allows first message (Saturday = weekend = 25 max)
    const check1 = await budget.canSendMessage('conv-1', {
      weekdayMaxMessages: config.weekdayMaxMessages,
      weekendMaxMessages: config.weekendMaxMessages,
    });
    expect(check1.allowed).toBe(true);
    expect(check1.remaining).toBe(25);

    // Record 25 messages across 4 users
    for (let i = 0; i < 25; i++) {
      await budget.recordMessage('conv-1', `user-${i % 4}`);
    }

    // Budget now exhausted
    const check2 = await budget.canSendMessage('conv-1', {
      weekdayMaxMessages: config.weekdayMaxMessages,
      weekendMaxMessages: config.weekendMaxMessages,
    });
    expect(check2.allowed).toBe(false);
    expect(check2.remaining).toBe(0);
  });

  it('invalidation forces cache to re-fetch from DB', async () => {
    const configV1 = {
      id: 'cfg-1',
      conversationId: 'conv-1',
      enabled: true,
      weekendMaxMessages: 25,
    };
    const configV2 = {
      id: 'cfg-1',
      conversationId: 'conv-1',
      enabled: true,
      weekendMaxMessages: 30,
    };

    const redis = makeRedisStore();
    const persistence = {
      getAgentConfig: jest.fn()
        .mockResolvedValueOnce(configV1)
        .mockResolvedValueOnce(configV2),
      getGlobalConfig: jest.fn().mockResolvedValue(null),
    } as unknown as MongoPersistence;

    const cache = new ConfigCache(redis as any, persistence);

    // Load V1
    const first = await cache.getConfig('conv-1');
    expect(first).toEqual(configV1);
    expect(persistence.getAgentConfig).toHaveBeenCalledTimes(1);

    // Invalidate
    await cache.invalidate('conv-1');

    // Re-fetch gets V2
    const second = await cache.getConfig('conv-1');
    expect(second).toEqual(configV2);
    expect(persistence.getAgentConfig).toHaveBeenCalledTimes(2);
  });

  it('user limit tracking works across multiple recordMessage calls', async () => {
    const redis = makeRedisStore();
    const budget = new DailyBudgetManager(redis as any);

    // Record messages from 3 distinct users
    await budget.recordMessage('conv-1', 'user-a');
    await budget.recordMessage('conv-1', 'user-b');
    await budget.recordMessage('conv-1', 'user-a'); // duplicate user
    await budget.recordMessage('conv-1', 'user-c');

    // scard should count 3 distinct users
    const userCheck = await budget.canAddUser('conv-1', {
      weekdayMaxUsers: 2,
      weekendMaxUsers: 4,
    });
    expect(userCheck.current).toBe(3);
    expect(userCheck.allowed).toBe(true); // 3 < 4 (weekend)

    // Add one more user
    await budget.recordMessage('conv-1', 'user-d');

    const userCheck2 = await budget.canAddUser('conv-1', {
      weekdayMaxUsers: 2,
      weekendMaxUsers: 4,
    });
    expect(userCheck2.current).toBe(4);
    expect(userCheck2.allowed).toBe(false); // 4 >= 4 (weekend)
  });

  it('burst cooldown prevents rapid successive bursts', async () => {
    const redis = makeRedisStore();
    const budget = new DailyBudgetManager(redis as any);

    // First burst allowed (no previous record)
    const burst1 = await budget.canBurst('conv-1', { quietIntervalMinutes: 90 });
    expect(burst1.allowed).toBe(true);

    // Record burst
    await budget.recordBurst('conv-1');

    // Immediate second burst blocked
    const burst2 = await budget.canBurst('conv-1', { quietIntervalMinutes: 90 });
    expect(burst2.allowed).toBe(false);
    expect(burst2.minutesUntilNext).toBe(90);

    // Advance time past cooldown
    jest.setSystemTime(new Date('2026-03-07T15:31:00Z')); // +91 minutes

    const burst3 = await budget.canBurst('conv-1', { quietIntervalMinutes: 90 });
    expect(burst3.allowed).toBe(true);
  });
});
