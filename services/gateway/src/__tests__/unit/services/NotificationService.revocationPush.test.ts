/**
 * NotificationService.revocationPush.test.ts
 *
 * Une notification retirée doit l'être aussi sur le TÉLÉPHONE qui l'a déjà
 * reçue. La famille `retract*` supprime la ligne et l'annonce sur le socket ;
 * ce canal n'atteint qu'un appareil déjà là. Les trois hubs d'annonce —
 * `announceNotificationsRetracted`, `announceNotificationsReproduced`,
 * `deleteNotification` — remettent donc au service push un push de CONTRÔLE
 * `notification_revoked`, un par destinataire, que chaque client traduit en
 * « retirer ces bannières ».
 *
 * Les témoins entrent par les modules de retrait RÉELS (réaction, message)
 * avec ce service comme annonceur : c'est le câblage module → hub → transport
 * qui est prouvé, pas le hub seul.
 *
 * Le TYPE de chaque ligne voyage avec sa conversation, et c'est ce que ces
 * témoins vérifient jusqu'au transport : `data.conversationId` est posé par
 * `createNotification` pour TOUS les types, si bien qu'un client qui révoque
 * « par conversation » sans regarder le type annule la bannière du dernier
 * message du fil. Une projection qui oublie `type` rend `types: ''` — le
 * client retombe alors, fail-safe, sur la seule révocation par notification.
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
import { retractReactionNotifications } from '../../../services/notifications/retractReactionNotifications';
import { retractMessageNotifications } from '../../../services/messaging/retractMessageNotifications';

const AUTHOR_ID = '64a000000000000000000001';
const MENTIONED_ID = '64a000000000000000000002';
const REPLIED_ID = '64a000000000000000000003';
const REACTOR_ID = '64a000000000000000000004';
const OTHER_REACTOR_ID = '64a000000000000000000005';
const MESSAGE_ID = '507f1f77bcf86cd799439011';
const CONVERSATION_ID = '507f1f77bcf86cd799439021';
const NOTIF_ID = '64d000000000000000000004';

const flushAsync = () => new Promise((resolve) => setImmediate(resolve));

type PushCall = { userId: string; payload: { silent?: boolean; data: Record<string, string> }; types: string[]; bypassDnd?: boolean };

function makeRawNotification(overrides: Record<string, unknown> = {}) {
  return {
    id: NOTIF_ID,
    userId: AUTHOR_ID,
    type: 'new_message',
    priority: 'normal',
    title: null,
    subtitle: null,
    content: 'Hello',
    context: { conversationId: CONVERSATION_ID, messageId: MESSAGE_ID },
    metadata: {},
    isRead: false,
    readAt: null,
    createdAt: new Date('2026-08-04T09:00:00Z'),
    expiresAt: null,
    delivery: { emailSent: false, pushSent: true },
    ...overrides,
  };
}

describe('NotificationService — push de révocation des bannières déjà livrées', () => {
  let service: NotificationService;
  let prisma: any;
  let mockIO: any;
  let sendToUser: jest.Mock<any>;

  const pushCalls = (): PushCall[] => sendToUser.mock.calls.map((call: any[]) => call[0]);
  const pushTo = (userId: string): PushCall | undefined => pushCalls().find((call) => call.userId === userId);
  const revocationTo = (userId: string): PushCall | undefined =>
    pushCalls().find((call) => call.userId === userId && call.payload.data.type === 'notification_revoked');

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = new PrismaClient();
    service = new NotificationService(prisma);

    mockIO = { to: jest.fn().mockReturnThis(), emit: jest.fn() };
    service.setSocketIO(mockIO, new Map());
    sendToUser = jest.fn<any>().mockResolvedValue([]);
    service.setPushNotificationService({ sendToUser } as never);

    prisma.notification.count.mockResolvedValue(0);
    prisma.notification.deleteMany.mockResolvedValue({ count: 1 });
  });

  describe('retrait d’une réaction (unlike, emoji retiré)', () => {
    /**
     * Le double rend les lignes de la base filtrées par acteur, comme Mongo le
     * ferait : la réaction d'un TIERS au même message ne matche pas, et son
     * destinataire ne doit recevoir aucun push.
     */
    const seedReactionRows = (rows: Array<{ id: string; userId: string; actorId: string }>) => {
      prisma.$runCommandRaw.mockImplementation(async (command: any) => ({
        cursor: {
          firstBatch: rows
            .filter((row) => row.actorId === command.filter['actor.id'])
            .map((row) => ({
              _id: { $oid: row.id },
              userId: { $oid: row.userId },
              type: 'message_reaction',
              context: { conversationId: CONVERSATION_ID },
              delivery: { pushSent: true },
            })),
        },
      }));
    };

    it('pousse UN notification_revoked au destinataire, avec l’id et la conversation de la ligne', async () => {
      seedReactionRows([{ id: NOTIF_ID, userId: AUTHOR_ID, actorId: REACTOR_ID }]);

      await retractReactionNotifications(
        prisma,
        { subject: { kind: 'message', id: MESSAGE_ID }, actorId: REACTOR_ID, emoji: '❤️' },
        service
      );
      await flushAsync();

      expect(sendToUser).toHaveBeenCalledTimes(1);
      expect(pushTo(AUTHOR_ID)).toEqual(
        expect.objectContaining({
          payload: expect.objectContaining({
            silent: true,
            data: {
              type: 'notification_revoked',
              notificationIds: NOTIF_ID,
              conversationIds: CONVERSATION_ID,
              types: 'message_reaction',
            },
          }),
          types: ['apns', 'fcm'],
          bypassDnd: true,
        })
      );
    });

    it('ne pousse rien chez un tiers dont la réaction reste en place', async () => {
      seedReactionRows([
        { id: NOTIF_ID, userId: AUTHOR_ID, actorId: REACTOR_ID },
        { id: '64d000000000000000000005', userId: MENTIONED_ID, actorId: OTHER_REACTOR_ID },
      ]);

      await retractReactionNotifications(
        prisma,
        { subject: { kind: 'message', id: MESSAGE_ID }, actorId: REACTOR_ID, emoji: '❤️' },
        service
      );
      await flushAsync();

      expect(pushCalls().map((call) => call.userId)).toEqual([AUTHOR_ID]);
    });
  });

  describe('suppression d’un message qui mentionnait A et répondait à B', () => {
    it('pousse un notification_revoked à CHACUN des deux destinataires', async () => {
      prisma.notification.findMany.mockResolvedValue([
        { id: 'n-mention', userId: MENTIONED_ID, type: 'user_mentioned', context: { conversationId: CONVERSATION_ID }, delivery: { pushSent: true } },
        { id: 'n-reply', userId: REPLIED_ID, type: 'message_reply', context: { conversationId: CONVERSATION_ID }, delivery: { pushSent: true } },
      ]);

      await retractMessageNotifications(prisma, MESSAGE_ID, service);
      await flushAsync();

      expect(sendToUser).toHaveBeenCalledTimes(2);
      expect(pushTo(MENTIONED_ID)?.payload.data).toEqual({
        type: 'notification_revoked',
        notificationIds: 'n-mention',
        conversationIds: CONVERSATION_ID,
        types: 'user_mentioned',
      });
      expect(pushTo(REPLIED_ID)?.payload.data).toEqual({
        type: 'notification_revoked',
        notificationIds: 'n-reply',
        conversationIds: CONVERSATION_ID,
        types: 'message_reply',
      });
    });
  });

  describe('deleteNotification — le geste unitaire', () => {
    it('révoque la bannière sur les autres appareils du même utilisateur', async () => {
      prisma.notification.findUnique.mockResolvedValue({
        userId: AUTHOR_ID,
        type: 'new_message',
        context: { conversationId: CONVERSATION_ID },
        delivery: { pushSent: true },
      });
      prisma.notification.delete.mockResolvedValue({});

      await service.deleteNotification(NOTIF_ID);
      await flushAsync();

      expect(mockIO.emit).toHaveBeenCalledWith('notification:deleted', { notificationId: NOTIF_ID });
      expect(pushTo(AUTHOR_ID)?.payload.data).toEqual({
        type: 'notification_revoked',
        notificationIds: NOTIF_ID,
        conversationIds: CONVERSATION_ID,
        types: 'new_message',
      });
    });

    it('ne pousse rien quand la suppression échoue', async () => {
      prisma.notification.findUnique.mockResolvedValue({ userId: AUTHOR_ID, context: {} });
      prisma.notification.delete.mockRejectedValue(new Error('gone'));

      await service.deleteNotification(NOTIF_ID);
      await flushAsync();

      expect(sendToUser).not.toHaveBeenCalled();
    });
  });

  /**
   * Éditer un message, un post ou un commentaire « annule la notification
   * envoyée et envoie la nouvelle version » : les trois passent par ce hub
   * (`reproduceEditedMessageNotifications`, `reproduceEditedSubjectNotifications`).
   * Le socket ne suffit pas — un destinataire dont l'app est tuée perdrait la
   * bannière sans rien recevoir à la place.
   */
  describe('announceNotificationsReproduced — contenu réécrit', () => {
    it('révoque la bannière PÉRIMÉE de chaque ligne reproduite', async () => {
      prisma.notification.findUnique.mockResolvedValue(makeRawNotification());

      await service.announceNotificationsReproduced([{ id: NOTIF_ID, userId: AUTHOR_ID }]);
      await service.flushPendingRevocations();

      expect(mockIO.emit).toHaveBeenCalledWith('notification:deleted', { notificationId: NOTIF_ID });
      expect(mockIO.emit).toHaveBeenCalledWith('notification:new', expect.objectContaining({ id: NOTIF_ID }));
      expect(revocationTo(AUTHOR_ID)?.payload.data).toEqual({
        type: 'notification_revoked',
        notificationIds: NOTIF_ID,
        conversationIds: CONVERSATION_ID,
        types: 'new_message',
      });
    });

    it('pousse ENSUITE la nouvelle version, en push NOMINAL visible', async () => {
      prisma.notification.findUnique.mockResolvedValue(
        makeRawNotification({ content: 'Rendez-vous à 18h finalement' })
      );

      await service.announceNotificationsReproduced([{ id: NOTIF_ID, userId: AUTHOR_ID }]);
      await service.flushPendingRevocations();

      const calls = pushCalls();
      expect(calls).toHaveLength(2);
      // L'ORDRE est la règle : les deux charges nomment la MÊME notification,
      // et les clients indexent leur bannière par cette identité. Une
      // révocation qui arriverait après le remplacement l'effacerait.
      expect(calls[0].payload.data.type).toBe('notification_revoked');

      const replacement = calls[1];
      expect(replacement.userId).toBe(AUTHOR_ID);
      expect(replacement.types).toEqual(['apns', 'fcm']);
      expect(replacement.payload.body).toBe('Rendez-vous à 18h finalement');
      expect(replacement.payload.data.notificationId).toBe(NOTIF_ID);
      expect(replacement.payload.data.conversationId).toBe(CONVERSATION_ID);
      // Du CONTENU, pas un signal de contrôle : ni silencieux, ni au-dessus des
      // préférences — `PushNotificationService` applique DND et `pushEnabled`.
      expect(replacement.payload.silent).toBeUndefined();
      expect(replacement.bypassDnd).toBeUndefined();
    });

    it('ne pousse aucun remplacement pour une ligne disparue entre la réécriture et l’annonce', async () => {
      prisma.notification.findUnique.mockResolvedValue(null);

      await service.announceNotificationsReproduced([{ id: NOTIF_ID, userId: AUTHOR_ID }]);
      await service.flushPendingRevocations();

      expect(pushCalls().filter((call) => call.payload.data.type !== 'notification_revoked')).toEqual([]);
    });

    it('un remplacement qui échoue n’annule pas la révocation déjà partie', async () => {
      prisma.notification.findUnique.mockResolvedValue(makeRawNotification());
      sendToUser.mockImplementation(async (options: any) =>
        options.payload.data.type === 'notification_revoked'
          ? []
          : Promise.reject(new Error('apns down'))
      );

      await expect(
        service.announceNotificationsReproduced([{ id: NOTIF_ID, userId: AUTHOR_ID }])
      ).resolves.toBeUndefined();
      await expect(service.flushPendingRevocations()).resolves.toBeUndefined();

      expect(revocationTo(AUTHOR_ID)).toBeDefined();
    });
  });

  /**
   * `retractPostNotifications` draine l'audience d'un post — qu'il chiffre à
   * 40 000 lignes — par lots de 200, et documente que « le pic reste celui d'un
   * seul lot quelle que soit la taille de l'audience ». Le hub ne peut pas
   * ATTENDRE la révocation (elle parle à APNs derrière un disjoncteur, et son
   * appelant répond à un geste), mais il ne doit pas non plus la lâcher en
   * rafale : chaque annonce s'enchaîne sur la précédente.
   */
  describe('le pic de la révocation reste celui d’un seul envoi', () => {
    it('enchaîne les annonces successives au lieu de les lancer en parallèle', async () => {
      let inFlight = 0;
      let peak = 0;
      sendToUser.mockImplementation(async () => {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        await new Promise((resolve) => setImmediate(resolve));
        inFlight -= 1;
        return [];
      });

      const batch = (prefix: string) =>
        Array.from({ length: 4 }, (_, index) => ({
          id: `${prefix}-${index}`,
          userId: `user-${prefix}-${index}`,
          pushSent: true,
        }));

      await service.announceNotificationsRetracted(batch('a'));
      await service.announceNotificationsRetracted(batch('b'));
      await service.announceNotificationsRetracted(batch('c'));
      await service.flushPendingRevocations();

      expect(sendToUser).toHaveBeenCalledTimes(12);
      expect(peak).toBe(1);
    });
  });

  describe('le push est un effet du retrait, jamais sa condition', () => {
    it('un transport en panne n’empêche ni l’annonce socket ni le retour du retrait', async () => {
      sendToUser.mockRejectedValue(new Error('apns down'));
      prisma.notification.findMany.mockResolvedValue([
        { id: 'n-mention', userId: MENTIONED_ID, context: { conversationId: CONVERSATION_ID }, delivery: { pushSent: true } },
      ]);

      await expect(retractMessageNotifications(prisma, MESSAGE_ID, service)).resolves.toBeUndefined();
      await flushAsync();

      expect(mockIO.emit).toHaveBeenCalledWith('notification:deleted', { notificationId: 'n-mention' });
      expect(sendToUser).toHaveBeenCalledTimes(1);
    });

    it('un service sans transport câblé retire et annonce quand même', async () => {
      const offline = new NotificationService(prisma);
      offline.setSocketIO(mockIO, new Map());
      prisma.notification.findMany.mockResolvedValue([
        { id: 'n-mention', userId: MENTIONED_ID, context: {} },
      ]);

      await expect(retractMessageNotifications(prisma, MESSAGE_ID, offline)).resolves.toBeUndefined();
      await flushAsync();

      expect(mockIO.emit).toHaveBeenCalledWith('notification:deleted', { notificationId: 'n-mention' });
    });
  });
});
