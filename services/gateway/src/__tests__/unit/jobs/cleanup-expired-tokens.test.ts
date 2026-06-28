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

import { CleanupExpiredTokens } from '../../../jobs/cleanup-expired-tokens';

type DeleteManyResult = { count: number };
type CountResult = number;

function makePrisma(overrides: {
  deleteMany?: () => Promise<DeleteManyResult>;
  count?: () => Promise<CountResult>;
} = {}) {
  const deleteMany = jest.fn(overrides.deleteMany ?? (() => Promise.resolve({ count: 3 })));
  const count = jest.fn(overrides.count ?? (() => Promise.resolve(10)));
  return {
    passwordResetToken: { deleteMany, count },
    spies: { deleteMany, count },
  };
}

describe('CleanupExpiredTokens', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  // ─── start / stop lifecycle ─────────────────────────────────────────────

  describe('start()', () => {
    it('runs cleanup immediately on start', async () => {
      const prisma = makePrisma();
      const job = new CleanupExpiredTokens(prisma as any);

      job.start();
      await Promise.resolve();

      expect(prisma.spies.deleteMany).toHaveBeenCalledTimes(1);
      job.stop();
    });

    it('fires cleanup again after 15-minute interval', async () => {
      const prisma = makePrisma();
      const job = new CleanupExpiredTokens(prisma as any);

      job.start();
      await Promise.resolve();
      const callsAfterStart = prisma.spies.deleteMany.mock.calls.length;

      await jest.advanceTimersByTimeAsync(15 * 60 * 1000);
      expect(prisma.spies.deleteMany.mock.calls.length).toBeGreaterThan(callsAfterStart);
      job.stop();
    });

    it('second start() call is a no-op (already-running guard)', async () => {
      const prisma = makePrisma();
      const job = new CleanupExpiredTokens(prisma as any);

      job.start();
      await Promise.resolve();
      job.start(); // should warn, not start again
      await Promise.resolve();

      // Two calls after start would mean the interval ran twice — but second start is no-op
      const calls = prisma.spies.deleteMany.mock.calls.length;
      expect(calls).toBe(1);
      job.stop();
    });
  });

  describe('stop()', () => {
    it('clears the interval so cleanup no longer fires', async () => {
      const prisma = makePrisma();
      const job = new CleanupExpiredTokens(prisma as any);

      job.start();
      await Promise.resolve();
      job.stop();

      await jest.advanceTimersByTimeAsync(30 * 60 * 1000);
      expect(prisma.spies.deleteMany).toHaveBeenCalledTimes(1); // only the immediate one
    });

    it('stop() is a no-op when the job was never started', () => {
      const prisma = makePrisma();
      const job = new CleanupExpiredTokens(prisma as any);

      expect(() => job.stop()).not.toThrow();
      expect(prisma.spies.deleteMany).not.toHaveBeenCalled();
    });

    it('stop() allows re-starting the job afterwards', async () => {
      const prisma = makePrisma();
      const job = new CleanupExpiredTokens(prisma as any);

      job.start();
      await Promise.resolve();
      job.stop();

      job.start();
      await Promise.resolve();
      expect(prisma.spies.deleteMany).toHaveBeenCalledTimes(2);
      job.stop();
    });
  });

  // ─── runNow() ───────────────────────────────────────────────────────────

  describe('runNow()', () => {
    it('calls cleanup without requiring start()', async () => {
      const prisma = makePrisma();
      const job = new CleanupExpiredTokens(prisma as any);

      await job.runNow();

      expect(prisma.spies.deleteMany).toHaveBeenCalledTimes(1);
    });

    it('logs stats when tokens were deleted', async () => {
      const prisma = makePrisma({ deleteMany: () => Promise.resolve({ count: 5 }) });
      const job = new CleanupExpiredTokens(prisma as any);

      // When count > 0, getStats() is called which fires count() multiple times
      await job.runNow();

      expect(prisma.spies.deleteMany).toHaveBeenCalledTimes(1);
      // getStats calls count 5 times (total, active, expired, used, revoked)
      expect(prisma.spies.count).toHaveBeenCalled();
    });

    it('does not call getStats when no tokens were deleted', async () => {
      const prisma = makePrisma({ deleteMany: () => Promise.resolve({ count: 0 }) });
      const job = new CleanupExpiredTokens(prisma as any);

      await job.runNow();

      expect(prisma.spies.count).not.toHaveBeenCalled();
    });

    it('swallows errors from deleteMany (best-effort cleanup)', async () => {
      const prisma = makePrisma({
        deleteMany: () => Promise.reject(new Error('Mongo down')),
      });
      const job = new CleanupExpiredTokens(prisma as any);

      await expect(job.runNow()).resolves.toBeUndefined();
    });
  });

  // ─── cleanup — where clause covers all three OR branches ────────────────

  describe('cleanup WHERE clause', () => {
    it('passes an OR clause covering expired / used / revoked tokens', async () => {
      const prisma = makePrisma();
      const job = new CleanupExpiredTokens(prisma as any);

      await job.runNow();

      const args = (prisma.spies.deleteMany.mock.calls as any[][])[0]?.[0] as any;
      expect(args.where.OR).toHaveLength(3);

      // Branch 1: expired tokens
      expect(args.where.OR[0]).toHaveProperty('expiresAt');

      // Branch 2: used tokens older than 24h
      expect(args.where.OR[1]).toHaveProperty('AND');

      // Branch 3: revoked tokens older than 24h
      expect(args.where.OR[2]).toHaveProperty('AND');
    });
  });

  // ─── setInterval() ──────────────────────────────────────────────────────

  describe('setInterval()', () => {
    it('throws when minutes < 1', () => {
      const prisma = makePrisma();
      const job = new CleanupExpiredTokens(prisma as any);

      expect(() => job.setInterval(0)).toThrow('at least 1 minute');
    });

    it('changes the interval when job is not running', () => {
      const prisma = makePrisma();
      const job = new CleanupExpiredTokens(prisma as any);

      expect(() => job.setInterval(30)).not.toThrow();
    });

    it('restarts the job with the new interval when already running', async () => {
      const prisma = makePrisma();
      const job = new CleanupExpiredTokens(prisma as any);

      job.start();
      await Promise.resolve();
      const callsBeforeChange = prisma.spies.deleteMany.mock.calls.length;

      // setInterval while running → stop + start at new interval
      job.setInterval(30);
      await Promise.resolve();
      // The restart fires an immediate cleanup again
      expect(prisma.spies.deleteMany.mock.calls.length).toBeGreaterThan(callsBeforeChange);
      job.stop();
    });
  });
});
