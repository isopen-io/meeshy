/**
 * #18910 (serveur-transport-6) — une conversation lue ailleurs remet l'icône à son vrai chiffre.
 *
 * Bob lit sur le web trois conversations dont les messages avaient posé « 3 » sur son iPhone. Aucun push ne partait
 * vers l'iPhone : l'icône restait à « 3 » pendant des heures. Désormais, marquer les notifications d'une conversation
 * comme lues :
 *
 *  - iOS  : envoie UN push « badge seul » (`badge_sync`, plateforme iOS) portant le total recalculé ;
 *  - Android : n'a pas de pastille sans bannière — les bannières lues dont le push est parti sont révoquées
 *    (`notification_revoked`, déjà déployé).
 *
 * Rien ne part quand la lecture n'a rien marqué, ni chez un compte sans appareil iOS, ni quand le total est
 * indisponible (servir « 0 » EFFACERAIT l'icône). Une rafale de lectures est coalescée en UNE synchronisation.
 *
 * @jest-environment node
 */

jest.mock('isomorphic-dompurify', () => ({
  __esModule: true,
  default: { sanitize: (input: string) => input?.replace(/<[^>]*>/g, '') ?? '' },
}));

jest.mock('../../../utils/logger-enhanced', () => ({
  notificationLogger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
  securityLogger: { logViolation: jest.fn() },
  enhancedLogger: { child: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() })) },
}));

jest.mock('@meeshy/shared/prisma/client', () => {
  const mockPrisma = {
    notification: { update: jest.fn(), updateMany: jest.fn(), delete: jest.fn(), deleteMany: jest.fn(), findUnique: jest.fn(), findMany: jest.fn(), count: jest.fn() },
    userPreferences: { findUnique: jest.fn() },
    pushToken: { findFirst: jest.fn(), findMany: jest.fn() },
    $runCommandRaw: jest.fn(),
  };
  return { PrismaClient: jest.fn(() => mockPrisma) };
});

const mockComputeBadge = jest.fn<(prisma: unknown, userId: string) => Promise<number>>();
jest.mock('../../../services/notifications/conversationUnreadBadge', () => ({
  computeConversationUnreadBadge: (prisma: unknown, userId: string) => mockComputeBadge(prisma, userId),
}));

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { PrismaClient } from '@meeshy/shared/prisma/client';
import { NotificationService } from '../../../services/notifications/NotificationService';
import { BADGE_SYNC_DEBOUNCE_MS } from '../../../services/notifications/readElsewhereSync';

const USER = '64a000000000000000000001';
const CONV_A = '64b00000000000000000000a';
const CONV_B = '64b00000000000000000000b';
const NOTIF_1 = '64e000000000000000000001';
const NOTIF_2 = '64e000000000000000000002';

type PushCall = { userId: string; platforms?: string[]; types?: string[]; payload: { badge?: number; data: Record<string, string> } };

describe('NotificationService — une lecture faite ailleurs remet l’icône à son chiffre (#18910)', () => {
  let service: NotificationService;
  let prisma: any;
  let sendToUser: jest.Mock<any>;
  let marked: number;
  let unreadBanners: Array<{ id: string; conversationId: string; type: string }>;

  const calls = (): PushCall[] => sendToUser.mock.calls.map((call: any[]) => call[0]);
  const badgeSyncs = () => calls().filter((call) => call.payload.data.type === 'badge_sync');
  const revocations = () => calls().filter((call) => call.payload.data.type === 'notification_revoked');
  const settle = async () => { await service.flushPendingRevocations(); };

  beforeEach(() => {
    jest.clearAllMocks();
    marked = 1;
    unreadBanners = [];
    prisma = new PrismaClient();
    service = new NotificationService(prisma);
    service.setSocketIO({ to: jest.fn().mockReturnThis(), emit: jest.fn() } as never, new Map());
    sendToUser = jest.fn<any>().mockResolvedValue([{ success: true, tokenId: 't' }]);
    service.setPushNotificationService({ sendToUser } as never);

    prisma.notification.count.mockResolvedValue(0);
    prisma.pushToken.findFirst.mockResolvedValue({ id: 'ios-token' });
    mockComputeBadge.mockResolvedValue(0);
    prisma.$runCommandRaw.mockImplementation(async (command: any) => {
      if (command.find === 'Notification') {
        return {
          cursor: {
            firstBatch: unreadBanners.map((row) => ({
              _id: { $oid: row.id }, type: row.type, context: { conversationId: row.conversationId }, delivery: { pushSent: true },
            })),
          },
        };
      }
      return { ok: 1, nModified: marked };
    });
  });

  it('la dernière conversation non lue lue ailleurs : UN push « badge seul » vers l’iPhone, à 0', async () => {
    await service.markConversationNotificationsAsRead(USER, CONV_A);
    await settle();

    expect(badgeSyncs()).toHaveLength(1);
    const [push] = badgeSyncs();
    expect(push.userId).toBe(USER);
    expect(push.platforms).toEqual(['ios']);
    expect(push.payload.badge).toBe(0);
    expect(push.payload.data.unreadCount).toBe('0');
  });

  it('le total est celui du reste : deux conversations non lues, une lue ⇒ la pastille dit 1', async () => {
    mockComputeBadge.mockResolvedValue(1);

    await service.markConversationNotificationsAsRead(USER, CONV_A);
    await settle();

    expect(badgeSyncs()[0].payload.badge).toBe(1);
  });

  it('une lecture qui n’a rien marqué n’appelle rien : le total n’a pas pu bouger', async () => {
    marked = 0;

    await service.markConversationNotificationsAsRead(USER, CONV_A);
    await settle();

    expect(sendToUser).not.toHaveBeenCalled();
    expect(mockComputeBadge).not.toHaveBeenCalled();
  });

  it('un compte sans appareil iOS ne paie ni le calcul du total ni le push', async () => {
    prisma.pushToken.findFirst.mockResolvedValue(null);

    await service.markConversationNotificationsAsRead(USER, CONV_A);
    await settle();

    expect(mockComputeBadge).not.toHaveBeenCalled();
    expect(badgeSyncs()).toEqual([]);
  });

  it('un total indisponible n’envoie rien : « 0 » effacerait l’icône d’un destinataire qui a des non-lus', async () => {
    mockComputeBadge.mockRejectedValue(new Error('conversation unread counts unavailable'));

    await service.markConversationNotificationsAsRead(USER, CONV_A);
    await settle();

    expect(badgeSyncs()).toEqual([]);
  });

  it('une rafale de lectures (trois conversations) se coalesce en UNE synchronisation', async () => {
    await Promise.all([
      service.markConversationNotificationsAsRead(USER, CONV_A),
      service.markConversationNotificationsAsRead(USER, CONV_B),
      service.markConversationNotificationsAsRead(USER, '64b00000000000000000000c'),
    ]);
    await settle();

    expect(badgeSyncs()).toHaveLength(1);
  });

  /**
   * Revue (#18910) — l'anti-rebond est un DÉLAI, pas une simple coalescence de file. La cascade « messages lus →
   * notifications lues » part AVANT l'écriture du curseur de lecture (`MessageReadStatusService.markMessagesAsRead`),
   * et le total se compte sur ce curseur : calculé aussitôt, il compte encore la conversation qu'on vient de lire,
   * et ce chiffre périmé reste sur l'icône. Il se lit donc une fois la fenêtre écoulée, que la dernière lecture
   * d'une rafale étale sur plusieurs secondes prolonge.
   */
  describe('l’anti-rebond attend que la lecture soit écrite', () => {
    const drainMicrotasks = async () => {
      for (let index = 0; index < 10; index += 1) await new Promise((resolve) => setImmediate(resolve));
    };

    beforeEach(() => {
      jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('le total est lu après la fenêtre : la conversation dont le curseur s’écrit juste après n’est plus comptée', async () => {
      let cursorWritten = false;
      mockComputeBadge.mockImplementation(async () => (cursorWritten ? 0 : 1));

      await service.markConversationNotificationsAsRead(USER, CONV_A);
      await drainMicrotasks();
      cursorWritten = true;

      expect(badgeSyncs()).toEqual([]);
      jest.advanceTimersByTime(BADGE_SYNC_DEBOUNCE_MS);
      await settle();

      expect(badgeSyncs()).toHaveLength(1);
      expect(badgeSyncs()[0].payload.badge).toBe(0);
    });

    it('trois conversations lues à une seconde d’intervalle : UN seul push, au total d’après la dernière', async () => {
      let readConversations = 0;
      mockComputeBadge.mockImplementation(async () => 3 - readConversations);

      for (const conversationId of [CONV_A, CONV_B, '64b00000000000000000000c']) {
        await service.markConversationNotificationsAsRead(USER, conversationId);
        readConversations += 1;
        await drainMicrotasks();
        jest.advanceTimersByTime(1_000);
      }
      jest.advanceTimersByTime(BADGE_SYNC_DEBOUNCE_MS);
      await settle();

      expect(badgeSyncs()).toHaveLength(1);
      expect(badgeSyncs()[0].payload.badge).toBe(0);
    });
  });

  it('Android : les bannières lues dont le push est parti sont révoquées, par conversation', async () => {
    unreadBanners = [
      { id: NOTIF_1, conversationId: CONV_A, type: 'new_message' },
      { id: NOTIF_2, conversationId: CONV_A, type: 'new_message' },
    ];

    await service.markConversationNotificationsAsRead(USER, CONV_A);
    await settle();

    expect(revocations()).toHaveLength(1);
    expect(revocations()[0].payload.data.notificationIds).toBe(`${NOTIF_1},${NOTIF_2}`);
    expect(revocations()[0].payload.data.conversationIds).toBe(`${CONV_A},${CONV_A}`);
  });

  it('la lecture d’un post ou d’une demande d’ami ne touche pas la pastille des conversations', async () => {
    await service.markPostNotificationsAsRead(USER, '64c000000000000000000003');
    await service.markFriendRequestNotificationsAsRead(USER, '64d000000000000000000004');
    await settle();

    expect(sendToUser).not.toHaveBeenCalled();
    expect(mockComputeBadge).not.toHaveBeenCalled();
  });
});
