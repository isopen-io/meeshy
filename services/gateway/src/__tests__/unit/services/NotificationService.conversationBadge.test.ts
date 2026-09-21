/**
 * G3 (#7218, Closes #7001) — le badge du push (`aps.badge` / `data.unreadCount`)
 * compte les CONVERSATIONS non lues du destinataire, hors muettes (D-L1),
 * exactement comme `NotificationCoordinator.conversationUnreadTotal` sur iOS
 * et `countUnreadConversations` sur web-v2 (W4/#7221).
 *
 * Extrait de `NotificationService.pushMessage.test.ts` (F1, badge/widget gelés
 * app fermée) — ce fichier est dans la liste héritée du budget de taille
 * (`gateway-test-file-size-budget.test.ts`), qui ne peut que RÉTRÉCIR : les
 * témoins de badge, qui changent de source de vérité, vivent désormais ici,
 * hors de cette liste.
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
    post: { findFirst: jest.fn().mockResolvedValue({ authorId: 'post-author', visibility: 'PUBLIC', visibilityUserIds: [] }) },
    userPreferences: {
      findUnique: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
    conversation: {
      findUnique: jest.fn(),
    },
    message: {
      findUnique: jest.fn(),
    },
    postMedia: {
      findFirst: jest.fn(),
    },
    // G3 (#7218, D-L1) — les trois tables que `computeConversationUnreadBadge`
    // lit : les participations actives du destinataire, le curseur de lecture
    // par conversation (`unreadCount > 0`), et le mute par conversation.
    userConversationPreferences: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    participant: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    conversationReadCursor: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  };

  return {
    PrismaClient: jest.fn(() => mockPrisma),
    PostVisibility: {
      PUBLIC: 'PUBLIC', PRIVATE: 'PRIVATE', FRIENDS: 'FRIENDS',
      ONLY: 'ONLY', EXCEPT: 'EXCEPT', COMMUNITY: 'COMMUNITY',
    },
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

type PushPayload = { title: string; body: string; badge?: number; data?: Record<string, string> };

describe('NotificationService — badge du push (F1 ; D-L1, #7218 : conversations non lues)', () => {
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
    (prisma.message.findUnique as jest.Mock).mockResolvedValue({
      deletedAt: null,
      expiresAt: null,
      isViewOnce: false,
      viewOnceCount: 0,
    });
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      username: 'alice', displayName: 'Alice Martin', avatar: null,
    });
  });

  async function sendMessageNotification(): Promise<PushPayload> {
    await service.createMessageNotification({
      recipientUserId: RECIPIENT_ID,
      senderId: SENDER_ID,
      messageId: MESSAGE_ID,
      conversationId: CONVERSATION_ID,
      messagePreview: 'Salut !',
    });
    return lastPushPayload();
  }

  it('test_push_carriesUnreadBadge_asConversationCount_notMessageCount', async () => {
    // Sept conversations distinctes, chacune avec au moins un non-lu — D-L1 :
    // le badge compte les CONVERSATIONS, jamais leur nombre de messages.
    (prisma.participant.findMany as jest.Mock).mockResolvedValueOnce(
      Array.from({ length: 7 }, (_, i) => ({ id: `participant-${i}`, conversationId: `conv-${i}` }))
    );
    (prisma.conversationReadCursor.findMany as jest.Mock).mockResolvedValueOnce(
      Array.from({ length: 7 }, (_, i) => ({ conversationId: `conv-${i}` }))
    );

    const payload = await sendMessageNotification();
    expect(payload.badge).toBe(7);
    expect(payload.data?.unreadCount).toBe('7');
  });

  it('test_push_excludesMutedConversation_fromBadge', async () => {
    (prisma.participant.findMany as jest.Mock).mockResolvedValueOnce([
      { id: 'participant-open', conversationId: 'conv-open' },
      { id: 'participant-muted', conversationId: 'conv-muted' },
    ]);
    (prisma.conversationReadCursor.findMany as jest.Mock).mockResolvedValueOnce([
      { conversationId: 'conv-open' },
      { conversationId: 'conv-muted' },
    ]);
    (prisma.userConversationPreferences.findMany as jest.Mock).mockResolvedValueOnce([
      { conversationId: 'conv-muted' },
    ]);

    const payload = await sendMessageNotification();
    expect(payload.badge).toBe(1);
  });

  it('test_push_omitsBadge_whenParticipantLookupUnavailable_bestEffort', async () => {
    (prisma.participant.findMany as jest.Mock).mockRejectedValueOnce(new Error('db down'));

    const payload = await sendMessageNotification();
    expect(payload.badge).toBeUndefined();
    expect(payload.data?.unreadCount).toBeUndefined();
    expect(sendToUser).toHaveBeenCalledTimes(1);
  });

  it('test_aFriendRequestNotification_doesNotIncrementTheBadge_anUnreadMessageDoes', async () => {
    // Une demande d'ami : `createFriendRequestNotification` (context =
    // `{ friendRequestId }`, aucun Participant/ConversationReadCursor posé) —
    // la cloche (`notification:counts`) en parle, jamais le badge de
    // conversations (D-L1).
    (prisma.participant.findMany as jest.Mock).mockResolvedValueOnce([]);

    await service.createFriendRequestNotification({
      recipientUserId: RECIPIENT_ID,
      requesterId: SENDER_ID,
      friendRequestId: 'friend-request-1',
    });

    expect(lastPushPayload().badge).toBe(0);

    // Le MÊME destinataire reçoit ensuite un message dans une conversation où
    // il a un non-lu : le badge passe à 1 — c'est bien la conversation, pas
    // la notification sociale, qui le fait bouger.
    (prisma.participant.findMany as jest.Mock).mockResolvedValueOnce([
      { id: 'participant-a', conversationId: CONVERSATION_ID },
    ]);
    (prisma.conversationReadCursor.findMany as jest.Mock).mockResolvedValueOnce([
      { conversationId: CONVERSATION_ID },
    ]);

    const payload = await sendMessageNotification();
    expect(payload.badge).toBe(1);
  });
});
