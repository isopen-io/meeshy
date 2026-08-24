/**
 * Cycle 124 — la protection était ANNONCÉE par deux champs et APPLIQUÉE par
 * aucun : le CORPS d'un vocal protégé partait en clair.
 *
 * Le cycle 123 a fermé le FIL de ce message — sa traduction ne part plus sur le
 * canal push, `previewPrismSource` rendant une source VIDE dès que la base est
 * `protected-placeholder` ou qu'un `notificationLocKey` est présent. Le CORPS,
 * lui, était déjà perdu une couche PLUS HAUT que toute déclaration de base :
 *
 *     const notificationPreviewForPush = firstAttachmentTranscript ?? notificationPreview;
 *
 * `notificationPreview` est le placeholder que `protectedPreview` vient de
 * composer. La transcription gagnait INCONDITIONNELLEMENT. Un vocal ÉPHÉMÈRE / à
 * VUE UNIQUE / FLOUTÉ / CHIFFRÉ poussait donc son texte transcrit ENTIER sur
 * l'écran verrouillé — exactement ce que la protection masque, et le seul écran
 * où elle a une raison d'être.
 *
 * `previewIsProtectedPlaceholder` gouvernait `previewBasis`, jamais l'aperçu
 * lui-même. Les deux gardes du dépôt étaient posées, justes, testées — et elles
 * gardaient la SUBSTITUTION d'un texte que la couche du dessus avait déjà
 * remplacé.
 *
 * > Un champ de service qui DÉCLARE une restriction ne la fait pas respecter.
 * > La question à poser à toute garde n'est pas « est-elle posée ? » mais « le
 * > texte qu'elle gouverne est-il bien celui qui part ? ».
 *
 * Les témoins portent sur ce que l'éventail REMET au créateur de notification —
 * la seule valeur qui atteigne un lecteur.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';

import { notifyMessageRecipients } from '../../../../services/messaging/messageNotificationFanOut';

const CONV_ID = '507f1f77bcf86cd799439022';
const MSG_ID = '507f1f77bcf86cd799439051';
const SENDER_PART_ID = '507f1f77bcf86cd799439031';
const SENDER_USER_ID = '507f1f77bcf86cd799439041';
const PEER_USER_ID = '507f1f77bcf86cd799439042';

const TRANSCRIPT = 'Salut, je te rappelle ce soir';

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

const audioAttachment = (overrides: Record<string, unknown> = {}) => ({
  mimeType: 'audio/mp4',
  fileName: 'vocal.m4a',
  fileSize: 12_000,
  duration: 7,
  width: null,
  height: null,
  fileUrl: 'https://cdn.example/vocal.m4a',
  transcription: { text: TRANSCRIPT, language: 'fr' },
  translations: { es: { type: 'audio', transcription: 'Te llamo esta noche', createdAt: new Date() } },
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

/** Ce que l'éventail remet au créateur de notification pour le seul auditeur. */
async function servedParams(opts: {
  attachments?: unknown[];
  message?: Record<string, unknown>;
  processedContent?: string;
}): Promise<Record<string, unknown>> {
  const createMessageNotification = jest.fn<any>().mockResolvedValue({ id: 'notif' });
  await notifyMessageRecipients({
    prisma: makePrisma(opts.attachments ?? [audioAttachment()]) as any,
    notificationService: {
      createReplyNotification: jest.fn<any>().mockResolvedValue(null),
      createMentionNotificationsBatch: jest.fn<any>().mockResolvedValue(0),
      createMessageNotification,
    },
    message: makeMessage(opts.message) as any,
    senderParticipantId: SENDER_PART_ID,
    conversationId: CONV_ID,
    processedContent: opts.processedContent ?? '',
  });

  expect(createMessageNotification).toHaveBeenCalledTimes(1);
  return createMessageNotification.mock.calls[0][0] as Record<string, unknown>;
}

describe('éventail — la transcription ne franchit PAS une protection', () => {
  // La table des quatre protections, une par branche de `protectedPreview`.
  // Chacune compose un placeholder que la transcription écrasait.
  const protections: ReadonlyArray<readonly [string, Record<string, unknown>]> = [
    ['vue unique', { isViewOnce: true }],
    ['flouté', { isBlurred: true }],
    ['éphémère', { expiresAt: new Date('2026-08-24T11:00:00Z') }],
    ['chiffré', { isEncrypted: true }],
  ];

  it.each(protections)('un vocal %s garde son placeholder', async (_label, overrides) => {
    const params = await servedParams({ message: overrides });

    expect(params.messagePreview).not.toBe(TRANSCRIPT);
    expect(params.messagePreview).not.toContain('rappelle');
    expect(params.notificationLocKey).toBeTruthy();
  });

  it('et sa base redevient le PLACEHOLDER, non la transcription', async () => {
    // Corollaire de forme, et il n'est pas accessoire : sans transcription à ce
    // moment-là, `pushPreviewBasis` ne peut plus élire `transcript` sur un
    // message protégé. La carte de l'attachment cesse d'être offerte à la
    // descente, et le second verrou (`notificationLocKey`) cesse d'être la seule
    // chose qui retienne la traduction du texte masqué.
    const params = await servedParams({ message: { isViewOnce: true } });

    expect(params.previewBasis).toEqual({ kind: 'protected-placeholder' });
  });

  it('un vocal ORDINAIRE affiche bien sa transcription, et déclare SA source', async () => {
    // Mode d'échec du CORRECTIF : refermer la protection ne doit ni supprimer la
    // transcription inline du cas nominal — la raison d'être
    // d'`extractTranscriptionText` — ni lui retirer la source que le cycle 123
    // lui a donnée.
    const params = await servedParams({});

    expect(params.messagePreview).toBe(TRANSCRIPT);
    expect(params.previewBasis).toEqual({
      kind: 'transcript',
      source: { translations: { es: 'Te llamo esta noche' }, originalLanguage: 'fr' },
    });
  });
});
