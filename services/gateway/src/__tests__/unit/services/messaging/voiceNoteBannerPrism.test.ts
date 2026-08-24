/**
 * Cycle 124 — la bannière d'un VOCAL : ce qu'elle MONTRE, et dans quelle langue.
 *
 * Suivi MESURÉ du cycle 122, qui l'avait nommé et laissé ouvert : « la bannière
 * d'un VOCAL reste dans la langue de l'expéditeur — sa transcription a ses
 * propres traductions (`MessageAttachment.translations`) qu'aucun éventail ne
 * descend ». En l'instruisant, un SECOND défaut est tombé au même site, et il
 * est plus grave que le premier.
 *
 * ── Défaut A — la protection était ANNONCÉE sans être APPLIQUÉE ──────────────
 *
 * `notificationPreviewForPush = firstAttachmentTranscript ?? notificationPreview`
 * faisait gagner la transcription INCONDITIONNELLEMENT, y compris quand
 * `protectedPreview` venait de composer un placeholder. Un vocal ÉPHÉMÈRE, à VUE
 * UNIQUE, FLOUTÉ ou CHIFFRÉ poussait donc son texte transcrit ENTIER sur l'écran
 * verrouillé — exactement ce que la protection masque. Le `locKey` partait
 * pourtant avec, et `previewIsMessageContent` était correctement à `false` : les
 * deux garde-fous du cycle 122 étaient en place, et gardaient une SUBSTITUTION
 * qui n'avait plus rien à empêcher, le texte ayant déjà pris la place du
 * placeholder une couche plus haut.
 *
 * C'est la forme exacte du défaut du cycle 123 sur `StoryViewer` : le résolveur
 * dit juste, l'hôte rend autre chose. Ici l'hôte rend PLUS que ce que le
 * résolveur autorise.
 *
 * ── Défaut B — la transcription ne descendait aucun Prisme ───────────────────
 *
 * `Message.translations` ne traduit que `Message.content` ; les traductions
 * d'une transcription vivent sur `MessageAttachment.translations`, sous une
 * AUTRE forme (`{ lang: { transcription, deletedAt? } }`). Aucun éventail ne les
 * lisait, donc la bannière d'un vocal restait dans la langue de l'expéditeur
 * pendant que la bulle de la même application, elle, descend le Prisme
 * (`AudioTrackLanguageResolver` / `resolveAutoLanguage` / `resolveTranslatedAudio`).
 *
 * Les témoins portent sur ce que l'éventail REMET au créateur de notification —
 * la seule valeur qui atteint un lecteur.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';

import {
  notifyMessageRecipients,
  transcriptPrismSource,
} from '../../../../services/messaging/messageNotificationFanOut';

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
  translations: null,
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

  it('et n\'expose AUCUNE source de Prisme sur un vocal protégé', async () => {
    // Le corollaire du cycle 122 : un contenu qu'on refuse d'afficher ne se
    // relâche pas non plus par le champ de service `translatedContent`.
    const params = await servedParams({
      message: { isViewOnce: true },
      attachments: [
        audioAttachment({ translations: { es: { transcription: 'Te llamo esta noche' } } }),
      ],
    });

    expect(params.previewPrismSource).toBeUndefined();
  });

  it('un vocal ORDINAIRE affiche bien sa transcription', async () => {
    // Mode d'échec du CORRECTIF : refermer la protection ne doit pas supprimer
    // la transcription inline du cas nominal, qui est la raison d'être de
    // `extractTranscriptionText`.
    const params = await servedParams({});

    expect(params.messagePreview).toBe(TRANSCRIPT);
  });
});

describe('éventail — la transcription porte SA source de Prisme', () => {
  it('remet les traductions de la transcription et sa langue d\'origine', async () => {
    const params = await servedParams({
      attachments: [
        audioAttachment({
          transcription: { text: TRANSCRIPT, language: 'fr' },
          translations: {
            es: { type: 'audio', transcription: 'Te llamo esta noche' },
            en: { type: 'audio', transcription: 'I will call you tonight' },
          },
        }),
      ],
    });

    expect(params.previewPrismSource).toEqual({
      translations: { es: 'Te llamo esta noche', en: 'I will call you tonight' },
      originalLanguage: 'fr',
    });
  });

  it('n\'en remet AUCUNE quand le message n\'a pas de transcription', async () => {
    // Sans transcription, l'aperçu est `Message.content` : lui appliquer la
    // source d'une pièce jointe afficherait un texte sans rapport.
    const params = await servedParams({
      attachments: [audioAttachment({ transcription: null })],
      processedContent: 'Écoute ça',
    });

    expect(params.previewPrismSource).toBeUndefined();
    expect(params.messagePreview).toBe('Écoute ça');
  });
});

describe('transcriptPrismSource — la projection du stockage vers la descente', () => {
  it('écarte les entrées SOFT-SUPPRIMÉES', async () => {
    expect(
      transcriptPrismSource({
        transcription: { text: TRANSCRIPT, language: 'fr' },
        translations: {
          es: { transcription: 'Te llamo', deletedAt: '2026-08-01T00:00:00Z' },
          it: { transcription: 'Ti chiamo' },
        },
      })
    ).toEqual({ translations: { it: 'Ti chiamo' }, originalLanguage: 'fr' });
  });

  it('écarte les entrées sans texte utilisable', async () => {
    expect(
      transcriptPrismSource({
        transcription: { text: TRANSCRIPT, language: 'fr' },
        translations: { es: { transcription: '   ' }, de: { url: 'https://cdn/de.mp3' } },
      })
    ).toEqual({ translations: {}, originalLanguage: 'fr' });
  });

  it('rend une langue d\'origine NULLE quand la transcription ne la déclare pas', async () => {
    // Règle #3 : sans langue d'origine, aucun rang ne peut être court-circuité —
    // la descente élit alors la première traduction du prisme, ce qui est juste.
    expect(
      transcriptPrismSource({
        transcription: { text: TRANSCRIPT },
        translations: { it: { transcription: 'Ti chiamo' } },
      })
    ).toEqual({ translations: { it: 'Ti chiamo' }, originalLanguage: null });
  });

  it('rend `undefined` sans pièce jointe', async () => {
    expect(transcriptPrismSource(null)).toBeUndefined();
    expect(transcriptPrismSource(undefined)).toBeUndefined();
  });
});
