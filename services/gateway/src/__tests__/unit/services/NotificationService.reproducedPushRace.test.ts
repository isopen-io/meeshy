/**
 * #18910 (serveur-notifications-4), #19211, #19212 — qui re-sonne quand une notification est
 * réécrite par l'édition de son contenu.
 *
 * `announceNotificationsReproduced` garde le couple `notification:deleted` +
 * `notification:new` et les compteurs POUR TOUTES les lignes (les clients
 * recalent leur liste). Ce que ce lot retient, c'est le PUSH d'alerte : titre,
 * corps, son. Un push de remplacement n'a de sens que pour une bannière que
 * l'utilisateur n'a pas encore consommée, qui a bien été poussée, et que la
 * conversation n'a pas fait taire depuis.
 *
 *  - ligne LUE, déjà poussée  : la bannière d'avant porte un texte périmé, elle
 *    est révoquée en silence, rien ne sonne ;
 *  - ligne JAMAIS poussée     : aucune bannière n'existe, rien ne part ;
 *  - ligne non lue, poussée, conversation en sourdine : révocation silencieuse ;
 *  - ligne non lue, poussée, audible : le remplacement part, inchangé.
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
    userPreferences: { findUnique: jest.fn() },
    user: { findUnique: jest.fn(async () => ({ systemLanguage: 'fr' })) },
    userConversationPreferences: { findMany: jest.fn() },
    $runCommandRaw: jest.fn(),
  };
  return { PrismaClient: jest.fn(() => mockPrisma) };
});

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { PrismaClient } from '@meeshy/shared/prisma/client';
import { NotificationService } from '../../../services/notifications/NotificationService';
import { REPLACES_NOTIFICATION_FIELD } from '@meeshy/shared/types/reproduced-notification-push';

const RECIPIENT_ID = '64a000000000000000000001';
const CONVERSATION_ID = '507f1f77bcf86cd799439021';
const MESSAGE_ID = '507f1f77bcf86cd799439011';
const NOTIF_ID = '64d000000000000000000004';

type PushCall = { userId: string; payload: { title?: string; body?: string; silent?: boolean; data: Record<string, string> } };

const row = (overrides: Record<string, unknown> = {}) => ({
  id: NOTIF_ID,
  userId: RECIPIENT_ID,
  type: 'new_message',
  priority: 'normal',
  title: null,
  subtitle: null,
  content: 'Petit message texte',
  context: { conversationId: CONVERSATION_ID, messageId: MESSAGE_ID },
  metadata: {},
  isRead: false,
  readAt: null,
  createdAt: new Date('2026-11-17T09:00:00Z'),
  expiresAt: null,
  delivery: { emailSent: false, pushSent: true },
  ...overrides,
});

describe('#19211, #19212 — le remplacement d’une bannière réécrite se juge sur la ligne RELUE avant l’envoi', () => {
  let service: NotificationService;
  let prisma: any;
  let io: { to: jest.Mock<any>; emit: jest.Mock<any> };
  let sendToUser: jest.Mock<any>;
  const order: string[] = [];

  beforeEach(() => {
    jest.clearAllMocks();
    order.length = 0;
    prisma = new PrismaClient();
    service = new NotificationService(prisma);
    io = { to: jest.fn<any>().mockReturnThis(), emit: jest.fn<any>() };
    service.setSocketIO(io as never, new Map());
    sendToUser = jest.fn<any>(async (options: any) => {
      order.push(options.payload.data.type === 'notification_revoked' ? 'revocation' : 'alert');
      return [{ success: true, tokenId: 'token-1' }];
    });
    service.setPushNotificationService({ sendToUser } as never);
    prisma.notification.count.mockResolvedValue(0);
    prisma.userPreferences.findUnique.mockResolvedValue(null);
    prisma.userConversationPreferences.findMany.mockResolvedValue([]);
  });

  it('une MENTION dans une conversation en sourdine perce la sourdine : son édition la remplace, elle ne la retire pas', async () => {
    prisma.notification.findUnique.mockResolvedValue(row({ type: 'user_mentioned' }));
    prisma.userConversationPreferences.findMany.mockResolvedValue([{ userId: RECIPIENT_ID }]);

    await service.announceNotificationsReproduced([{ id: NOTIF_ID, userId: RECIPIENT_ID }]);
    await service.flushPendingRevocations();

    expect(order).toEqual(['alert']);
  });

  it('une ligne LUE entre l’annonce et l’envoi ne doit pas re-sonner, ni rester affichée', async () => {
    let read = false;
    prisma.notification.findUnique.mockImplementation(async () => row({ isRead: read }));
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    prisma.userPreferences.findUnique.mockImplementation(async () => { await gate; return null; });
    prisma.$runCommandRaw.mockImplementation(async (command: any) => {
      if (command.find) {
        return { cursor: { firstBatch: [{ _id: { $oid: NOTIF_ID }, type: 'new_message', context: { conversationId: CONVERSATION_ID }, delivery: { pushSent: true } }] } };
      }
      read = true;
      return { nModified: 1 };
    });

    await service.announceNotificationsReproduced([{ id: NOTIF_ID, userId: RECIPIENT_ID }]);
    // La file `bulk` est occupée (APNs lent, audience d’un post…) ; le destinataire lit la conversation sur le web.
    await service.markConversationNotificationsAsRead(RECIPIENT_ID, CONVERSATION_ID);
    await new Promise((r) => setTimeout(r, 20));
    release();
    await service.flushPendingRevocations();

    // Ce que la passerelle envoie : la révocation (file du compte) PUIS l’alerte (file bulk) — la bannière d’un
    // message LU revient, avec son, et plus rien ne la retire.
    expect(order).not.toEqual(['revocation', 'alert']);
    expect(order).not.toContain('alert');
    expect(order).toContain('revocation');
  });

  it('une lecture enfilée PENDANT l’envoi du remplacement part après lui, sur la même file : la bannière posée est retirée', async () => {
    prisma.notification.findUnique.mockResolvedValue(row());
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    sendToUser.mockImplementation(async (options: any) => {
      const kind = options.payload.data.type === 'notification_revoked' ? 'revocation' : 'alert';
      if (kind === 'alert') await gate;
      order.push(kind);
      return [{ success: true, tokenId: 'token-1' }];
    });
    prisma.$runCommandRaw.mockImplementation(async (command: any) => command.find
      ? { cursor: { firstBatch: [{ _id: { $oid: NOTIF_ID }, type: 'new_message', context: { conversationId: CONVERSATION_ID }, delivery: { pushSent: true } }] } }
      : { nModified: 1 });

    await service.announceNotificationsReproduced([{ id: NOTIF_ID, userId: RECIPIENT_ID }]);
    await new Promise((r) => setTimeout(r, 20));
    await service.markConversationNotificationsAsRead(RECIPIENT_ID, CONVERSATION_ID);
    await new Promise((r) => setTimeout(r, 20));
    release();
    await service.flushPendingRevocations();

    expect(order).toEqual(['alert', 'revocation']);
  });

  it('sous « Masquer le nom de l’expéditeur », le remplacement ne nomme l’acteur ni au titre, ni au corps, ni au sous-titre', async () => {
    prisma.notification.findUnique.mockResolvedValue(row({
      type: 'story_thread_reply',
      context: { postId: '507f1f77bcf86cd799439015' },
      content: 'Alice Martin a répondu',
      subtitle: 'Une story de Alice Martin',
      actor: { id: '64a000000000000000000009', username: 'alice', displayName: 'Alice Martin', avatar: null },
    }));
    prisma.userPreferences.findUnique.mockResolvedValue({ notification: { showSenderName: false } });

    await service.announceNotificationsReproduced([{ id: NOTIF_ID, userId: RECIPIENT_ID }]);
    await service.flushPendingRevocations();

    const alert = (sendToUser.mock.calls as Array<[PushCall & { payload: { subtitle?: string } }]>)
      .map(([call]) => call.payload)
      .find((payload) => payload.data.type !== 'notification_revoked');
    expect(alert?.title).toBe('Meeshy');
    expect(alert?.body ?? '').not.toContain('Alice Martin');
    expect(alert?.subtitle ?? '').not.toContain('Alice Martin');
  });
});
