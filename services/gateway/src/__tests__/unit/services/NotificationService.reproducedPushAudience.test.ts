/**
 * #18910 (serveur-notifications-4) — qui re-sonne quand une notification est
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

describe('announceNotificationsReproduced — qui re-sonne (#18910)', () => {
  let service: NotificationService;
  let prisma: any;
  let io: { to: jest.Mock<any>; emit: jest.Mock<any> };
  let sendToUser: jest.Mock<any>;

  const pushCalls = (): PushCall[] => sendToUser.mock.calls.map((call: any[]) => call[0]);
  const alerts = () => pushCalls().filter((call) => call.payload.data.type !== 'notification_revoked');
  const revocations = () => pushCalls().filter((call) => call.payload.data.type === 'notification_revoked');

  const announce = async () => {
    await service.announceNotificationsReproduced([{ id: NOTIF_ID, userId: RECIPIENT_ID }]);
    await service.flushPendingRevocations();
  };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = new PrismaClient();
    service = new NotificationService(prisma);
    io = { to: jest.fn<any>().mockReturnThis(), emit: jest.fn<any>() };
    service.setSocketIO(io as never, new Map());
    sendToUser = jest.fn<any>().mockResolvedValue([{ success: true, tokenId: 'token-1' }]);
    service.setPushNotificationService({ sendToUser } as never);
    prisma.notification.count.mockResolvedValue(0);
    prisma.userPreferences.findUnique.mockResolvedValue(null);
    prisma.userConversationPreferences.findMany.mockResolvedValue([]);
  });

  it('une ligne déjà LUE : le couple deleted + new part, aucun push d’alerte, la bannière périmée est révoquée en silence', async () => {
    prisma.notification.findUnique.mockResolvedValue(row({ isRead: true, readAt: new Date() }));

    await announce();

    expect(io.emit).toHaveBeenCalledWith('notification:deleted', { notificationId: NOTIF_ID });
    expect(io.emit).toHaveBeenCalledWith('notification:new', expect.objectContaining({ id: NOTIF_ID }));
    expect(alerts()).toEqual([]);
    expect(revocations()).toHaveLength(1);
    expect(revocations()[0].payload.data.notificationIds).toBe(NOTIF_ID);
  });

  it('une ligne JAMAIS poussée : rien ne part vers les appareils, ni alerte ni révocation', async () => {
    prisma.notification.findUnique.mockResolvedValue(row({ delivery: { emailSent: false, pushSent: false } }));

    await announce();

    expect(io.emit).toHaveBeenCalledWith('notification:new', expect.objectContaining({ id: NOTIF_ID }));
    expect(pushCalls()).toEqual([]);
  });

  it('une ligne non lue dont la conversation a été mise en SOURDINE depuis : pas d’alerte, la bannière périmée est révoquée', async () => {
    prisma.notification.findUnique.mockResolvedValue(row());
    prisma.userConversationPreferences.findMany.mockResolvedValue([{ userId: RECIPIENT_ID }]);

    await announce();

    expect(alerts()).toEqual([]);
    expect(revocations()).toHaveLength(1);
  });

  it('une ligne non lue, poussée, audible : le remplacement part, il annonce la bannière qu’il annule', async () => {
    prisma.notification.findUnique.mockResolvedValue(row());

    await announce();

    expect(alerts()).toHaveLength(1);
    expect(alerts()[0].payload.data[REPLACES_NOTIFICATION_FIELD]).toBe(NOTIF_ID);
    expect(revocations()).toEqual([]);
  });

  it('une ligne sans conversation (post) non lue et poussée : le remplacement part, la sourdine ne la concerne pas', async () => {
    prisma.notification.findUnique.mockResolvedValue(
      row({ type: 'friend_new_post', context: { postId: '507f1f77bcf86cd799439031' } })
    );

    await announce();

    expect(alerts()).toHaveLength(1);
    expect(prisma.userConversationPreferences.findMany).not.toHaveBeenCalled();
  });

  it('une ligne de post LUE : pas d’alerte non plus — le post déjà ouvert ne re-sonne pas chez 200 amis', async () => {
    prisma.notification.findUnique.mockResolvedValue(
      row({ type: 'friend_new_post', context: { postId: '507f1f77bcf86cd799439031' }, isRead: true })
    );

    await announce();

    expect(alerts()).toEqual([]);
  });

  it('un lot mixte : seule la ligne non lue reçoit l’alerte', async () => {
    const unread = row({ id: '64d000000000000000000010', userId: '64a000000000000000000010' });
    const read = row({ id: '64d000000000000000000011', userId: '64a000000000000000000011', isRead: true });
    prisma.notification.findUnique.mockImplementation(async ({ where }: any) =>
      where.id === unread.id ? unread : read
    );

    await service.announceNotificationsReproduced([
      { id: unread.id, userId: unread.userId },
      { id: read.id, userId: read.userId },
    ]);
    await service.flushPendingRevocations();

    expect(alerts().map((call) => call.userId)).toEqual([unread.userId]);
    expect(revocations().map((call) => call.userId)).toEqual([read.userId]);
  });
});
