jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: () => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    }),
  },
}));

import { UnlockAccountsJob } from '../../../jobs/unlock-accounts';

type LockedUser = {
  id: string;
  email: string;
  lockedUntil: Date | null;
  lockedReason: string | null;
};

function makeUser(overrides: Partial<LockedUser> = {}): LockedUser {
  return {
    id: 'user-1',
    email: 'user@example.com',
    lockedUntil: new Date(Date.now() - 1000), // expired 1s ago
    lockedReason: 'too many login attempts',
    ...overrides,
  };
}

function makePrisma(overrides: {
  findMany?: (args?: any) => Promise<LockedUser[]>;
  updateMany?: (args?: any) => Promise<{ count: number }>;
  count?: (args?: any) => Promise<number>;
  createMany?: (args?: any) => Promise<{ count: number }>;
} = {}) {
  const findMany = jest.fn(overrides.findMany ?? (() => Promise.resolve([])));
  const updateMany = jest.fn(overrides.updateMany ?? (() => Promise.resolve({ count: 0 })));
  const count = jest.fn(overrides.count ?? (() => Promise.resolve(0)));
  const createMany = jest.fn(overrides.createMany ?? (() => Promise.resolve({ count: 0 })));
  return {
    user: { findMany, updateMany, count },
    securityEvent: { createMany },
    spies: { findMany, updateMany, count, createMany },
  };
}

describe('UnlockAccountsJob', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  // ─── start / stop lifecycle ─────────────────────────────────────────────

  describe('start()', () => {
    it('runs unlock immediately on start', async () => {
      const prisma = makePrisma();
      const job = new UnlockAccountsJob(prisma as any);

      job.start();
      await Promise.resolve();

      expect(prisma.spies.findMany).toHaveBeenCalledTimes(1);
      job.stop();
    });

    it('fires unlock again after 24-hour interval', async () => {
      const prisma = makePrisma();
      const job = new UnlockAccountsJob(prisma as any);

      job.start();
      await Promise.resolve();
      const callsAfterStart = prisma.spies.findMany.mock.calls.length;

      await jest.advanceTimersByTimeAsync(24 * 60 * 60 * 1000);
      expect(prisma.spies.findMany.mock.calls.length).toBeGreaterThan(callsAfterStart);
      job.stop();
    });

    it('second start() call is a no-op (already-running guard)', async () => {
      const prisma = makePrisma();
      const job = new UnlockAccountsJob(prisma as any);

      job.start();
      await Promise.resolve();
      job.start(); // second call warns, no effect
      await Promise.resolve();

      expect(prisma.spies.findMany).toHaveBeenCalledTimes(1);
      job.stop();
    });
  });

  describe('stop()', () => {
    it('clears the interval so unlock no longer fires', async () => {
      const prisma = makePrisma();
      const job = new UnlockAccountsJob(prisma as any);

      job.start();
      await Promise.resolve();
      job.stop();

      await jest.advanceTimersByTimeAsync(48 * 60 * 60 * 1000);
      expect(prisma.spies.findMany).toHaveBeenCalledTimes(1);
    });

    it('stop() is a no-op when the job was never started', () => {
      const prisma = makePrisma();
      const job = new UnlockAccountsJob(prisma as any);

      expect(() => job.stop()).not.toThrow();
      expect(prisma.spies.findMany).not.toHaveBeenCalled();
    });

    it('stop() allows re-starting the job afterwards', async () => {
      const prisma = makePrisma();
      const job = new UnlockAccountsJob(prisma as any);

      job.start();
      await Promise.resolve();
      job.stop();

      job.start();
      await Promise.resolve();
      expect(prisma.spies.findMany).toHaveBeenCalledTimes(2);
      job.stop();
    });
  });

  // ─── runNow() ───────────────────────────────────────────────────────────

  describe('runNow()', () => {
    it('calls unlock without requiring start()', async () => {
      const prisma = makePrisma();
      const job = new UnlockAccountsJob(prisma as any);

      await job.runNow();

      expect(prisma.spies.findMany).toHaveBeenCalledTimes(1);
    });

    it('does nothing when no accounts have expired locks', async () => {
      const prisma = makePrisma({ findMany: () => Promise.resolve([]) });
      const job = new UnlockAccountsJob(prisma as any);

      await job.runNow();

      expect(prisma.spies.updateMany).not.toHaveBeenCalled();
      expect(prisma.spies.createMany).not.toHaveBeenCalled();
    });

    it('unlocks accounts with expired locks and creates security events', async () => {
      const user = makeUser();
      const prisma = makePrisma({
        findMany: () => Promise.resolve([user]),
        updateMany: () => Promise.resolve({ count: 1 }),
        count: () => Promise.resolve(100),
      });
      const job = new UnlockAccountsJob(prisma as any);

      await job.runNow();

      expect(prisma.spies.updateMany).toHaveBeenCalledTimes(1);
      const updateArgs = (prisma.spies.updateMany.mock.calls as any[][])[0]?.[0] as any;
      expect(updateArgs.where.id.in).toContain(user.id);
      expect(updateArgs.data.lockedUntil).toBeNull();
      expect(updateArgs.data.lockedReason).toBeNull();
      expect(updateArgs.data.failedLoginAttempts).toBe(0);
      expect(updateArgs.data.passwordResetAttempts).toBe(0);

      // Security events created for each unlocked user
      expect(prisma.spies.createMany).toHaveBeenCalledTimes(1);
      const createArgs = (prisma.spies.createMany.mock.calls as any[][])[0]?.[0] as any;
      expect(createArgs.data[0].userId).toBe(user.id);
      expect(createArgs.data[0].eventType).toBe('ACCOUNT_UNLOCKED');
    });

    it('calls getStats after unlocking accounts', async () => {
      const user = makeUser();
      const prisma = makePrisma({
        findMany: () => Promise.resolve([user]),
        count: () => Promise.resolve(50),
      });
      const job = new UnlockAccountsJob(prisma as any);

      await job.runNow();

      // getStats calls user.count 3 times (total, locked, withFailedAttempts)
      expect(prisma.spies.count).toHaveBeenCalled();
    });

    it('swallows errors from findMany (best-effort unlock)', async () => {
      const prisma = makePrisma({
        findMany: () => Promise.reject(new Error('DB down')),
      });
      const job = new UnlockAccountsJob(prisma as any);

      await expect(job.runNow()).resolves.toBeUndefined();
    });

    it('swallows errors from updateMany (best-effort unlock)', async () => {
      const user = makeUser();
      const prisma = makePrisma({
        findMany: () => Promise.resolve([user]),
        updateMany: () => Promise.reject(new Error('Update failed')),
      });
      const job = new UnlockAccountsJob(prisma as any);

      await expect(job.runNow()).resolves.toBeUndefined();
    });
  });

  // ─── WHERE clause targets expired locks ─────────────────────────────────

  describe('unlock WHERE clause', () => {
    it('queries for users where lockedUntil is not null and lte now', async () => {
      const prisma = makePrisma();
      const job = new UnlockAccountsJob(prisma as any);

      await job.runNow();

      const args = (prisma.spies.findMany.mock.calls as any[][])[0]?.[0] as any;
      expect(args.where.AND).toBeDefined();
      // First condition: lockedUntil is not null
      expect(args.where.AND[0]).toEqual({ lockedUntil: { not: null } });
      // Second condition: lockedUntil <= now
      expect(args.where.AND[1].lockedUntil).toHaveProperty('lte');
    });
  });

  // ─── setInterval() ──────────────────────────────────────────────────────

  describe('setInterval()', () => {
    it('throws when hours < 1', () => {
      const prisma = makePrisma();
      const job = new UnlockAccountsJob(prisma as any);

      expect(() => job.setInterval(0)).toThrow('at least 1 hour');
    });

    it('changes the interval when job is not running', () => {
      const prisma = makePrisma();
      const job = new UnlockAccountsJob(prisma as any);

      expect(() => job.setInterval(48)).not.toThrow();
    });

    it('restarts the job with the new interval when already running', async () => {
      const prisma = makePrisma();
      const job = new UnlockAccountsJob(prisma as any);

      job.start();
      await Promise.resolve();
      const callsBefore = prisma.spies.findMany.mock.calls.length;

      job.setInterval(12); // stop + start with 12h interval
      await Promise.resolve();
      expect(prisma.spies.findMany.mock.calls.length).toBeGreaterThan(callsBefore);
      job.stop();
    });
  });
});
