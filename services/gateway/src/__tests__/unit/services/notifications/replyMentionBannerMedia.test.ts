/**
 * Cycle 126 — l'aperçu composé avait TROIS consommateurs et UN seul câblage.
 *
 * `messageNotificationFanOut` COMPOSE, une fois par message, ce que sa bannière
 * donne à voir : `notificationPreviewForPush` (la transcription d'un vocal, ou
 * le contenu), `pushPreviewBasis` (ce que cet aperçu EST, donc ce qui le
 * traduit), `attachmentInfo` (le média et ses étiquettes) et
 * `notificationLocKey` (le verrou de protection). Un seul de ses TROIS lots le
 * lisait. Les deux autres — RÉPONSE et MENTION — repartaient de la matière
 * brute, `Message.content`.
 *
 * Pour un message SANS texte — un vocal, une photo, une vidéo, un fichier — la
 * matière brute est la chaîne VIDE. Répondre à quelqu'un par une photo lui
 * poussait donc une bannière au CORPS VIDE, pendant que tous les autres membres
 * de la conversation recevaient « 📷 Photo · 1024×768 ». Le destinataire le plus
 * directement concerné était le seul à ne rien lire.
 *
 * > La cinquième question à poser autour d'un résolveur de Prisme ne s'adresse
 * > pas au résolveur mais à la VALEUR qu'il rend : **qui d'AUTRE aurait dû
 * > l'afficher ?** Une valeur composée à un endroit et lue par un seul de ses
 * > consommateurs possibles n'est pas partagée — elle est privée, et ses
 * > jumelles recomposent la même chose à côté, moins bien.
 *
 * Suivi MESURÉ reporté deux fois (cycles 124 et 125) sous l'étiquette
 * « décision produit » : une bannière au corps vide n'est pas une décision.
 *
 * Les témoins portent sur ce que l'éventail REMET aux trois créateurs, puis sur
 * le corps réellement PERSISTÉ et POUSSÉ — jamais sur un calcul intermédiaire.
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

const VOICE_URL = 'https://cdn.example/voice/note.m4a';
const TRANSCRIPT = 'On se retrouve à dix-huit heures devant le kiosque';

// ── Éventail : le harnais ───────────────────────────────────────────────────

const voiceAttachment = (overrides: Record<string, unknown> = {}) => ({
  mimeType: 'audio/m4a',
  fileName: 'note.m4a',
  fileSize: 48_000,
  duration: 12,
  width: null,
  height: null,
  fileUrl: VOICE_URL,
  transcription: { text: TRANSCRIPT, language: 'fr' },
  translations: null,
  isViewOnce: false,
  isBlurred: false,
  effectFlags: 0,
  ...overrides,
});

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

function makePrisma(attachments: unknown[]) {
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
        participants: [
          { userId: SENDER_USER_ID },
          { userId: PEER_USER_ID },
          { userId: THIRD_USER_ID },
          { userId: FOURTH_USER_ID },
        ],
      }),
    },
    message: {
      // Le message CITÉ : son auteur est le destinataire de la réponse.
      findUnique: jest.fn<any>().mockResolvedValue({ senderId: PEER_PART_ID, deletedAt: null }),
    },
    notification: {
      findMany: jest.fn<any>().mockResolvedValue([]),
      deleteMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
    },
    messageAttachment: { findMany: jest.fn<any>().mockResolvedValue(attachments) },
    userConversationPreferences: { findMany: jest.fn<any>().mockResolvedValue([]) },
  };
}

function makeMessage(overrides: Record<string, unknown> = {}) {
  return {
    id: MSG_ID,
    messageType: 'audio',
    replyToId: REPLIED_MSG_ID,
    isEncrypted: false,
    encryptionMode: null,
    isViewOnce: false,
    isBlurred: false,
    effectFlags: 0,
    expiresAt: null,
    createdAt: new Date('2026-08-24T10:00:00Z'),
    encryptedContent: null,
    ...overrides,
  };
}

/** Ce que l'éventail remet à CHACUN de ses trois créateurs, pour un même message. */
async function servedLots(opts: {
  attachments?: unknown[];
  message?: Record<string, unknown>;
  processedContent?: string;
  mentionUserIds?: string[];
}) {
  const createReplyNotification = jest.fn<any>().mockResolvedValue({ id: 'reply' });
  const createMentionNotificationsBatch = jest.fn<any>().mockResolvedValue(1);
  const createMessageNotification = jest.fn<any>().mockResolvedValue({ id: 'notif' });

  await notifyMessageRecipients({
    prisma: makePrisma(opts.attachments ?? [voiceAttachment()]) as any,
    notificationService: {
      createReplyNotification,
      createMentionNotificationsBatch,
      createMessageNotification,
    },
    message: makeMessage(opts.message) as any,
    senderParticipantId: SENDER_PART_ID,
    conversationId: CONV_ID,
    processedContent: opts.processedContent ?? '',
    validatedMentionUserIds: opts.mentionUserIds ?? [THIRD_USER_ID],
  });

  return {
    reply: createReplyNotification.mock.calls[0]?.[0] as Record<string, unknown> | undefined,
    mention: createMentionNotificationsBatch.mock.calls[0]?.[1] as Record<string, unknown> | undefined,
    regular: createMessageNotification.mock.calls[0]?.[0] as Record<string, unknown> | undefined,
  };
}

// ── Éventail — les trois lots servent le MÊME message ───────────────────────

describe('éventail — RÉPONSE et MENTION reçoivent l\'aperçu COMPOSÉ', () => {
  it('la réponse à un vocal porte sa TRANSCRIPTION, comme les autres membres', async () => {
    const { reply, regular } = await servedLots({});

    expect(regular?.messagePreview).toBe(TRANSCRIPT);
    expect(reply?.messagePreview).toBe(TRANSCRIPT);
  });

  it('la mention dans un vocal porte sa TRANSCRIPTION', async () => {
    const { mention, regular } = await servedLots({});

    expect(mention?.messageContent).toBe(regular?.messagePreview);
  });

  it('la base du Prisme suit l\'aperçu servi — une transcription a la SIENNE', async () => {
    const { reply, mention, regular } = await servedLots({});

    expect((regular?.previewBasis as any)?.kind).toBe('transcript');
    expect((reply?.previewBasis as any)?.kind).toBe('transcript');
    expect((mention?.previewBasis as any)?.kind).toBe('transcript');
  });

  it('une photo SANS légende remet ses étiquettes aux trois lots', async () => {
    // Le cas où la matière brute est la chaîne VIDE : sans les étiquettes, le
    // corps de la bannière ne peut RIEN dire.
    const { reply, mention, regular } = await servedLots({
      attachments: [photoAttachment()],
      message: { messageType: 'image' },
    });

    for (const lot of [regular, reply, mention]) {
      expect(lot?.hasAttachments).toBe(true);
      expect(lot?.firstAttachmentType).toBe('image');
      expect(lot?.firstAttachmentWidth).toBe(1024);
      expect(lot?.attachments).toEqual([{ type: 'image', filename: 'plage.jpg' }]);
    }
  });

  it('le média voyage vers les trois lots — le rich-push n\'est pas réservé au lot regular', async () => {
    const { reply, mention, regular } = await servedLots({
      attachments: [photoAttachment()],
      message: { messageType: 'image' },
    });

    for (const lot of [regular, reply, mention]) {
      expect(lot?.firstAttachmentUrl).toBe('https://cdn.example/photo/plage.jpg');
      expect(lot?.firstAttachmentMimeType).toBe('image/jpeg');
    }
  });
});

describe('éventail — la protection vaut pour les TROIS lots', () => {
  const protections: ReadonlyArray<readonly [string, Record<string, unknown>]> = [
    ['vue unique', { isViewOnce: true }],
    ['flouté', { isBlurred: true }],
    ['éphémère', { expiresAt: new Date('2026-08-24T11:00:00Z') }],
    ['chiffré', { isEncrypted: true }],
  ];

  it.each(protections)('un vocal %s ne laisse fuir ni transcription ni fichier, sur aucun lot', async (_l, overrides) => {
    const { reply, mention, regular } = await servedLots({ message: overrides });

    for (const lot of [regular, reply, mention]) {
      expect(JSON.stringify(lot)).not.toContain('kiosque');
      expect(lot?.firstAttachmentUrl).toBeUndefined();
      expect(lot?.hasAttachments).toBeFalsy();
    }
  });

  it.each(protections)('le VERROU de protection accompagne les trois lots (%s)', async (_l, overrides) => {
    // `notificationLocKey` est le second verrou de `createNotification` : sans
    // lui, un appelant qui masque le corps garde ses champs de média.
    const { reply, mention, regular } = await servedLots({ message: overrides });

    expect(regular?.notificationLocKey).toBeTruthy();
    expect(reply?.notificationLocKey).toBe(regular?.notificationLocKey);
    expect(mention?.notificationLocKey).toBe(regular?.notificationLocKey);
  });
});

// ── Service — le corps réellement composé ──────────────────────────────────

const RECIPIENT_ID = '507f1f77bcf86cd799439043';

function makeServicePrisma(recipient: Record<string, unknown>) {
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
  return { service, sendToUser };
}

/** La charge réellement remise à APNs — jamais un calcul intermédiaire. */
const servedPushData = (sendToUser: any): Record<string, any> | undefined =>
  sendToUser.mock.calls[0]?.[0]?.payload?.data;

/** Le jeu de champs média d'une photo sans légende. */
const PHOTO_MEDIA = {
  hasAttachments: true,
  attachmentCount: 1,
  firstAttachmentType: 'image' as const,
  attachments: [{ type: 'image' as const, filename: 'plage.jpg' }],
  firstAttachmentFilename: 'plage.jpg',
  firstAttachmentWidth: 1024,
  firstAttachmentHeight: 768,
  firstAttachmentUrl: 'https://cdn.example/photo/plage.jpg',
  firstAttachmentMimeType: 'image/jpeg',
};

const runners = [
  [
    'createReplyNotification',
    (service: NotificationService, media: Record<string, unknown>, preview: string) =>
      service.createReplyNotification({
        recipientUserId: RECIPIENT_ID,
        replierUserId: SENDER_USER_ID,
        messageId: MSG_ID,
        conversationId: CONV_ID,
        messagePreview: preview,
        originalMessageId: REPLIED_MSG_ID,
        ...media,
      } as any),
  ],
  [
    'createMentionNotification',
    (service: NotificationService, media: Record<string, unknown>, preview: string) =>
      service.createMentionNotification({
        mentionedUserId: RECIPIENT_ID,
        mentionerUserId: SENDER_USER_ID,
        messageId: MSG_ID,
        conversationId: CONV_ID,
        messagePreview: preview,
        ...media,
      } as any),
  ],
] as const;

describe.each(runners)('%s — le CORPS composé, jamais la chaîne nue', (_name, run) => {
  it('une photo sans légende produit une étiquette lisible, pas un corps vide', async () => {
    const { service } = makeService();

    const notification = await run(service, PHOTO_MEDIA, '');

    expect((notification as any)?.content).toContain('Photo');
    expect((notification as any)?.content).toContain('1024×768');
  });

  it('l\'étiquette est composée dans la langue de CADRAGE du destinataire', async () => {
    const { service } = makeService({ systemLanguage: 'es' });

    const notification = await run(service, PHOTO_MEDIA, '');

    expect((notification as any)?.content).toContain('Foto');
  });

  it('une légende présente reste le corps — l\'étiquette ne la remplace pas', async () => {
    const { service } = makeService();

    const notification = await run(service, PHOTO_MEDIA, 'Regarde ça');

    expect((notification as any)?.content).toContain('Regarde ça');
  });

  it('les pièces jointes suivantes deviennent des badges +N', async () => {
    const { service } = makeService();

    const notification = await run(
      service,
      {
        ...PHOTO_MEDIA,
        attachmentCount: 3,
        attachments: [
          { type: 'image' as const, filename: 'plage.jpg' },
          { type: 'image' as const, filename: 'mer.jpg' },
          { type: 'audio' as const, filename: 'note.m4a' },
        ],
      },
      ''
    );

    expect((notification as any)?.content).toContain('+1📷');
    expect((notification as any)?.content).toContain('+1🎵');
  });

  it('le média part sur le fil push — le rich-push vaut pour ce lot aussi', async () => {
    const { service, sendToUser } = makeService();

    await run(service, PHOTO_MEDIA, '');

    const data = servedPushData(sendToUser);
    expect(data?.attachmentUrl).toBe('https://cdn.example/photo/plage.jpg');
    expect(data?.attachmentMimeType).toBe('image/jpeg');
  });

  it('un verrou de protection retient le média, ici comme sur le lot regular', async () => {
    const { service, sendToUser } = makeService();

    await run(
      service,
      { ...PHOTO_MEDIA, notificationLocKey: 'notification.view_once_message' },
      '👁️ 🖼️'
    );

    const data = servedPushData(sendToUser);
    expect(data?.attachmentUrl).toBe('');
    expect(data?.attachmentMimeType).toBe('');
  });

  it('la bulle pré-enregistrée porte l\'horloge du SERVEUR, pas celle du device', async () => {
    const { service, sendToUser } = makeService();

    await run(service, PHOTO_MEDIA, 'Regarde ça');

    const data = servedPushData(sendToUser);
    expect(data?.createdAt).toBe('2026-08-24T10:00:00.000Z');
    expect(data?.messageType).toBe('image');
  });
});
