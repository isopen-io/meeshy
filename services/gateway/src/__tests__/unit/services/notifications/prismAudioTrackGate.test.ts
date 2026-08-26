/**
 * Cycle 128 — la bannière servait la bonne LANGUE et attachait le mauvais SON.
 *
 * Le cycle 123 a donné à la transcription d'un vocal sa propre source de Prisme
 * (`PreviewPrismBasis.transcript`) : depuis, le TEXTE de la bannière descend le
 * prisme du lecteur. Le FICHIER attaché à côté, lui, est resté
 * `first?.fileUrl` — l'original, sans condition, identique pour TOUS les
 * lecteurs. Un francophone recevant un vocal anglais voyait une bannière en
 * français au-dessus d'un `UNNotificationAttachment` qui parle anglais.
 *
 * La piste traduite existe pourtant en production : le pipeline audio écrit
 * `MessageAttachment.translations[lang].url` pour chaque langue, et les trois
 * clients descendent déjà le Prisme sur la piste JOUÉE en conversation. L'écran
 * verrouillé était la SEULE surface qui ne le faisait pas.
 *
 * > **Une résolution de CONTENU se mesure sur tout ce que la charge TRANSPORTE,
 * > jamais sur sa seule chaîne.** C'est la leçon 275, appliquée à un correctif
 * > de Prisme au lieu d'un correctif de protection : le cycle 123 a fait
 * > descendre le texte et laissé le médium douze lignes plus bas, dans le même
 * > objet littéral.
 *
 * Les témoins portent sur ce qui atteint APNs et sur le corps AFFICHÉ — jamais
 * sur un calcul intermédiaire.
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
const SENDER_USER_ID = '507f1f77bcf86cd799439041';
const RECIPIENT_ID = '507f1f77bcf86cd799439043';

const SERVER_CLOCK = new Date('2026-08-24T10:00:00Z');

/** Le vocal, tel que l'expéditeur l'a envoyé. */
const ORIGINAL_URL = '/api/v1/attachments/file/voice_note.m4a';
const ORIGINAL_MIME = 'audio/m4a';
/**
 * MILLISECONDES — l'unité de `MessageAttachment.duration` (`schema.prisma`),
 * telle que l'éventail la passe, sans conversion.
 */
const ORIGINAL_DURATION_MS = 12000;

/** La piste TTS que le pipeline a produite pour le lecteur francophone. */
const FR_TRACK_URL = '/api/v1/attachments/file/translated/att_fr.mp3';
const FR_TRACK_DURATION_MS = 9400;

/** Ce que la transcription dit, et ce que sa traduction en dit. */
const TRANSCRIPT_EN = 'the meeting moved to friday';
const TRANSCRIPT_FR = 'la réunion est déplacée à vendredi';

const liveRow = (overrides: Record<string, unknown> = {}) => ({
  deletedAt: null,
  expiresAt: null,
  translations: null,
  originalLanguage: 'en',
  createdAt: SERVER_CLOCK,
  messageType: 'audio',
  ...overrides,
});

function makeService(recipientLanguage = 'fr') {
  const prisma = {
    message: { findUnique: jest.fn<any>().mockResolvedValue(liveRow()) },
    notification: {
      create: jest.fn<any>().mockImplementation((args: any) => ({ id: 'notif_created', ...args.data })),
      findMany: jest.fn<any>().mockResolvedValue([]),
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
            : { id: where?.id, systemLanguage: recipientLanguage }
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

/**
 * La forme que l'éventail compose pour un vocal DÉJÀ TRANSCRIT : l'aperçu poussé
 * est la transcription, sa base porte SA carte, et le média du rich-push est
 * celui de l'attachment.
 */
const runVoiceNote = (
  service: NotificationService,
  overrides: Record<string, unknown> = {}
) =>
  service.createMessageNotification({
    recipientUserId: RECIPIENT_ID,
    senderId: SENDER_USER_ID,
    messageId: MSG_ID,
    conversationId: CONV_ID,
    messagePreview: TRANSCRIPT_EN,
    senderProfile: { username: 'alice', displayName: 'Alice', avatar: null },
    previewBasis: {
      kind: 'transcript',
      source: { translations: { fr: TRANSCRIPT_FR }, originalLanguage: 'en' },
    },
    hasAttachments: true,
    attachmentCount: 1,
    attachments: [{ type: 'audio', filename: 'voice_note.m4a' }],
    firstAttachmentType: 'audio',
    firstAttachmentFilename: 'voice_note.m4a',
    firstAttachmentUrl: ORIGINAL_URL,
    firstAttachmentMimeType: ORIGINAL_MIME,
    firstAttachmentDuration: ORIGINAL_DURATION_MS,
    attachmentTracks: {
      fr: { url: FR_TRACK_URL, mimeType: 'audio/mp3', durationMs: FR_TRACK_DURATION_MS },
    },
    ...overrides,
  } as any);

/** Ce qui atteint réellement APNs, réduit au bloc `data` que la NSE lit. */
const pushedPayload = (sendToUser: any) => sendToUser.mock.calls[0]?.[0]?.payload ?? {};
const pushedData = (sendToUser: any) => pushedPayload(sendToUser).data ?? {};

describe('bannière d\'un vocal — la piste attachée suit la langue SERVIE', () => {
  it('un lecteur francophone reçoit la piste FRANÇAISE, pas le fichier original', async () => {
    const { service, sendToUser } = makeService('fr');

    await runVoiceNote(service);

    expect(pushedData(sendToUser).attachmentUrl).toBe(FR_TRACK_URL);
  });

  /**
   * Les trois champs voyagent ENSEMBLE. Servir la piste traduite sous le mime et
   * la durée de l'originale ferait mentir le `typeHint` UTI de la NSE et le
   * libellé « 🎤 · 0:12 » que le corps compose depuis cette durée — c'est la
   * leçon 279 : ce qui QUALIFIE une chaîne voyage avec elle.
   */
  it('le mime et la durée suivent la piste servie, jamais l\'originale', async () => {
    const { service, sendToUser } = makeService('fr');

    await runVoiceNote(service);

    const data = pushedData(sendToUser);
    expect(data.attachmentMimeType).toBe('audio/mp3');
    expect(data.attachmentDurationMs).toBe(String(FR_TRACK_DURATION_MS));
  });

  it('le corps AFFICHÉ compose sa durée depuis la piste servie', async () => {
    // 9400 ms → 0:09, jamais le 0:12 de l'original. Le corps est le seul texte
    // que les trois plateformes rendent (cycle 122).
    const { service, sendToUser } = makeService('fr');

    await runVoiceNote(service, { messagePreview: '' });

    const body = pushedPayload(sendToUser).body ?? '';
    expect(body).toContain('0:09');
    expect(body).not.toContain('0:12');
  });

  /**
   * La règle de conception du cycle : la piste est élue par la langue du TEXTE
   * SERVI, jamais par une descente indépendante. Deux descentes parallèles
   * laisseraient la bannière dire « la réunion… » au-dessus d'une piste
   * espagnole.
   */
  it('la piste élue est celle de la langue du texte servi, pas une autre du lot', async () => {
    const { service, sendToUser } = makeService('fr');

    await runVoiceNote(service, {
      attachmentTracks: {
        fr: { url: FR_TRACK_URL, mimeType: 'audio/mp3', durationMs: FR_TRACK_DURATION_MS },
        es: { url: '/api/v1/attachments/file/translated/att_es.mp3', mimeType: 'audio/mp3' },
      },
    });

    expect(pushedData(sendToUser).attachmentUrl).toBe(FR_TRACK_URL);
  });
});

describe('les trois cas où l\'ORIGINAL reste le bon fichier', () => {
  it('aucune traduction élue (lecteur anglophone) ⇒ fichier original', async () => {
    // Le Prisme n'a rien substitué : le message est DÉJÀ dans sa langue.
    const { service, sendToUser } = makeService('en');

    await runVoiceNote(service);

    const data = pushedData(sendToUser);
    expect(data.attachmentUrl).toBe(ORIGINAL_URL);
    expect(data.attachmentMimeType).toBe(ORIGINAL_MIME);
    expect(data.attachmentDurationMs).toBe(String(ORIGINAL_DURATION_MS));
  });

  it('langue élue SANS piste ⇒ fichier original — fail-OPEN sur le médium', async () => {
    // Le TTS peut manquer là où la traduction texte existe. Le son d'origine
    // vaut mieux que le silence, et le texte reste servi en français.
    const { service, sendToUser } = makeService('fr');

    await runVoiceNote(service, { attachmentTracks: {} });

    const data = pushedData(sendToUser);
    expect(data.attachmentUrl).toBe(ORIGINAL_URL);
    expect(data.attachmentMimeType).toBe(ORIGINAL_MIME);
    expect(pushedPayload(sendToUser).body ?? '').toContain(TRANSCRIPT_FR);
  });

  it('aucune carte de pistes (le cas de l\'écrasante majorité) ⇒ rien ne change', async () => {
    const { service, sendToUser } = makeService('fr');

    await runVoiceNote(service, { attachmentTracks: undefined });

    expect(pushedData(sendToUser).attachmentUrl).toBe(ORIGINAL_URL);
  });
});

/**
 * Le second défaut du lot, trouvé en LISANT le corps composé plutôt qu'en le
 * cherchant : un vocal de 12 s s'annonçait « 🎵 Audio · 0:00 ».
 *
 * `MessageAttachment.duration` est en MILLISECONDES — le schéma le dit
 * (`schema.prisma`, « Durée en MILLISECONDES ») et
 * `formatSingleAttachmentLabelI18n` le REDIT dans son doc-comment. Son unique
 * producteur, l'éventail, passe bien la colonne telle quelle. Le champ du fil,
 * lui, la multipliait par 1000 comme si elle était en secondes : un vocal de
 * 34 s partait annoncé pour 9 h 26.
 *
 * > **Deux lectures d'un MÊME champ, dans le MÊME objet littéral, sous deux
 * > unités.** Le doc-comment qui dit vrai est à quarante lignes de la ligne qui
 * > dit faux, et rien ne les confronte : c'est le nom du champ d'arrivée
 * > (`…DurationMs`) qui rend la conversion crédible.
 */
describe('la durée d\'un vocal est en MILLISECONDES de bout en bout', () => {
  it('le fil push porte la durée telle quelle, jamais multipliée par mille', async () => {
    const { service, sendToUser } = makeService('en');

    await runVoiceNote(service, { firstAttachmentDuration: 34000 });

    expect(pushedData(sendToUser).attachmentDurationMs).toBe('34000');
  });

  it('la ligne PERSISTÉE porte la même unité que le contrat client', async () => {
    // `NotificationMetadata.attachments.firstDurationMs`, décodé par le SDK iOS
    // et dont la fixture de sa propre suite pose 34000 pour 34 s.
    const { service, prisma } = makeService('en');

    await runVoiceNote(service, { firstAttachmentDuration: 34000 });

    const metadata = prisma.notification.create.mock.calls[0]?.[0]?.data?.metadata;
    expect(metadata?.attachments?.firstDurationMs).toBe(34000);
  });

  it('le corps AFFICHÉ et le fil s\'accordent sur la même durée', async () => {
    const { service, sendToUser } = makeService('en');

    await runVoiceNote(service, { firstAttachmentDuration: 34000, messagePreview: '' });

    expect(pushedPayload(sendToUser).body ?? '').toContain('0:34');
    expect(pushedData(sendToUser).attachmentDurationMs).toBe('34000');
  });
});

describe('la protection reste au-dessus de l\'élection', () => {
  /**
   * Mode d'échec du CORRECTIF, et il n'est pas théorique : la carte des pistes
   * est un chemin de PLUS par lequel un fichier peut atteindre un écran
   * verrouillé. Le verrou du cycle 125 (`notificationLocKey` ⇒ `attachmentUrl`
   * vidé) doit le fermer aussi.
   */
  it('un message protégé ne pousse NI l\'original NI la piste traduite', async () => {
    const { service, sendToUser } = makeService('fr');

    await runVoiceNote(service, { notificationLocKey: 'notification.viewOnce' });

    const data = pushedData(sendToUser);
    expect(data.attachmentUrl).toBe('');
    expect(data.attachmentMimeType).toBe('');
    expect(data.attachmentDurationMs).toBe('');
    expect(JSON.stringify(sendToUser.mock.calls)).not.toContain(FR_TRACK_URL);
  });
});
