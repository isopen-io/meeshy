/**
 * Cycle 128, moitié PRODUCTEUR — l'éventail remet-il les candidates de piste ?
 *
 * `prismAudioTrackGate.test.ts` garde l'ÉLECTION : le créateur sert bien la
 * piste de la langue élue quand on la lui donne. Ce fichier-ci garde ce qui
 * précède, et c'est une propriété disjointe : un correctif d'élection dont
 * l'amont ne remet jamais de candidates n'a corrigé personne (leçon 266 — un
 * contenu RÉSOLU n'est pas un contenu SERVI).
 *
 * La lecture est GRATUITE, et c'est ce qui rend l'omission remarquable :
 * `translations` est dans le `select` de l'éventail DEPUIS le cycle 123, qui n'en
 * a dépouillé que le TEXTE. La piste TTS dormait sur la même ligne, déjà lue.
 *
 * Les témoins portent sur ce que l'éventail REMET au créateur — jamais sur un
 * calcul intermédiaire.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';

import { notifyMessageRecipients } from '../../../../services/messaging/messageNotificationFanOut';

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

const ORIGINAL_URL = 'https://cdn.example/voice/note.m4a';
const FR_TRACK_URL = '/api/v1/attachments/file/translated/att_fr.mp3';

function makePrisma(attachments: unknown[]) {
  return {
    participant: {
      findUnique: jest
        .fn<any>()
        .mockResolvedValue({ userId: SENDER_USER_ID, displayName: 'Alice P', avatar: null }),
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
        participants: [{ userId: SENDER_USER_ID }, { userId: PEER_USER_ID }],
      }),
    },
    message: { findUnique: jest.fn<any>().mockResolvedValue({ deletedAt: null }) },
    notification: {
      findMany: jest.fn<any>().mockResolvedValue([]),
      deleteMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
    },
    messageAttachment: { findMany: jest.fn<any>().mockResolvedValue(attachments) },
    userConversationPreferences: { findMany: jest.fn<any>().mockResolvedValue([]) },
  };
}

/** Un vocal transcrit, traduit en français — texte ET piste. */
const voiceNote = (overrides: Record<string, unknown> = {}) => ({
  mimeType: 'audio/m4a',
  fileName: 'note.m4a',
  fileSize: 84_000,
  duration: 12_000,
  width: null,
  height: null,
  fileUrl: ORIGINAL_URL,
  transcription: { text: 'the meeting moved to friday', language: 'en' },
  translations: {
    fr: {
      type: 'audio',
      transcription: 'la réunion est déplacée à vendredi',
      url: FR_TRACK_URL,
      durationMs: 9_400,
      format: 'mp3',
      createdAt: new Date('2026-08-24T10:00:00Z'),
    },
  },
  isViewOnce: false,
  isBlurred: false,
  effectFlags: 0,
  ...overrides,
});

function makeMessage(overrides: Record<string, unknown> = {}) {
  return {
    id: MSG_ID,
    messageType: 'audio',
    replyToId: null,
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

async function servedParams(opts: {
  attachments?: unknown[];
  message?: Record<string, unknown>;
} = {}): Promise<Record<string, unknown>> {
  const createMessageNotification = jest.fn<any>().mockResolvedValue({ id: 'notif' });
  await notifyMessageRecipients({
    prisma: makePrisma(opts.attachments ?? [voiceNote()]) as any,
    notificationService: {
      createReplyNotification: jest.fn<any>().mockResolvedValue(null),
      createMentionNotificationsBatch: jest.fn<any>().mockResolvedValue(0),
      createMessageNotification,
    },
    message: makeMessage(opts.message) as any,
    senderParticipantId: SENDER_PART_ID,
    conversationId: CONV_ID,
    processedContent: '',
  } as any);
  expect(createMessageNotification).toHaveBeenCalledTimes(1);
  return createMessageNotification.mock.calls[0][0] as Record<string, unknown>;
}

describe('éventail — les candidates de PISTE sont remises avec le média', () => {
  it('un vocal traduit remet sa piste, son mime normalisé et sa durée', async () => {
    const params = await servedParams();

    expect(params.attachmentTracks).toEqual({
      fr: { url: FR_TRACK_URL, mimeType: 'audio/mp3', durationMs: 9_400 },
    });
  });

  it('la durée de l\'ORIGINAL reste en millisecondes, sans conversion', async () => {
    // L'unité de `MessageAttachment.duration` (`schema.prisma`). L'éventail est
    // son unique producteur et ne la touche pas — c'est le créateur qui la
    // multipliait par mille.
    const params = await servedParams();

    expect(params.firstAttachmentDuration).toBe(12_000);
  });

  it('un vocal SANS traduction remet une carte vide — pas d\'absence à deviner', async () => {
    const params = await servedParams({
      attachments: [voiceNote({ translations: null })],
    });

    expect(params.attachmentTracks).toEqual({});
    expect(params.firstAttachmentUrl).toBe(ORIGINAL_URL);
  });

  it('une PHOTO n\'a pas de piste — la carte n\'est pas calculée', async () => {
    const params = await servedParams({
      attachments: [voiceNote({ mimeType: 'image/jpeg', transcription: null })],
    });

    expect(params.attachmentTracks).toBeUndefined();
  });
});

describe('éventail — la piste traduite est du CONTENU, et la protection la retient', () => {
  /**
   * Mode d'échec du CORRECTIF, et c'est le plus cher : la carte des pistes est
   * une porte NEUVE par laquelle un fichier peut atteindre un écran verrouillé.
   * Le cycle 125 a fermé celle du fichier original ; ouvrir celle-ci sans la
   * garder rouvrirait la même fuite sous un autre nom.
   */
  const protections: ReadonlyArray<readonly [string, Record<string, unknown>]> = [
    ['vue unique', { isViewOnce: true }],
    ['flouté', { isBlurred: true }],
    ['éphémère', { expiresAt: new Date('2026-08-24T11:00:00Z') }],
    ['chiffré', { isEncrypted: true }],
  ];

  it.each(protections)('un vocal %s ne remet AUCUNE piste', async (_label, overrides) => {
    const params = await servedParams({ message: overrides });

    expect(params.attachmentTracks).toBeUndefined();
    expect(JSON.stringify(params)).not.toContain('translated');
  });

  it('une pièce jointe masquée à SON niveau retient la piste aussi', async () => {
    // Le second niveau du cycle 125 : `MessageAttachment` porte ses propres
    // drapeaux, et ils ne suivent pas ceux du message qui la porte.
    const params = await servedParams({
      attachments: [voiceNote({ isViewOnce: true })],
    });

    expect(params.attachmentTracks).toBeUndefined();
    expect(JSON.stringify(params)).not.toContain(FR_TRACK_URL);
  });
});
