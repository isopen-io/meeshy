/**
 * Cycle 125 bis — répondre par un VOCAL poussait une bannière au corps VIDE.
 *
 * Suivi MESURÉ du cycle 124, laissé ouvert deux cycles : les éventails RÉPONSE
 * et MENTION composent depuis `notificationPreview` — jamais
 * `notificationPreviewForPush` — et ne reçoivent AUCUN `attachmentInfo`. Leur
 * corps est donc `Message.content`, **vide** pour un vocal ou une photo sans
 * légende ; et `createMessageNotification` est le seul des trois à passer par
 * `buildMessageNotificationBodyI18n`, le compositeur qui remplace un texte
 * absent par « 🎵 Audio · 0:07 ».
 *
 * Le résultat, sur un seul message :
 *
 *   | destinataire | ce qu'il voit |
 *   |---|---|
 *   | les membres du fil | la transcription, ou « 📷 Photo · 240 ko » |
 *   | **celui à qui on répond** | **rien** |
 *   | **celui qu'on mentionne** | **rien** |
 *
 * C'est le symptôme que les cycles 121 à 124 poursuivent — « deux textes pour
 * un même message » — dans sa forme extrême : le second texte est vide. Et le
 * repli client ne rattrape pas, mesuré : `NotificationPayloadHelpers.audioBodyFallback`
 * (NSE iOS) exige `attachmentMimeType`, que ces deux éventails ne poussent pas
 * non plus.
 *
 * Défaut d'OMISSION, distinct des quatre précédents : ni mauvais rang (121), ni
 * contenu résolu jamais affiché (122), ni fuite à côté (123), ni garde relâchée
 * (124/125) — un aperçu jamais composé.
 *
 * Les témoins portent sur ce que l'éventail REMET et sur le corps REMIS à APNs.
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
const ORIGINAL_MSG_ID = '507f1f77bcf86cd799439052';
const SENDER_PART_ID = '507f1f77bcf86cd799439031';
const ORIGINAL_PART_ID = '507f1f77bcf86cd799439032';
const SENDER_USER_ID = '507f1f77bcf86cd799439041';
const REPLIED_USER_ID = '507f1f77bcf86cd799439042';
const MENTIONED_USER_ID = '507f1f77bcf86cd799439043';
/** Le membre ORDINAIRE — celui dont la bannière sert de référence aux deux autres. */
const PLAIN_USER_ID = '507f1f77bcf86cd799439045';

const TRANSCRIPT = 'Salut, je te rappelle ce soir';

const audioAttachment = () => ({
  mimeType: 'audio/mp4',
  fileName: 'vocal.m4a',
  fileSize: 12_000,
  duration: 7,
  width: null,
  height: null,
  fileUrl: 'https://cdn.example/vocal.m4a',
  transcription: { text: TRANSCRIPT, language: 'fr' },
  translations: { es: { type: 'audio', transcription: 'Te llamo esta noche', createdAt: new Date() } },
  isViewOnce: false,
  isBlurred: false,
  effectFlags: 0,
});

// ── L'éventail — ce qu'il remet aux TROIS créateurs ─────────────────────────

function makeFanOutPrisma(attachments: unknown[]) {
  return {
    participant: {
      findUnique: jest.fn<any>().mockImplementation(({ where }: any) =>
        Promise.resolve(
          where?.id === ORIGINAL_PART_ID
            ? { userId: REPLIED_USER_ID, displayName: 'Bob P', avatar: null }
            : { userId: SENDER_USER_ID, displayName: 'Alice P', avatar: null }
        )
      ),
    },
    user: {
      findUnique: jest.fn<any>().mockResolvedValue({ username: 'alice', displayName: 'Alice', avatar: null }),
    },
    conversation: {
      findUnique: jest.fn<any>().mockResolvedValue({
        title: 'Salon',
        type: 'group',
        participants: [
          { userId: SENDER_USER_ID },
          { userId: REPLIED_USER_ID },
          { userId: MENTIONED_USER_ID },
          { userId: PLAIN_USER_ID },
        ],
      }),
    },
    message: {
      findUnique: jest.fn<any>().mockImplementation(({ where }: any) =>
        Promise.resolve(
          where?.id === ORIGINAL_MSG_ID
            ? { senderId: ORIGINAL_PART_ID }
            : { deletedAt: null }
        )
      ),
    },
    notification: {
      findMany: jest.fn<any>().mockResolvedValue([]),
      deleteMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
    },
    messageAttachment: { findMany: jest.fn<any>().mockResolvedValue(attachments) },
    userConversationPreferences: { findMany: jest.fn<any>().mockResolvedValue([]) },
  };
}

/** Ce que l'éventail remet à CHACUN de ses trois créateurs, pour un même message. */
async function servedByEachFanOut(): Promise<{
  regular: Record<string, unknown>;
  reply: Record<string, unknown>;
  mention: Record<string, unknown>;
}> {
  const createMessageNotification = jest.fn<any>().mockResolvedValue({ id: 'notif' });
  const createReplyNotification = jest.fn<any>().mockResolvedValue({ id: 'notif' });
  const createMentionNotificationsBatch = jest.fn<any>().mockResolvedValue(1);

  await notifyMessageRecipients({
    prisma: makeFanOutPrisma([audioAttachment()]) as any,
    notificationService: {
      createMessageNotification,
      createReplyNotification,
      createMentionNotificationsBatch,
    },
    message: {
      id: MSG_ID,
      messageType: 'audio',
      replyToId: ORIGINAL_MSG_ID,
      isEncrypted: false,
      encryptionMode: null,
      isViewOnce: false,
      isBlurred: false,
      effectFlags: 0,
      expiresAt: null,
      createdAt: new Date('2026-08-24T10:00:00Z'),
      encryptedContent: null,
    } as any,
    senderParticipantId: SENDER_PART_ID,
    conversationId: CONV_ID,
    processedContent: '',
    validatedMentionUserIds: [MENTIONED_USER_ID],
  });

  expect(createMessageNotification).toHaveBeenCalledTimes(1);
  expect(createReplyNotification).toHaveBeenCalledTimes(1);
  expect(createMentionNotificationsBatch).toHaveBeenCalledTimes(1);

  return {
    regular: createMessageNotification.mock.calls[0][0] as Record<string, unknown>,
    reply: createReplyNotification.mock.calls[0][0] as Record<string, unknown>,
    // Le batch prend (userIds, commonData, memberIds) — c'est `commonData` qui
    // porte l'aperçu.
    mention: createMentionNotificationsBatch.mock.calls[0][1] as Record<string, unknown>,
  };
}

describe('éventail — les TROIS bannières annoncent le MÊME message', () => {
  it('la RÉPONSE reçoit la transcription, comme le message simple', async () => {
    const { regular, reply } = await servedByEachFanOut();

    expect(regular.messagePreview).toBe(TRANSCRIPT);
    expect(reply.messagePreview).toBe(TRANSCRIPT);
  });

  it('la MENTION reçoit la transcription, comme le message simple', async () => {
    const { regular, mention } = await servedByEachFanOut();

    expect(mention.messageContent).toBe(regular.messagePreview);
  });

  it('et les deux déclarent la base de cette transcription — sa PROPRE carte', async () => {
    // Sans quoi la descente du Prisme apparierait `Message.translations`, qui ne
    // traduit que `Message.content` : le cycle 123 en fait un type SOMME
    // précisément pour que le site qui COMPOSE l'aperçu dise ce qu'il est.
    const { regular, reply, mention } = await servedByEachFanOut();

    expect(reply.previewBasis).toEqual(regular.previewBasis);
    expect(mention.previewBasis).toEqual(regular.previewBasis);
    expect(reply.previewBasis).toEqual(
      expect.objectContaining({ kind: 'transcript' })
    );
  });

  it('et le résumé de pièce jointe qui compose leur corps', async () => {
    // `buildMessageNotificationBodyI18n` remplace un texte ABSENT par le libellé
    // détaillé de la première pièce jointe. Sans ces champs, une photo sans
    // légende pousse un corps vide à celui qu'on mentionne.
    const { reply, mention } = await servedByEachFanOut();

    for (const served of [reply, mention]) {
      expect(served.attachments).toEqual([{ type: 'audio', filename: 'vocal.m4a' }]);
      expect(served.firstAttachmentDuration).toBe(7);
      expect(served.firstAttachmentFileSize).toBe(12_000);
    }
  });
});

// ── Les créateurs — le corps REMIS à APNs ───────────────────────────────────

const RECIPIENT_ID = '507f1f77bcf86cd799439044';

function makeServicePrisma() {
  return {
    message: {
      findUnique: jest.fn<any>().mockResolvedValue({
        deletedAt: null,
        expiresAt: null,
        isViewOnce: false,
        viewOnceCount: 0,
        createdAt: new Date('2026-08-24T10:00:00Z'),
        messageType: 'image',
        translations: null,
        originalLanguage: 'fr',
      }),
    },
    user: {
      findUnique: jest.fn<any>().mockImplementation(({ where }: any) =>
        Promise.resolve(
          where?.id === RECIPIENT_ID
            ? {
                id: RECIPIENT_ID, username: 'bob', displayName: 'Bob', avatar: null,
                systemLanguage: 'fr', regionalLanguage: null,
                customDestinationLanguage: null, deviceLocale: null,
              }
            : { id: SENDER_USER_ID, username: 'alice', displayName: 'Alice', avatar: null }
        )
      ),
      findMany: jest.fn<any>().mockResolvedValue([]),
    },
    conversation: {
      findUnique: jest.fn<any>().mockResolvedValue({ title: 'Salon', type: 'group', avatar: null }),
    },
    notification: {
      create: jest.fn<any>().mockImplementation((args: any) => ({ id: 'notif_x', ...args.data })),
      findMany: jest.fn<any>().mockResolvedValue([]),
      count: jest.fn<any>().mockResolvedValue(0),
    },
    userConversationPreferences: { findUnique: jest.fn<any>().mockResolvedValue(null) },
    userPreferences: { findUnique: jest.fn<any>().mockResolvedValue(null) },
  } as any;
}

const makeService = () => {
  const prisma = makeServicePrisma();
  const sendToUser = jest.fn<any>().mockResolvedValue(undefined);
  const service = new NotificationService(prisma);
  service.setSocketIO({
    to: jest.fn().mockReturnThis(),
    in: jest.fn().mockReturnThis(),
    fetchSockets: jest.fn<any>().mockResolvedValue([]),
    emit: jest.fn(),
  } as any);
  service.setPushNotificationService({ sendToUser } as any);
  return { service, sendToUser };
};

/** Une photo SANS légende : l'aperçu est vide, le résumé porte tout le corps. */
const CAPTIONLESS_PHOTO = {
  messagePreview: '',
  attachments: [{ type: 'image' as const, filename: 'plage.jpg' }],
  firstAttachmentFileSize: 240_000,
  firstAttachmentWidth: 1024,
  firstAttachmentHeight: 768,
};

describe('créateurs — un média sans légende ne pousse jamais un corps VIDE', () => {
  it('createReplyNotification compose le libellé de la pièce jointe', async () => {
    const { service, sendToUser } = makeService();

    await service.createReplyNotification({
      recipientUserId: RECIPIENT_ID,
      replierUserId: SENDER_USER_ID,
      messageId: MSG_ID,
      conversationId: CONV_ID,
      originalMessageId: ORIGINAL_MSG_ID,
      ...CAPTIONLESS_PHOTO,
    } as any);

    const body = (sendToUser.mock.calls[0]?.[0] as any)?.payload?.body as string;
    expect(body.trim()).not.toBe('');
    expect(body).toContain('1024×768');
  });

  it('createMentionNotification aussi', async () => {
    const { service, sendToUser } = makeService();

    await service.createMentionNotification({
      mentionedUserId: RECIPIENT_ID,
      mentionerUserId: SENDER_USER_ID,
      messageId: MSG_ID,
      conversationId: CONV_ID,
      ...CAPTIONLESS_PHOTO,
    } as any);

    const body = (sendToUser.mock.calls[0]?.[0] as any)?.payload?.body as string;
    expect(body.trim()).not.toBe('');
    expect(body).toContain('1024×768');
  });

  it('et un aperçu TEXTE reste servi tel quel, badges en suffixe', async () => {
    // Mode d'échec du CORRECTIF : composer le corps ne doit pas écraser le texte
    // du message par le libellé de sa pièce jointe — `buildMessageNotificationBodyI18n`
    // ne substitue que sur un texte ABSENT.
    const { service, sendToUser } = makeService();

    await service.createReplyNotification({
      recipientUserId: RECIPIENT_ID,
      replierUserId: SENDER_USER_ID,
      messageId: MSG_ID,
      conversationId: CONV_ID,
      messagePreview: 'Regarde ça',
      attachments: [
        { type: 'image' as const, filename: 'a.jpg' },
        { type: 'image' as const, filename: 'b.jpg' },
      ],
    } as any);

    const body = (sendToUser.mock.calls[0]?.[0] as any)?.payload?.body as string;
    expect(body).toBe('Regarde ça +1📷');
  });

  it('et une bannière SANS pièce jointe garde exactement son texte', async () => {
    const { service, sendToUser } = makeService();

    await service.createMentionNotification({
      mentionedUserId: RECIPIENT_ID,
      mentionerUserId: SENDER_USER_ID,
      messageId: MSG_ID,
      conversationId: CONV_ID,
      messagePreview: 'Coucou @bob',
    } as any);

    const body = (sendToUser.mock.calls[0]?.[0] as any)?.payload?.body as string;
    expect(body).toBe('Coucou @bob');
  });
});
