/**
 * GW3 — per-conversation mute applied to notification fan-out.
 *
 * UserConversationPreferences.isMuted was written by conversation-preferences
 * routes but never read by the send pipeline. Contract:
 *  - new_message, message_reply, message_reaction fan-out EXCLUDE muted
 *    recipients (filterMutedRecipients helper — single rule site);
 *  - user_mentioned PIERCES the mute (WhatsApp convention);
 *  - non-muted recipients are unaffected.
 *
 * @jest-environment node
 */

jest.mock('isomorphic-dompurify', () => ({
  __esModule: true,
  default: { sanitize: (input: string) => input?.replace(/<[^>]*>/g, '') ?? '' },
}));

jest.mock('../../../../utils/sanitize', () => ({
  SecuritySanitizer: {
    sanitizeText: jest.fn((s: string) => s ?? ''),
    sanitizeUsername: jest.fn((s: string) => s ?? ''),
    sanitizeURL: jest.fn((s: string) => s ?? null),
    sanitizeJSON: jest.fn((x: unknown) => x),
    isValidNotificationType: jest.fn(() => true),
    isValidPriority: jest.fn(() => true),
  },
}));

jest.mock('../../../../utils/logger-enhanced', () => ({
  notificationLogger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
  securityLogger: { logViolation: jest.fn() },
  enhancedLogger: { child: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() })) },
}));

jest.mock('@meeshy/shared/prisma/client', () => {
  const mockPrisma = {
    notification: {
      create: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    user: { findUnique: jest.fn(), findMany: jest.fn() },
    conversation: { findUnique: jest.fn() },
    message: { findUnique: jest.fn() },
    userPreferences: { findUnique: jest.fn() },
    userConversationPreferences: { findMany: jest.fn() },
  };
  return { PrismaClient: jest.fn(() => mockPrisma) };
});

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { PrismaClient } from '@meeshy/shared/prisma/client';
import { NotificationService } from '../../../../services/notifications/NotificationService';
import { filterMutedRecipients } from '../../../../services/notifications/mutedRecipients';

const CONV_ID = '507f1f77bcf86cd799439011';
const AUTHOR_ID = '507f1f77bcf86cd799439022';
const ACTOR_ID = '507f1f77bcf86cd799439033';
const OTHER_ID = '507f1f77bcf86cd799439044';
const MSG_ID = '507f1f77bcf86cd799439055';

// ─── filterMutedRecipients (pure helper) ─────────────────────────────────────

describe('filterMutedRecipients', () => {
  let prisma: any;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = new PrismaClient();
  });

  it('returns all userIds when nobody muted the conversation', async () => {
    prisma.userConversationPreferences.findMany.mockResolvedValue([]);

    const result = await filterMutedRecipients(prisma, CONV_ID, [AUTHOR_ID, OTHER_ID]);

    expect(result).toEqual([AUTHOR_ID, OTHER_ID]);
  });

  it('removes recipients with isMuted=true, keeps the others in order', async () => {
    prisma.userConversationPreferences.findMany.mockResolvedValue([{ userId: AUTHOR_ID }]);

    const result = await filterMutedRecipients(prisma, CONV_ID, [AUTHOR_ID, OTHER_ID]);

    expect(result).toEqual([OTHER_ID]);
  });

  it('queries only muted rows scoped to the conversation and candidates', async () => {
    prisma.userConversationPreferences.findMany.mockResolvedValue([]);

    await filterMutedRecipients(prisma, CONV_ID, [AUTHOR_ID]);

    expect(prisma.userConversationPreferences.findMany).toHaveBeenCalledWith({
      where: { conversationId: CONV_ID, userId: { in: [AUTHOR_ID] }, isMuted: true },
      select: { userId: true },
    });
  });

  it('returns [] without querying when userIds is empty', async () => {
    const result = await filterMutedRecipients(prisma, CONV_ID, []);

    expect(result).toEqual([]);
    expect(prisma.userConversationPreferences.findMany).not.toHaveBeenCalled();
  });
});

// ─── NotificationService fan-out sites ───────────────────────────────────────

describe('NotificationService — mute applied to reaction/reply fan-out', () => {
  let service: NotificationService;
  let prisma: any;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = new PrismaClient();

    prisma.notification.create.mockImplementation(({ data }: any) =>
      Promise.resolve({
        id: `n-${Math.random()}`,
        ...data,
        delivery: { emailSent: false, pushSent: false },
      })
    );
    prisma.user.findUnique.mockResolvedValue({ username: 'u', displayName: 'U', avatar: null });
    prisma.user.findMany.mockResolvedValue([]);
    prisma.conversation.findUnique.mockResolvedValue({ title: 'c', type: 'direct' });
    prisma.message.findUnique.mockResolvedValue({ content: 'msg' });
    prisma.userPreferences.findUnique.mockResolvedValue(null);
    prisma.userConversationPreferences.findMany.mockResolvedValue([]);

    service = new NotificationService(prisma);
  });

  describe('createReactionNotification', () => {
    const params = {
      messageAuthorId: AUTHOR_ID,
      reactorUserId: ACTOR_ID,
      messageId: MSG_ID,
      conversationId: CONV_ID,
      reactionEmoji: '❤️',
    };

    it('suppresses the notification when the recipient muted the conversation', async () => {
      prisma.userConversationPreferences.findMany.mockResolvedValue([{ userId: AUTHOR_ID }]);

      const result = await service.createReactionNotification(params);

      expect(result).toBeNull();
      expect(prisma.notification.create).not.toHaveBeenCalled();
    });

    it('creates the notification for a non-muted recipient', async () => {
      const result = await service.createReactionNotification(params);

      expect(result).not.toBeNull();
      expect(prisma.notification.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('createReplyNotification', () => {
    const params = {
      recipientUserId: AUTHOR_ID,
      replierUserId: ACTOR_ID,
      messageId: MSG_ID,
      conversationId: CONV_ID,
      messagePreview: 'a reply',
      originalMessageId: '507f1f77bcf86cd799439066',
    };

    it('suppresses the notification when the recipient muted the conversation', async () => {
      prisma.userConversationPreferences.findMany.mockResolvedValue([{ userId: AUTHOR_ID }]);

      const result = await service.createReplyNotification(params);

      expect(result).toBeNull();
      expect(prisma.notification.create).not.toHaveBeenCalled();
    });

    it('creates the notification for a non-muted recipient', async () => {
      const result = await service.createReplyNotification(params);

      expect(result).not.toBeNull();
      expect(prisma.notification.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('createMentionNotificationsBatch — mentions pierce the mute', () => {
    it('still notifies a muted recipient who was @mentioned (WhatsApp convention)', async () => {
      prisma.userConversationPreferences.findMany.mockResolvedValue([{ userId: AUTHOR_ID }]);

      const count = await service.createMentionNotificationsBatch(
        [AUTHOR_ID],
        {
          senderId: ACTOR_ID,
          senderUsername: 'actor',
          messageContent: 'hello @you',
          conversationId: CONV_ID,
          messageId: MSG_ID,
        },
        [AUTHOR_ID, ACTOR_ID]
      );

      expect(count).toBe(1);
      expect(prisma.notification.create).toHaveBeenCalledTimes(1);
      expect(prisma.notification.create.mock.calls[0][0].data.type).toBe('user_mentioned');
    });
  });
});
