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
    // Required by the race-condition guard in createMessageNotification
    // (refetches `deletedAt` / `expiresAt` right before fan-out). Default
    // returns a live row so the existing push tests keep passing; the
    // dedicated `createMessageNotificationRaceGuard.test.ts` overrides
    // this to exercise the bail-out branches.
    message: {
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
    // Default: message is live (race-guard happy path). Race-guard
    // bail-out branches are covered in createMessageNotificationRaceGuard.test.ts.
    (prisma.message.findUnique as jest.Mock).mockResolvedValue({
      deletedAt: null,
      expiresAt: null,
      isViewOnce: false,
      viewOnceCount: 0,
    });
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

    it('test_createMessageNotification_group_titleIsSenderName_subtitleIsConversation', async () => {
      // Previously the title was "<sender> | <conversation>" but iOS
      // Communication Notifications (INSendMessageIntent.donate) clobbered
      // the concatenated form. The gateway now sends the sender as title
      // and the conversation name as a separate APN-native `subtitle`,
      // which iOS preserves and renders between title and body.
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

      const payload = lastPushPayload();
      expect(payload.title).toBe('Alice Martin');
      expect((payload as { subtitle?: string }).subtitle).toBe('Équipe Dev');
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

      const payload = lastPushPayload();
      expect(payload.title).toBe('alice');
      expect((payload as { subtitle?: string }).subtitle).toBe('Équipe Dev');
    });
  });

  describe('attachment body badges', () => {
    type Att = { type: 'image' | 'video' | 'audio' | 'document'; filename?: string | null };

    beforeEach(() => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        username: 'alice',
        displayName: 'Alice Martin',
        avatar: null,
      });
      (prisma.conversation.findUnique as jest.Mock).mockResolvedValue({
        title: 'Équipe Dev',
        type: 'direct',
      });
    });

    function sendWith(params: {
      messagePreview: string;
      attachments: Att[];
      firstAttachmentWidth?: number;
      firstAttachmentHeight?: number;
      firstAttachmentDuration?: number;
    }) {
      return service.createMessageNotification({
        recipientUserId: RECIPIENT_ID,
        senderId: SENDER_ID,
        messageId: MESSAGE_ID,
        conversationId: CONVERSATION_ID,
        ...params,
      });
    }

    it('test_body_textWithMixedAttachments_appendsPerTypeBadgesForRest', async () => {
      await sendWith({
        messagePreview: 'Regardez ça !',
        attachments: [
          { type: 'image', filename: 'a.jpg' },
          { type: 'image', filename: 'b.jpg' },
          { type: 'image', filename: 'c.jpg' },
          { type: 'audio', filename: 'm1.m4a' },
          { type: 'audio', filename: 'm2.m4a' },
          { type: 'video', filename: 'v.mp4' },
          { type: 'document', filename: 'r1.pdf' },
          { type: 'document', filename: 'r2.pdf' },
        ],
      });

      expect(lastPushPayload().body).toBe('Regardez ça ! +2📷 +2🎵 +1🎬 📄 PDF · 2');
    });

    it('test_body_textWithSingleAttachment_hasNoBadges', async () => {
      await sendWith({
        messagePreview: 'Une seule photo',
        attachments: [{ type: 'image', filename: 'a.jpg' }],
      });

      expect(lastPushPayload().body).toBe('Une seule photo');
    });

    it('test_body_noText_usesFirstAttachmentLabelThenBadges', async () => {
      await sendWith({
        messagePreview: '',
        attachments: [
          { type: 'image', filename: 'a.jpg' },
          { type: 'image', filename: 'b.jpg' },
          { type: 'image', filename: 'c.jpg' },
          { type: 'audio', filename: 'm1.m4a' },
          { type: 'audio', filename: 'm2.m4a' },
          { type: 'video', filename: 'v.mp4' },
          { type: 'document', filename: 'r1.pdf' },
          { type: 'document', filename: 'r2.pdf' },
        ],
        firstAttachmentWidth: 1920,
        firstAttachmentHeight: 1080,
      });

      expect(lastPushPayload().body).toBe('📷 Photo · 1920×1080 +2📷 +2🎵 +1🎬 📄 PDF · 2');
    });

    it('test_body_noText_singleAttachment_isJustTheLabel', async () => {
      await sendWith({
        messagePreview: '',
        attachments: [{ type: 'audio', filename: 'voice.m4a' }],
        // `duration` est en MILLISECONDES (cf. schema.prisma) — 34000 ms = 0:34.
        // Régression corrigée : un `* 1000` parasite affichait 566:40 pour 34 s.
        firstAttachmentDuration: 34000,
      });

      expect(lastPushPayload().body).toBe('🎵 Audio · 0:34');
    });

    it('test_body_mixedDocumentExtensions_fallBackToGenericPaperclip', async () => {
      await sendWith({
        messagePreview: 'Les fichiers',
        attachments: [
          { type: 'image', filename: 'a.jpg' },
          { type: 'document', filename: 'r1.pdf' },
          { type: 'document', filename: 'r2.docx' },
        ],
      });

      expect(lastPushPayload().body).toBe('Les fichiers 📎 2 fichiers');
    });

    it('test_body_group_titleIsSenderName_subtitleIsConversation_withBadges', async () => {
      (prisma.conversation.findUnique as jest.Mock).mockResolvedValue({
        title: 'Équipe Dev',
        type: 'group',
      });

      await sendWith({
        messagePreview: 'Sprint',
        attachments: [
          { type: 'image', filename: 'a.jpg' },
          { type: 'video', filename: 'v.mp4' },
        ],
      });

      const payload = lastPushPayload();
      expect(payload.title).toBe('Alice Martin');
      expect((payload as { subtitle?: string }).subtitle).toBe('Équipe Dev');
      expect(payload.body).toBe('Sprint +1🎬');
    });
  });
});
