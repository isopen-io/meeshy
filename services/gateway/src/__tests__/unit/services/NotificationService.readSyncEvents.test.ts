/**
 * NotificationService.readSyncEvents.test.ts
 *
 * Sync multi-appareils des états de lecture des notifications :
 * - `notification:read` / `notification:deleted` sont émis vers la room user.
 *   Déclarés dans SERVER_EVENTS et écoutés par le web ET iOS depuis toujours,
 *   ils n'étaient JAMAIS émis — marquer lu sur un appareil ne retirait pas la
 *   ligne sur les autres (seul un `notification:counts` anonyme partait).
 * - `notification:counts` compte les non-lues avec `isRead: false` — même
 *   prédicat (indexé [userId, isRead]) que la liste et le badge REST. L'ancien
 *   `readAt: null` divergeait sur les données legacy et tournait en collscan.
 * - `deleteAllRead` purge les notifications lues (le web appelait
 *   DELETE /notifications/read qui matchait DELETE /notifications/:id → 404).
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
      update: jest.fn(),
      updateMany: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
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
const NOTIF_ID = '64d000000000000000000004';

const flushAsync = () => new Promise((resolve) => setImmediate(resolve));

function makeRawNotification(overrides: Record<string, unknown> = {}) {
  return {
    id: NOTIF_ID,
    userId: USER_ID,
    type: 'new_message',
    priority: 'normal',
    title: null,
    subtitle: null,
    content: 'Hello',
    context: {},
    metadata: {},
    isRead: true,
    readAt: new Date('2026-08-04T10:00:00Z'),
    createdAt: new Date('2026-08-04T09:00:00Z'),
    expiresAt: null,
    ...overrides,
  };
}

describe('NotificationService — événements de sync de lecture multi-appareils', () => {
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

  describe('markAsRead', () => {
    it("émet notification:read { notificationId } vers la room de l'utilisateur", async () => {
      prisma.notification.update.mockResolvedValue(makeRawNotification());

      await service.markAsRead(NOTIF_ID);
      await flushAsync();

      expect(mockIO.to).toHaveBeenCalledWith(`user:${USER_ID}`);
      expect(mockIO.emit).toHaveBeenCalledWith('notification:read', { notificationId: NOTIF_ID });
    });

    it('émet aussi notification:counts avec le prédicat isRead (jamais readAt)', async () => {
      prisma.notification.update.mockResolvedValue(makeRawNotification());

      await service.markAsRead(NOTIF_ID);
      await flushAsync();

      expect(mockIO.emit).toHaveBeenCalledWith('notification:counts', expect.any(Object));
      const countWheres = prisma.notification.count.mock.calls.map((c: any[]) => c[0].where);
      // `objectContaining` et non l'égalité : ce que ce test défend est le
      // PRÉDICAT de non-lu (isRead, jamais readAt), pas la clause entière — le
      // filtre de visibilité (`expiresAt`) s'y compose depuis, et il est tenu
      // sur son propre terrain par `notificationExpiry.test.ts`, en évaluant
      // la clause contre des lignes plutôt qu'en la recopiant.
      expect(countWheres).toContainEqual(expect.objectContaining({ userId: USER_ID, isRead: false }));
      expect(countWheres.some((w: Record<string, unknown>) => 'readAt' in w)).toBe(false);
    });

    it("survit à l'absence de socket (io non configuré)", async () => {
      const offlineService = new NotificationService(prisma);
      prisma.notification.update.mockResolvedValue(makeRawNotification());

      const result = await offlineService.markAsRead(NOTIF_ID);

      expect(result).not.toBeNull();
    });
  });

  describe('deleteNotification', () => {
    it("émet notification:deleted { notificationId } vers la room de l'utilisateur", async () => {
      prisma.notification.findUnique.mockResolvedValue({ userId: USER_ID });
      prisma.notification.delete.mockResolvedValue({});

      await service.deleteNotification(NOTIF_ID);
      await flushAsync();

      expect(mockIO.to).toHaveBeenCalledWith(`user:${USER_ID}`);
      expect(mockIO.emit).toHaveBeenCalledWith('notification:deleted', { notificationId: NOTIF_ID });
    });

    it("n'émet rien quand la suppression échoue", async () => {
      prisma.notification.findUnique.mockResolvedValue({ userId: USER_ID });
      prisma.notification.delete.mockRejectedValue(new Error('gone'));

      const deleted = await service.deleteNotification(NOTIF_ID);
      await flushAsync();

      expect(deleted).toBe(false);
      expect(mockIO.emit).not.toHaveBeenCalledWith('notification:deleted', expect.anything());
    });
  });

  describe('deleteAllRead', () => {
    it('supprime uniquement les notifications lues du user et rafraîchit les compteurs', async () => {
      prisma.notification.deleteMany.mockResolvedValue({ count: 4 });

      const count = await service.deleteAllRead(USER_ID);
      await flushAsync();

      expect(prisma.notification.deleteMany).toHaveBeenCalledWith({
        where: { userId: USER_ID, isRead: true },
      });
      expect(count).toBe(4);
      expect(mockIO.emit).toHaveBeenCalledWith('notification:counts', expect.any(Object));
    });

    it('retourne 0 sans émettre quand rien n\'a été supprimé', async () => {
      prisma.notification.deleteMany.mockResolvedValue({ count: 0 });

      const count = await service.deleteAllRead(USER_ID);
      await flushAsync();

      expect(count).toBe(0);
      expect(mockIO.emit).not.toHaveBeenCalled();
    });

    it('retourne 0 et n\'explose pas si la purge échoue', async () => {
      prisma.notification.deleteMany.mockRejectedValue(new Error('mongo down'));

      const count = await service.deleteAllRead(USER_ID);

      expect(count).toBe(0);
    });
  });
  /**
   * Les marquages EN MASSE ne peuvent pas émettre `notification:read` : ni
   * `updateMany` ni `$runCommandRaw` ne renvoient les ids touchés, et les
   * refetcher annulerait le gain d'un update unique. `notification:read-bulk`
   * annonce donc le PRÉDICAT appliqué ; chaque client le rejoue sur son cache.
   * Le compteur reste tenu par `notification:counts`, émis juste après (un
   * cache partiel matcherait un nombre de lignes différent du serveur).
   */
  describe('notification:read-bulk', () => {
    const readBulkEmits = () =>
      mockIO.emit.mock.calls.filter(([event]: [string]) => event === 'notification:read-bulk');

    describe('markAllAsRead', () => {
      it("annonce le scope 'all' vers la room de l'utilisateur", async () => {
        prisma.notification.updateMany.mockResolvedValue({ count: 7 });

        await service.markAllAsRead(USER_ID);
        await flushAsync();

        expect(mockIO.to).toHaveBeenCalledWith(`user:${USER_ID}`);
        expect(readBulkEmits()).toEqual([['notification:read-bulk', { scope: { kind: 'all' } }]]);
      });

      it("n'annonce rien quand aucune ligne n'était non lue", async () => {
        prisma.notification.updateMany.mockResolvedValue({ count: 0 });

        await service.markAllAsRead(USER_ID);
        await flushAsync();

        expect(readBulkEmits()).toHaveLength(0);
      });
    });

    describe('markConversationNotificationsAsRead', () => {
      it("annonce le scope 'context' avec la clé ET la valeur interrogées", async () => {
        prisma.$runCommandRaw.mockResolvedValue({ nModified: 3 });

        await service.markConversationNotificationsAsRead(USER_ID, 'conv-1');
        await flushAsync();

        expect(mockIO.to).toHaveBeenCalledWith(`user:${USER_ID}`);
        expect(readBulkEmits()).toEqual([
          [
            'notification:read-bulk',
            { scope: { kind: 'context', contextKey: 'conversationId', contextValue: 'conv-1' } },
          ],
        ]);
      });

      it("n'annonce rien quand la conversation n'avait aucune notification non lue", async () => {
        prisma.$runCommandRaw.mockResolvedValue({ nModified: 0 });

        await service.markConversationNotificationsAsRead(USER_ID, 'conv-1');
        await flushAsync();

        expect(readBulkEmits()).toHaveLength(0);
      });
    });

    it('markPostNotificationsAsRead annonce la clé postId', async () => {
      prisma.$runCommandRaw.mockResolvedValue({ nModified: 1 });

      await service.markPostNotificationsAsRead(USER_ID, 'post-42');
      await flushAsync();

      expect(readBulkEmits()).toEqual([
        [
          'notification:read-bulk',
          { scope: { kind: 'context', contextKey: 'postId', contextValue: 'post-42' } },
        ],
      ]);
    });

    it('markFriendRequestNotificationsAsRead annonce la clé friendRequestId', async () => {
      prisma.$runCommandRaw.mockResolvedValue({ nModified: 1 });

      await service.markFriendRequestNotificationsAsRead(USER_ID, 'fr-9');
      await flushAsync();

      expect(readBulkEmits()).toEqual([
        [
          'notification:read-bulk',
          { scope: { kind: 'context', contextKey: 'friendRequestId', contextValue: 'fr-9' } },
        ],
      ]);
    });

    describe('markNotificationsByTypesAsRead', () => {
      it("annonce le scope 'types' avec la liste interrogée", async () => {
        prisma.notification.updateMany.mockResolvedValue({ count: 2 });

        await service.markNotificationsByTypesAsRead(USER_ID, ['friend_request', 'friend_accepted']);
        await flushAsync();

        expect(readBulkEmits()).toEqual([
          [
            'notification:read-bulk',
            { scope: { kind: 'types', types: ['friend_request', 'friend_accepted'] } },
          ],
        ]);
      });

      it("n'annonce rien pour une liste de types vide (aucun update n'est tenté)", async () => {
        await service.markNotificationsByTypesAsRead(USER_ID, []);
        await flushAsync();

        expect(readBulkEmits()).toHaveLength(0);
      });
    });

    it("reste silencieux et sans erreur quand aucun socket n'est câblé", async () => {
      const offline = new NotificationService(prisma);
      prisma.notification.updateMany.mockResolvedValue({ count: 5 });

      await expect(offline.markAllAsRead(USER_ID)).resolves.toBe(5);
      expect(mockIO.emit).not.toHaveBeenCalled();
    });
  });

  /**
   * Symétrique exact du bloc ci-dessus, côté PURGE — et son cas est plus fort :
   * `notification:counts` ne dit littéralement RIEN d'une purge des lues (seules
   * des lignes déjà lues partent, `unread` est inchangé), là où il recalait au
   * moins le badge après un marquage. Sans `notification:deleted-bulk`, vider sa
   * cloche sur un appareil la laisse pleine sur les autres, chaque ligne y
   * ouvrant un écran dont la notification n'existe plus.
   */
  describe('notification:deleted-bulk', () => {
    const deletedBulkEmits = () =>
      mockIO.emit.mock.calls.filter(([event]: [string]) => event === 'notification:deleted-bulk');

    describe('deleteAllRead', () => {
      it("annonce le scope 'read' vers la room de l'utilisateur quand des lignes partent", async () => {
        prisma.notification.deleteMany.mockResolvedValue({ count: 4 });

        await service.deleteAllRead(USER_ID);
        await flushAsync();

        expect(mockIO.to).toHaveBeenCalledWith(`user:${USER_ID}`);
        expect(deletedBulkEmits()).toEqual([
          ['notification:deleted-bulk', { scope: { kind: 'read' } }],
        ]);
      });

      it("n'annonce rien quand aucune ligne n'a été purgée", async () => {
        prisma.notification.deleteMany.mockResolvedValue({ count: 0 });

        await service.deleteAllRead(USER_ID);
        await flushAsync();

        expect(deletedBulkEmits()).toHaveLength(0);
      });

      it("n'égrène AUCUN notification:deleted par ligne", async () => {
        // La purge n'est pas bornée — un compte ancien en a des milliers. Le
        // fan-out par ligne ferait payer au chemin de purge un coût
        // proportionnel à l'historique, et exigerait de lister les ids avant
        // le `deleteMany`. C'est précisément ce que l'annonce du prédicat évite.
        prisma.notification.deleteMany.mockResolvedValue({ count: 1200 });

        await service.deleteAllRead(USER_ID);
        await flushAsync();

        expect(mockIO.emit).not.toHaveBeenCalledWith('notification:deleted', expect.anything());
      });

      it("survit à l'absence de socket (io non configuré)", async () => {
        const offline = new NotificationService(prisma);
        prisma.notification.deleteMany.mockResolvedValue({ count: 2 });

        await expect(offline.deleteAllRead(USER_ID)).resolves.toBe(2);
        expect(mockIO.emit).not.toHaveBeenCalled();
      });
    });
  });

  /**
   * Le RAPPEL d'un message retire en base les notifications qu'il avait
   * produites (`applyMessageRemovalEffects`). Ce service n'en tient que la
   * moitié volatile : sans elle, la ligne resterait affichée sur les écrans
   * ouverts et la cloche compterait des lignes que le serveur vient de
   * supprimer, jusqu'au prochain démarrage à froid.
   */
  describe('announceNotificationsRetracted', () => {
    const OTHER_USER_ID = '64a000000000000000000002';

    it('émet notification:deleted vers la room de CHAQUE destinataire', async () => {
      // `pushSent: false` : ces témoins observent le canal SOCKET. Aucune
      // bannière n'était partie, donc aucun push de révocation n'est dû.
      await service.announceNotificationsRetracted([
        { id: 'notif-a', userId: USER_ID, pushSent: false },
        { id: 'notif-b', userId: OTHER_USER_ID, pushSent: false },
      ]);
      await flushAsync();

      expect(mockIO.to).toHaveBeenCalledWith(`user:${USER_ID}`);
      expect(mockIO.to).toHaveBeenCalledWith(`user:${OTHER_USER_ID}`);
      expect(mockIO.emit).toHaveBeenCalledWith('notification:deleted', { notificationId: 'notif-a' });
      expect(mockIO.emit).toHaveBeenCalledWith('notification:deleted', { notificationId: 'notif-b' });
    });

    it('ne recompte les badges qu\'UNE fois par destinataire', async () => {
      // Une mention et une réponse sur le même message rappelé visent la même
      // personne : deux lignes retirées, un seul badge à recalculer.
      await service.announceNotificationsRetracted([
        { id: 'notif-a', userId: USER_ID, pushSent: false },
        { id: 'notif-b', userId: USER_ID, pushSent: false },
      ]);
      await flushAsync();

      const countsEmits = mockIO.emit.mock.calls.filter(([event]: [string]) => event === 'notification:counts');
      expect(countsEmits).toHaveLength(1);
    });

    it('reste silencieux et sans erreur quand aucun socket n\'est câblé', async () => {
      // Le retrait durable a DÉJÀ eu lieu quand ceci tourne : un worker sans
      // `io` ne doit pas transformer une suppression réussie en rejet.
      const offline = new NotificationService(prisma);

      await expect(
        offline.announceNotificationsRetracted([{ id: 'notif-a', userId: USER_ID, pushSent: false }])
      ).resolves.toBeUndefined();
      expect(mockIO.emit).not.toHaveBeenCalled();
    });
  });
});
