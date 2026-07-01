/**
 * Push notification `collapseId` must be scoped per-conversation, not per-message.
 *
 * Apple/Google collapse undelivered pushes sharing the same `apns-collapse-id` /
 * `collapseKey` into one, so a recipient who was offline while several messages
 * arrived in the same conversation gets ONE banner instead of a pile-up. A
 * per-message id (`msg-${messageId}`) is unique by construction and never
 * collapses anything — see tasks/socketio-events-cleanup.md / B.5.
 *
 * @jest-environment node
 */

jest.mock('isomorphic-dompurify', () => ({
  __esModule: true,
  default: { sanitize: (input: string) => input?.replace(/<[^>]*>/g, '') || '' },
}));

jest.mock('../../../utils/sanitize', () => ({
  SecuritySanitizer: {
    sanitizeText: jest.fn((input: string) => input?.replace(/<[^>]*>/g, '') || ''),
    sanitizeUsername: jest.fn((input: string) => input?.replace(/[^a-zA-Z0-9_.-]/g, '').substring(0, 50) || ''),
    sanitizeURL: jest.fn((input: string) => input || null),
    sanitizeJSON: jest.fn((input: unknown) => input),
    isValidNotificationType: jest.fn(() => true),
    isValidPriority: jest.fn(() => true),
  },
}));

jest.mock('@meeshy/shared/prisma/client', () => {
  const mockPrisma = {
    notification: {
      create: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
    },
    notificationPreference: { findUnique: jest.fn() },
    userPreferences: { findUnique: jest.fn() },
    user: { findUnique: jest.fn() },
    conversation: { findUnique: jest.fn() },
    // Race-condition guard in createMessageNotification refetches the live message.
    message: { findUnique: jest.fn() },
  };
  return { PrismaClient: jest.fn(() => mockPrisma) };
});

jest.mock('firebase-admin', () => ({
  initializeApp: jest.fn(),
  credential: { cert: jest.fn() },
  messaging: jest.fn(() => ({ send: jest.fn().mockResolvedValue('message-id') })),
}));

jest.mock('fs', () => ({
  existsSync: jest.fn().mockReturnValue(false),
  readFileSync: jest.fn(),
}));

jest.mock('../../../utils/logger', () => ({
  logger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock('../../../utils/logger-enhanced', () => ({
  notificationLogger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
  securityLogger: { logViolation: jest.fn(), logAttempt: jest.fn(), logSuccess: jest.fn() },
}));

import { NotificationService } from '../../../services/notifications/NotificationService';
import { PrismaClient } from '@meeshy/shared/prisma/client';

const RECIPIENT_ID = '507f1f77bcf86cd799439011';
const SENDER_ID = '507f1f77bcf86cd799439012';
const CONVERSATION_ID = '507f1f77bcf86cd799439013';
const MESSAGE_ID = '507f1f77bcf86cd799439014';

describe('NotificationService — push collapseId is per-conversation', () => {
  let service: NotificationService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: any;
  let sendToUser: jest.Mock;

  function lastCollapseId(): string | undefined {
    const calls = sendToUser.mock.calls as Array<[{ payload: { collapseId?: string } }]>;
    return calls[calls.length - 1][0].payload.collapseId;
  }

  beforeEach(() => {
    jest.clearAllMocks();

    prisma = new PrismaClient();
    service = new NotificationService(prisma as any);
    service.setSocketIO({ to: jest.fn().mockReturnThis(), emit: jest.fn() } as any, new Map());

    sendToUser = jest.fn().mockResolvedValue(undefined);
    service.setPushNotificationService({ sendToUser } as any);

    prisma.userPreferences.findUnique.mockResolvedValue(null);
    prisma.notification.create.mockResolvedValue({
      id: 'notif-1',
      userId: RECIPIENT_ID,
      isRead: false,
      createdAt: new Date(),
      actor: null,
      context: {},
      metadata: {},
      title: null,
      subtitle: null,
      priority: 'normal',
    });
    prisma.message.findUnique.mockResolvedValue({
      deletedAt: null,
      expiresAt: null,
      isViewOnce: false,
      viewOnceCount: 0,
    });
    prisma.user.findUnique.mockResolvedValue({ username: 'alice', displayName: 'Alice', avatar: null });
    prisma.conversation.findUnique.mockResolvedValue({ title: 'Team Chat', type: 'group' });
  });

  it('test_createMessageNotification_collapseIdIsScopedToConversation', async () => {
    await service.createMessageNotification({
      recipientUserId: RECIPIENT_ID,
      senderId: SENDER_ID,
      messageId: MESSAGE_ID,
      conversationId: CONVERSATION_ID,
      messagePreview: 'Hello',
    });

    expect(lastCollapseId()).toBe(`conv-${CONVERSATION_ID}`);
  });

  it('test_createMentionNotification_collapseIdIsScopedToConversation', async () => {
    await service.createMentionNotification({
      mentionedUserId: RECIPIENT_ID,
      mentionerUserId: SENDER_ID,
      messageId: MESSAGE_ID,
      conversationId: CONVERSATION_ID,
      messagePreview: '@alice check this out',
    });

    expect(lastCollapseId()).toBe(`conv-${CONVERSATION_ID}`);
  });

  it('test_createReplyNotification_collapseIdIsScopedToConversation', async () => {
    await service.createReplyNotification({
      recipientUserId: RECIPIENT_ID,
      replierUserId: SENDER_ID,
      messageId: MESSAGE_ID,
      conversationId: CONVERSATION_ID,
      messagePreview: 'Reply text',
    });

    expect(lastCollapseId()).toBe(`conv-${CONVERSATION_ID}`);
  });

  it('test_createMessageNotification_differentMessagesSameConversation_shareCollapseId', async () => {
    await service.createMessageNotification({
      recipientUserId: RECIPIENT_ID,
      senderId: SENDER_ID,
      messageId: MESSAGE_ID,
      conversationId: CONVERSATION_ID,
      messagePreview: 'First',
    });
    const firstCollapseId = lastCollapseId();

    await service.createMessageNotification({
      recipientUserId: RECIPIENT_ID,
      senderId: SENDER_ID,
      messageId: '507f1f77bcf86cd799439099',
      conversationId: CONVERSATION_ID,
      messagePreview: 'Second',
    });
    const secondCollapseId = lastCollapseId();

    expect(firstCollapseId).toBe(secondCollapseId);
  });
});
