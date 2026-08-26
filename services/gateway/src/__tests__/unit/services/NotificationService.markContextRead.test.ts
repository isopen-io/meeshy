/**
 * NotificationService.markContextRead.test.ts
 *
 * Iter 35 (F7) — l'auto-marquage des notifications d'une conversation/d'un post
 * est UN SEUL update Mongo ($runCommandRaw) filtré serveur sur le chemin JSON
 * context.* — plus de findMany de toutes les non-lues + filtre en mémoire.
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
    notification: {
      findMany: jest.fn(),
      updateMany: jest.fn(),
      deleteMany: jest.fn(),
      count: jest.fn(),
    },
    $runCommandRaw: jest.fn(),
  };
  return { PrismaClient: jest.fn(() => mockPrisma) };
});

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { PrismaClient } from '@meeshy/shared/prisma/client';
import { NotificationService } from '../../../services/notifications/NotificationService';

const USER_ID = '64a000000000000000000001';
const CONVERSATION_ID = '64b000000000000000000002';
const POST_ID = '64c000000000000000000003';
const FRIEND_REQUEST_ID = '64d000000000000000000004';

describe('NotificationService — marquage par contexte en 1 requête (iter 35 F7)', () => {
  let service: NotificationService;
  let prisma: any;
  let mockIO: any;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = new PrismaClient();
    service = new NotificationService(prisma);

    mockIO = { to: jest.fn().mockReturnThis(), emit: jest.fn() };
    service.setSocketIO(mockIO, new Map());
    prisma.notification.count.mockResolvedValue(0);
  });

  describe('markConversationNotificationsAsRead', () => {
    it('émet un seul update Mongo filtré { userId, isRead, context.conversationId } sans findMany', async () => {
      prisma.$runCommandRaw.mockResolvedValue({ ok: 1, n: 2, nModified: 2 });

      const count = await service.markConversationNotificationsAsRead(USER_ID, CONVERSATION_ID);

      expect(prisma.notification.findMany).not.toHaveBeenCalled();
      expect(prisma.notification.updateMany).not.toHaveBeenCalled();
      expect(prisma.$runCommandRaw).toHaveBeenCalledTimes(1);
      expect(prisma.$runCommandRaw).toHaveBeenCalledWith({
        update: 'Notification',
        updates: [{
          q: {
            userId: { $oid: USER_ID },
            isRead: false,
            'context.conversationId': CONVERSATION_ID,
          },
          u: { $set: { isRead: true, readAt: { $date: expect.any(String) } } },
          multi: true,
        }],
      });
      expect(count).toBe(2);
    });

    it('rafraîchit les compteurs (notification:counts) quand des notifications ont été marquées', async () => {
      prisma.$runCommandRaw.mockResolvedValue({ ok: 1, n: 1, nModified: 1 });

      await service.markConversationNotificationsAsRead(USER_ID, CONVERSATION_ID);
      await new Promise(resolve => setImmediate(resolve));

      expect(mockIO.to).toHaveBeenCalledWith(`user:${USER_ID}`);
      expect(mockIO.emit).toHaveBeenCalledWith('notification:counts', expect.any(Object));
    });

    it('n\'émet pas notification:counts quand rien n\'a été marqué', async () => {
      prisma.$runCommandRaw.mockResolvedValue({ ok: 1, n: 0, nModified: 0 });

      const count = await service.markConversationNotificationsAsRead(USER_ID, CONVERSATION_ID);
      await new Promise(resolve => setImmediate(resolve));

      expect(count).toBe(0);
      expect(mockIO.emit).not.toHaveBeenCalled();
    });

    it('retourne 0 sans requête DB pour un userId non-ObjectId (session anonyme)', async () => {
      const count = await service.markConversationNotificationsAsRead('anon-session-token', CONVERSATION_ID);

      expect(prisma.$runCommandRaw).not.toHaveBeenCalled();
      expect(count).toBe(0);
    });

    it('retourne 0 et n\'explose pas si Mongo échoue', async () => {
      prisma.$runCommandRaw.mockRejectedValue(new Error('mongo down'));

      const count = await service.markConversationNotificationsAsRead(USER_ID, CONVERSATION_ID);

      expect(count).toBe(0);
    });
  });

  describe('markPostNotificationsAsRead', () => {
    it('émet un seul update Mongo filtré sur context.postId', async () => {
      prisma.$runCommandRaw.mockResolvedValue({ ok: 1, n: 1, nModified: 1 });

      const count = await service.markPostNotificationsAsRead(USER_ID, POST_ID);

      expect(prisma.notification.findMany).not.toHaveBeenCalled();
      expect(prisma.$runCommandRaw).toHaveBeenCalledWith({
        update: 'Notification',
        updates: [{
          q: {
            userId: { $oid: USER_ID },
            isRead: false,
            'context.postId': POST_ID,
          },
          u: { $set: { isRead: true, readAt: { $date: expect.any(String) } } },
          multi: true,
        }],
      });
      expect(count).toBe(1);
    });
  });

  describe('markFriendRequestNotificationsAsRead', () => {
    it('émet un seul update Mongo filtré sur context.friendRequestId sans findMany/updateMany', async () => {
      prisma.$runCommandRaw.mockResolvedValue({ ok: 1, n: 1, nModified: 1 });

      const count = await service.markFriendRequestNotificationsAsRead(USER_ID, FRIEND_REQUEST_ID);

      expect(prisma.notification.findMany).not.toHaveBeenCalled();
      expect(prisma.notification.updateMany).not.toHaveBeenCalled();
      expect(prisma.$runCommandRaw).toHaveBeenCalledWith({
        update: 'Notification',
        updates: [{
          q: {
            userId: { $oid: USER_ID },
            isRead: false,
            'context.friendRequestId': FRIEND_REQUEST_ID,
          },
          u: { $set: { isRead: true, readAt: { $date: expect.any(String) } } },
          multi: true,
        }],
      });
      expect(count).toBe(1);
    });

    it('rafraîchit les compteurs (notification:counts) pour la sync multi-appareils', async () => {
      prisma.$runCommandRaw.mockResolvedValue({ ok: 1, n: 1, nModified: 1 });

      await service.markFriendRequestNotificationsAsRead(USER_ID, FRIEND_REQUEST_ID);
      await new Promise(resolve => setImmediate(resolve));

      expect(mockIO.to).toHaveBeenCalledWith(`user:${USER_ID}`);
      expect(mockIO.emit).toHaveBeenCalledWith('notification:counts', expect.any(Object));
    });

    it('retourne 0 sans requête DB pour un userId non-ObjectId (session anonyme)', async () => {
      const count = await service.markFriendRequestNotificationsAsRead('anon-session-token', FRIEND_REQUEST_ID);

      expect(prisma.$runCommandRaw).not.toHaveBeenCalled();
      expect(count).toBe(0);
    });
  });

  // Le marquage a un pendant : quand la demande d'amitié est SUPPRIMÉE
  // (`DELETE /friend-requests/:id`), la notification ne devient pas « lue »,
  // elle devient morte — son `action: accept_or_reject_contact` mène à une ligne
  // qui n'existe plus. Même arbitrage que le rappel d'un message
  // (`retractMessageNotifications`) : retrait, pas neutralisation.
  describe('retractFriendRequestNotifications', () => {
    const NOTIF_A = '64e000000000000000000005';
    const NOTIF_B = '64e000000000000000000006';

    function rawFind(ids: string[]) {
      return {
        cursor: {
          // `delivery.pushSent` fait partie de la projection : la révocation
          // push ne réveille un appareil que là où un push nominal est parti.
          firstBatch: ids.map((id) => ({ _id: { $oid: id }, delivery: { pushSent: true } })),
          id: 0,
          ns: 'meeshy.Notification',
        },
        ok: 1,
      };
    }

    it('lit par chemin JSON, sans filtre isRead — une lue est aussi morte qu\'une non lue', async () => {
      prisma.$runCommandRaw.mockResolvedValue(rawFind([NOTIF_A]));
      prisma.notification.deleteMany.mockResolvedValue({ count: 1 });

      await service.retractFriendRequestNotifications(USER_ID, FRIEND_REQUEST_ID);

      expect(prisma.$runCommandRaw).toHaveBeenCalledWith({
        find: 'Notification',
        filter: {
          userId: { $oid: USER_ID },
          'context.friendRequestId': FRIEND_REQUEST_ID,
        },
        projection: { _id: 1, 'delivery.pushSent': 1 },
        singleBatch: true,
        batchSize: 1000,
      });
    });

    it('supprime EXACTEMENT les lignes lues, et les annonce toutes', async () => {
      prisma.$runCommandRaw.mockResolvedValue(rawFind([NOTIF_A, NOTIF_B]));
      prisma.notification.deleteMany.mockResolvedValue({ count: 2 });

      const count = await service.retractFriendRequestNotifications(USER_ID, FRIEND_REQUEST_ID);
      await new Promise(resolve => setImmediate(resolve));

      expect(prisma.notification.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: [NOTIF_A, NOTIF_B] } },
      });
      expect(count).toBe(2);
      expect(mockIO.to).toHaveBeenCalledWith(`user:${USER_ID}`);
      expect(mockIO.emit).toHaveBeenCalledWith('notification:deleted', { notificationId: NOTIF_A });
      expect(mockIO.emit).toHaveBeenCalledWith('notification:deleted', { notificationId: NOTIF_B });
      // La cloche recalcule son badge : sans ça, le compteur resterait sur des
      // lignes que le serveur vient de retirer.
      expect(mockIO.emit).toHaveBeenCalledWith('notification:counts', expect.any(Object));
    });

    it('annonce APRÈS l\'écriture durable — les compteurs voient la base d\'après le retrait', async () => {
      const order: string[] = [];
      prisma.$runCommandRaw.mockResolvedValue(rawFind([NOTIF_A]));
      prisma.notification.deleteMany.mockImplementation(async () => {
        order.push('delete');
        return { count: 1 };
      });
      mockIO.emit.mockImplementation((event: string) => {
        if (event === 'notification:counts') order.push('counts');
      });
      prisma.notification.count.mockImplementation(async () => {
        order.push('count-read');
        return 0;
      });

      await service.retractFriendRequestNotifications(USER_ID, FRIEND_REQUEST_ID);
      await new Promise(resolve => setImmediate(resolve));

      expect(order[0]).toBe('delete');
      expect(order).toContain('counts');
    });

    it('ne supprime rien et n\'annonce rien quand aucune ligne ne porte cette demande', async () => {
      prisma.$runCommandRaw.mockResolvedValue(rawFind([]));

      const count = await service.retractFriendRequestNotifications(USER_ID, FRIEND_REQUEST_ID);
      await new Promise(resolve => setImmediate(resolve));

      expect(count).toBe(0);
      expect(prisma.notification.deleteMany).not.toHaveBeenCalled();
      expect(mockIO.emit).not.toHaveBeenCalled();
    });

    it('retourne 0 sans requête DB pour un userId non-ObjectId (session anonyme)', async () => {
      const count = await service.retractFriendRequestNotifications('anon-session-token', FRIEND_REQUEST_ID);

      expect(prisma.$runCommandRaw).not.toHaveBeenCalled();
      expect(prisma.notification.deleteMany).not.toHaveBeenCalled();
      expect(count).toBe(0);
    });

    it('retourne 0 et n\'explose pas si Mongo échoue', async () => {
      prisma.$runCommandRaw.mockRejectedValue(new Error('mongo down'));

      const count = await service.retractFriendRequestNotifications(USER_ID, FRIEND_REQUEST_ID);

      expect(count).toBe(0);
    });
  });
});
