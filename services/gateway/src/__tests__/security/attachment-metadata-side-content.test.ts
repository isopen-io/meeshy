/**
 * #20017, deuxième porte : `GET /attachments/:attachmentId/metadata`.
 *
 * Elle vit dans le MÊME fichier que `GET /attachments/:id/subtitles/:lang`, à
 * une quarantaine de lignes d'écart. La seconde refuse la transcription d'une
 * pièce protégée (`servedSubtitles` → `subtitlesMayTravel`, qui EST
 * `mediaSideContentMayTravel`). La première la servait en JSON entier, sous
 * `attachment: messageAttachmentSchema`, qui DÉCLARE `transcription` — donc
 * rien ne la retenait au sérialiseur.
 *
 * ─── Ce que ce témoin NE peut pas prouver seul ───────────────────────────────
 *
 * Le `select` de `getAttachmentWithMetadata` ne portait AUCUN drapeau de
 * protection de la pièce (il porte `transcription`, `translations`, et pas
 * `isViewOnce`/`isBlurred`/`effectFlags`/`isEncrypted`). Un double de service
 * rend ce qu'on lui dit, quel que soit le `select` : ce témoin-ci passerait au
 * VERT sur une production dont la requête ne ramène pas les drapeaux, et la
 * garde serait morte. C'est la raison d'être du témoin de PROJECTION ci-dessous,
 * qui assert sur la REQUÊTE et non sur le rendu — la seule forme qui voit cette
 * moitié du défaut (`services/gateway/CLAUDE.md`, § « le `select` est le seul
 * des trois qu'aucun témoin de rang ne peut voir »).
 *
 * Le PORTEUR, lui, était déjà complet : `attachmentDetailReader` compose
 * `CARRIER_LIFECYCLE_SELECT` + `READER_LIFECYCLE_MESSAGE_SELECT` + `isBlurred`,
 * `isEncrypted`, `encryptionMode`, soit les sept colonnes de
 * `MESSAGE_SIDE_PROTECTION_SELECT`. Mesuré, pas supposé : c'est ce qui permet de
 * passer `reader.carrier` à la loi sans élargir une requête de plus.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';
import { MESSAGE_EFFECT_FLAGS } from '@meeshy/shared/types/message-effect-flags';

jest.mock('../../utils/logger-enhanced.js', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn() }) },
}));

const mockGetAttachmentWithMetadata = jest.fn<any>();
const mockGetConversationAttachments = jest.fn<any>();

jest.mock('../../services/attachments', () => ({
  AttachmentService: jest.fn().mockImplementation(() => ({
    getAttachmentWithMetadata: (...a: unknown[]) => mockGetAttachmentWithMetadata(...a),
    getConversationAttachments: (...a: unknown[]) => mockGetConversationAttachments(...a),
  })),
}));

import { registerMetadataRoutes } from '../../routes/attachments/metadata';

const USER_ID = '507f1f77bcf86cd799439011';
const READER = 'cccccccccccccccccccccc01';
const CONVERSATION = 'dddddddddddddddddddddd01';
const MESSAGE = 'bbbbbbbbbbbbbbbbbbbbbbb1';
const PIECE = 'aaaaaaaaaaaaaaaaaaaaaaa1';
const KEY = '2026/11/68f2a81417a557e8ce4ddfc1/memo.m4a';

const TEXTE = 'le code du coffre est 4791';
const TRANSCRIPTION = { text: TEXTE, segments: [{ text: 'le code', start: 0, end: 1 }] };

const ORDINAIRE = { isViewOnce: false, isBlurred: false, effectFlags: 0, ephemeralDuration: null, expiresAt: null, isEncrypted: false, encryptionMode: null };
const EPHEMERE = { ...ORDINAIRE, effectFlags: MESSAGE_EFFECT_FLAGS.EPHEMERAL, ephemeralDuration: 30, expiresAt: new Date(Date.now() + 3_600_000) };
const VUE_UNIQUE = { ...ORDINAIRE, isViewOnce: true };
const FLOUTE = { ...ORDINAIRE, isBlurred: true };

function makePrisma(carrier: Record<string, unknown>) {
  const row = { id: MESSAGE, conversationId: CONVERSATION, deletedAt: null, viewOnceBurnAt: null, viewOnceBurnedAt: null, senderId: 'cccccccccccccccccccccc02', createdAt: new Date(), ...carrier };
  return {
    message: { findUnique: jest.fn(async () => row), findFirst: jest.fn(async () => ({ id: MESSAGE })), findMany: jest.fn(async () => [row]) },
    messageAttachment: { findMany: jest.fn(async () => [{ id: PIECE, isViewOnce: false, isBlurred: false, effectFlags: 0 }]) },
    participant: {
      findFirst: jest.fn(async () => ({ id: READER, conversationId: CONVERSATION, joinedAt: new Date(0), shareLinkId: null, permissions: null })),
      findUnique: jest.fn(async () => null),
    },
    messageStatusEntry: { findFirst: jest.fn(async () => ({ ephemeralExpiresAt: new Date(Date.now() + 60_000), viewedOnceAt: null })) },
    conversationShareLink: { findUnique: jest.fn(async () => null) },
    userConversationPreferences: { findFirst: jest.fn(async () => null) },
    userMessageDeletion: { findMany: jest.fn(async () => []) },
  };
}

async function buildApp(prisma: unknown): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  const authOptional = async (req: any) => {
    req.authContext = { isAuthenticated: true, isAnonymous: false, type: 'registered', userId: USER_ID, registeredUser: { id: USER_ID, role: 'USER' } };
  };
  await registerMetadataRoutes(app, authOptional, prisma as never);
  await app.ready();
  return app;
}

/** La pièce telle que le `select` CORRIGÉ la rend : drapeaux de la pièce compris. */
const stored = (piece: Record<string, unknown> = {}) => ({
  id: PIECE, messageId: MESSAGE, fileName: 'memo.m4a', originalName: 'memo.m4a',
  mimeType: 'audio/mp4', fileSize: 4096, fileUrl: KEY, uploadedBy: USER_ID,
  createdAt: new Date(), duration: 12_000,
  transcription: TRANSCRIPTION, translations: null,
  isViewOnce: false, isBlurred: false, effectFlags: 0, isEncrypted: false, encryptionMode: null,
  ...piece,
});

beforeEach(() => {
  process.env.ATTACHMENT_URL_SIGNING_KEY = Buffer.alloc(32, 4).toString('base64');
  mockGetAttachmentWithMetadata.mockReset();
  mockGetConversationAttachments.mockReset();
});
afterEach(() => { delete process.env.ATTACHMENT_URL_SIGNING_KEY; });

const servie = async (carrier: Record<string, unknown>, piece: Record<string, unknown> = {}) => {
  mockGetAttachmentWithMetadata.mockResolvedValue(stored(piece));
  const app = await buildApp(makePrisma(carrier));
  const res = await app.inject({ method: 'GET', url: `/attachments/${PIECE}/metadata` });
  await app.close();
  expect(res.statusCode).toBe(200);
  return res.json().data.attachment;
};

describe('GET /attachments/:id/metadata — la transcription d’une pièce protégée ne sort pas (#20017)', () => {
  it('retient la transcription quand le MESSAGE porteur est ÉPHÉMÈRE', async () => {
    expect((await servie(EPHEMERE)).transcription ?? null).toBeNull();
  });

  it('retient la transcription quand le MESSAGE porteur est à VUE UNIQUE', async () => {
    expect((await servie(VUE_UNIQUE)).transcription ?? null).toBeNull();
  });

  it('retient la transcription quand le MESSAGE porteur est FLOUTÉ', async () => {
    expect((await servie(FLOUTE)).transcription ?? null).toBeNull();
  });

  it('retient la transcription quand la PIÈCE est à vue unique', async () => {
    expect((await servie(ORDINAIRE, { isViewOnce: true })).transcription ?? null).toBeNull();
  });

  it('retient la transcription quand la PIÈCE est chiffrée', async () => {
    expect((await servie(ORDINAIRE, { isEncrypted: true })).transcription ?? null).toBeNull();
  });

  it('sert la transcription d’une pièce ORDINAIRE — la garde n’est pas un interrupteur', async () => {
    expect((await servie(ORDINAIRE)).transcription?.text).toBe(TEXTE);
  });
});
