// Mock all heavy dependencies so the BackgroundJobsManager constructor
// doesn't try to connect to Redis, Prisma, or external services.
jest.mock('../../../jobs/cleanup-expired-tokens', () => ({
  CleanupExpiredTokens: jest.fn().mockImplementation(() => ({
    start: jest.fn(),
    stop: jest.fn(),
    runNow: jest.fn().mockResolvedValue(undefined),
  })),
}));

jest.mock('../../../jobs/unlock-accounts', () => ({
  UnlockAccountsJob: jest.fn().mockImplementation(() => ({
    start: jest.fn(),
    stop: jest.fn(),
    runNow: jest.fn().mockResolvedValue(undefined),
  })),
}));

jest.mock('../../../jobs/notification-digest', () => ({
  NotificationDigestJob: jest.fn().mockImplementation(() => ({
    start: jest.fn(),
    stop: jest.fn(),
    runNow: jest.fn().mockResolvedValue(undefined),
  })),
}));

jest.mock('../../../jobs/delivery-queue-cleanup', () => ({
  DeliveryQueueCleanupJob: jest.fn().mockImplementation(() => ({
    start: jest.fn(),
    stop: jest.fn(),
    runNow: jest.fn().mockResolvedValue(undefined),
  })),
}));

jest.mock('../../../jobs/mutation-log-cleanup', () => ({
  MutationLogCleanupJob: jest.fn().mockImplementation(() => ({
    start: jest.fn(),
    stop: jest.fn(),
    runNow: jest.fn().mockResolvedValue(undefined),
  })),
}));

jest.mock('../../../services/MagicLinkService', () => ({
  MagicLinkService: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../../../services/CacheStore', () => ({
  getCacheStore: jest.fn().mockReturnValue({}),
}));

jest.mock('../../../services/GeoIPService', () => ({
  GeoIPService: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../../../services/RedisDeliveryQueue', () => ({
  RedisDeliveryQueue: jest.fn().mockImplementation(() => ({
    cleanup: jest.fn().mockResolvedValue(0),
  })),
}));

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

import { BackgroundJobsManager } from '../../../jobs/index';

function makePrisma() {
  return {} as any;
}

function makeEmailService() {
  return {} as any;
}

describe('BackgroundJobsManager', () => {
  let manager: BackgroundJobsManager;

  beforeEach(() => {
    manager = new BackgroundJobsManager(makePrisma(), makeEmailService());
  });

  // ─── isJobsRunning() ─────────────────────────────────────────────────────

  it('reports jobs as not running before startAll()', () => {
    expect(manager.isJobsRunning()).toBe(false);
  });

  it('reports jobs as running after startAll()', () => {
    manager.startAll();
    expect(manager.isJobsRunning()).toBe(true);
    manager.stopAll();
  });

  // ─── startAll() ──────────────────────────────────────────────────────────

  describe('startAll()', () => {
    it('starts all jobs and sets isRunning to true', () => {
      manager.startAll();

      const jobs = manager.getJobs();
      expect(jobs.cleanupTokens.start).toHaveBeenCalledTimes(1);
      expect(jobs.unlockAccounts.start).toHaveBeenCalledTimes(1);
      expect(jobs.notificationDigest.start).toHaveBeenCalledTimes(1);
      expect(jobs.deliveryQueueCleanup.start).toHaveBeenCalledTimes(1);
      expect(jobs.mutationLogCleanup.start).toHaveBeenCalledTimes(1);

      expect(manager.isJobsRunning()).toBe(true);
      manager.stopAll();
    });

    it('second startAll() call is a no-op (already-running guard)', () => {
      manager.startAll();
      manager.startAll(); // should warn, not start again

      const jobs = manager.getJobs();
      // Each job.start() should have been called exactly once
      expect(jobs.cleanupTokens.start).toHaveBeenCalledTimes(1);
      manager.stopAll();
    });
  });

  // ─── stopAll() ───────────────────────────────────────────────────────────

  describe('stopAll()', () => {
    it('stops all jobs and sets isRunning to false', () => {
      manager.startAll();
      manager.stopAll();

      const jobs = manager.getJobs();
      expect(jobs.cleanupTokens.stop).toHaveBeenCalledTimes(1);
      expect(jobs.unlockAccounts.stop).toHaveBeenCalledTimes(1);
      expect(jobs.notificationDigest.stop).toHaveBeenCalledTimes(1);
      expect(jobs.deliveryQueueCleanup.stop).toHaveBeenCalledTimes(1);
      expect(jobs.mutationLogCleanup.stop).toHaveBeenCalledTimes(1);

      expect(manager.isJobsRunning()).toBe(false);
    });

    it('second stopAll() call is a no-op (not-running guard)', () => {
      manager.startAll();
      manager.stopAll();
      manager.stopAll(); // should warn, not stop again

      const jobs = manager.getJobs();
      expect(jobs.cleanupTokens.stop).toHaveBeenCalledTimes(1);
    });

    it('stopAll() is a no-op when jobs were never started', () => {
      expect(() => manager.stopAll()).not.toThrow();
      expect(manager.isJobsRunning()).toBe(false);
    });
  });

  // ─── runAll() ────────────────────────────────────────────────────────────

  describe('runAll()', () => {
    it('calls runNow() on all jobs', async () => {
      await manager.runAll();

      const jobs = manager.getJobs();
      expect(jobs.cleanupTokens.runNow).toHaveBeenCalledTimes(1);
      expect(jobs.unlockAccounts.runNow).toHaveBeenCalledTimes(1);
      expect(jobs.notificationDigest.runNow).toHaveBeenCalledTimes(1);
      expect(jobs.deliveryQueueCleanup.runNow).toHaveBeenCalledTimes(1);
      expect(jobs.mutationLogCleanup.runNow).toHaveBeenCalledTimes(1);
    });

    it('does not require startAll() to be called first', async () => {
      await expect(manager.runAll()).resolves.toBeUndefined();
    });
  });

  // ─── getJobs() ───────────────────────────────────────────────────────────

  describe('getJobs()', () => {
    it('returns all five job instances', () => {
      const jobs = manager.getJobs();
      expect(jobs).toHaveProperty('cleanupTokens');
      expect(jobs).toHaveProperty('unlockAccounts');
      expect(jobs).toHaveProperty('notificationDigest');
      expect(jobs).toHaveProperty('deliveryQueueCleanup');
      expect(jobs).toHaveProperty('mutationLogCleanup');
    });
  });

  // ─── custom deliveryQueue parameter ──────────────────────────────────────

  it('accepts an optional deliveryQueue parameter', () => {
    const customQueue = { cleanup: jest.fn().mockResolvedValue(0) } as any;
    const mgr = new BackgroundJobsManager(makePrisma(), makeEmailService(), customQueue);
    expect(mgr.isJobsRunning()).toBe(false);
  });
});
