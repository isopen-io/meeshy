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
      findMany: jest.fn(),
    },
    postMedia: {
      findFirst: jest.fn(),
    },
    // G3 (#7218, D-L1) — les tables que la chaîne du badge lit : les
    // participations actives du destinataire, les curseurs de lecture, le
    // mute par conversation, le masquage personnel, et le COMPTAGE des
    // messages postérieurs au curseur — c'est lui, jamais le champ
    // dénormalisé `ConversationReadCursor.unreadCount`, qui dit le non-lu
    // (voir `conversationUnreadBadge.ts`).
    userConversationPreferences: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    participant: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    conversationReadCursor: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    userMessageDeletion: {
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
  // `enhancedLogger.child(...)` : réclamé au CHARGEMENT par la chaîne de
  // comptage du non-lu (`MessageReadStatusService` →
  // `MessageMediaConsumptionService`). Sans lui, le badge partait silencieusement
  // absent — le repli best-effort avalait une panne de MOCK.
  enhancedLogger: {
    child: jest.fn(() => ({
      info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn(),
    })),
  },
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

type ConversationFixture = {
  readonly conversationId: string;
  readonly participantId: string;
  /** Messages d'autrui postérieurs au curseur — le VRAI non-lu de la liste. */
  readonly unreadMessages: number;
  readonly isMuted?: boolean;
};

describe('NotificationService — badge du push (F1 ; D-L1, #7218 : conversations non lues)', () => {
  let service: NotificationService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: any;
  let sendToUser: jest.Mock;

  function lastPushPayload(): PushPayload {
    const calls = sendToUser.mock.calls as Array<[{ payload: PushPayload }]>;
    return calls[calls.length - 1][0].payload;
  }

  /**
   * Sème la BASE telle qu'elle est : des messages non lus, et des curseurs
   * dont `unreadCount` vaut `0` — le dépôt ne l'incrémente nulle part à
   * l'arrivée d'un message. Un badge qui lirait ce champ rendrait `0` ici,
   * comme il le ferait en production.
   */
  function seedConversations(fixtures: readonly ConversationFixture[]): void {
    const byConversation = new Map(fixtures.map((f) => [f.conversationId, f]));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (prisma.participant.findMany as jest.Mock).mockImplementation(async ({ where }: any) =>
      fixtures
        .filter((f) =>
          where?.conversationId?.in ? where.conversationId.in.includes(f.conversationId) : true
        )
        .map((f) => ({
          id: f.participantId,
          userId: RECIPIENT_ID,
          conversationId: f.conversationId,
          joinedAt: null,
        }))
    );
    (prisma.conversationReadCursor.findMany as jest.Mock).mockImplementation(async () =>
      fixtures.map((f) => ({
        participantId: f.participantId,
        lastReadAt: new Date('2026-09-20T00:00:00.000Z'),
        lastReadMessageCreatedAt: new Date('2026-09-20T00:00:00.000Z'),
        unreadCount: 0,
      }))
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (prisma.userConversationPreferences.findMany as jest.Mock).mockImplementation(async ({ where }: any) =>
      where?.isMuted === true
        ? fixtures.filter((f) => f.isMuted).map((f) => ({ conversationId: f.conversationId }))
        : []
    );
    // #7199 (G2) — `computeUnreadCounts` (`unreadCountsCore.ts`) compte
    // désormais par `message.findMany` borné par le plancher, plus par
    // `message.count` par conversation.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (prisma.message.findMany as jest.Mock).mockImplementation(async ({ where }: any) => {
      const unreadMessages = byConversation.get(where.conversationId)?.unreadMessages ?? 0;
      return Array.from({ length: unreadMessages }, (_, i) => ({
        id: `${where.conversationId}-msg-${i}`,
        createdAt: new Date(`2026-09-21T00:00:${String(i).padStart(2, '0')}.000Z`),
        senderId: 'someone-else',
      }));
    });
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
    (prisma.userMessageDeletion.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.message.findUnique as jest.Mock).mockResolvedValue({
      deletedAt: null,
      expiresAt: null,
      isViewOnce: false,
      viewOnceCount: 0,
    });
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      username: 'alice', displayName: 'Alice Martin', avatar: null,
    });
    seedConversations([]);
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
    // Sept conversations non lues, dont une à quarante messages — D-L1 : le
    // badge vaut 7, jamais la somme des messages.
    seedConversations(
      Array.from({ length: 7 }, (_, i) => ({
        conversationId: `conv-${i}`,
        participantId: `participant-${i}`,
        unreadMessages: i === 0 ? 40 : 1,
      }))
    );

    const payload = await sendMessageNotification();
    expect(payload.badge).toBe(7);
    expect(payload.data?.unreadCount).toBe('7');
  });

  it('test_push_countsOnlyConversationsThatStillHaveUnreadMessages', async () => {
    seedConversations([
      { conversationId: 'conv-unread', participantId: 'participant-unread', unreadMessages: 2 },
      { conversationId: 'conv-read', participantId: 'participant-read', unreadMessages: 0 },
    ]);

    expect((await sendMessageNotification()).badge).toBe(1);
  });

  it('test_push_excludesMutedConversation_fromBadge', async () => {
    seedConversations([
      { conversationId: 'conv-open', participantId: 'participant-open', unreadMessages: 1 },
      { conversationId: 'conv-muted', participantId: 'participant-muted', unreadMessages: 9, isMuted: true },
    ]);

    expect((await sendMessageNotification()).badge).toBe(1);
  });

  it('test_push_omitsBadge_whenParticipantLookupUnavailable_bestEffort', async () => {
    (prisma.participant.findMany as jest.Mock).mockRejectedValue(new Error('db down'));

    const payload = await sendMessageNotification();
    expect(payload.badge).toBeUndefined();
    expect(payload.data?.unreadCount).toBeUndefined();
    expect(sendToUser).toHaveBeenCalledTimes(1);
  });

  it('test_push_omitsBadge_whenUnreadCountingFails_ratherThanWipingTheIcon', async () => {
    // Le comptage avale sa panne et rendrait une carte VIDE : servir `badge: 0`
    // EFFACERAIT l'icône d'un destinataire qui a des non-lus. Le badge est omis.
    //
    // Depuis #7199 (G2), une panne DANS `computeUnreadCounts` (le comptage
    // message par message) est avalée à CE niveau et rend des zéros — elle ne
    // remonte plus jusqu'ici (écart consigné, `decisions.md`). La panne qui
    // remonte encore est celle de la lecture des curseurs.
    seedConversations([
      { conversationId: 'conv-a', participantId: 'participant-a', unreadMessages: 3 },
    ]);
    (prisma.conversationReadCursor.findMany as jest.Mock).mockRejectedValue(new Error('db down'));

    const payload = await sendMessageNotification();
    expect(payload.badge).toBeUndefined();
    expect(payload.data?.unreadCount).toBeUndefined();
    expect(sendToUser).toHaveBeenCalledTimes(1);
  });

  it('test_reproducedPush_afterRevocation_carriesTheSameConversationBadge', async () => {
    // Le SECOND site du badge : le push nominal qui remplace une bannière
    // révoquée (`announceNotificationsReproduced` → `pushReproducedNotification`).
    // Il doit porter la MÊME projection que le push de création — sans quoi
    // une simple édition de message recalerait l'icône sur un autre nombre.
    seedConversations([
      { conversationId: 'conv-a', participantId: 'participant-a', unreadMessages: 2 },
      { conversationId: 'conv-b', participantId: 'participant-b', unreadMessages: 1 },
    ]);
    (prisma.notification.findUnique as jest.Mock).mockResolvedValue({
      ...makeNotif(),
      type: 'new_message',
      title: null,
      subtitle: null,
      content: 'Salut, corrigé !',
      context: { conversationId: 'conv-a', messageId: MESSAGE_ID },
      delivery: { pushSent: true },
    });

    await service.announceNotificationsReproduced([{ id: 'notif-msg-1', userId: RECIPIENT_ID }]);
    // La file d'appareil est une chaîne de promesses — on la laisse se vider.
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));

    const reproduced = (sendToUser.mock.calls as Array<[{ payload: PushPayload }]>)
      .map(([call]) => call.payload)
      .filter((payload) => payload.badge !== undefined);
    expect(reproduced.length).toBeGreaterThan(0);
    expect(reproduced[reproduced.length - 1].badge).toBe(2);
  });

  it('test_aFriendRequestNotification_doesNotIncrementTheBadge_anUnreadMessageDoes', async () => {
    // Deux conversations non lues : le badge vaut 2 et la demande d'ami ne le
    // fait PAS bouger — elle ne parle qu'à la cloche (`notification:counts`).
    seedConversations([
      { conversationId: 'conv-a', participantId: 'participant-a', unreadMessages: 1 },
      { conversationId: 'conv-b', participantId: 'participant-b', unreadMessages: 5 },
    ]);

    await service.createFriendRequestNotification({
      recipientUserId: RECIPIENT_ID,
      requesterId: SENDER_ID,
      friendRequestId: 'friend-request-1',
    });

    expect(lastPushPayload().badge).toBe(2);

    // Un message non lu dans une TROISIÈME conversation, lui, l'incrémente.
    seedConversations([
      { conversationId: 'conv-a', participantId: 'participant-a', unreadMessages: 1 },
      { conversationId: 'conv-b', participantId: 'participant-b', unreadMessages: 5 },
      { conversationId: CONVERSATION_ID, participantId: 'participant-c', unreadMessages: 1 },
    ]);

    expect((await sendMessageNotification()).badge).toBe(3);
  });
});
