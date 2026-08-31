/**
 * CE QUE LA GALERIE SERT VRAIMENT — `GET /conversations/:conversationId/attachments`.
 *
 * Ce fichier est le JUMEAU de `attachments-metadata.test.ts` sur un point, et
 * c'est tout son objet : il ne MOQUE PAS `@meeshy/shared/types/api-schemas`.
 *
 * `fast-json-stringify` TRONQUE en silence tout champ qu'un schéma de réponse
 * ne déclare pas. Un test qui remplace le schéma par un bouchon mesure donc son
 * propre bouchon : il verrait passer n'importe quel champ, y compris ceux que
 * la production retire. Le seul témoin capable de dire ce qu'un client REÇOIT
 * est celui qui laisse le vrai schéma sérialiser la vraie charge.
 *
 * Ce que la galerie doit servir, et pourquoi :
 *
 *   • `originalName` — le nom que l'utilisateur reconnaît. `fileName` est le nom
 *     de STOCKAGE (`a-2.m4a`) ;
 *   • `createdAt` — l'ordre. Sans lui, une galerie qui fusionne deux types (la
 *     puce « Fichiers » de la v3 sert `document` ET `text`) ne peut PAS les
 *     entrelacer par date ;
 *   • `transcription` et `translations` — le PRISME. `AttachmentService` les
 *     lit déjà en base ; le schéma les jetait juste avant l'envoi, si bien
 *     qu'aucune surface ne pouvait servir la transcription d'un vocal dans la
 *     langue de son lecteur depuis cette porte.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

jest.mock('../../../utils/logger-enhanced.js', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn() }) },
}));

const mockGetConversationAttachments = jest.fn<any>();

jest.mock('../../../services/attachments', () => ({
  AttachmentService: jest.fn().mockImplementation(() => ({
    getAttachmentWithMetadata: jest.fn(),
    getAttachment: jest.fn(),
    deleteAttachment: jest.fn(),
    getConversationAttachments: (...a: any[]) => mockGetConversationAttachments(...a),
  })),
}));

import { registerMetadataRoutes } from '../../../routes/attachments/metadata';

const USER_ID = '507f1f77bcf86cd799439011';
const CONV_ID = 'conv-222bbb';
const PARTICIPANT_ID = 'part-333ccc';

const VOCAL = {
  id: 'att-1',
  messageId: 'msg-1',
  fileName: 'a-2.m4a',
  originalName: 'note-vocale.m4a',
  mimeType: 'audio/mp4',
  fileSize: 96_000,
  fileUrl: 'https://gate.test/api/v1/attachments/file/2026/08/a-2.m4a',
  thumbnailUrl: null,
  duration: 23_000,
  createdAt: new Date('2026-08-30T12:02:00.000Z'),
  transcription: {
    text: 'Mo ti de ibi ipade.',
    language: 'yo',
    confidence: 0.94,
    source: 'whisper',
  },
  translations: {
    fr: {
      type: 'audio',
      transcription: 'Je suis arrivé au lieu du rendez-vous.',
      url: 'https://gate.test/tts/att-1-fr.mp3',
      format: 'mp3',
      createdAt: '2026-08-30T12:02:30.000Z',
    },
  },
};

const prismaDeBase = () => ({
  participant: {
    findFirst: jest.fn<any>().mockResolvedValue({
      id: PARTICIPANT_ID,
      conversationId: CONV_ID,
      joinedAt: new Date('2026-08-01T00:00:00.000Z'),
      shareLinkId: null,
    }),
    findUnique: jest.fn<any>().mockResolvedValue(null),
  },
  conversationShareLink: { findUnique: jest.fn<any>().mockResolvedValue({ allowViewHistory: true }) },
  userConversationPreferences: { findFirst: jest.fn<any>().mockResolvedValue(null) },
  userMessageDeletion: { findMany: jest.fn<any>().mockResolvedValue([]) },
});

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });

  const authRequired = async (req: any) => {
    (req as any).authContext = { isAuthenticated: true, isAnonymous: false, type: 'registered', userId: USER_ID };
  };
  const authOptional = authRequired;

  await registerMetadataRoutes(app, authRequired, authOptional, prismaDeBase() as any);
  await app.ready();
  return app;
}

const servi = async (): Promise<any> => {
  mockGetConversationAttachments.mockResolvedValue([VOCAL]);
  const app = await buildApp();
  const res = await app.inject({ method: 'GET', url: `/conversations/${CONV_ID}/attachments` });
  await app.close();

  expect(res.statusCode).toBe(200);
  return JSON.parse(res.body).data.attachments[0];
};

describe('GET /conversations/:id/attachments — ce que le schéma laisse passer', () => {
  it('sert l’identité, l’adresse et le poids de la pièce jointe', async () => {
    const piece = await servi();

    expect(piece.id).toBe('att-1');
    expect(piece.fileUrl).toBe(VOCAL.fileUrl);
    expect(piece.fileSize).toBe(96_000);
    expect(piece.duration).toBe(23_000);
  });

  it('sert le nom d’ORIGINE, pas seulement le nom de stockage', async () => {
    const piece = await servi();

    expect(piece.fileName).toBe('a-2.m4a');
    expect(piece.originalName).toBe('note-vocale.m4a');
  });

  it('sert la date, sans laquelle aucune galerie ne peut ordonner', async () => {
    expect((await servi()).createdAt).toBe('2026-08-30T12:02:00.000Z');
  });

  /**
   * LE PRISME. `AttachmentService.getConversationAttachments` sélectionne déjà
   * ces deux colonnes ; le schéma de réponse les retirait juste avant l'envoi.
   * Une surface qui voulait servir la transcription d'un vocal dans la langue de
   * son lecteur depuis cette porte ne le pouvait donc pas — et le manque était
   * INVISIBLE, la requête ayant bien lu les données.
   */
  it('sert la transcription et ses traductions — texte ET piste', async () => {
    const piece = await servi();

    expect(piece.transcription).toEqual(
      expect.objectContaining({ text: 'Mo ti de ibi ipade.', language: 'yo' }),
    );
    expect(piece.translations.fr).toEqual(
      expect.objectContaining({
        transcription: 'Je suis arrivé au lieu du rendez-vous.',
        url: 'https://gate.test/tts/att-1-fr.mp3',
      }),
    );
  });
});
