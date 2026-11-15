/**
 * #14669 — la charge push d'un message dit le RÉGIME de sa conversation.
 *
 * Le client iOS (`NotificationReplyRegime.pushedModeKeys`) lit
 * `conversationEncryptionMode` dans `userInfo` pour fermer une réponse rapide
 * sans aller-retour ; aucun producteur ne la posait, donc chaque réponse rapide
 * payait la relecture de la conversation et tombait en régime non confirmé dès
 * que le réseau manquait.
 *
 * La clé QUALIFIE la bannière sans composer aucune chaîne (cycle 126) : elle
 * doit voyager sur les TROIS éventails — message, réponse, mention, et le relais
 * de mentions qui RÉPAND. Elle vient de la lecture de conversation que chaque
 * créateur faisait déjà (aucune requête de plus), et elle est absente pour le
 * clair : rien d'inventé.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';

import { NotificationService } from '../../../../services/notifications/NotificationService';

jest.mock('../../../../utils/logger-enhanced', () => ({
  notificationLogger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
  securityLogger: { logViolation: jest.fn() },
  enhancedLogger: { child: () => ({ info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() }) },
}));

const CONV_ID = '507f1f77bcf86cd799439022';
const MSG_ID = '507f1f77bcf86cd799439051';
const REPLIED_MSG_ID = '507f1f77bcf86cd799439052';
const SENDER_USER_ID = '507f1f77bcf86cd799439041';
const RECIPIENT_ID = '507f1f77bcf86cd799439043';
const OTHER_RECIPIENT_ID = '507f1f77bcf86cd799439044';

function makePrisma(conversationMode: string | null | undefined) {
  return {
    message: {
      findUnique: jest.fn<any>().mockResolvedValue({
        deletedAt: null,
        expiresAt: null,
        createdAt: new Date('2026-11-02T10:00:00Z'),
        messageType: 'text',
        translations: null,
        originalLanguage: 'fr',
      }),
    },
    notification: {
      create: jest.fn<any>().mockImplementation((args: any) => ({ id: 'notif_created', ...args.data })),
      findMany: jest.fn<any>(),
      findUnique: jest.fn<any>(),
      update: jest.fn<any>(),
      updateMany: jest.fn<any>(),
      delete: jest.fn<any>(),
      deleteMany: jest.fn<any>(),
      count: jest.fn<any>().mockResolvedValue(0),
    },
    user: {
      findUnique: jest.fn<any>().mockImplementation(({ where }: any) =>
        Promise.resolve(
          where?.id === SENDER_USER_ID
            ? { id: SENDER_USER_ID, username: 'alice', displayName: 'Alice', avatar: null }
            : { id: where?.id, username: 'bob', displayName: 'Bob', avatar: null, systemLanguage: 'fr' }
        )
      ),
      findMany: jest.fn<any>().mockResolvedValue([]),
    },
    conversation: {
      findUnique: jest.fn<any>().mockResolvedValue({
        title: 'Salon',
        type: 'group',
        avatar: null,
        ...(conversationMode === undefined ? {} : { encryptionMode: conversationMode }),
      }),
    },
    userPreferences: { findUnique: jest.fn<any>().mockResolvedValue(null) },
    userConversationPreferences: { findMany: jest.fn<any>().mockResolvedValue([]) },
  } as any;
}

function makeService(conversationMode: string | null | undefined) {
  const prisma = makePrisma(conversationMode);
  const sendToUser = jest.fn<any>().mockResolvedValue(undefined);
  const service = new NotificationService(prisma);
  service.setSocketIO({
    to: jest.fn<any>().mockReturnThis(),
    in: jest.fn<any>().mockReturnThis(),
    fetchSockets: jest.fn<any>().mockResolvedValue([]),
    emit: jest.fn<any>(),
  } as any);
  service.setPushNotificationService({ sendToUser } as any);
  return { service, sendToUser, prisma };
}

const servedPushData = (sendToUser: any, call = 0): Record<string, any> | undefined =>
  sendToUser.mock.calls[call]?.[0]?.payload?.data;

const runners = [
  [
    'createMessageNotification',
    (service: NotificationService) =>
      service.createMessageNotification({
        recipientUserId: RECIPIENT_ID,
        senderId: SENDER_USER_ID,
        messageId: MSG_ID,
        conversationId: CONV_ID,
        messagePreview: 'Bonjour',
      } as any),
  ],
  [
    'createReplyNotification',
    (service: NotificationService) =>
      service.createReplyNotification({
        recipientUserId: RECIPIENT_ID,
        replierUserId: SENDER_USER_ID,
        messageId: MSG_ID,
        conversationId: CONV_ID,
        messagePreview: 'Bonjour',
        originalMessageId: REPLIED_MSG_ID,
      } as any),
  ],
  [
    'createMentionNotification',
    (service: NotificationService) =>
      service.createMentionNotification({
        mentionedUserId: RECIPIENT_ID,
        mentionerUserId: SENDER_USER_ID,
        messageId: MSG_ID,
        conversationId: CONV_ID,
        messagePreview: 'Bonjour',
      } as any),
  ],
] as const;

describe.each(runners)('%s — le régime de la conversation voyage sur le fil', (_name, run) => {
  it.each(['e2ee', 'server', 'hybrid'])('une conversation %s le dit dans la charge push', async (mode) => {
    const { service, sendToUser } = makeService(mode);

    await run(service);

    expect(servedPushData(sendToUser)?.conversationEncryptionMode).toBe(mode);
  });

  it.each([null, '', undefined])('une conversation en clair (%j) ne pose AUCUNE clé', async (mode) => {
    const { service, sendToUser } = makeService(mode);

    await run(service);

    const data = servedPushData(sendToUser);
    expect(data).toBeDefined();
    expect(data).not.toHaveProperty('conversationEncryptionMode');
  });

  it('vient de la lecture de conversation que ce créateur faisait DÉJÀ', async () => {
    const { service, prisma } = makeService('e2ee');

    await run(service);

    expect(prisma.conversation.findUnique).toHaveBeenCalledTimes(1);
    expect(prisma.conversation.findUnique.mock.calls[0][0].select.encryptionMode).toBe(true);
  });

  it('voyage aussi en mode privé : le régime ne révèle aucun contenu', async () => {
    const { service, sendToUser, prisma } = makeService('e2ee');
    prisma.userPreferences.findUnique.mockResolvedValue({ notification: { showPreview: false } });

    await run(service);

    const data = servedPushData(sendToUser);
    expect(data).not.toHaveProperty('encryptedContent');
    expect(data?.conversationEncryptionMode).toBe('e2ee');
  });

  it('ne porte que le mode — aucun champ de conversation de plus', async () => {
    const { service, sendToUser, prisma } = makeService('e2ee');
    prisma.conversation.findUnique.mockResolvedValue({
      title: 'Salon',
      type: 'group',
      avatar: null,
      encryptionMode: 'e2ee',
      serverEncryptionKeyId: 'cle-secrete-du-serveur',
    });

    await run(service);

    expect(JSON.stringify(servedPushData(sendToUser))).not.toContain('cle-secrete-du-serveur');
  });
});

describe('createMentionNotificationsBatch — le relais RÉPAND le régime à chaque mentionné', () => {
  it('deux mentionnés ⇒ deux charges qui portent le mode, sans lecture de plus par destinataire', async () => {
    const { service, sendToUser, prisma } = makeService('e2ee');

    await service.createMentionNotificationsBatch(
      [RECIPIENT_ID, OTHER_RECIPIENT_ID],
      {
        senderId: SENDER_USER_ID,
        messageContent: 'Coucou vous deux',
        conversationId: CONV_ID,
        messageId: MSG_ID,
      } as any,
      [RECIPIENT_ID, OTHER_RECIPIENT_ID, SENDER_USER_ID]
    );

    expect(sendToUser).toHaveBeenCalledTimes(2);
    expect(servedPushData(sendToUser, 0)?.conversationEncryptionMode).toBe('e2ee');
    expect(servedPushData(sendToUser, 1)?.conversationEncryptionMode).toBe('e2ee');
    expect(prisma.conversation.findUnique).toHaveBeenCalledTimes(2);
  });
});
