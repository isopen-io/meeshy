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
