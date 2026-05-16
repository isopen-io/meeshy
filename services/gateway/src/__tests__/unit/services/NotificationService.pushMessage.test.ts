/**
 * Unit tests for message push notification title/body construction.
 *
 * Covers the Prisme rule for `new_message` push notifications:
 *  - Direct conversation  → title = sender name,                body = message content
 *  - Group conversation   → title = "sender name | group name", body = message content
 *  - The sender name is never duplicated inside the body.
 *  - The best available sender name is used (displayName → username).
 *
 * @jest-environment node
 */

jest.mock('isomorphic-dompurify', () => ({
  __esModule: true,
  default: {
    sanitize: (input: string) => input?.replace(/<[^>]*>/g, '') || '',
  },
}));

jest.mock('../../../utils/sanitize', () => ({
  SecuritySanitizer: {
    sanitizeText: jest.fn((input: string) => input?.replace(/<[^>]*>/g, '') || ''),
    sanitizeUsername: jest.fn((input: string) =>
      input?.replace(/[^a-zA-Z0-9_.-]/g, '').substring(0, 50) || ''
    ),
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
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
      count: jest.fn(),
      groupBy: jest.fn(),
      createMany: jest.fn(),
    },
    notificationPreference: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    userPreferences: {
      findUnique: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
    conversation: {
      findUnique: jest.fn(),
    },
  };

  return {
    PrismaClient: jest.fn(() => mockPrisma),
  };
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
  notificationLogger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
  securityLogger: {
    logViolation: jest.fn(),
    logAttempt: jest.fn(),
    logSuccess: jest.fn(),
  },
}));

import { NotificationService } from '../../../services/notifications/NotificationService';
import { PrismaClient } from '@meeshy/shared/prisma/client';

const RECIPIENT_ID = '507f1f77bcf86cd799439011';
const SENDER_ID = '507f1f77bcf86cd799439012';
const CONVERSATION_ID = '507f1f77bcf86cd799439013';
const MESSAGE_ID = '507f1f77bcf86cd799439014';

function makeNotif() {
  return {
    id: 'notif-msg-1',
    userId: RECIPIENT_ID,
    type: 'new_message',
    isRead: false,
    createdAt: new Date(),
    content: '',
    priority: 'normal',
    actor: null,
    context: {},
    metadata: {},
    delivery: { emailSent: false, pushSent: false },
  };
}

type PushPayload = { title: string; body: string };

describe('NotificationService — message push title/body', () => {
  let service: NotificationService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: any;
  let sendToUser: jest.Mock;

  function lastPushPayload(): PushPayload {
    const calls = sendToUser.mock.calls as Array<[{ payload: PushPayload }]>;
    return calls[calls.length - 1][0].payload;
  }

  beforeEach(() => {
    jest.clearAllMocks();

    prisma = new PrismaClient();
    service = new NotificationService(prisma as any);

    service.setSocketIO(
      { to: jest.fn().mockReturnThis(), emit: jest.fn() } as any,
      new Map()
    );

    sendToUser = jest.fn().mockResolvedValue(undefined);
    service.setPushNotificationService({ sendToUser } as any);

    (prisma.userPreferences.findUnique as jest.Mock).mockResolvedValue(null);
    (prisma.notification.count as jest.Mock).mockResolvedValue(0);
    (prisma.notification.create as jest.Mock).mockResolvedValue(makeNotif());
  });

  describe('direct conversation', () => {
    beforeEach(() => {
      (prisma.conversation.findUnique as jest.Mock).mockResolvedValue({
        title: 'Alice Martin',
        type: 'direct',
      });
    });

    it('test_createMessageNotification_direct_titleIsSenderName', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        username: 'alice',
        displayName: 'Alice Martin',
        avatar: null,
      });

      await service.createMessageNotification({
        recipientUserId: RECIPIENT_ID,
        senderId: SENDER_ID,
        messageId: MESSAGE_ID,
        conversationId: CONVERSATION_ID,
        messagePreview: 'Salut, comment ça va ?',
      });

      expect(sendToUser).toHaveBeenCalledTimes(1);
      expect(lastPushPayload().title).toBe('Alice Martin');
    });

    it('test_createMessageNotification_direct_bodyIsMessageContentOnly', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        username: 'alice',
        displayName: 'Alice Martin',
        avatar: null,
      });

      await service.createMessageNotification({
        recipientUserId: RECIPIENT_ID,
        senderId: SENDER_ID,
        messageId: MESSAGE_ID,
        conversationId: CONVERSATION_ID,
        messagePreview: 'Salut, comment ça va ?',
      });

      expect(lastPushPayload().body).toBe('Salut, comment ça va ?');
    });
  });

  describe('group conversation', () => {
    beforeEach(() => {
      (prisma.conversation.findUnique as jest.Mock).mockResolvedValue({
        title: 'Équipe Dev',
        type: 'group',
      });
    });

    it('test_createMessageNotification_group_titleIsSenderNamePipeConversationName', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        username: 'alice',
        displayName: 'Alice Martin',
        avatar: null,
      });

      await service.createMessageNotification({
        recipientUserId: RECIPIENT_ID,
        senderId: SENDER_ID,
        messageId: MESSAGE_ID,
        conversationId: CONVERSATION_ID,
        messagePreview: 'On démarre le sprint demain',
      });

      expect(lastPushPayload().title).toBe('Alice Martin | Équipe Dev');
    });

    it('test_createMessageNotification_group_bodyHasNoSenderNamePrefix', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        username: 'alice',
        displayName: 'Alice Martin',
        avatar: null,
      });

      await service.createMessageNotification({
        recipientUserId: RECIPIENT_ID,
        senderId: SENDER_ID,
        messageId: MESSAGE_ID,
        conversationId: CONVERSATION_ID,
        messagePreview: 'On démarre le sprint demain',
      });

      const body = lastPushPayload().body;
      expect(body).toBe('On démarre le sprint demain');
      expect(body).not.toContain('Alice Martin');
    });

    it('test_createMessageNotification_group_noDisplayName_fallsBackToUsername', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        username: 'alice',
        displayName: null,
        avatar: null,
      });

      await service.createMessageNotification({
        recipientUserId: RECIPIENT_ID,
        senderId: SENDER_ID,
        messageId: MESSAGE_ID,
        conversationId: CONVERSATION_ID,
        messagePreview: 'On démarre le sprint demain',
      });

      expect(lastPushPayload().title).toBe('alice | Équipe Dev');
    });
  });
});
