import { DailyBudgetManager } from '../../scheduler/daily-budget';

function makeRedisStore() {
  const store = new Map<string, string>();
  const sets = new Map<string, Set<string>>();

  const incrFn = jest.fn(async (key: string) => {
    const current = parseInt(store.get(key) ?? '0', 10);
    const next = current + 1;
    store.set(key, String(next));
    return next;
  });
  const expireFn = jest.fn(async (_key?: string, _ttl?: number) => 1);
  const saddFn = jest.fn(async (key: string, member: string) => {
    const s = sets.get(key) ?? new Set<string>();
    const isNew = !s.has(member);
    s.add(member);
    sets.set(key, s);
    return isNew ? 1 : 0;
  });

  const redis = {
    store,
    sets,
    get: jest.fn(async (key: string) => store.get(key) ?? null),
    set: jest.fn(async (key: string, value: string, _mode?: string, _ttl?: number) => {
      store.set(key, value);
      return 'OK';
    }),
    incr: incrFn,
    expire: expireFn,
    sadd: saddFn,
    scard: jest.fn(async (key: string) => {
      return sets.get(key)?.size ?? 0;
    }),
    pipeline: jest.fn(() => {
      const commands: Array<() => Promise<unknown>> = [];
      const pipe = {
        incr: (key: string) => { commands.push(() => incrFn(key)); return pipe; },
        expire: (key: string, ttl: number) => { commands.push(() => expireFn(key, ttl)); return pipe; },
        sadd: (key: string, member: string) => { commands.push(() => saddFn(key, member)); return pipe; },
        exec: async () => {
          const results = [];
          for (const cmd of commands) {
            results.push([null, await cmd()]);
          }
          return results;
        },
      };
      return pipe;
    }),
  };

  return redis;
}

describe('DailyBudgetManager', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('canSendMessage', () => {
    it('allows when budget not exhausted on weekend', () => {
      jest.setSystemTime(new Date('2026-03-07T14:00:00Z'));
      const redis = makeRedisStore();
      const manager = new DailyBudgetManager(redis as any);

      return manager
        .canSendMessage('conv-1', { weekdayMaxMessages: 10, weekendMaxMessages: 25 })
        .then((result) => {
          expect(result.allowed).toBe(true);
          expect(result.remaining).toBe(25);
          expect(result.current).toBe(0);
          expect(result.max).toBe(25);
        });
    });

    it('blocks when daily budget is exhausted', () => {
      jest.setSystemTime(new Date('2026-03-07T14:00:00Z'));
      const redis = makeRedisStore();
      redis.store.set('agent:budget:conv-1:2026-03-07', '25');
      const manager = new DailyBudgetManager(redis as any);

      return manager
        .canSendMessage('conv-1', { weekdayMaxMessages: 10, weekendMaxMessages: 25 })
        .then((result) => {
          expect(result.allowed).toBe(false);
          expect(result.remaining).toBe(0);
          expect(result.current).toBe(25);
          expect(result.max).toBe(25);
        });
    });

    it('uses weekday budget on weekdays', () => {
      jest.setSystemTime(new Date('2026-03-09T14:00:00Z'));
      const redis = makeRedisStore();
      const manager = new DailyBudgetManager(redis as any);

      return manager
        .canSendMessage('conv-1', { weekdayMaxMessages: 10, weekendMaxMessages: 25 })
        .then((result) => {
          expect(result.allowed).toBe(true);
          expect(result.remaining).toBe(10);
          expect(result.current).toBe(0);
          expect(result.max).toBe(10);
        });
    });
  });

  describe('recordMessage', () => {
    it('increments counter and adds user to set', async () => {
      jest.setSystemTime(new Date('2026-03-07T14:00:00Z'));
      const redis = makeRedisStore();
      const manager = new DailyBudgetManager(redis as any);

      await manager.recordMessage('conv-1', 'user-42');

      expect(redis.incr).toHaveBeenCalledWith('agent:budget:conv-1:2026-03-07');
      expect(redis.sadd).toHaveBeenCalledWith('agent:budget:conv-1:2026-03-07:users', 'user-42');
      expect(redis.expire).toHaveBeenCalledTimes(2);
      expect(redis.store.get('agent:budget:conv-1:2026-03-07')).toBe('1');
      expect(redis.sets.get('agent:budget:conv-1:2026-03-07:users')?.has('user-42')).toBe(true);
    });
  });

  describe('canAddUser', () => {
    it('checks user count against max on weekend', async () => {
      jest.setSystemTime(new Date('2026-03-07T14:00:00Z'));
      const redis = makeRedisStore();
      redis.sets.set('agent:budget:conv-1:2026-03-07:users', new Set(['u1', 'u2']));
      const manager = new DailyBudgetManager(redis as any);

      const result = await manager.canAddUser('conv-1', {
        weekdayMaxUsers: 3,
        weekendMaxUsers: 5,
      });

      expect(result.allowed).toBe(true);
      expect(result.current).toBe(2);
      expect(result.max).toBe(5);
    });

    it('blocks when user limit reached', async () => {
      jest.setSystemTime(new Date('2026-03-07T14:00:00Z'));
      const redis = makeRedisStore();
      redis.sets.set('agent:budget:conv-1:2026-03-07:users', new Set(['u1', 'u2', 'u3', 'u4', 'u5']));
      const manager = new DailyBudgetManager(redis as any);

      const result = await manager.canAddUser('conv-1', {
        weekdayMaxUsers: 3,
        weekendMaxUsers: 5,
      });

      expect(result.allowed).toBe(false);
      expect(result.current).toBe(5);
      expect(result.max).toBe(5);
    });
  });

  describe('canBurst', () => {
    it('blocks during cooldown period', async () => {
      jest.setSystemTime(new Date('2026-03-07T14:00:00Z'));
      const redis = makeRedisStore();
      const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
      redis.store.set('agent:budget:conv-1:last-burst', String(fiveMinutesAgo));
      const manager = new DailyBudgetManager(redis as any);

      const result = await manager.canBurst('conv-1', { quietIntervalMinutes: 30 });

      expect(result.allowed).toBe(false);
      expect(result.minutesUntilNext).toBe(25);
    });

    it('allows after cooldown elapsed', async () => {
      jest.setSystemTime(new Date('2026-03-07T14:00:00Z'));
      const redis = makeRedisStore();
      const thirtyOneMinutesAgo = Date.now() - 31 * 60 * 1000;
      redis.store.set('agent:budget:conv-1:last-burst', String(thirtyOneMinutesAgo));
      const manager = new DailyBudgetManager(redis as any);

      const result = await manager.canBurst('conv-1', { quietIntervalMinutes: 30 });

      expect(result.allowed).toBe(true);
      expect(result.minutesUntilNext).toBe(0);
    });

    it('allows when no previous burst recorded', async () => {
      jest.setSystemTime(new Date('2026-03-07T14:00:00Z'));
      const redis = makeRedisStore();
      const manager = new DailyBudgetManager(redis as any);

      const result = await manager.canBurst('conv-1', { quietIntervalMinutes: 30 });

      expect(result.allowed).toBe(true);
      expect(result.minutesUntilNext).toBe(0);
    });
  });

  describe('recordBurst', () => {
    it('stores current timestamp with TTL', async () => {
      jest.setSystemTime(new Date('2026-03-07T14:00:00Z'));
      const redis = makeRedisStore();
      const manager = new DailyBudgetManager(redis as any);

      await manager.recordBurst('conv-1');

      expect(redis.set).toHaveBeenCalledWith(
        'agent:budget:conv-1:last-burst',
        String(Date.now()),
        'EX',
        172800,
      );
    });
  });

  describe('getTodayStats', () => {
    it('returns correct stats', async () => {
      jest.setSystemTime(new Date('2026-03-07T14:00:00Z'));
      const redis = makeRedisStore();
      redis.store.set('agent:budget:conv-1:2026-03-07', '12');
      redis.sets.set('agent:budget:conv-1:2026-03-07:users', new Set(['u1', 'u2', 'u3']));
      const manager = new DailyBudgetManager(redis as any);

      const stats = await manager.getTodayStats('conv-1');

      expect(stats.messagesUsed).toBe(12);
      expect(stats.usersActive).toBe(3);
      expect(stats.isWeekend).toBe(true);
    });

    it('returns zeros when no data exists', async () => {
      jest.setSystemTime(new Date('2026-03-09T14:00:00Z'));
      const redis = makeRedisStore();
      const manager = new DailyBudgetManager(redis as any);

      const stats = await manager.getTodayStats('conv-1');

      expect(stats.messagesUsed).toBe(0);
      expect(stats.usersActive).toBe(0);
      expect(stats.isWeekend).toBe(false);
    });
  });
});
