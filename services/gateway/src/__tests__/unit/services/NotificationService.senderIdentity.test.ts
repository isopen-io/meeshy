/**
 * #18910 — l'identité de l'expéditeur sur le fil du push de message
 * (`senderDisplayName`, `senderUsername`, `senderAvatar`, `imageURL`) obéit à
 * « Masquer le nom de l'expéditeur ». Extrait de `NotificationService.pushMessage.test.ts`,
 * dont le budget de taille hérité ne peut que rétrécir.
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
    // Même contrat que la production : un chemin relatif ou une URL http(s) survit.
    sanitizeURLOrPath: jest.fn((input: string) => input || null),
    sanitizeJSON: jest.fn((input: unknown) => input),
    isValidNotificationType: jest.fn(() => true),
    isValidPriority: jest.fn(() => true),
  },
}));

jest.mock('@meeshy/shared/prisma/client', () => {
  const mockPrisma = {
    notification: {
      create: jest.fn(), findMany: jest.fn(), findFirst: jest.fn(), findUnique: jest.fn(), update: jest.fn(),
      updateMany: jest.fn(), delete: jest.fn(), deleteMany: jest.fn(), count: jest.fn(), groupBy: jest.fn(),
      createMany: jest.fn(),
    },
    notificationPreference: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    userPreferences: { findUnique: jest.fn() },
    user: {
      findUnique: jest.fn(),
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn(async (args: any) => (args?.where?.isActive === true ? (args.where.id?.in ?? []).map((id: string) => ({ id })) : [])),
    },
    conversation: { findUnique: jest.fn() },
    message: { findUnique: jest.fn() },
    userConversationPreferences: { findMany: jest.fn().mockResolvedValue([]) },
  };
  return { PrismaClient: jest.fn(() => mockPrisma) };
});

jest.mock('firebase-admin/app', () => ({ getApps: jest.fn(() => []), initializeApp: jest.fn(), cert: jest.fn() }));
jest.mock('firebase-admin/messaging', () => ({
  getMessaging: jest.fn(() => ({ send: jest.fn().mockResolvedValue('message-id') })),
}));
jest.mock('fs', () => ({ existsSync: jest.fn().mockReturnValue(false), readFileSync: jest.fn() }));
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

type PushPayload = { title: string; body: string; data?: Record<string, string> };

describe('NotificationService — push de message', () => {
  let service: NotificationService;
  let prisma: any;
  let sendToUser: jest.Mock;

  const lastPushPayload = (): PushPayload => {
    const calls = sendToUser.mock.calls as Array<[{ payload: PushPayload }]>;
    return calls[calls.length - 1][0].payload;
  };

  async function createAndFlush() {
    await service.createMessageNotification({
      recipientUserId: RECIPIENT_ID,
      senderId: SENDER_ID,
      messageId: MESSAGE_ID,
      conversationId: CONVERSATION_ID,
      messagePreview: 'Salut, comment ça va ?',
    });
    await new Promise(r => setImmediate(r));
  }

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = new PrismaClient();
    service = new NotificationService(prisma as any);
    service.setSocketIO({ to: jest.fn().mockReturnThis(), emit: jest.fn() } as any, new Map());
    sendToUser = jest.fn().mockResolvedValue(undefined);
    service.setPushNotificationService({ sendToUser } as any);

    (prisma.userPreferences.findUnique as jest.Mock).mockResolvedValue(null);
    (prisma.notification.count as jest.Mock).mockResolvedValue(0);
    (prisma.notification.create as jest.Mock).mockResolvedValue({
      id: 'notif-msg-1', userId: RECIPIENT_ID, type: 'new_message', isRead: false, createdAt: new Date(),
      content: '', priority: 'normal', actor: null, context: {}, metadata: {},
      delivery: { emailSent: false, pushSent: false },
    });
    (prisma.message.findUnique as jest.Mock).mockResolvedValue({
      deletedAt: null, expiresAt: null, isViewOnce: false, viewOnceCount: 0,
    });
    (prisma.conversation.findUnique as jest.Mock).mockResolvedValue({ title: 'Équipe Dev', type: 'group' });
    (prisma.notification.update as jest.Mock).mockResolvedValue({});
  });

describe('identité de l\'expéditeur sur le fil (#18910)', () => {
  const SENDER_AVATAR = 'https://cdn.example.com/alice.png';
  const IDENTITY_KEYS = ['senderDisplayName', 'senderUsername', 'senderAvatar', 'imageURL'] as const;

  beforeEach(() => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      username: 'alice', displayName: 'Alice Martin', avatar: SENDER_AVATAR,
    });
  });

  it('test_showSenderNameFalse_dataCarriesNoNameNoHandleNoAvatar_senderIdStays', async () => {
    (prisma.userPreferences.findUnique as jest.Mock).mockResolvedValue({
      notification: { showSenderName: false },
    });

    await createAndFlush();
    const data = lastPushPayload().data!;
    IDENTITY_KEYS.forEach((key) => expect(data[key]).toBe(''));
    expect(data.senderId).toBe(SENDER_ID);
  });

  it('test_showSenderNameTrue_dataKeepsTheSenderIdentity', async () => {
    (prisma.userPreferences.findUnique as jest.Mock).mockResolvedValue({
      notification: { showSenderName: true },
    });

    await createAndFlush();

    const data = lastPushPayload().data!;
    expect(data.senderDisplayName).toBe('Alice Martin');
    expect(data.senderUsername).toBe('alice');
    expect(data.senderAvatar).toBe(SENDER_AVATAR);
    expect(data.imageURL).toBe(SENDER_AVATAR);
    expect(data.senderId).toBe(SENDER_ID);
  });

  it('test_showSenderNameUnset_keepsTheIdentity_legacyDefault', async () => {
    (prisma.userPreferences.findUnique as jest.Mock).mockResolvedValue(null);

    await createAndFlush();

    expect(lastPushPayload().data!.senderDisplayName).toBe('Alice Martin');
  });
});
});
