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

import { BanExpirySweepJob } from '../../../jobs/ban-expiry-sweep';
import { UserAuditAction } from '@meeshy/shared/types';
import { SYSTEM_ACTOR_ID } from '../../../services/admin/ban.service';

type LiftedBan = {
  id: string;
  userId: string;
  bannedById: string;
  reason: string;
  expiresAt: Date | null;
  createdAt: Date;
  liftedAt: Date | null;
  liftedById: string | null;
  liftReason: string | null;
};

function makeLiftedBan(overrides: Partial<LiftedBan> = {}): LiftedBan {
  const echeance = new Date('2026-09-01T00:00:00Z');
  return {
    id: 'ban-1',
    userId: 'user-1',
    bannedById: 'admin-1',
    reason: 'Spam',
    expiresAt: echeance,
    createdAt: new Date('2026-08-01T00:00:00Z'),
    liftedAt: echeance,
    liftedById: null,
    liftReason: 'expired',
    ...overrides,
  };
}

function makeBanService(sweepExpiredBans?: jest.Mock) {
  const spy = sweepExpiredBans ?? jest.fn(() => Promise.resolve([]));
  return { banService: { sweepExpiredBans: spy } as any, spies: { sweepExpiredBans: spy } };
}

function makeUserAuditService(createAuditLog?: jest.Mock) {
  const spy = createAuditLog ?? jest.fn(() => Promise.resolve({}));
  return { userAuditService: { createAuditLog: spy } as any, spies: { createAuditLog: spy } };
}

describe('BanExpirySweepJob', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  // ─── start / stop lifecycle ─────────────────────────────────────────────

  describe('start()', () => {
    it('runs sweep immediately on start', async () => {
      const { banService, spies } = makeBanService();
      const { userAuditService } = makeUserAuditService();
      const job = new BanExpirySweepJob(banService, userAuditService);

      job.start();
      await Promise.resolve();

      expect(spies.sweepExpiredBans).toHaveBeenCalledTimes(1);
      job.stop();
    });

    it('fires sweep again after the 15-minute interval', async () => {
      const { banService, spies } = makeBanService();
      const { userAuditService } = makeUserAuditService();
      const job = new BanExpirySweepJob(banService, userAuditService);

      job.start();
      await Promise.resolve();
      const callsAfterStart = spies.sweepExpiredBans.mock.calls.length;

      await jest.advanceTimersByTimeAsync(15 * 60 * 1000);
      expect(spies.sweepExpiredBans.mock.calls.length).toBeGreaterThan(callsAfterStart);
      job.stop();
    });

    it('second start() call is a no-op (already-running guard)', async () => {
      const { banService, spies } = makeBanService();
      const { userAuditService } = makeUserAuditService();
      const job = new BanExpirySweepJob(banService, userAuditService);

      job.start();
      await Promise.resolve();
      job.start();
      await Promise.resolve();

      expect(spies.sweepExpiredBans).toHaveBeenCalledTimes(1);
      job.stop();
    });
  });

  describe('stop()', () => {
    it('clears the interval so sweep no longer fires', async () => {
      const { banService, spies } = makeBanService();
      const { userAuditService } = makeUserAuditService();
      const job = new BanExpirySweepJob(banService, userAuditService);

      job.start();
      await Promise.resolve();
      job.stop();

      await jest.advanceTimersByTimeAsync(60 * 60 * 1000);
      expect(spies.sweepExpiredBans).toHaveBeenCalledTimes(1);
    });

    it('stop() is a no-op when the job was never started', () => {
      const { banService } = makeBanService();
      const { userAuditService } = makeUserAuditService();
      const job = new BanExpirySweepJob(banService, userAuditService);

      expect(() => job.stop()).not.toThrow();
    });

    it('stop() allows re-starting the job afterwards', async () => {
      const { banService, spies } = makeBanService();
      const { userAuditService } = makeUserAuditService();
      const job = new BanExpirySweepJob(banService, userAuditService);

      job.start();
      await Promise.resolve();
      job.stop();

      job.start();
      await Promise.resolve();
      expect(spies.sweepExpiredBans).toHaveBeenCalledTimes(2);
      job.stop();
    });
  });

  // ─── runNow() ───────────────────────────────────────────────────────────

  describe('runNow()', () => {
    it('calls sweepExpiredBans without requiring start()', async () => {
      const { banService, spies } = makeBanService();
      const { userAuditService } = makeUserAuditService();
      const job = new BanExpirySweepJob(banService, userAuditService);

      await job.runNow();

      expect(spies.sweepExpiredBans).toHaveBeenCalledTimes(1);
    });

    it('does nothing when no bans have expired', async () => {
      const { banService } = makeBanService();
      const { userAuditService, spies: auditSpies } = makeUserAuditService();
      const job = new BanExpirySweepJob(banService, userAuditService);

      await job.runNow();

      expect(auditSpies.createAuditLog).not.toHaveBeenCalled();
    });

    it('writes an UNBAN_USER audit log under the system actor for each lifted ban', async () => {
      const ban = makeLiftedBan();
      const { banService } = makeBanService(jest.fn(() => Promise.resolve([ban])));
      const { userAuditService, spies: auditSpies } = makeUserAuditService();
      const job = new BanExpirySweepJob(banService, userAuditService);

      await job.runNow();

      expect(auditSpies.createAuditLog).toHaveBeenCalledTimes(1);
      expect(auditSpies.createAuditLog).toHaveBeenCalledWith({
        userId: ban.userId,
        adminId: SYSTEM_ACTOR_ID,
        action: UserAuditAction.UNBAN_USER,
        entityId: ban.id,
        changes: {},
        metadata: { reason: 'expired', banId: ban.id, expiresAt: ban.expiresAt!.toISOString() },
      });
    });

    it('writes one audit log per lifted ban', async () => {
      const ban1 = makeLiftedBan({ id: 'ban-1', userId: 'user-1' });
      const ban2 = makeLiftedBan({ id: 'ban-2', userId: 'user-2' });
      const { banService } = makeBanService(jest.fn(() => Promise.resolve([ban1, ban2])));
      const { userAuditService, spies: auditSpies } = makeUserAuditService();
      const job = new BanExpirySweepJob(banService, userAuditService);

      await job.runNow();

      expect(auditSpies.createAuditLog).toHaveBeenCalledTimes(2);
    });

    it('a ban with expiresAt null (unreachable via sweepExpiredBans in practice) never reaches the audit log write with a null date', async () => {
      // sweepExpiredBans only ever returns bans it lifted for expiry, which always
      // carry a non-null expiresAt — but the job defends with `?? null` regardless.
      const ban = makeLiftedBan({ expiresAt: null });
      const { banService } = makeBanService(jest.fn(() => Promise.resolve([ban])));
      const { userAuditService, spies: auditSpies } = makeUserAuditService();
      const job = new BanExpirySweepJob(banService, userAuditService);

      await job.runNow();

      expect(auditSpies.createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({ metadata: expect.objectContaining({ expiresAt: null }) })
      );
    });

    it('keeps writing remaining audit logs when one fails (best-effort)', async () => {
      const ban1 = makeLiftedBan({ id: 'ban-1', userId: 'user-1' });
      const ban2 = makeLiftedBan({ id: 'ban-2', userId: 'user-2' });
      const { banService } = makeBanService(jest.fn(() => Promise.resolve([ban1, ban2])));
      const failThenSucceed = jest
        .fn()
        .mockRejectedValueOnce(new Error('DB down'))
        .mockResolvedValueOnce({});
      const { userAuditService, spies: auditSpies } = makeUserAuditService(failThenSucceed);
      const job = new BanExpirySweepJob(banService, userAuditService);

      await expect(job.runNow()).resolves.toBeUndefined();

      expect(auditSpies.createAuditLog).toHaveBeenCalledTimes(2);
    });

    it('swallows errors from sweepExpiredBans (best-effort)', async () => {
      const { banService } = makeBanService(jest.fn(() => Promise.reject(new Error('DB down'))));
      const { userAuditService } = makeUserAuditService();
      const job = new BanExpirySweepJob(banService, userAuditService);

      await expect(job.runNow()).resolves.toBeUndefined();
    });
  });

  // ─── setInterval() ──────────────────────────────────────────────────────

  describe('setInterval()', () => {
    it('throws when minutes < 1', () => {
      const { banService } = makeBanService();
      const { userAuditService } = makeUserAuditService();
      const job = new BanExpirySweepJob(banService, userAuditService);

      expect(() => job.setInterval(0)).toThrow('at least 1 minute');
    });

    it('changes the interval when job is not running', () => {
      const { banService } = makeBanService();
      const { userAuditService } = makeUserAuditService();
      const job = new BanExpirySweepJob(banService, userAuditService);

      expect(() => job.setInterval(30)).not.toThrow();
    });

    it('restarts the job with the new interval when already running', async () => {
      const { banService, spies } = makeBanService();
      const { userAuditService } = makeUserAuditService();
      const job = new BanExpirySweepJob(banService, userAuditService);

      job.start();
      await Promise.resolve();
      const callsBefore = spies.sweepExpiredBans.mock.calls.length;

      job.setInterval(5); // stop + start with 5-minute interval
      await Promise.resolve();
      expect(spies.sweepExpiredBans.mock.calls.length).toBeGreaterThan(callsBefore);
      job.stop();
    });
  });
});
