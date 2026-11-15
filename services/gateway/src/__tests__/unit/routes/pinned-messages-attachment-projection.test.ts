/**
 * #4392 — « Quelles colonnes lourdes une LISTE sert encore ».
 *
 * `GET /conversations/:id/pinned-messages` chargeait sa relation `attachments`
 * NUE (`attachments: true`, sans projection) et la servait à travers
 * `messageSchema`, dont `items` est `messageAttachmentSchema` — le schéma
 * COMPLET. La liste des épingles poussait donc, pour CHAQUE épingle, la
 * transcription mot-à-mot d'un vocal, la carte de TOUTES ses traductions et
 * l'enveloppe de chiffrement (`encryptionIv`, `encryptionAuthTag`), plus
 * sept colonnes que le schéma de réponse jette de toute façon
 * (`encryptionHmac`, `originalFileHash`, `encryptedFileHash`,
 * `originalFileSize`, `serverKeyId`, `thumbnailEncryptionIv`,
 * `thumbnailEncryptionAuthTag`).
 *
 * Comptage des lecteurs (critère 1 de l'issue), sur les quatre surfaces :
 *   - web      : `PinnedMessageBanner.tsx` est le SEUL appelant du dépôt et son
 *                type `PinnedMessage` ne déclare pas `attachments` ;
 *   - iOS      : `ConversationsEndpoint.byIdPinnedMessages` est DÉCLARÉ et
 *                jamais appelé — `ConversationInfoSheet.pinnedMessages` filtre
 *                les messages DÉJÀ chargés ;
 *   - SDK      : idem, l'endpoint n'a aucun consommateur ;
 *   - Android  : aucun endpoint, `PinnedMessagesList.of(messages)` dérive de
 *                la liste locale.
 * Zéro lecteur ⇒ la liste sert désormais l'APERÇU canonique
 * (`attachmentForwardPreviewSelect`), dont le doc-comment porte déjà la règle :
 * « Do NOT add transcription/translations here […] the user taps through to
 * the full message for playback » — ce que fait exactement la bannière.
 *
 * Ce que ce témoin garde, et POURQUOI il est écrit ainsi :
 *   - il assert sur la VALEUR SERVIE, jamais sur le seul `select` : un témoin
 *     de `select` reste vert si le gestionnaire recompose le champ ensuite ;
 *   - le double Prisma est CONSCIENT DU SELECT (`projectBySelect`) — sans
 *     cela, un double qui rend sa fixture entière quel que soit le `select`
 *     rendrait l'assertion aveugle au correctif qu'elle mesure ;
 *   - la fixture porte une pièce jointe RÉELLE, transcription et traductions
 *     NON VIDES : un témoin de retrait écrit sur une réponse vide est
 *     trivialement vert ;
 *   - `@meeshy/shared/types/api-schemas` n'est PAS mocké — c'est
 *     `fast-json-stringify` qu'on traverse ici, donc la couche mesurée.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

// ─── Mocks (avant l'import du module de route) ────────────────────────────────

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() }) },
  performanceLogger: { child: () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() }) },
}));

const mockResolveConversationId = jest.fn<any>();
jest.mock('../../../utils/conversation-id-cache', () => ({
  resolveConversationId: (...args: any[]) => mockResolveConversationId(...args),
}));

const mockCanAccessConversation = jest.fn<any>();
jest.mock('../../../routes/conversations/utils/access-control', () => ({
  ...(jest.requireActual('../../../routes/conversations/utils/access-control') as Record<string, unknown>),
  canAccessConversation: (...args: any[]) => mockCanAccessConversation(...args),
}));

jest.mock('../../../services/PresenceVisibilityService', () => ({
  getPresenceVisibilityService: () => ({
    resolveForTargets: jest.fn<any>().mockResolvedValue(new Map()),
  }),
}));

// ─── Import après les mocks ───────────────────────────────────────────────────

import { registerMessagePinRoutes } from '../../../routes/conversations/messages-pin';

// ─── Constantes ───────────────────────────────────────────────────────────────

const CONV_ID = '507f1f77bcf86cd799439101';
const USER_ID = '507f1f77bcf86cd799439122';
const MSG_ID = '507f1f77bcf86cd799439133';
const ATT_ID = '507f1f77bcf86cd799439144';

/** L'APERÇU canonique — `attachmentForwardPreviewSelect`, à la clé près. */
const PREVIEW_KEYS = ['fileUrl', 'id', 'mimeType', 'thumbnailUrl'] as const;

/**
 * Les colonnes LOURDES que la liste ne doit plus servir. `transcription` et
 * `translations` sont celles que l'issue nomme ; l'enveloppe de chiffrement
 * voyageait avec elles dans le même `include` nu (leçon 275 : une charge se
 * mesure sur tout ce qu'elle TRANSPORTE, pas sur la seule colonne visée).
 */
const HEAVY_KEYS = [
  'transcription',
  'translations',
  'encryptionIv',
  'encryptionAuthTag',
  'encryptionHmac',
  'originalFileHash',
  'serverKeyId',
] as const;

/**
 * Une pièce jointe telle que MongoDB la porte : toutes les colonnes du modèle,
 * transcription et traductions NON VIDES.
 */
const FULL_ATTACHMENT_ROW: Record<string, unknown> = {
  id: ATT_ID,
  messageId: MSG_ID,
  fileName: 'note-vocale.m4a',
  originalName: 'Note vocale.m4a',
  mimeType: 'audio/mp4',
  fileSize: 84213,
  filePath: 'attachments/2026/09/u/note-vocale.m4a',
  fileUrl: 'https://cdn.example.com/note-vocale.m4a',
  thumbnailUrl: 'https://cdn.example.com/note-vocale.png',
  thumbnailPath: 'thumbs/2026/09/note-vocale.png',
  thumbHash: 'AQIDBAU=',
  title: null,
  alt: null,
  caption: null,
  width: null,
  height: null,
  duration: 12480,
  bitrate: 64000,
  sampleRate: 48000,
  codec: 'aac',
  channels: 1,
  fps: null,
  videoCodec: null,
  pageCount: null,
  lineCount: null,
  uploadedBy: USER_ID,
  isAnonymous: false,
  isForwarded: false,
  forwardedFromAttachmentId: null,
  capturedInApp: true,
  isViewOnce: false,
  maxViewOnceCount: null,
  viewOnceCount: 0,
  isBlurred: false,
  effectFlags: 0,
  viewedCount: 3,
  downloadedCount: 1,
  consumedCount: 2,
  deliveredToAllAt: null,
  viewedByAllAt: null,
  downloadedByAllAt: null,
  listenedByAllAt: null,
  watchedByAllAt: null,
  scanStatus: 'clean',
  scanCompletedAt: null,
  moderationStatus: 'approved',
  moderationReason: null,
  isEncrypted: true,
  encryptionMode: 'e2ee',
  encryptionIv: 'aXYtMTIzNDU2Nzg5MDEy',
  encryptionAuthTag: 'dGFnLTE2LWJ5dGVzLWFiYw==',
  encryptionHmac: 'aG1hYy1zaGEyNTYtYmFzZTY0',
  originalFileHash: 'c2hhMjU2LW9yaWdpbmFs',
  encryptedFileHash: 'c2hhMjU2LWNoaWZmcmU=',
  originalFileSize: 81920,
  serverKeyId: 'srv-key-1',
  thumbnailEncryptionIv: 'dGh1bWItaXY=',
  thumbnailEncryptionAuthTag: 'dGh1bWItdGFn',
  metadata: { audioEffectsTimeline: [{ atMs: 0, effect: 'fade-in' }] },
  createdAt: new Date('2026-09-01T10:00:00.000Z'),
  transcription: {
    type: 'audio',
    text: 'La réunion est déplacée à quinze heures.',
    language: 'fr',
    confidence: 0.94,
    source: 'whisper',
    durationMs: 12480,
    segments: [
      { text: 'La réunion', startMs: 0, endMs: 620, speakerId: 's0', confidence: 0.97, voiceSimilarityScore: null },
      { text: 'est déplacée', startMs: 620, endMs: 1480, speakerId: 's0', confidence: 0.95, voiceSimilarityScore: null },
      { text: 'à quinze heures.', startMs: 1480, endMs: 2600, speakerId: 's0', confidence: 0.91, voiceSimilarityScore: null },
    ],
  },
  translations: {
    en: {
      type: 'audio',
      transcription: 'The meeting has moved to three p.m.',
      url: 'https://cdn.example.com/note-vocale.en.mp3',
      durationMs: 11900,
      createdAt: new Date('2026-09-01T10:00:30.000Z'),
    },
    es: {
      type: 'audio',
      transcription: 'La reunión se ha movido a las tres.',
      url: 'https://cdn.example.com/note-vocale.es.mp3',
      durationMs: 12100,
      createdAt: new Date('2026-09-01T10:00:35.000Z'),
    },
  },
};

/**
 * Projection à la manière de Prisma : un `select` ne rend QUE ses clés. Sans
 * ce dépouillement, le double rendrait sa fixture entière et le témoin
 * n'observerait jamais l'effet du correctif — il mesurerait sa propre fixture.
 * `attachments: true` (la relation NUE, le défaut visé) rend la ligne ENTIÈRE.
 */
function projectBySelect(row: Record<string, unknown>, select: unknown): Record<string, unknown> {
  if (select === true || select === undefined) return { ...row };
  const spec = (select as { select?: Record<string, unknown> }).select ?? (select as Record<string, unknown>);
  return Object.keys(spec).reduce<Record<string, unknown>>((acc, key) => {
    if (spec[key] === true && key in row) return { ...acc, [key]: row[key] };
    return acc;
  }, {});
}

const PINNED_ROW = {
  id: MSG_ID,
  conversationId: CONV_ID,
  senderId: 'participant-1',
  content: 'Rappel : réunion déplacée',
  originalLanguage: 'fr',
  messageType: 'text',
  editedAt: null,
  deletedAt: null,
  replyToId: null,
  forwardedFromId: null,
  forwardedFromConversationId: null,
  pinnedAt: new Date('2026-09-01T11:00:00.000Z'),
  pinnedBy: USER_ID,
  isViewOnce: false,
  isBlurred: false,
  expiresAt: null,
  effectFlags: 0,
  translations: {
    en: {
      text: 'Reminder: meeting moved',
      translationModel: 'premium' as const,
      createdAt: new Date('2026-09-01T10:00:10.000Z'),
    },
  },
  createdAt: new Date('2026-09-01T10:00:00.000Z'),
  updatedAt: new Date('2026-09-01T10:00:00.000Z'),
  metadata: null,
  sender: {
    id: 'participant-1',
    userId: USER_ID,
    displayName: 'Alice',
    avatar: null,
    type: 'member',
    user: {
      id: USER_ID,
      username: 'alice',
      firstName: 'Alice',
      lastName: null,
      displayName: 'Alice',
      avatar: null,
      isOnline: true,
    },
  },
  _count: { reactions: 0, replies: 0 },
};

function buildApp(): { app: FastifyInstance; prisma: any; captured: { select?: any } } {
  const captured: { select?: any } = {};
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  (app as any).socketIOHandler = { getManager: () => null };

  const prisma: any = {
    participant: {
      findFirst: jest.fn<any>().mockResolvedValue({
        id: 'reader-part-id',
        userId: USER_ID,
        isActive: true,
        role: 'member',
        joinedAt: new Date('2026-01-01T00:00:00.000Z'),
        shareLinkId: null,
        historyVisibleFrom: null,
        permissions: null,
        anonymousSession: null,
        user: null,
      }),
    },
    userConversationPreferences: { findFirst: jest.fn<any>().mockResolvedValue(null) },
    userMessageDeletion: { findMany: jest.fn<any>().mockResolvedValue([]) },
    message: {
      findMany: jest.fn<any>(async ({ select }: { select: Record<string, unknown> }) => {
        captured.select = select;
        return [{ ...PINNED_ROW, attachments: [projectBySelect(FULL_ATTACHMENT_ROW, select.attachments)] }];
      }),
      count: jest.fn<any>().mockResolvedValue(1),
    },
  };

  const authMiddleware = async (req: any) => {
    req.authContext = {
      type: 'registered',
      isAuthenticated: true,
      isAnonymous: false,
      userId: USER_ID,
      registeredUser: { id: USER_ID, role: 'USER' },
    };
  };

  registerMessagePinRoutes(app, prisma, authMiddleware, (app as any).socketIOHandler);
  return { app, prisma, captured };
}

async function servedAttachment(): Promise<{ attachment: Record<string, unknown>; body: any; captured: { select?: any } }> {
  const { app, captured } = buildApp();
  await app.ready();
  try {
    const res = await app.inject({ method: 'GET', url: `/conversations/${CONV_ID}/pinned-messages` });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    return { attachment: body.data[0].attachments[0], body, captured };
  } finally {
    await app.close();
  }
}

// ─────────────────────────────────────────────────────────────────────────────

describe('GET /conversations/:id/pinned-messages — la pièce jointe servie est un APERÇU (#4392)', () => {
  beforeEach(() => {
    mockResolveConversationId.mockResolvedValue(CONV_ID);
    mockCanAccessConversation.mockResolvedValue(true);
  });

  it('ne sert plus AUCUNE colonne lourde — ni Prisme, ni enveloppe de chiffrement', async () => {
    const { attachment } = await servedAttachment();

    for (const key of HEAVY_KEYS) {
      expect(attachment).not.toHaveProperty(key);
    }
  });

  it("sert EXACTEMENT le jeu de clés de l'aperçu — un retrait qui emporte un voisin tombe ici", async () => {
    const { attachment } = await servedAttachment();

    expect(Object.keys(attachment).sort()).toEqual([...PREVIEW_KEYS]);
    expect(attachment).toEqual({
      id: ATT_ID,
      mimeType: 'audio/mp4',
      fileUrl: 'https://cdn.example.com/note-vocale.m4a',
      thumbnailUrl: 'https://cdn.example.com/note-vocale.png',
    });
  });

  it('la relation `attachments` porte sa PROPRE projection — jamais la relation nue', async () => {
    const { captured } = await servedAttachment();

    expect(captured.select).toBeDefined();
    expect(captured.select.attachments).not.toBe(true);
    expect(captured.select.attachments).toHaveProperty('select');
  });

  it("le RESTE de la ligne épinglée est intact — le message, son Prisme, son auteur, sa pagination", async () => {
    const { body } = await servedAttachment();
    const row = body.data[0];

    expect(row.id).toBe(MSG_ID);
    expect(row.content).toBe('Rappel : réunion déplacée');
    expect(row.originalLanguage).toBe('fr');
    expect(row.pinnedBy).toBe(USER_ID);
    // Le Prisme du MESSAGE (`transformTranslationsToArray`) reste servi : c'est
    // lui que `PinnedMessageBanner` lit pour rendre l'aperçu dans la langue du
    // lecteur. Seul le Prisme de la PIÈCE JOINTE part.
    expect(row.translations).toEqual([
      expect.objectContaining({ targetLanguage: 'en', translatedContent: 'Reminder: meeting moved' }),
    ]);
    expect(row.sender).toEqual(expect.objectContaining({ username: 'alice', displayName: 'Alice' }));
    expect(body.pagination).toEqual({ total: 1, offset: 0, limit: 50, hasMore: false });
  });
});
