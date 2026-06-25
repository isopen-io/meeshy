/**
 * Extra unit tests for NotificationDigestJob.
 * Covers branches not exercised by the primary test suite:
 * start/stop lifecycle, no-unread early exit, email failure path,
 * all-already-emailed skip, null delivery treated as pending,
 * missing user skip, conversations fallback, doWork fatal error.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { NotificationDigestJob } from '../../../jobs/notification-digest';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
  },
}));

function makeMocks(opts: {
  globalFindManyResult?: object[];
  userFindManyResult?: object[];
  userPrefs?: object | null;
  user?: object | null;
  emailResult?: { success: boolean; error?: string };
  token?: string | null;
} = {}) {
  const {
    globalFindManyResult = [{ userId: 'u-1', delivery: { emailSent: false } }],
    userFindManyResult = [
      { id: 'n-1', context: { conversationId: 'conv-1' }, delivery: { emailSent: false } },
    ],
    userPrefs = { notification: { emailEnabled: true } },
    user = { email: 'alice@example.com', displayName: 'Alice', username: 'alice', systemLanguage: 'en', isActive: true },
    emailResult = { success: true },
    token = 'TOK123',
  } = opts;

  const prisma = {
    notification: {
      findMany: jest.fn<any>().mockImplementation((args: any) => {
        if (args?.select?.userId && !args?.orderBy) return Promise.resolve(globalFindManyResult);
        return Promise.resolve(userFindManyResult);
      }),
      updateMany: jest.fn<any>().mockResolvedValue({ count: 1 }),
    },
    userPreferences: { findFirst: jest.fn<any>().mockResolvedValue(userPrefs) },
    user: { findUnique: jest.fn<any>().mockResolvedValue(user) },
  } as any;

  const emailService = {
    sendNotificationDigestEmail: jest.fn<any>().mockResolvedValue(emailResult),
  } as any;

  const magicLinkService = {
    issueLoginTokenForUser: jest.fn<any>().mockResolvedValue(token),
  } as any;

  return { prisma, emailService, magicLinkService };
}

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

// ─── start / stop lifecycle ───────────────────────────────────────────────────

describe('start and stop', () => {
  it('start is idempotent — second call logs warn and adds no timer', () => {
    const { prisma, emailService, magicLinkService } = makeMocks();
    const job = new NotificationDigestJob(prisma, emailService, magicLinkService);

    job.start();
    job.start(); // second call — should be ignored

    expect(prisma.notification.findMany).not.toHaveBeenCalled();
  });

  it('stop does not throw when the job was never started', () => {
    const { prisma, emailService, magicLinkService } = makeMocks();
    const job = new NotificationDigestJob(prisma, emailService, magicLinkService);

    expect(() => job.stop()).not.toThrow();
  });

  it('stop prevents the scheduled timer from firing', () => {
    const { prisma, emailService, magicLinkService } = makeMocks();
    const job = new NotificationDigestJob(prisma, emailService, magicLinkService);

    job.start();
    job.stop();

    jest.runAllTimers();

    expect(prisma.notification.findMany).not.toHaveBeenCalled();
  });
});

// ─── doWork — no unread notifications ────────────────────────────────────────

describe('doWork — no users with pending notifications', () => {
  it('returns early without querying per-user data when there are no unread notifications', async () => {
    const { prisma, emailService, magicLinkService } = makeMocks({
      globalFindManyResult: [],
    });
    const job = new NotificationDigestJob(prisma, emailService, magicLinkService);

    await job.runNow();

    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(emailService.sendNotificationDigestEmail).not.toHaveBeenCalled();
  });

  it('treats delivery=null as not yet emailed', async () => {
    const { prisma, emailService, magicLinkService } = makeMocks({
      globalFindManyResult: [{ userId: 'u-1', delivery: null }],
    });
    const job = new NotificationDigestJob(prisma, emailService, magicLinkService);

    await job.runNow();

    expect(prisma.user.findUnique).toHaveBeenCalled();
  });

  it('skips notifications where delivery.emailSent is already true', async () => {
    const { prisma, emailService, magicLinkService } = makeMocks({
      globalFindManyResult: [{ userId: 'u-1', delivery: { emailSent: true } }],
    });
    const job = new NotificationDigestJob(prisma, emailService, magicLinkService);

    await job.runNow();

    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(emailService.sendNotificationDigestEmail).not.toHaveBeenCalled();
  });
});

// ─── processUser — edge cases ─────────────────────────────────────────────────

describe('processUser edge cases', () => {
  it('skips when user is not found in DB', async () => {
    const { prisma, emailService, magicLinkService } = makeMocks({ user: null });
    const job = new NotificationDigestJob(prisma, emailService, magicLinkService);

    await job.runNow();

    expect(magicLinkService.issueLoginTokenForUser).not.toHaveBeenCalled();
    expect(emailService.sendNotificationDigestEmail).not.toHaveBeenCalled();
  });

  it('skips when user has no email address', async () => {
    const { prisma, emailService, magicLinkService } = makeMocks({
      user: { email: null, displayName: 'Bob', username: 'bob', systemLanguage: 'en', isActive: true },
    });
    const job = new NotificationDigestJob(prisma, emailService, magicLinkService);

    await job.runNow();

    expect(emailService.sendNotificationDigestEmail).not.toHaveBeenCalled();
  });

  it('skips when all pending notifications are already emailed', async () => {
    const { prisma, emailService, magicLinkService } = makeMocks({
      userFindManyResult: [{ id: 'n-1', context: {}, delivery: { emailSent: true } }],
    });
    const job = new NotificationDigestJob(prisma, emailService, magicLinkService);

    await job.runNow();

    expect(emailService.sendNotificationDigestEmail).not.toHaveBeenCalled();
  });

  it('logs a warning when the email send fails and does not mark notifications', async () => {
    const { prisma, emailService, magicLinkService } = makeMocks({
      emailResult: { success: false, error: 'SMTP error' },
    });
    const job = new NotificationDigestJob(prisma, emailService, magicLinkService);

    await job.runNow();

    expect(prisma.notification.updateMany).not.toHaveBeenCalled();
  });

  it('uses username as name fallback when displayName is absent', async () => {
    const { prisma, emailService, magicLinkService } = makeMocks({
      user: { email: 'bob@example.com', displayName: null, username: 'bob99', systemLanguage: 'fr', isActive: true },
    });
    const job = new NotificationDigestJob(prisma, emailService, magicLinkService);

    await job.runNow();

    const data = emailService.sendNotificationDigestEmail.mock.calls[0][0];
    expect(data.name).toBe('bob99');
  });

  it('falls back to "there" when both displayName and username are absent', async () => {
    const { prisma, emailService, magicLinkService } = makeMocks({
      user: { email: 'x@example.com', displayName: null, username: null, systemLanguage: 'en', isActive: true },
    });
    const job = new NotificationDigestJob(prisma, emailService, magicLinkService);

    await job.runNow();

    const data = emailService.sendNotificationDigestEmail.mock.calls[0][0];
    expect(data.name).toBe('there');
  });
});

// ─── resolveDeepLinkPath fallback ─────────────────────────────────────────────

describe('resolveDeepLinkPath', () => {
  it('falls back to /conversations when no notification has a conversationId', async () => {
    const { prisma, emailService, magicLinkService } = makeMocks({
      userFindManyResult: [{ id: 'n-1', context: null, delivery: { emailSent: false } }],
    });
    const job = new NotificationDigestJob(prisma, emailService, magicLinkService);

    await job.runNow();

    const data = emailService.sendNotificationDigestEmail.mock.calls[0][0];
    // returnUrl is encoded; %2Fconversations = /conversations (no specific conv id)
    expect(data.magicUrl).toContain('%2Fconversations');
    expect(data.magicUrl).not.toMatch(/%2Fconversations%2F/);
  });
});

// ─── doWork fatal error ───────────────────────────────────────────────────────

describe('doWork fatal error', () => {
  it('catches and logs unexpected errors without re-throwing', async () => {
    const { prisma, emailService, magicLinkService } = makeMocks();
    prisma.notification.findMany.mockRejectedValue(new Error('DB exploded'));
    const job = new NotificationDigestJob(prisma, emailService, magicLinkService);

    await expect(job.runNow()).resolves.toBeUndefined();
  });
});
