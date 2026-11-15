/**
 * #12518 — l'aperçu d'une conversation chiffrée de bout en bout se décide sur
 * le MODE DE LA CONVERSATION, jamais sur les seuls drapeaux du message.
 *
 * L'éventail lisait `message.isEncrypted || message.encryptionMode === 'e2ee'`.
 * Or ces deux champs sont ceux de la LIGNE : un message hérité d'avant la garde,
 * un `messageType: 'system'` déclaré par le client (que `getEncryptionContext`
 * exemptait du mode) ou une ligne écrite par un autre chemin portent
 * `isEncrypted: false, encryptionMode: null` dans une conversation e2ee — et
 * leur texte, leur transcription, leur fichier partaient alors sur l'écran
 * verrouillé.
 *
 * Les témoins lisent la charge REMISE à APNs/FCM, de bout en bout (éventail →
 * `NotificationService` → `sendToUser`), et la relisent tout entière : ce qui
 * part À CÔTÉ du texte compte autant que lui.
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
const SENDER_PART_ID = '507f1f77bcf86cd799439031';
const SENDER_USER_ID = '507f1f77bcf86cd799439041';
const PEER_USER_ID = '507f1f77bcf86cd799439042';
const ATTACHMENT_ID = '507f1f77bcf86cd799439061';

const SECRET_TEXT = 'le code du coffre est 4321';
const SECRET_TRANSCRIPT = 'rendez-vous derrière la gare';
const SECRET_TRANSLATION = 'meet behind the station';
const SECRET_URL = 'https://cdn.example/private/voice-note.m4a';
const SECRET_FILENAME = 'aveux.m4a';

const voiceNote = {
  id: ATTACHMENT_ID,
  mimeType: 'audio/mp4',
  fileName: SECRET_FILENAME,
  originalName: SECRET_FILENAME,
  fileSize: 48_000,
  duration: 12,
  width: null,
  height: null,
  fileUrl: SECRET_URL,
  thumbnailUrl: null,
  transcription: { text: SECRET_TRANSCRIPT, language: 'fr' },
  translations: { en: { text: SECRET_TRANSLATION, url: 'https://cdn.example/private/voice-note.en.m4a' } },
  isViewOnce: false,
  isBlurred: false,
  effectFlags: 0,
};

function makePrisma(encryptionMode: string | null) {
  return {
    participant: {
      findUnique: jest.fn<any>().mockResolvedValue({ userId: SENDER_USER_ID, displayName: 'Alice P', avatar: null }),
    },
    user: {
      findUnique: jest.fn<any>().mockImplementation(async ({ where }: any) => ({
        id: where?.id ?? PEER_USER_ID,
        username: 'alice',
        displayName: 'Alice',
        avatar: null,
        systemLanguage: 'en',
        regionalLanguage: null,
        customDestinationLanguage: null,
        deviceLocale: null,
      })),
      findMany: jest.fn<any>().mockResolvedValue([]),
    },
    conversation: {
      findUnique: jest.fn<any>().mockResolvedValue({
        title: 'Salon',
        type: 'direct',
        avatar: null,
        encryptionMode,
        participants: [{ userId: SENDER_USER_ID }, { userId: PEER_USER_ID }],
      }),
    },
    message: {
      findUnique: jest.fn<any>().mockResolvedValue({
        deletedAt: null,
        expiresAt: null,
        isViewOnce: false,
        viewOnceCount: 0,
        isEncrypted: false,
        encryptionMode: null,
        createdAt: new Date('2026-10-23T10:00:00Z'),
        messageType: 'audio',
        content: SECRET_TEXT,
        translations: { en: { text: SECRET_TRANSLATION } },
        originalLanguage: 'fr',
      }),
    },
    notification: {
      create: jest.fn<any>().mockImplementation((args: any) => ({ id: 'notif_x', ...args.data })),
      findMany: jest.fn<any>().mockResolvedValue([]),
      deleteMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
      count: jest.fn<any>().mockResolvedValue(0),
    },
    messageAttachment: { findMany: jest.fn<any>().mockResolvedValue([voiceNote]) },
    userConversationPreferences: {
      findMany: jest.fn<any>().mockResolvedValue([]),
      findUnique: jest.fn<any>().mockResolvedValue(null),
    },
    userPreferences: { findUnique: jest.fn<any>().mockResolvedValue(null) },
    conversationShareLink: { findUnique: jest.fn<any>().mockResolvedValue(null) },
  } as any;
}

/** Ce qui part réellement : la charge remise au service push, et la ligne `Notification`. */
async function delivered(encryptionMode: string | null) {
  const prisma = makePrisma(encryptionMode);
  const sendToUser = jest.fn<any>().mockResolvedValue(undefined);
  const service = new NotificationService(prisma);
  service.setSocketIO({
    to: jest.fn().mockReturnThis(),
    in: jest.fn().mockReturnThis(),
    fetchSockets: jest.fn<any>().mockResolvedValue([]),
    emit: jest.fn(),
  } as any);
  service.setPushNotificationService({ sendToUser } as any);

  await notifyMessageRecipients({
    prisma,
    notificationService: service,
    message: {
      id: MSG_ID,
      messageType: 'audio',
      replyToId: null,
      isEncrypted: false,
      encryptionMode: null,
      isViewOnce: false,
      isBlurred: false,
      effectFlags: 0,
      expiresAt: null,
      createdAt: new Date('2026-10-23T10:00:00Z'),
      encryptedContent: null,
      metadata: null,
    },
    senderParticipantId: SENDER_PART_ID,
    conversationId: CONV_ID,
    processedContent: SECRET_TEXT,
  });

  return {
    pushes: sendToUser.mock.calls.map((call) => JSON.stringify(call[0])),
    rows: prisma.notification.create.mock.calls.map((call: any[]) => JSON.stringify(call[0])),
  };
}

const SECRETS = [SECRET_TEXT, SECRET_TRANSCRIPT, SECRET_TRANSLATION, SECRET_URL, SECRET_FILENAME, 'voice-note', ATTACHMENT_ID];

describe('conversation e2ee — la charge push ne transporte aucun contenu', () => {
  it('la bannière part, mais sans texte, transcription, traduction, fichier ni URL', async () => {
    const { pushes, rows } = await delivered('e2ee');

    expect(pushes.length).toBeGreaterThan(0);
    for (const charge of [...pushes, ...rows]) {
      for (const secret of SECRETS) expect(charge).not.toContain(secret);
    }
  });

  it('la clé de localisation du placeholder chiffré accompagne la bannière', async () => {
    const { pushes } = await delivered('E2EE');

    expect(pushes[0]).toContain('notification.encrypted_message');
  });
});

describe('conversation en clair — la bannière d’un vocal garde son contenu (non-régression)', () => {
  it('la transcription et le fichier voyagent', async () => {
    const { pushes } = await delivered(null);

    expect(pushes.length).toBeGreaterThan(0);
    expect(pushes.join('\n')).toContain(SECRET_URL);
  });
});
