/**
 * #4392 — « Quelles colonnes lourdes une LISTE sert encore ».
 *
 * L'issue porte `GET /conversations/:conversationId/attachments` comme servant
 * « `transcription` (texte + segments mot-à-mot) et `translations` (toutes
 * langues), systématiquement, pour jusqu'à 100 pièces ». La MESURE dit
 * autrement, et c'est le cœur de ce témoin : la route **les CHARGE** —
 * `AttachmentService.getConversationAttachments` les demande à MongoDB pour
 * chaque pièce de la page — et **n'en SERT aucune** : son schéma de réponse est
 * `messageAttachmentMinimalSchema`, sept clés, et `fast-json-stringify`
 * supprime tout ce qu'aucun schéma ne déclare.
 *
 * « Chargé » ≠ « servi ». Aucun client ne PEUT lire ces colonnes ici, quelle
 * que soit sa bonne volonté : le comptage des lecteurs rend zéro par
 * CONSTRUCTION, avant même d'ouvrir un client. Le comptage l'a confirmé
 * indépendamment — web : `AttachmentGallery.tsx` via
 * `AttachmentService.getConversationAttachments`, qui ne mentionne ni l'une ni
 * l'autre ; iOS/SDK : `ConversationsEndpoint.byConversationIdAttachments` est
 * DÉCLARÉ et jamais appelé ; Android : aucun endpoint.
 *
 * Ce que ce témoin GARDE : le jeu de clés SERVI, exactement. Il tombe dans les
 * deux sens —
 *   - si le schéma de réponse est élargi (`messageAttachmentSchema` à la place
 *     du minimal), les colonnes lourdes repartent sur le fil et l'assertion de
 *     jeu EXACT rougit ;
 *   - si une clé du minimal disparaît, elle rougit aussi.
 * C'est le PRÉALABLE que #3909 nomme : déclarer le champ vient AVANT le
 * projeter. Tant que ce témoin tient, retirer les deux colonnes du `select`
 * de `AttachmentService` ne change RIEN au fil — c'est du travail mort, au
 * sens exact de #4177.
 *
 * `@meeshy/shared/types/api-schemas` n'est PAS mocké ici : c'est
 * `fast-json-stringify` qu'on mesure, donc la couche à traverser. (Le harnais
 * voisin `unit/routes/attachments-metadata.test.ts` la mocke avec un faux
 * schéma — il ne peut donc rien dire du contrat réel.)
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';

jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn(() => ({ info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() })),
  },
}));

const mockGetConversationAttachments = jest.fn<any>().mockResolvedValue([]);

jest.mock('../../../../services/attachments', () => ({
  AttachmentService: jest.fn().mockImplementation(() => ({
    getAttachmentWithMetadata: jest.fn<any>().mockResolvedValue(null),
    getAttachment: jest.fn<any>().mockResolvedValue(null),
    deleteAttachment: jest.fn<any>().mockResolvedValue(undefined),
    getConversationAttachments: (...args: any[]) => mockGetConversationAttachments(...args),
  })),
}));

jest.mock('../../../../services/historyFloor', () => ({
  HISTORY_FLOOR_PARTICIPANT_SELECT: { id: true },
  loadHistoryFloor: jest.fn<any>().mockResolvedValue(null),
}));

jest.mock('../../../../services/personalHistoryFilter', () => ({
  loadPersonalHistoryHiding: jest.fn<any>().mockResolvedValue({ clearHistoryBefore: null, hiddenMessageIds: [] }),
  applyPersonalHistoryHiding: (where: unknown) => where,
}));

import { registerMetadataRoutes } from '../../../../routes/attachments/metadata';

const USER_ID = '507f1f77bcf86cd799439011';
const CONVERSATION_ID = '507f1f77bcf86cd799439022';
const ATT_ID = '507f1f77bcf86cd799439033';

/** Le contrat SERVI par la liste — `messageAttachmentMinimalSchema`, à la clé près. */
const SERVED_KEYS = [
  'duration', 'fileName', 'fileSize', 'fileUrl', 'id', 'mimeType', 'thumbnailUrl',
] as const;

/**
 * Ce que le service rend RÉELLEMENT (son `select` demande les deux colonnes
 * lourdes) : une pièce jointe complète, transcription et traductions NON
 * VIDES. Un témoin de retrait écrit sur une réponse vide serait trivialement
 * vert — ici la charge est pleine, et c'est le sérialiseur qui la vide.
 */
const SERVICE_ROW: Record<string, unknown> = {
  id: ATT_ID,
  messageId: '507f1f77bcf86cd799439044',
  fileName: 'note-vocale.m4a',
  originalName: 'Note vocale.m4a',
  mimeType: 'audio/mp4',
  fileSize: 84213,
  fileUrl: 'https://cdn.example.com/note-vocale.m4a',
  thumbnailUrl: 'https://cdn.example.com/note-vocale.png',
  width: undefined,
  height: undefined,
  duration: 12480,
  bitrate: 64000,
  sampleRate: 48000,
  codec: 'aac',
  channels: 1,
  uploadedBy: USER_ID,
  isAnonymous: false,
  createdAt: '2026-09-01T10:00:00.000Z',
  isForwarded: false,
  capturedInApp: true,
  isViewOnce: false,
  viewOnceCount: 0,
  isBlurred: false,
  viewedCount: 3,
  downloadedCount: 1,
  consumedCount: 2,
  isEncrypted: false,
  transcription: {
    type: 'audio',
    text: 'La réunion est déplacée à quinze heures.',
    language: 'fr',
    confidence: 0.94,
    source: 'whisper',
    durationMs: 12480,
    segments: [
      { text: 'La réunion', startMs: 0, endMs: 620, speakerId: 's0', confidence: 0.97 },
      { text: 'est déplacée', startMs: 620, endMs: 1480, speakerId: 's0', confidence: 0.95 },
      { text: 'à quinze heures.', startMs: 1480, endMs: 2600, speakerId: 's0', confidence: 0.91 },
    ],
  },
  translations: {
    en: { type: 'audio', transcription: 'The meeting has moved to three p.m.', url: 'https://cdn.example.com/x.en.mp3', createdAt: '2026-09-01T10:00:30.000Z' },
    es: { type: 'audio', transcription: 'La reunión se ha movido a las tres.', url: 'https://cdn.example.com/x.es.mp3', createdAt: '2026-09-01T10:00:35.000Z' },
  },
  translatedAudios: [
    { id: `${ATT_ID}_en`, type: 'audio', targetLanguage: 'en', translatedText: 'The meeting has moved to three p.m.', url: 'https://cdn.example.com/x.en.mp3' },
  ],
};

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  const prisma: any = {
    participant: {
      findFirst: jest.fn<any>().mockResolvedValue({ id: 'part-1', conversationId: CONVERSATION_ID }),
      findUnique: jest.fn<any>().mockResolvedValue(null),
    },
  };
  app.decorate('prisma', prisma);

  const authContext = {
    isAuthenticated: true, isAnonymous: false, userId: USER_ID,
    registeredUser: { id: USER_ID, role: 'USER' },
  };
  const setAuth = async (req: FastifyRequest) => { (req as any).authContext = authContext; };

  await registerMetadataRoutes(app, setAuth, setAuth, prisma);
  await app.ready();
  return app;
}

async function servedAttachment(): Promise<Record<string, unknown>> {
  mockGetConversationAttachments.mockResolvedValueOnce([SERVICE_ROW]);
  const app = await buildApp();
  try {
    const res = await app.inject({
      method: 'GET',
      url: `/conversations/${CONVERSATION_ID}/attachments?type=audio&limit=100`,
    });
    expect(res.statusCode).toBe(200);
    return JSON.parse(res.payload).data.attachments[0];
  } finally {
    await app.close();
  }
}

// ─────────────────────────────────────────────────────────────────────────────

describe('GET /conversations/:id/attachments — CHARGÉ ≠ SERVI (#4392)', () => {
  it("le service rend transcription et translations PLEINES — la galerie n'en voit rien", async () => {
    const attachment = await servedAttachment();

    // La charge remise par le service les porte…
    expect(SERVICE_ROW.transcription).toHaveProperty('segments');
    expect(Object.keys(SERVICE_ROW.translations as object)).toEqual(['en', 'es']);
    // …et le sérialiseur les retire, faute d'être déclarées au schéma.
    expect(attachment).not.toHaveProperty('transcription');
    expect(attachment).not.toHaveProperty('translations');
    expect(attachment).not.toHaveProperty('translatedAudios');
  });

  it('sert EXACTEMENT les sept clés de `messageAttachmentMinimalSchema`', async () => {
    const attachment = await servedAttachment();

    expect(Object.keys(attachment).sort()).toEqual([...SERVED_KEYS]);
    expect(attachment).toEqual({
      id: ATT_ID,
      fileName: 'note-vocale.m4a',
      mimeType: 'audio/mp4',
      fileSize: 84213,
      fileUrl: 'https://cdn.example.com/note-vocale.m4a',
      thumbnailUrl: 'https://cdn.example.com/note-vocale.png',
      duration: 12480,
    });
  });

  it("les colonnes que la galerie web RENDRAIT ne sont pas servies non plus — le constat, pas le correctif", async () => {
    // `AttachmentGallery.tsx` lit `messageId`, `originalName`, `uploadedBy`,
    // `createdAt`, `width`, `height` sur les pièces de CETTE route. Aucune
    // n'est déclarée au schéma minimal : le panneau d'information de la
    // galerie est vide par construction. Ce témoin le CONSTATE (dimension 13,
    // complétude) ; l'élargir est une décision produit, hors de ce lot.
    const attachment = await servedAttachment();

    for (const key of ['messageId', 'originalName', 'uploadedBy', 'createdAt', 'width', 'height']) {
      expect(attachment).not.toHaveProperty(key);
    }
  });
});
