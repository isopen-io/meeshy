/**
 * Unit tests for CleanupExpiredTokens and UnlockAccountsJob background jobs.
 *
 * CleanupExpiredTokens:
 *   Covers: start/stop/idempotent-start, runNow (deleteMany path), no-op when
 *   count=0, error resilience, setInterval validation, and interval restart.
 *
 * UnlockAccountsJob:
 *   Covers: start/stop/idempotent-start, runNow (no locks found, accounts
 *   unlocked + security events created), error resilience, setInterval
 *   validation, and interval restart.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
  },
}));

import { CleanupExpiredTokens } from '../../../jobs/cleanup-expired-tokens';
import { UnlockAccountsJob } from '../../../jobs/unlock-accounts';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

// ─── CleanupExpiredTokens factories ──────────────────────────────────────────

function makeCleanupPrisma(deletedCount = 0) {
  return {
    passwordResetToken: {
      deleteMany: jest.fn<any>().mockResolvedValue({ count: deletedCount }),
      count: jest.fn<any>().mockResolvedValue(0),
    },
  } as unknown as PrismaClient;
}

function makeCleanupSut(prisma?: PrismaClient) {
  return new CleanupExpiredTokens(prisma ?? makeCleanupPrisma());
}

// ─── UnlockAccountsJob factories ─────────────────────────────────────────────

const LOCKED_USERS = [
  { id: 'user-1', email: 'a@test.com', lockedUntil: new Date('2020-01-01'), lockedReason: 'too many attempts' },
  { id: 'user-2', email: 'b@test.com', lockedUntil: new Date('2020-01-01'), lockedReason: 'suspicious activity' },
];

function makeUnlockPrisma(lockedUsers = LOCKED_USERS) {
  return {
    user: {
      findMany: jest.fn<any>().mockResolvedValue(lockedUsers),
      updateMany: jest.fn<any>().mockResolvedValue({ count: lockedUsers.length }),
      count: jest.fn<any>().mockResolvedValue(0),
    },
    securityEvent: {
      createMany: jest.fn<any>().mockResolvedValue({}),
    },
  } as unknown as PrismaClient;
}

function makeUnlockSut(prisma?: PrismaClient) {
  return new UnlockAccountsJob(prisma ?? makeUnlockPrisma());
}

// ─── CleanupExpiredTokens tests ───────────────────────────────────────────────

describe('CleanupExpiredTokens', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  describe('start / stop', () => {
    it('start calls cleanup immediately', async () => {
      const prisma = makeCleanupPrisma();
      const sut = makeCleanupSut(prisma);

      sut.start();
      await Promise.resolve(); // let the fire-and-forget settle

      expect(prisma.passwordResetToken.deleteMany).toHaveBeenCalled();
    });

    it('start is idempotent — second call is a no-op', async () => {
      const prisma = makeCleanupPrisma();
      const sut = makeCleanupSut(prisma);

      sut.start();
      sut.start(); // second call — should log warn and do nothing

      await Promise.resolve();

      // cleanup was called once (from first start), not twice
      expect(prisma.passwordResetToken.deleteMany).toHaveBeenCalledTimes(1);
    });

    it('stop clears the interval', () => {
      const sut = makeCleanupSut();

      sut.start();
      sut.stop(); // should not throw

      // No crash on second stop
      expect(() => sut.stop()).not.toThrow();
    });

    it('fires cleanup on interval tick', async () => {
      const prisma = makeCleanupPrisma();
      const sut = makeCleanupSut(prisma);

      sut.start();
      await Promise.resolve();
      const callsAfterStart = (prisma.passwordResetToken.deleteMany as jest.Mock<any>).mock.calls.length;

      jest.advanceTimersByTime(15 * 60 * 1000 + 1);
      await Promise.resolve();

      expect((prisma.passwordResetToken.deleteMany as jest.Mock<any>).mock.calls.length).toBeGreaterThan(callsAfterStart);
    });
  });

  describe('runNow', () => {
    it('calls deleteMany with expired/used/revoked conditions', async () => {
      const prisma = makeCleanupPrisma();
      const sut = makeCleanupSut(prisma);

      await sut.runNow();

      expect(prisma.passwordResetToken.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ OR: expect.any(Array) }) })
      );
    });

    it('logs stats when tokens are deleted', async () => {
      const prisma = makeCleanupPrisma(5); // 5 deleted
      const sut = makeCleanupSut(prisma);

      await sut.runNow();

      expect(prisma.passwordResetToken.count).toHaveBeenCalled();
    });

    it('does not call count when deleteMany returns 0', async () => {
      const prisma = makeCleanupPrisma(0);
      const sut = makeCleanupSut(prisma);

      await sut.runNow();

      expect(prisma.passwordResetToken.count).not.toHaveBeenCalled();
    });

    it('does not throw when deleteMany rejects', async () => {
      const prisma = makeCleanupPrisma();
      (prisma.passwordResetToken.deleteMany as jest.Mock<any>).mockRejectedValue(new Error('db down'));
      const sut = makeCleanupSut(prisma);

      await expect(sut.runNow()).resolves.not.toThrow();
    });
  });

  describe('setInterval', () => {
    it('throws for interval < 1 minute', () => {
      const sut = makeCleanupSut();

      expect(() => sut.setInterval(0)).toThrow('Interval must be at least 1 minute');
    });

    it('updates interval without restarting when not running', () => {
      const sut = makeCleanupSut();

      expect(() => sut.setInterval(30)).not.toThrow();
    });

    it('restarts the job with new interval when already running', async () => {
      const prisma = makeCleanupPrisma();
      const sut = makeCleanupSut(prisma);

      sut.start();
      await Promise.resolve();
      const callsBeforeChange = (prisma.passwordResetToken.deleteMany as jest.Mock<any>).mock.calls.length;

      sut.setInterval(30);
      await Promise.resolve();

      // setInterval restarts → another immediate cleanup call
      expect((prisma.passwordResetToken.deleteMany as jest.Mock<any>).mock.calls.length).toBeGreaterThan(callsBeforeChange);
    });
  });
});

// ─── UnlockAccountsJob tests ──────────────────────────────────────────────────

describe('UnlockAccountsJob', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  describe('start / stop', () => {
    it('start calls unlock immediately', async () => {
      const prisma = makeUnlockPrisma();
      const sut = makeUnlockSut(prisma);

      sut.start();
      await Promise.resolve();

      expect(prisma.user.findMany).toHaveBeenCalled();
    });

    it('start is idempotent — second call is a no-op', async () => {
      const prisma = makeUnlockPrisma();
      const sut = makeUnlockSut(prisma);

      sut.start();
      sut.start();
      await Promise.resolve();

      expect((prisma.user.findMany as jest.Mock<any>).mock.calls.length).toBe(1);
    });

    it('stop clears the interval without throwing', () => {
      const sut = makeUnlockSut();
      sut.start();

      expect(() => sut.stop()).not.toThrow();
      expect(() => sut.stop()).not.toThrow(); // idempotent stop
    });
  });

  describe('runNow — accounts with expired locks', () => {
    it('queries for accounts with lockedUntil <= now', async () => {
      const prisma = makeUnlockPrisma();
      const sut = makeUnlockSut(prisma);

      await sut.runNow();

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.any(Object) })
      );
    });

    it('calls updateMany to clear lock fields', async () => {
      const prisma = makeUnlockPrisma();
      const sut = makeUnlockSut(prisma);

      await sut.runNow();

      expect(prisma.user.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: { in: ['user-1', 'user-2'] } }),
          data: expect.objectContaining({
            lockedUntil: null,
            lockedReason: null,
            failedLoginAttempts: 0,
          }),
        })
      );
    });

    it('creates ACCOUNT_UNLOCKED security events for each unlocked user', async () => {
      const prisma = makeUnlockPrisma();
      const sut = makeUnlockSut(prisma);

      await sut.runNow();

      expect(prisma.securityEvent.createMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.arrayContaining([
            expect.objectContaining({ userId: 'user-1', eventType: 'ACCOUNT_UNLOCKED' }),
            expect.objectContaining({ userId: 'user-2', eventType: 'ACCOUNT_UNLOCKED' }),
          ]),
        })
      );
    });

    it('calls user.count for stats after unlock', async () => {
      const prisma = makeUnlockPrisma();
      const sut = makeUnlockSut(prisma);

      await sut.runNow();

      expect(prisma.user.count).toHaveBeenCalled();
    });
  });

  describe('runNow — no expired locks', () => {
    it('skips updateMany and securityEvent when no users found', async () => {
      const prisma = makeUnlockPrisma([]);
      const sut = makeUnlockSut(prisma);

      await sut.runNow();

      expect(prisma.user.updateMany).not.toHaveBeenCalled();
      expect(prisma.securityEvent.createMany).not.toHaveBeenCalled();
    });
  });

  describe('error resilience', () => {
    it('does not throw when findMany rejects', async () => {
      const prisma = makeUnlockPrisma();
      (prisma.user.findMany as jest.Mock<any>).mockRejectedValue(new Error('db down'));
      const sut = makeUnlockSut(prisma);

      await expect(sut.runNow()).resolves.not.toThrow();
    });
  });

  describe('setInterval', () => {
    it('throws for interval < 1 hour', () => {
      const sut = makeUnlockSut();

      expect(() => sut.setInterval(0)).toThrow('Interval must be at least 1 hour');
    });

    it('updates interval when job is not running', () => {
      const sut = makeUnlockSut();

      expect(() => sut.setInterval(48)).not.toThrow();
    });

    it('restarts with new interval when job is running', async () => {
      const prisma = makeUnlockPrisma();
      const sut = makeUnlockSut(prisma);

      sut.start();
      await Promise.resolve();
      const callsBefore = (prisma.user.findMany as jest.Mock<any>).mock.calls.length;

      sut.setInterval(12);
      await Promise.resolve();

      expect((prisma.user.findMany as jest.Mock<any>).mock.calls.length).toBeGreaterThan(callsBefore);
    });
  });
});
