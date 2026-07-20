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
    // Required by resolvePostMedia (social comment/reply notifications attach
    // the post thumbnail to the push). Default returns null so no media branch
    // runs; the comment-navigation push test relies only on context IDs.
    postMedia: {
      findFirst: jest.fn(),
    },
    // GW3 — reaction/reply fan-out consults the per-conversation mute.
    userConversationPreferences: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  };

  return {
    PrismaClient: jest.fn(() => mockPrisma),
  };
});

jest.mock('firebase-admin/app', () => ({
  getApps: jest.fn(() => []),
  initializeApp: jest.fn(),
  cert: jest.fn(),
}));
jest.mock('firebase-admin/messaging', () => ({
  getMessaging: jest.fn(() => ({ send: jest.fn().mockResolvedValue('message-id') })),
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

import { NotificationService, pushCategoryForNotificationType } from '../../../services/notifications/NotificationService';
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

type PushPayload = { title: string; body: string; data?: Record<string, string> };

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

  describe('social comment navigation push data', () => {
    const POST_ID = 'aaaaaaaaaaaaaaaaaaaaaaaa';
    const COMMENT_ID = 'bbbbbbbbbbbbbbbbbbbbbbbb';
    const PARENT_COMMENT_ID = 'cccccccccccccccccccccccc';

    beforeEach(() => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        username: 'bob',
        displayName: 'Bob Commentateur',
        avatar: null,
      });
      (prisma.postMedia.findFirst as jest.Mock).mockResolvedValue(null);
    });

    it('test_commentReplyPush_carriesCommentIdAndParentCommentId', async () => {
      // The tapped push must let iOS open the post AND scroll to the reply:
      // data.commentId targets the reply, data.parentCommentId lets the client
      // expand the parent thread first.
      await service.createCommentReplyNotification({
        actorId: SENDER_ID,
        postId: POST_ID,
        commentAuthorId: RECIPIENT_ID,
        commentId: COMMENT_ID,
        parentCommentId: PARENT_COMMENT_ID,
        replyPreview: 'Tout à fait',
        postType: 'POST',
      });

      const data = lastPushPayload().data!;
      expect(data.postId).toBe(POST_ID);
      expect(data.commentId).toBe(COMMENT_ID);
      expect(data.parentCommentId).toBe(PARENT_COMMENT_ID);
    });

    it('test_commentReplyPush_parentCommentIdEmptyWhenAbsent', async () => {
      await service.createCommentReplyNotification({
        actorId: SENDER_ID,
        postId: POST_ID,
        commentAuthorId: RECIPIENT_ID,
        commentId: COMMENT_ID,
        replyPreview: 'Top',
        postType: 'POST',
      });

      const data = lastPushPayload().data!;
      expect(data.commentId).toBe(COMMENT_ID);
      expect(data.parentCommentId).toBe('');
    });
  });
  describe('badge du push (F1 — badge/widget gelés app fermée)', () => {
    it('test_push_carriesUnreadBadge_andDataUnreadCount', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        username: 'alice', displayName: 'Alice Martin', avatar: null,
      });
      (prisma.notification.count as jest.Mock).mockResolvedValue(7);

      await service.createMessageNotification({
        recipientUserId: RECIPIENT_ID,
        senderId: SENDER_ID,
        messageId: MESSAGE_ID,
        conversationId: CONVERSATION_ID,
        messagePreview: 'Salut !',
      });

      const payload = lastPushPayload() as { badge?: number; data?: Record<string, string> };
      expect(payload.badge).toBe(7);
      expect(payload.data?.unreadCount).toBe('7');
    });

    it('test_push_omitsBadge_whenCountUnavailable_bestEffort', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        username: 'alice', displayName: 'Alice Martin', avatar: null,
      });
      (prisma.notification.count as jest.Mock).mockRejectedValue(new Error('db down'));

      await service.createMessageNotification({
        recipientUserId: RECIPIENT_ID,
        senderId: SENDER_ID,
        messageId: MESSAGE_ID,
        conversationId: CONVERSATION_ID,
        messagePreview: 'Salut !',
      });

      const payload = lastPushPayload() as { badge?: number; data?: Record<string, string> };
      expect(payload.badge).toBeUndefined();
      expect(payload.data?.unreadCount).toBeUndefined();
      expect(sendToUser).toHaveBeenCalledTimes(1);
    });
  });

  // GW4 — producers set native threadId (conversation grouping) + category
  // (actionable iOS banners). The transport already forwards both (APNs
  // thread-id/category, FCM aps) — the NSE stays as fallback only.
  describe('GW4 — native threadId + category on push payloads', () => {
    type ThreadedPayload = { threadId?: string; category?: string };

    beforeEach(() => {
      (prisma.conversation.findUnique as jest.Mock).mockResolvedValue({
        title: 'Chat', type: 'direct',
      });
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        username: 'alice', displayName: 'Alice Martin', avatar: null,
      });
      (prisma.postMedia.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.userConversationPreferences.findMany as jest.Mock).mockResolvedValue([]);
    });

    it('test_newMessagePush_carriesConversationThreadIdAndMessageCategory', async () => {
      await service.createMessageNotification({
        recipientUserId: RECIPIENT_ID,
        senderId: SENDER_ID,
        messageId: MESSAGE_ID,
        conversationId: CONVERSATION_ID,
        messagePreview: 'Salut !',
      });

      const payload = lastPushPayload() as ThreadedPayload;
      expect(payload.threadId).toBe(CONVERSATION_ID);
      expect(payload.category).toBe('MEESHY_MESSAGE');
    });

    it('test_mentionPush_carriesMentionCategory', async () => {
      await service.createMentionNotification({
        mentionedUserId: RECIPIENT_ID,
        mentionerUserId: SENDER_ID,
        messageId: MESSAGE_ID,
        conversationId: CONVERSATION_ID,
        messagePreview: 'hello @you',
      });

      const payload = lastPushPayload() as ThreadedPayload;
      expect(payload.threadId).toBe(CONVERSATION_ID);
      expect(payload.category).toBe('MEESHY_MENTION');
    });

    it('test_reactionPush_carriesMessageCategory', async () => {
      (prisma.message.findUnique as jest.Mock).mockResolvedValue({ content: 'msg' });

      await service.createReactionNotification({
        messageAuthorId: RECIPIENT_ID,
        reactorUserId: SENDER_ID,
        messageId: MESSAGE_ID,
        conversationId: CONVERSATION_ID,
        reactionEmoji: '❤️',
      });

      const payload = lastPushPayload() as ThreadedPayload;
      expect(payload.threadId).toBe(CONVERSATION_ID);
      expect(payload.category).toBe('MEESHY_MESSAGE');
    });

    it('test_postCommentPush_carriesSocialCategory_noThreadId', async () => {
      await service.createPostCommentNotification({
        actorId: SENDER_ID,
        postId: 'aaaaaaaaaaaaaaaaaaaaaaaa',
        postAuthorId: RECIPIENT_ID,
        commentId: 'bbbbbbbbbbbbbbbbbbbbbbbb',
        commentPreview: 'Nice post!',
      });

      const payload = lastPushPayload() as ThreadedPayload;
      expect(payload.category).toBe('MEESHY_SOCIAL');
      expect(payload.threadId).toBeUndefined();
    });

    it('test_missedCallPush_carriesMissedCallCategory', async () => {
      await service.createMissedCallNotification({
        recipientUserId: RECIPIENT_ID,
        callerId: SENDER_ID,
        conversationId: CONVERSATION_ID,
        callSessionId: 'cccccccccccccccccccccccc',
        callType: 'audio',
      });

      const payload = lastPushPayload() as ThreadedPayload;
      expect(payload.threadId).toBe(CONVERSATION_ID);
      expect(payload.category).toBe('MEESHY_CALL_MISSED');
    });

    it('test_friendRequestPush_carriesFriendRequestCategory', async () => {
      await service.createFriendRequestNotification({
        recipientUserId: RECIPIENT_ID,
        requesterId: SENDER_ID,
        friendRequestId: 'dddddddddddddddddddddddd',
      });

      const payload = lastPushPayload() as ThreadedPayload;
      expect(payload.category).toBe('MEESHY_FRIEND_REQUEST');
      expect(payload.threadId).toBeUndefined();
    });
  });

  // GW5 — payload enrichment for NSE persistence: createdAt + messageType
  // always for messages, plus the Prism-resolved translation for the
  // recipient when one already exists in DB at fan-out time. APNs 4KB
  // budget: the translation is the FIRST field dropped when oversized.
  describe('GW5 — data carries createdAt/messageType and Prism translation', () => {
    const MSG_CREATED_AT = new Date('2026-07-20T09:30:00.000Z');

    function mockLiveMessage(overrides: Record<string, unknown> = {}) {
      (prisma.message.findUnique as jest.Mock).mockResolvedValue({
        deletedAt: null,
        expiresAt: null,
        isViewOnce: false,
        viewOnceCount: 0,
        createdAt: MSG_CREATED_AT,
        messageType: 'text',
        translations: null,
        ...overrides,
      });
    }

    function mockRecipientLanguage(systemLanguage: string) {
      (prisma.user.findUnique as jest.Mock).mockImplementation(({ where }: any) => {
        if (where.id === RECIPIENT_ID) {
          return Promise.resolve({
            systemLanguage,
            regionalLanguage: null,
            customDestinationLanguage: null,
            deviceLocale: null,
          });
        }
        return Promise.resolve({ username: 'alice', displayName: 'Alice Martin', avatar: null });
      });
    }

    async function sendMessageNotification(extra: Record<string, unknown> = {}) {
      await service.createMessageNotification({
        recipientUserId: RECIPIENT_ID,
        senderId: SENDER_ID,
        messageId: MESSAGE_ID,
        conversationId: CONVERSATION_ID,
        messagePreview: 'Bonjour tout le monde',
        ...extra,
      });
    }

    beforeEach(() => {
      (prisma.conversation.findUnique as jest.Mock).mockResolvedValue({
        title: 'Chat', type: 'direct',
      });
      mockRecipientLanguage('en');
    });

    it('test_messagePush_dataCarriesCreatedAtIsoAndMessageType', async () => {
      mockLiveMessage({ messageType: 'audio' });

      await sendMessageNotification();

      const data = (lastPushPayload().data ?? {}) as Record<string, string>;
      expect(data.createdAt).toBe('2026-07-20T09:30:00.000Z');
      expect(data.messageType).toBe('audio');
    });

    it('test_messagePush_translationMatchingPrismLanguage_isIncluded', async () => {
      mockLiveMessage({
        translations: {
          en: { text: 'Hello everyone', translationModel: 'medium', createdAt: MSG_CREATED_AT },
          de: { text: 'Hallo zusammen', translationModel: 'medium', createdAt: MSG_CREATED_AT },
        },
      });

      await sendMessageNotification();

      const data = (lastPushPayload().data ?? {}) as Record<string, string>;
      expect(data.translatedContent).toBe('Hello everyone');
      expect(data.translatedLanguage).toBe('en');
    });

    it('test_messagePush_noMatchingTranslation_fieldsAbsent', async () => {
      mockLiveMessage({
        translations: {
          de: { text: 'Hallo zusammen', translationModel: 'medium', createdAt: MSG_CREATED_AT },
        },
      });

      await sendMessageNotification();

      const data = (lastPushPayload().data ?? {}) as Record<string, string>;
      expect(data).not.toHaveProperty('translatedContent');
      expect(data).not.toHaveProperty('translatedLanguage');
    });

    it('test_messagePush_encryptedTranslation_isNeverPushed', async () => {
      mockLiveMessage({
        translations: {
          en: { text: 'ciphertextbase64', translationModel: 'medium', isEncrypted: true, createdAt: MSG_CREATED_AT },
        },
      });

      await sendMessageNotification();

      const data = (lastPushPayload().data ?? {}) as Record<string, string>;
      expect(data).not.toHaveProperty('translatedContent');
    });

    it('test_messagePush_translationTruncatedTo200Chars', async () => {
      mockLiveMessage({
        translations: {
          en: { text: 'x'.repeat(300), translationModel: 'medium', createdAt: MSG_CREATED_AT },
        },
      });

      await sendMessageNotification();

      const data = (lastPushPayload().data ?? {}) as Record<string, string>;
      expect(data.translatedContent).toHaveLength(200);
    });

    it('test_messagePush_normalPayloadStaysUnderApns4KBBudget', async () => {
      mockLiveMessage({
        translations: {
          en: { text: 'Hello everyone', translationModel: 'medium', createdAt: MSG_CREATED_AT },
        },
      });

      await sendMessageNotification({ encryptedContent: 'shortciphertext' });

      const payload = lastPushPayload();
      expect(Buffer.byteLength(JSON.stringify(payload), 'utf8')).toBeLessThan(4096);
      expect((payload.data ?? {}).translatedContent).toBe('Hello everyone');
    });

    it('test_messagePush_oversizedByEncryptedContent_dropsTranslationFirst', async () => {
      mockLiveMessage({
        translations: {
          en: { text: 'y'.repeat(300), translationModel: 'medium', createdAt: MSG_CREATED_AT },
        },
      });

      await sendMessageNotification({ encryptedContent: 'z'.repeat(3800) });

      const data = (lastPushPayload().data ?? {}) as Record<string, string>;
      expect(data).not.toHaveProperty('translatedContent');
      expect(data).not.toHaveProperty('translatedLanguage');
      expect(data.encryptedContent).toBe('z'.repeat(3800));
      expect(data.createdAt).toBe('2026-07-20T09:30:00.000Z');
    });
  });
});

// ─── GW4 — pure type → category mapping ──────────────────────────────────────

describe('pushCategoryForNotificationType', () => {
  it('mirrors the iOS NSE mapping with the CALL split (incoming vs missed)', () => {
    expect(pushCategoryForNotificationType('new_message')).toBe('MEESHY_MESSAGE');
    expect(pushCategoryForNotificationType('message_reply')).toBe('MEESHY_MESSAGE');
    expect(pushCategoryForNotificationType('message_reaction')).toBe('MEESHY_MESSAGE');
    expect(pushCategoryForNotificationType('new_conversation_direct')).toBe('MEESHY_MESSAGE');
    expect(pushCategoryForNotificationType('user_mentioned')).toBe('MEESHY_MENTION');
    expect(pushCategoryForNotificationType('mention')).toBe('MEESHY_MENTION');
    expect(pushCategoryForNotificationType('friend_request')).toBe('MEESHY_FRIEND_REQUEST');
    expect(pushCategoryForNotificationType('contact_request')).toBe('MEESHY_FRIEND_REQUEST');
    expect(pushCategoryForNotificationType('post_like')).toBe('MEESHY_SOCIAL');
    expect(pushCategoryForNotificationType('post_comment')).toBe('MEESHY_SOCIAL');
    expect(pushCategoryForNotificationType('story_new_comment')).toBe('MEESHY_SOCIAL');
    expect(pushCategoryForNotificationType('friend_new_post')).toBe('MEESHY_SOCIAL');
    expect(pushCategoryForNotificationType('incoming_call')).toBe('MEESHY_CALL_INCOMING');
    expect(pushCategoryForNotificationType('missed_call')).toBe('MEESHY_CALL_MISSED');
    expect(pushCategoryForNotificationType('call_ended')).toBe('MEESHY_CALL_MISSED');
    expect(pushCategoryForNotificationType('call_declined')).toBe('MEESHY_CALL_MISSED');
  });

  it('returns undefined for unmapped types (no misleading actions)', () => {
    expect(pushCategoryForNotificationType('system')).toBeUndefined();
    expect(pushCategoryForNotificationType('login_new_device')).toBeUndefined();
    expect(pushCategoryForNotificationType('made_up_type')).toBeUndefined();
  });
});
