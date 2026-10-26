/**
 * #13165 — la réponse rapide d'une conversation passée chiffrée de bout en bout
 * sur un autre appareil ne doit jamais partir en clair. iOS ne sait du régime
 * que ce que l'appareil a vu ; le push est souvent la première chose qui lui
 * parvient après le réveil. Le fil push porte donc le MODE DE LA CONVERSATION
 * (`encryptionMode`), sur les trois éventails, y compris quand l'aperçu est
 * masqué : le mode ne dit rien du contenu.
 *
 * `notificationLocKey = notification.encrypted_message` ne suffit pas : il dit
 * `message.isEncrypted`, chiffrement au repos (`server`, `hybrid`) compris.
 *
 * Rétrocompatible : un champ AJOUTÉ, absent quand la conversation n'a pas de
 * mode, jamais un champ retiré.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';

import { notifyMessageRecipients } from '../../../../services/messaging/messageNotificationFanOut';
import { NotificationService } from '../../../../services/notifications/NotificationService';

jest.mock('../../../../utils/logger-enhanced', () => ({
  notificationLogger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
  securityLogger: { logViolation: jest.fn() },
  enhancedLogger: { child: () => ({ info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() }) },
}));

const CONV_ID = '507f1f77bcf86cd799439022';
const MSG_ID = '507f1f77bcf86cd799439051';
const REPLIED_MSG_ID = '507f1f77bcf86cd799439052';
const SENDER_PART_ID = '507f1f77bcf86cd799439031';
const PEER_PART_ID = '507f1f77bcf86cd799439032';
const SENDER_USER_ID = '507f1f77bcf86cd799439041';
const PEER_USER_ID = '507f1f77bcf86cd799439042';
const THIRD_USER_ID = '507f1f77bcf86cd799439044';
const FOURTH_USER_ID = '507f1f77bcf86cd799439045';
const RECIPIENT_ID = '507f1f77bcf86cd799439043';

const SERVER_CLOCK = new Date('2026-08-24T10:00:00Z');

// ── Éventail — ce que les trois lots reçoivent ─────────────────────────────

const photoAttachment = (overrides: Record<string, unknown> = {}) => ({
  mimeType: 'image/jpeg',
  fileName: 'plage.jpg',
  fileSize: 240_000,
  duration: null,
  width: 1024,
  height: 768,
  fileUrl: 'https://cdn.example/photo/plage.jpg',
  transcription: null,
  translations: null,
  isViewOnce: false,
  isBlurred: false,
  effectFlags: 0,
  ...overrides,
});

function makePrisma(conversationMode: string | null) {
  return {
    participant: {
      findUnique: jest.fn<any>().mockImplementation(({ where }: any) =>
        Promise.resolve(
          where?.id === PEER_PART_ID
            ? { userId: PEER_USER_ID, displayName: 'Bob P', avatar: null }
            : { userId: SENDER_USER_ID, displayName: 'Alice P', avatar: null }
        )
      ),
    },
    user: {
      findUnique: jest
        .fn<any>()
        .mockResolvedValue({ username: 'alice', displayName: 'Alice', avatar: null }),
    },
    conversation: {
      findUnique: jest.fn<any>().mockResolvedValue({
        title: 'Salon',
        type: 'group',
        encryptionMode: conversationMode,
        participants: [
          { userId: SENDER_USER_ID },
          { userId: PEER_USER_ID },
          { userId: THIRD_USER_ID },
          { userId: FOURTH_USER_ID },
        ],
      }),
    },
    message: {
      findUnique: jest.fn<any>().mockResolvedValue({ senderId: PEER_PART_ID, deletedAt: null }),
    },
    notification: {
      findMany: jest.fn<any>().mockResolvedValue([]),
      deleteMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
    },
    messageAttachment: { findMany: jest.fn<any>().mockResolvedValue([photoAttachment()]) },
    userConversationPreferences: { findMany: jest.fn<any>().mockResolvedValue([]) },
  };
}

async function servedLots(conversationMode: string | null, messageOverrides: Record<string, unknown> = {}) {
  const createReplyNotification = jest.fn<any>().mockResolvedValue({ id: 'reply' });
  const createMentionNotificationsBatch = jest.fn<any>().mockResolvedValue(1);
  const createMessageNotification = jest.fn<any>().mockResolvedValue({ id: 'notif' });

  await notifyMessageRecipients({
    prisma: makePrisma(conversationMode) as any,
    notificationService: {
      createReplyNotification,
      createMentionNotificationsBatch,
      createMessageNotification,
    },
    message: {
      id: MSG_ID,
      messageType: 'image',
      replyToId: REPLIED_MSG_ID,
      isEncrypted: false,
      encryptionMode: null,
      isViewOnce: false,
      isBlurred: false,
      effectFlags: 0,
      expiresAt: null,
      createdAt: SERVER_CLOCK,
      encryptedContent: null,
      ...messageOverrides,
    } as any,
    senderParticipantId: SENDER_PART_ID,
    conversationId: CONV_ID,
    processedContent: '',
    validatedMentionUserIds: [THIRD_USER_ID],
  });

  return {
    reply: createReplyNotification.mock.calls[0]?.[0] as Record<string, unknown> | undefined,
    mention: createMentionNotificationsBatch.mock.calls[0]?.[1] as Record<string, unknown> | undefined,
    regular: createMessageNotification.mock.calls[0]?.[0] as Record<string, unknown> | undefined,
  };
}

describe('éventail — le mode de la conversation accompagne les trois lots', () => {
  it.each(['e2ee', 'server', 'hybrid'])('une conversation en mode %s le remet aux TROIS créateurs', async (mode) => {
    const { reply, mention, regular } = await servedLots(mode);

    expect(regular?.conversationEncryptionMode).toBe(mode);
    expect(reply?.conversationEncryptionMode).toBe(mode);
    expect(mention?.conversationEncryptionMode).toBe(mode);
  });

  it('une conversation sans mode ne remet rien', async () => {
    const { reply, mention, regular } = await servedLots(null);

    for (const lot of [regular, reply, mention]) {
      expect(lot?.conversationEncryptionMode).toBeUndefined();
    }
  });
});

// ── Service — la charge remise à APNs ──────────────────────────────────────

function makeServicePrisma(recipient: Record<string, unknown>) {
  return {
    message: {
      findUnique: jest.fn<any>().mockResolvedValue({
        deletedAt: null,
        expiresAt: null,
        isViewOnce: false,
        viewOnceCount: 0,
        createdAt: SERVER_CLOCK,
        messageType: 'image',
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
          where?.id === RECIPIENT_ID
            ? { id: RECIPIENT_ID, ...recipient }
            : { id: SENDER_USER_ID, username: 'alice', displayName: 'Alice', avatar: null }
        )
      ),
      findMany: jest.fn<any>().mockResolvedValue([]),
    },
    conversation: {
      findUnique: jest.fn<any>().mockResolvedValue({ title: 'Salon', type: 'group', avatar: null }),
    },
    userPreferences: { findUnique: jest.fn<any>().mockResolvedValue(null) },
    userConversationPreferences: { findMany: jest.fn<any>().mockResolvedValue([]) },
  } as any;
}

function makeService(recipient: Record<string, unknown> = { systemLanguage: 'fr' }) {
  const prisma = makeServicePrisma(recipient);
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

/** La charge réellement remise à APNs. */
const servedPushData = (sendToUser: any): Record<string, any> | undefined =>
  sendToUser.mock.calls[0]?.[0]?.payload?.data;

const runners = [
  [
    'createReplyNotification',
    (service: NotificationService, extra: Record<string, unknown>) =>
      service.createReplyNotification({
        recipientUserId: RECIPIENT_ID,
        replierUserId: SENDER_USER_ID,
        messageId: MSG_ID,
        conversationId: CONV_ID,
        messagePreview: 'Regarde ça',
        originalMessageId: REPLIED_MSG_ID,
        ...extra,
      } as any),
  ],
  [
    'createMentionNotification',
    (service: NotificationService, extra: Record<string, unknown>) =>
      service.createMentionNotification({
        mentionedUserId: RECIPIENT_ID,
        mentionerUserId: SENDER_USER_ID,
        messageId: MSG_ID,
        conversationId: CONV_ID,
        messagePreview: 'Regarde ça',
        ...extra,
      } as any),
  ],
] as const;

const creators = [
  [
    'createMessageNotification',
    (service: NotificationService, extra: Record<string, unknown>) =>
      service.createMessageNotification({
        recipientUserId: RECIPIENT_ID,
        senderId: SENDER_USER_ID,
        messageId: MSG_ID,
        conversationId: CONV_ID,
        messagePreview: 'Regarde ça',
        ...extra,
      } as any),
  ],
  [
    'createReplyNotification',
    (service: NotificationService, extra: Record<string, unknown>) =>
      service.createReplyNotification({
        recipientUserId: RECIPIENT_ID,
        replierUserId: SENDER_USER_ID,
        messageId: MSG_ID,
        conversationId: CONV_ID,
        messagePreview: 'Regarde ça',
        originalMessageId: REPLIED_MSG_ID,
        ...extra,
      } as any),
  ],
  [
    'createMentionNotification',
    (service: NotificationService, extra: Record<string, unknown>) =>
      service.createMentionNotification({
        mentionedUserId: RECIPIENT_ID,
        mentionerUserId: SENDER_USER_ID,
        messageId: MSG_ID,
        conversationId: CONV_ID,
        messagePreview: 'Regarde ça',
        ...extra,
      } as any),
  ],
] as const;

describe.each(creators)('%s — le mode voyage sur le fil push', (_name, run) => {
  it('porte `encryptionMode` quand la conversation en a un', async () => {
    const { service, sendToUser } = makeService();

    await run(service, { conversationEncryptionMode: 'e2ee', notificationLocKey: 'notification.encrypted_message', messagePreview: '🔒 💬' });

    expect(servedPushData(sendToUser)?.encryptionMode).toBe('e2ee');
  });

  it('le porte aussi quand l\'aperçu est masqué : le mode ne dit rien du contenu', async () => {
    const { service, sendToUser, prisma } = makeService();
    prisma.userPreferences.findUnique.mockResolvedValue({ notification: { showPreview: false } });

    await run(service, { conversationEncryptionMode: 'e2ee', notificationLocKey: 'notification.encrypted_message', messagePreview: '🔒 💬' });

    expect(servedPushData(sendToUser)?.encryptionMode).toBe('e2ee');
  });

  it('ne pose aucune clé pour une conversation sans mode', async () => {
    const { service, sendToUser } = makeService();

    await run(service, {});

    const data = servedPushData(sendToUser);
    expect(data).toBeDefined();
    expect(data).not.toHaveProperty('encryptionMode');
  });
});
