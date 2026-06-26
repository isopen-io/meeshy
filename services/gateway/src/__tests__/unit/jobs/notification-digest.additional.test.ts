/**
 * Additional coverage for jobs/notification-digest.ts
 * Covers branches not reached by the existing notification-digest.test.ts:
 *  - start() idempotency and timer setup
 *  - stop() clears both timeout and interval
 *  - doWork() empty user set (early return)
 *  - doWork() fatal error from findMany
 *  - doWork() per-user error caught and continued
 *  - processUser() no email address
 *  - processUser() pending.length === 0 (all already emailed)
 *  - processUser() email service returns success: false
 *  - resolveDeepLinkPath fallback to /conversations when no conversationId
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { NotificationDigestJob } from '../../../jobs/notification-digest';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn().mockReturnValue({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    }),
  },
}));

// ── factories ──────────────────────────────────────────────────────────────

function makePrisma(overrides: Record<string, unknown> = {}) {
  return {
    notification: {
      findMany: jest.fn<any>(),
      updateMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
    },
    userPreferences: {
      findFirst: jest.fn<any>().mockResolvedValue({ notification: { emailEnabled: true } }),
    },
    user: {
      findUnique: jest.fn<any>().mockResolvedValue({
        email: 'user@example.com',
        displayName: 'Test User',
        username: 'testuser',
        systemLanguage: 'en',
        isActive: true,
      }),
    },
    ...overrides,
  } as any;
}

function makeEmailService() {
  return { sendNotificationDigestEmail: jest.fn<any>().mockResolvedValue({ success: true }) } as any;
}

function makeMagicLinkService() {
  return { issueLoginTokenForUser: jest.fn<any>().mockResolvedValue('TOKEN') } as any;
}

function makeNotif(overrides: Record<string, unknown> = {}) {
  return {
    id: 'notif-1',
    userId: 'user-1',
    delivery: { emailSent: false },
    context: { conversationId: 'conv-1' },
    createdAt: new Date('2026-01-01'),
    ...overrides,
  };
}

// ── start / stop ───────────────────────────────────────────────────────────

describe('NotificationDigestJob — start / stop', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('start() schedules the first run at 18:00 UTC via setTimeout', () => {
    const job = new NotificationDigestJob(makePrisma(), makeEmailService(), makeMagicLinkService());
    const spy = jest.spyOn(global, 'setTimeout');
    job.start();
    expect(spy).toHaveBeenCalled();
  });

  it('start() is idempotent — second call is a no-op', () => {
    const job = new NotificationDigestJob(makePrisma(), makeEmailService(), makeMagicLinkService());
    const spy = jest.spyOn(global, 'setTimeout');
    job.start();
    job.start();
    // setTimeout only called once for the first start()
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('stop() clears the pending timeout', () => {
    const job = new NotificationDigestJob(makePrisma(), makeEmailService(), makeMagicLinkService());
    const clearSpy = jest.spyOn(global, 'clearTimeout');
    job.start();
    job.stop();
    expect(clearSpy).toHaveBeenCalled();
  });

  it('stop() is a no-op when job was never started', () => {
    const job = new NotificationDigestJob(makePrisma(), makeEmailService(), makeMagicLinkService());
    expect(() => job.stop()).not.toThrow();
  });
});

// ── doWork() edge cases (via runNow()) ─────────────────────────────────────

describe('NotificationDigestJob — doWork edge cases', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns early when no unread notifications exist', async () => {
    const prisma = makePrisma();
    prisma.notification.findMany.mockResolvedValue([]);

    const emailService = makeEmailService();
    const job = new NotificationDigestJob(prisma, emailService, makeMagicLinkService());
    await job.runNow();

    expect(emailService.sendNotificationDigestEmail).not.toHaveBeenCalled();
  });

  it('returns early when all notifications are already emailed', async () => {
    const prisma = makePrisma();
    prisma.notification.findMany.mockResolvedValue([
      makeNotif({ delivery: { emailSent: true } }),
    ]);

    const emailService = makeEmailService();
    const job = new NotificationDigestJob(prisma, emailService, makeMagicLinkService());
    await job.runNow();

    expect(emailService.sendNotificationDigestEmail).not.toHaveBeenCalled();
  });

  it('catches and logs fatal error from findMany', async () => {
    const prisma = makePrisma();
    prisma.notification.findMany.mockRejectedValue(new Error('DB connection lost'));

    const job = new NotificationDigestJob(prisma, makeEmailService(), makeMagicLinkService());
    await expect(job.runNow()).resolves.toBeUndefined();
  });

  it('continues processing remaining users when one user throws', async () => {
    const prisma = makePrisma();

    prisma.notification.findMany.mockImplementation((args: any) => {
      if (!args?.orderBy) {
        return Promise.resolve([
          makeNotif({ userId: 'user-fail' }),
          makeNotif({ userId: 'user-ok' }),
        ]);
      }
      // processUser call for user-fail: throw; for user-ok: return notif
      if (args?.where?.userId === 'user-fail') {
        return Promise.reject(new Error('user-fail DB error'));
      }
      return Promise.resolve([makeNotif({ userId: 'user-ok' })]);
    });

    prisma.user.findUnique.mockResolvedValue({
      email: 'ok@example.com',
      displayName: 'OK User',
      username: 'okuser',
      systemLanguage: 'en',
      isActive: true,
    });

    const emailService = makeEmailService();
    const job = new NotificationDigestJob(prisma, emailService, makeMagicLinkService());
    await job.runNow();

    // user-ok still processed despite user-fail throwing
    expect(emailService.sendNotificationDigestEmail).toHaveBeenCalledTimes(1);
  });
});

// ── processUser() edge cases (via runNow()) ────────────────────────────────

describe('NotificationDigestJob — processUser edge cases', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  function makeJobWithSingleUser(prismaOverrides: {
    notifForUser?: unknown[];
    user?: unknown;
    prefs?: unknown;
  } = {}) {
    const prisma = makePrisma();

    prisma.notification.findMany.mockImplementation((args: any) => {
      if (!args?.orderBy) {
        return Promise.resolve([makeNotif({ userId: 'user-1' })]);
      }
      return Promise.resolve(prismaOverrides.notifForUser ?? [makeNotif({ userId: 'user-1' })]);
    });

    if (prismaOverrides.user !== undefined) {
      prisma.user.findUnique.mockResolvedValue(prismaOverrides.user);
    }
    if (prismaOverrides.prefs !== undefined) {
      prisma.userPreferences.findFirst.mockResolvedValue(prismaOverrides.prefs);
    }

    return { prisma, emailService: makeEmailService(), magicLinkService: makeMagicLinkService() };
  }

  it('skips user when findUnique returns null', async () => {
    const { prisma, emailService, magicLinkService } = makeJobWithSingleUser({ user: null });
    const job = new NotificationDigestJob(prisma, emailService, magicLinkService);
    await job.runNow();
    expect(emailService.sendNotificationDigestEmail).not.toHaveBeenCalled();
  });

  it('skips user with no email address', async () => {
    const { prisma, emailService, magicLinkService } = makeJobWithSingleUser({
      user: { email: null, displayName: 'X', username: 'x', systemLanguage: 'en', isActive: true },
    });
    const job = new NotificationDigestJob(prisma, emailService, magicLinkService);
    await job.runNow();
    expect(emailService.sendNotificationDigestEmail).not.toHaveBeenCalled();
  });

  it('skips user when all their notifications are already emailed (pending.length === 0)', async () => {
    const { prisma, emailService, magicLinkService } = makeJobWithSingleUser({
      notifForUser: [makeNotif({ delivery: { emailSent: true } })],
    });
    const job = new NotificationDigestJob(prisma, emailService, magicLinkService);
    await job.runNow();
    expect(emailService.sendNotificationDigestEmail).not.toHaveBeenCalled();
  });

  it('logs warning when email service returns success: false', async () => {
    const { prisma, emailService, magicLinkService } = makeJobWithSingleUser();
    emailService.sendNotificationDigestEmail.mockResolvedValue({ success: false, error: 'SMTP error' });

    const job = new NotificationDigestJob(prisma, emailService, magicLinkService);
    await job.runNow();

    expect(prisma.notification.updateMany).not.toHaveBeenCalled();
  });

  it('uses /conversations fallback when no notification has a conversationId', async () => {
    const { prisma, emailService, magicLinkService } = makeJobWithSingleUser({
      notifForUser: [makeNotif({ context: null }), makeNotif({ context: {} })],
    });

    const job = new NotificationDigestJob(prisma, emailService, magicLinkService);
    await job.runNow();

    const callArg = emailService.sendNotificationDigestEmail.mock.calls[0][0] as any;
    const decodedUrl = decodeURIComponent(callArg.magicUrl);
    expect(decodedUrl).toContain('/conversations');
    expect(decodedUrl).not.toMatch(/\/conversations\//);
  });

  it('uses username as name fallback when displayName is absent', async () => {
    const { prisma, emailService, magicLinkService } = makeJobWithSingleUser({
      user: { email: 'u@x.com', displayName: null, username: 'userX', systemLanguage: 'en', isActive: true },
    });

    const job = new NotificationDigestJob(prisma, emailService, magicLinkService);
    await job.runNow();

    const callArg = emailService.sendNotificationDigestEmail.mock.calls[0][0] as any;
    expect(callArg.name).toBe('userX');
  });

  it('uses "there" as final name fallback when both displayName and username are absent', async () => {
    const { prisma, emailService, magicLinkService } = makeJobWithSingleUser({
      user: { email: 'u@x.com', displayName: null, username: null, systemLanguage: 'en', isActive: true },
    });

    const job = new NotificationDigestJob(prisma, emailService, magicLinkService);
    await job.runNow();

    const callArg = emailService.sendNotificationDigestEmail.mock.calls[0][0] as any;
    expect(callArg.name).toBe('there');
  });

  it('uses "en" language fallback when systemLanguage is absent', async () => {
    const { prisma, emailService, magicLinkService } = makeJobWithSingleUser({
      user: { email: 'u@x.com', displayName: 'U', username: 'u', systemLanguage: null, isActive: true },
    });

    const job = new NotificationDigestJob(prisma, emailService, magicLinkService);
    await job.runNow();

    const callArg = emailService.sendNotificationDigestEmail.mock.calls[0][0] as any;
    expect(callArg.language).toBe('en');
  });

  it('uses null delivery as "not yet emailed" (isNotYetEmailed boundary)', async () => {
    const { prisma, emailService, magicLinkService } = makeJobWithSingleUser({
      notifForUser: [makeNotif({ delivery: null })],
    });

    const job = new NotificationDigestJob(prisma, emailService, magicLinkService);
    await job.runNow();

    expect(emailService.sendNotificationDigestEmail).toHaveBeenCalled();
  });
});
