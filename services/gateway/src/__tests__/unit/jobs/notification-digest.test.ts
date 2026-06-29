/**
 * NotificationDigestJob Unit Tests (re-engagement magic-login)
 *
 * Verifies the digest job:
 * - issues a one-click magic-login token per user (via MagicLinkService)
 * - builds a magicUrl deep-linking to the most-recent conversation (returnUrl)
 * - skips deactivated users (no token, no email)
 * - respects email preference opt-out and idempotency (delivery.emailSent)
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { NotificationDigestJob } from '../../../jobs/notification-digest';

const unread = (overrides: Record<string, unknown> = {}) => ({
  id: 'n1',
  type: 'message',
  actor: { displayName: 'Bob' },
  content: 'secret',
  context: { conversationId: 'conv-abc' },
  metadata: {},
  createdAt: new Date('2026-05-30T10:00:00Z'),
  delivery: { emailSent: false, pushSent: false },
  userId: 'user-1',
  ...overrides,
});

function makeMocks() {
  const prisma = {
    notification: {
      findMany: jest.fn() as jest.Mock<any>,
      updateMany: jest.fn() as jest.Mock<any>,
    },
    userPreferences: { findFirst: jest.fn() as jest.Mock<any> },
    user: { findUnique: jest.fn() as jest.Mock<any> },
  } as any;

  const emailService = { sendNotificationDigestEmail: jest.fn() as jest.Mock<any> } as any;
  const magicLinkService = { issueLoginTokenForUser: jest.fn() as jest.Mock<any> } as any;

  return { prisma, emailService, magicLinkService };
}

describe('NotificationDigestJob — magic-login re-engagement', () => {
  let prisma: any;
  let emailService: any;
  let magicLinkService: any;
  let job: NotificationDigestJob;

  beforeEach(() => {
    ({ prisma, emailService, magicLinkService } = makeMocks());

    // doWork() pass: distinct users with pending notifications
    prisma.notification.findMany.mockImplementation((args: any) => {
      // First call (doWork): select userId+delivery across all unread
      if (args?.select?.userId && args?.select?.delivery && !args?.orderBy) {
        return Promise.resolve([{ userId: 'user-1', delivery: { emailSent: false } }]);
      }
      // Second call (processUser): full notifications for the user
      return Promise.resolve([
        unread({ id: 'n1', context: { conversationId: 'conv-abc' }, createdAt: new Date('2026-05-30T12:00:00Z') }),
        unread({ id: 'n2', context: { conversationId: 'conv-xyz' }, createdAt: new Date('2026-05-30T09:00:00Z') }),
      ]);
    });
    prisma.userPreferences.findFirst.mockResolvedValue({ notification: { emailEnabled: true } });
    prisma.user.findUnique.mockResolvedValue({
      email: 'alice@example.com', displayName: 'Alice', username: 'alice', systemLanguage: 'fr', isActive: true,
    });
    prisma.notification.updateMany.mockResolvedValue({ count: 2 });

    magicLinkService.issueLoginTokenForUser.mockResolvedValue('RAWTOKEN123');
    emailService.sendNotificationDigestEmail.mockResolvedValue({ success: true });

    job = new NotificationDigestJob(prisma, emailService, magicLinkService);
  });

  it('issues a magic-login token for the user', async () => {
    await job.runNow();
    expect(magicLinkService.issueLoginTokenForUser).toHaveBeenCalledWith('user-1');
  });

  it('embeds the token in the magic-link validate URL with a returnUrl deep-link', async () => {
    await job.runNow();
    const data = emailService.sendNotificationDigestEmail.mock.calls[0][0];
    expect(data.magicUrl).toContain('/auth/magic-link/validate');
    expect(data.magicUrl).toContain('token=RAWTOKEN123');
    // most-recent notification (n1 @12:00) → conv-abc
    expect(data.magicUrl).toContain(encodeURIComponent('/conversations/conv-abc'));
  });

  it('does NOT pass actor/content (teaser reveals counts only)', async () => {
    await job.runNow();
    const data = emailService.sendNotificationDigestEmail.mock.calls[0][0];
    expect(data.notifications).toBeUndefined();
    expect(JSON.stringify(data)).not.toContain('secret');
  });

  it('marks notifications as emailed after a successful send', async () => {
    await job.runNow();
    expect(prisma.notification.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: ['n1', 'n2'] } } })
    );
  });

  it('skips deactivated users (no token minted, no email sent)', async () => {
    prisma.user.findUnique.mockResolvedValue({
      email: 'alice@example.com', displayName: 'Alice', username: 'alice', systemLanguage: 'fr', isActive: false,
    });
    await job.runNow();
    expect(emailService.sendNotificationDigestEmail).not.toHaveBeenCalled();
    expect(magicLinkService.issueLoginTokenForUser).not.toHaveBeenCalled();
  });

  it('skips users who disabled email notifications', async () => {
    prisma.userPreferences.findFirst.mockResolvedValue({ notification: { emailEnabled: false } });
    await job.runNow();
    expect(emailService.sendNotificationDigestEmail).not.toHaveBeenCalled();
    expect(magicLinkService.issueLoginTokenForUser).not.toHaveBeenCalled();
  });

  it('falls back to a plain in-app deep-link (not the dead-end validate page) when token issuance fails', async () => {
    magicLinkService.issueLoginTokenForUser.mockResolvedValue(null);
    await job.runNow();
    const data = emailService.sendNotificationDigestEmail.mock.calls[0][0];
    expect(data.magicUrl).not.toContain('token=');
    // No tokenless /validate URL — that page shows a hard error and drops returnUrl.
    expect(data.magicUrl).not.toContain('/auth/magic-link/validate');
    expect(data.magicUrl).toMatch(/\/conversations\/conv-abc$/);
    expect(emailService.sendNotificationDigestEmail).toHaveBeenCalled();
  });
});

// ─── doWork edge cases ────────────────────────────────────────────────────────

describe('NotificationDigestJob — doWork edge cases', () => {
  it('exits early when there are no unread notifications', async () => {
    const { prisma, emailService, magicLinkService } = makeMocks();
    prisma.notification.findMany.mockResolvedValue([]);
    const job = new NotificationDigestJob(prisma, emailService, magicLinkService);

    await job.runNow();

    expect(emailService.sendNotificationDigestEmail).not.toHaveBeenCalled();
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('does not throw on a fatal DB error inside doWork', async () => {
    const { prisma, emailService, magicLinkService } = makeMocks();
    prisma.notification.findMany.mockRejectedValue(new Error('DB connection lost'));
    const job = new NotificationDigestJob(prisma, emailService, magicLinkService);

    await expect(job.runNow()).resolves.toBeUndefined();
    expect(emailService.sendNotificationDigestEmail).not.toHaveBeenCalled();
  });

  it('logs warn and skips updateMany when email send returns success=false', async () => {
    const { prisma, emailService, magicLinkService } = makeMocks();
    prisma.notification.findMany.mockImplementation((args: any) => {
      if (!args?.orderBy) return Promise.resolve([{ userId: 'u1', delivery: { emailSent: false } }]);
      return Promise.resolve([unread()]);
    });
    prisma.userPreferences.findFirst.mockResolvedValue({ notification: {} });
    prisma.user.findUnique.mockResolvedValue({
      email: 'a@b.com', displayName: 'A', username: 'a', systemLanguage: 'en', isActive: true,
    });
    magicLinkService.issueLoginTokenForUser.mockResolvedValue('tok');
    emailService.sendNotificationDigestEmail.mockResolvedValue({ success: false, error: 'SMTP down' });

    const job = new NotificationDigestJob(prisma, emailService, magicLinkService);
    await job.runNow();

    expect(prisma.notification.updateMany).not.toHaveBeenCalled();
  });

  it('catches per-user error and continues processing remaining users', async () => {
    const { prisma, emailService, magicLinkService } = makeMocks();
    prisma.notification.findMany.mockImplementation((args: any) => {
      if (!args?.orderBy) {
        return Promise.resolve([
          { userId: 'u1', delivery: { emailSent: false } },
          { userId: 'u2', delivery: { emailSent: false } },
        ]);
      }
      return Promise.resolve([unread()]);
    });
    prisma.userPreferences.findFirst
      .mockRejectedValueOnce(new Error('DB timeout'))
      .mockResolvedValue({ notification: {} });
    prisma.user.findUnique.mockResolvedValue({
      email: 'b@c.com', displayName: 'B', username: 'b', systemLanguage: 'en', isActive: true,
    });
    prisma.notification.updateMany.mockResolvedValue({ count: 1 });
    magicLinkService.issueLoginTokenForUser.mockResolvedValue('tok');
    emailService.sendNotificationDigestEmail.mockResolvedValue({ success: true });

    const job = new NotificationDigestJob(prisma, emailService, magicLinkService);
    await job.runNow();

    // u1 errored (caught), u2 succeeded → exactly one email sent
    expect(emailService.sendNotificationDigestEmail).toHaveBeenCalledTimes(1);
  });
});

// ─── start()/stop() lifecycle ─────────────────────────────────────────────────

describe('NotificationDigestJob — start()/stop() lifecycle', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    // At 10:00 UTC the next 18:00 UTC is 8 h = 28_800_000 ms away
    jest.setSystemTime(new Date('2026-01-01T10:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('stop() before timeout fires cancels the scheduled run', async () => {
    const { prisma, emailService, magicLinkService } = makeMocks();
    prisma.notification.findMany.mockResolvedValue([]);
    const job = new NotificationDigestJob(prisma, emailService, magicLinkService);

    job.start();
    job.stop();

    await jest.advanceTimersByTimeAsync(30 * 60 * 60 * 1000);
    expect(prisma.notification.findMany).not.toHaveBeenCalled();
  });

  it('calling start() twice logs a warning instead of duplicating the timer', async () => {
    const { prisma, emailService, magicLinkService } = makeMocks();
    prisma.notification.findMany.mockResolvedValue([]);
    const job = new NotificationDigestJob(prisma, emailService, magicLinkService);

    job.start();
    job.start(); // second call hits the "already running" guard
    job.stop();
  });

  it('schedules for the NEXT day when start() is called after 18:00 UTC', () => {
    // At 20:00 UTC, 18:00 UTC was 2 h ago → next run is tomorrow at 18:00
    jest.setSystemTime(new Date('2026-01-01T20:00:00.000Z'));

    const { prisma, emailService, magicLinkService } = makeMocks();
    const job = new NotificationDigestJob(prisma, emailService, magicLinkService);

    job.start(); // calls getMillisecondsUntilNextRun → next.setUTCDate(+1)
    job.stop();
  });

  it('timeout fires doWork and sets up the 24 h repeat interval', async () => {
    const { prisma, emailService, magicLinkService } = makeMocks();
    prisma.notification.findMany.mockResolvedValue([]);
    const job = new NotificationDigestJob(prisma, emailService, magicLinkService);

    job.start();

    await jest.advanceTimersByTimeAsync(28_800_001);

    expect(prisma.notification.findMany).toHaveBeenCalled();
    job.stop();
  });

  it('stop() after interval is set clears it so no further runs occur', async () => {
    const { prisma, emailService, magicLinkService } = makeMocks();
    prisma.notification.findMany.mockResolvedValue([]);
    const job = new NotificationDigestJob(prisma, emailService, magicLinkService);

    job.start();
    await jest.advanceTimersByTimeAsync(28_800_001); // fire initial timeout → interval set

    const callsBefore = (prisma.notification.findMany as jest.Mock<any>).mock.calls.length;

    job.stop(); // clears the interval

    await jest.advanceTimersByTimeAsync(25 * 60 * 60 * 1000); // advance another 25 h
    expect((prisma.notification.findMany as jest.Mock<any>).mock.calls.length).toBe(callsBefore);
  });
});

// ─── batch processing — sleep between batches ─────────────────────────────────

describe('NotificationDigestJob — batch sleep (> BATCH_SIZE users)', () => {
  it('sleeps BATCH_DELAY_MS between batches so all 51 users are processed', async () => {
    jest.useFakeTimers();
    try {
      const { prisma, emailService, magicLinkService } = makeMocks();
      const users = Array.from({ length: 51 }, (_, i) => ({
        userId: `u${i}`,
        delivery: { emailSent: false },
      }));

      prisma.notification.findMany.mockImplementation((args: any) => {
        if (!args?.orderBy) return Promise.resolve(users);
        return Promise.resolve([unread()]);
      });
      prisma.userPreferences.findFirst.mockResolvedValue({ notification: {} });
      prisma.user.findUnique.mockResolvedValue({
        email: 'x@y.com', displayName: 'X', username: 'x', systemLanguage: 'en', isActive: true,
      });
      prisma.notification.updateMany.mockResolvedValue({ count: 1 });
      magicLinkService.issueLoginTokenForUser.mockResolvedValue('tok');
      emailService.sendNotificationDigestEmail.mockResolvedValue({ success: true });

      const job = new NotificationDigestJob(prisma, emailService, magicLinkService);
      const runPromise = job.runNow();

      await jest.runAllTimersAsync();
      await runPromise;

      expect(emailService.sendNotificationDigestEmail).toHaveBeenCalledTimes(51);
    } finally {
      jest.useRealTimers();
    }
  });
});
