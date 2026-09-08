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

import { BanExpirySweepJob, SYSTEM_ACTOR_ID } from '../../../jobs/ban-expiry-sweep';
import { UserAuditAction } from '@meeshy/shared/types';

type ExpiredBan = {
  id: string;
  userId: string;
  expiresAt: Date | null;
  liftedAt: null;
};

function makeBan(overrides: Partial<ExpiredBan> = {}): ExpiredBan {
  return {
    id: 'ban-1',
    userId: 'user-1',
    expiresAt: new Date(Date.now() - 1000), // expired 1s ago
    liftedAt: null,
    ...overrides,
  };
}

function makePrisma(overrides: { findMany?: (args?: any) => Promise<ExpiredBan[]> } = {}) {
  const findMany = jest.fn(overrides.findMany ?? (() => Promise.resolve([])));
  return { ban: { findMany }, spies: { findMany } };
}

function makeBanService(overrides: { expireBan?: (id: string, now: Date) => Promise<{ ban: unknown; reactivated: boolean }> } = {}) {
  const expireBan = jest.fn(overrides.expireBan ?? ((id: string) => Promise.resolve({ ban: { id }, reactivated: true })));
  return { spies: { expireBan }, service: { expireBan } };
}

function makeUserAuditService() {
  const createAuditLog = jest.fn(() => Promise.resolve({}));
  return { spies: { createAuditLog }, service: { createAuditLog } };
}

describe('BanExpirySweepJob (#5527)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  describe('start() / stop() lifecycle', () => {
    it('runs sweep immediately on start', async () => {
      const prisma = makePrisma();
      const banService = makeBanService();
      const auditService = makeUserAuditService();
      const job = new BanExpirySweepJob(prisma as any, banService.service as any, auditService.service as any);

      job.start();
      await Promise.resolve();

      expect(prisma.spies.findMany).toHaveBeenCalledTimes(1);
      job.stop();
    });

    it('fires sweep again after the hourly interval', async () => {
      const prisma = makePrisma();
      const job = new BanExpirySweepJob(prisma as any, makeBanService().service as any, makeUserAuditService().service as any);

      job.start();
      await Promise.resolve();
      const callsAfterStart = prisma.spies.findMany.mock.calls.length;

      await jest.advanceTimersByTimeAsync(60 * 60 * 1000);
      expect(prisma.spies.findMany.mock.calls.length).toBeGreaterThan(callsAfterStart);
      job.stop();
    });

    it('second start() call is a no-op (already-running guard)', async () => {
      const prisma = makePrisma();
      const job = new BanExpirySweepJob(prisma as any, makeBanService().service as any, makeUserAuditService().service as any);

      job.start();
      await Promise.resolve();
      job.start();
      await Promise.resolve();

      expect(prisma.spies.findMany).toHaveBeenCalledTimes(1);
      job.stop();
    });

    it('stop() clears the interval so sweep no longer fires', async () => {
      const prisma = makePrisma();
      const job = new BanExpirySweepJob(prisma as any, makeBanService().service as any, makeUserAuditService().service as any);

      job.start();
      await Promise.resolve();
      job.stop();

      await jest.advanceTimersByTimeAsync(2 * 60 * 60 * 1000);
      expect(prisma.spies.findMany).toHaveBeenCalledTimes(1);
    });
  });

  describe('runNow()', () => {
    it('does nothing when no bans have expired', async () => {
      const prisma = makePrisma({ findMany: () => Promise.resolve([]) });
      const banService = makeBanService();
      const auditService = makeUserAuditService();
      const job = new BanExpirySweepJob(prisma as any, banService.service as any, auditService.service as any);

      await job.runNow();

      expect(banService.spies.expireBan).not.toHaveBeenCalled();
      expect(auditService.spies.createAuditLog).not.toHaveBeenCalled();
    });

    it('expires each ban found and writes an audit log with the SYSTEM actor', async () => {
      const ban = makeBan();
      const prisma = makePrisma({ findMany: () => Promise.resolve([ban]) });
      const banService = makeBanService({ expireBan: () => Promise.resolve({ ban, reactivated: true }) });
      const auditService = makeUserAuditService();
      const job = new BanExpirySweepJob(prisma as any, banService.service as any, auditService.service as any);

      await job.runNow();

      expect(banService.spies.expireBan).toHaveBeenCalledWith(ban.id, expect.any(Date));

      expect(auditService.spies.createAuditLog).toHaveBeenCalledTimes(1);
      const call = (auditService.spies.createAuditLog.mock.calls as any[][])[0]?.[0] as any;
      expect(call.userId).toBe(ban.userId);
      expect(call.adminId).toBe(SYSTEM_ACTOR_ID);
      expect(call.action).toBe(UserAuditAction.UNBAN_USER);
      expect(call.entityId).toBe(ban.id);
      expect(call.changes).toEqual({ isActive: { before: false, after: true } });
      expect(call.metadata).toEqual({ reason: 'expired', banId: ban.id, expiresAt: ban.expiresAt!.toISOString() });
    });

    it('does not claim reactivation in the audit log when the account stays banned', async () => {
      const ban = makeBan();
      const prisma = makePrisma({ findMany: () => Promise.resolve([ban]) });
      const banService = makeBanService({ expireBan: () => Promise.resolve({ ban, reactivated: false }) });
      const auditService = makeUserAuditService();
      const job = new BanExpirySweepJob(prisma as any, banService.service as any, auditService.service as any);

      await job.runNow();

      const call = (auditService.spies.createAuditLog.mock.calls as any[][])[0]?.[0] as any;
      expect(call.changes).toEqual({});
    });

    it('processes remaining bans when one ban fails to expire (best-effort per ban)', async () => {
      const banA = makeBan({ id: 'ban-a', userId: 'user-a' });
      const banB = makeBan({ id: 'ban-b', userId: 'user-b' });
      const prisma = makePrisma({ findMany: () => Promise.resolve([banA, banB]) });
      const banService = makeBanService({
        expireBan: (id: string) =>
          id === 'ban-a'
            ? Promise.reject(new Error('DB down'))
            : Promise.resolve({ ban: banB, reactivated: true }),
      });
      const auditService = makeUserAuditService();
      const job = new BanExpirySweepJob(prisma as any, banService.service as any, auditService.service as any);

      await expect(job.runNow()).resolves.toBeUndefined();

      expect(banService.spies.expireBan).toHaveBeenCalledTimes(2);
      expect(auditService.spies.createAuditLog).toHaveBeenCalledTimes(1);
      const call = (auditService.spies.createAuditLog.mock.calls as any[][])[0]?.[0] as any;
      expect(call.userId).toBe('user-b');
    });

    it('swallows errors from findMany (best-effort sweep)', async () => {
      const prisma = makePrisma({ findMany: () => Promise.reject(new Error('DB down')) });
      const job = new BanExpirySweepJob(prisma as any, makeBanService().service as any, makeUserAuditService().service as any);

      await expect(job.runNow()).resolves.toBeUndefined();
    });
  });

  describe('sweep WHERE clause', () => {
    it('queries for bans where liftedAt is null and expiresAt is not null and <= now', async () => {
      const prisma = makePrisma();
      const job = new BanExpirySweepJob(prisma as any, makeBanService().service as any, makeUserAuditService().service as any);

      await job.runNow();

      const args = (prisma.spies.findMany.mock.calls as any[][])[0]?.[0] as any;
      expect(args.where.liftedAt).toBeNull();
      expect(args.where.expiresAt.not).toBeNull();
      expect(args.where.expiresAt).toHaveProperty('lte');
    });
  });
});
