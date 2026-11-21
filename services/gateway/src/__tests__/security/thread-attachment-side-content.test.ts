/**
 * #20017, quatrième porte : `GET /conversations/:id/threads/:messageId`.
 *
 * `servedThreadAttachment` appliquait `servedAttachmentTranslations` — qui
 * retire le CHEMIN DISQUE de chaque piste (#19672) — et rien d'autre. C'est
 * encore la moitié de la loi : la transcription et la description partaient
 * dans le même objet littéral, et le schéma du fil est
 * `additionalProperties: true`, donc il ne retient RIEN.
 *
 * ─── Le porteur était déjà là, mesuré ────────────────────────────────────────
 *
 * `threadMessageSelect` répand `MESSAGE_PROTECTION_SELECT` (`isViewOnce`,
 * `isBlurred`, `effectFlags`, `expiresAt`, `ephemeralDuration`), déclare
 * `deletedAt`, et répand `AT_REST_MESSAGE_SELECT` (`isEncrypted`,
 * `encryptionMode`) : les sept colonnes de `MESSAGE_SIDE_PROTECTION_SELECT`
 * sont servies au message de fil lui-même. La loi n'a donc besoin d'aucune
 * requête de plus — le message du fil EST le porteur de ses pièces.
 *
 * Ce qui manquait, comme sur les trois portes précédentes, ce sont les drapeaux
 * de la PIÈCE : `attachmentMediaSelect` ne les porte pas.
 *
 * ─── Pourquoi ce fichier double `attachmentIncludes` avec `requireActual` ────
 *
 * `__tests__/unit/routes/conversations/threads.test.ts` en pose un double
 * PARTIEL (cinq champs de `attachmentMediaSelect`, et rien d'autre). Sous un
 * tel double, `attachmentProtectionSelect` vaut `undefined`, son spread est un
 * no-op silencieux, et un témoin de ce fichier-ci ne pourrait pas voir si la
 * production demande les drapeaux. C'est le patron que le dépôt proscrit — « un
 * double PARTIEL d'un module perd en silence tout ce que le module GAGNE »
 * (cycles 86, 91, 93, 104). Ici : `requireActual`, et aucune surcharge.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';
import { MESSAGE_EFFECT_FLAGS } from '@meeshy/shared/types/message-effect-flags';

const mockResolveConversationId = jest.fn<any>().mockResolvedValue('507f1f77bcf86cd799439022');
const mockCanAccessConversation = jest.fn<any>().mockResolvedValue(true);

jest.mock('../../utils/conversation-id-cache', () => ({
  resolveConversationId: (...args: any[]) => mockResolveConversationId(...args),
}));

jest.mock('../../routes/conversations/utils/access-control', () =>
  (jest.requireActual('../helpers/acces-conversation-double') as any).doubleAccesConversation(
    jest.requireActual('../../routes/conversations/utils/access-control') as Record<string, unknown>,
    (...args: any[]) => mockCanAccessConversation(...args)));

jest.mock('../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: jest.fn(() => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn() })) },
}));

import { registerThreadsRoutes } from '../../routes/conversations/threads';

const USER_ID = '507f1f77bcf86cd799439011';
const CONV_ID = '507f1f77bcf86cd799439022';
const MSG_ID = '507f1f77bcf86cd799439033';

const TEXTE = 'le code du coffre est 4791';
const TRANSCRIPTION = { text: TEXTE, segments: [{ text: 'le code', start: 0, end: 1 }] };

const PIECE_NUE = {
  id: 'aaaaaaaaaaaaaaaaaaaaaaa1',
  messageId: MSG_ID,
  fileName: 'memo.m4a',
  mimeType: 'audio/mp4',
  fileUrl: '/uploads/memo.m4a',
  thumbnailUrl: null,
  duration: 12_000,
  transcription: TRANSCRIPTION,
  translations: { fr: { type: 'audio', transcription: TEXTE, url: '/f/fr.mp3' } },
  alt: 'un mémo vocal',
  isViewOnce: false,
  isBlurred: false,
  effectFlags: 0,
  isEncrypted: false,
  encryptionMode: null,
};

const PORTEUR_NU = {
  isViewOnce: false, isBlurred: false, effectFlags: 0, expiresAt: null,
  ephemeralDuration: null, deletedAt: null, isEncrypted: false, encryptionMode: null,
};

const messageDeFil = (piece: Record<string, unknown>, porteur: Record<string, unknown>) => ({
  id: MSG_ID,
  content: 'écoute ça',
  originalLanguage: 'fr',
  conversationId: CONV_ID,
  senderId: 'part-1',
  messageType: 'audio',
  messageSource: null,
  editedAt: null,
  replyToId: null,
  reactionSummary: {},
  reactionCount: 0,
  translations: {},
  validatedMentions: [],
  createdAt: new Date('2026-11-20T09:00:00.000Z'),
  updatedAt: new Date('2026-11-20T09:00:00.000Z'),
  sender: null,
  attachments: [{ ...PIECE_NUE, ...piece }],
  replyTo: null,
  _count: { reactions: 0, statusEntries: 0 },
  ...PORTEUR_NU,
  ...porteur,
});

function makePrisma(row: Record<string, unknown>) {
  return {
    message: {
      findFirst: jest.fn<any>().mockResolvedValue(row),
      findMany: jest.fn<any>().mockResolvedValue([]),
    },
    participant: { findFirst: jest.fn<any>().mockResolvedValue(null) },
    conversationShareLink: { findUnique: jest.fn<any>().mockResolvedValue(null) },
  };
}

async function servie(piece: Record<string, unknown> = {}, porteur: Record<string, unknown> = {}): Promise<any> {
  const app: FastifyInstance = Fastify({ logger: false });
  const auth = async (req: FastifyRequest) => {
    (req as any).authContext = { isAuthenticated: true, userId: USER_ID, registeredUser: { id: USER_ID, role: 'USER' } };
  };
  registerThreadsRoutes(app, makePrisma(messageDeFil(piece, porteur)) as any, auth as any);
  await app.ready();
  const res = await app.inject({ method: 'GET', url: `/conversations/${CONV_ID}/threads/${MSG_ID}` });
  await app.close();
  expect(res.statusCode).toBe(200);
  const body = res.json();
  // `data.parent` — la forme RÉELLE de la route, relevée sur sa réponse. Une
  // navigation qui retombe sur `{}` rendrait les cinq assertions de protection
  // VACUES (`undefined ?? null` est `null`) : seul le témoin de la pièce
  // ORDINAIRE pouvait le voir, et c'est lui qui l'a vu.
  const att = (body.data?.parent?.attachments ?? [])[0];
  if (!att) throw new Error(`forme inattendue: ${JSON.stringify(body).slice(0, 700)}`);
  return att;
}

describe('GET …/threads — la transcription d’une pièce protégée ne sort pas du fil (#20017)', () => {
  it.each([
    ['le MESSAGE du fil est ÉPHÉMÈRE', {}, { expiresAt: new Date('2026-11-20T12:00:00.000Z'), effectFlags: MESSAGE_EFFECT_FLAGS.EPHEMERAL }],
    ['le MESSAGE du fil est à VUE UNIQUE', {}, { isViewOnce: true }],
    ['le MESSAGE du fil est FLOUTÉ', {}, { isBlurred: true }],
    ['la PIÈCE est à vue unique', { isViewOnce: true }, {}],
    ['la PIÈCE est chiffrée', { isEncrypted: true }, {}],
  ])('retient transcription et description quand %s', async (_nom, piece, porteur) => {
    const att = await servie(piece, porteur);

    expect(att.transcription ?? null).toBeNull();
    expect(att.alt ?? null).toBeNull();
  });

  it('sert la transcription d’une pièce ORDINAIRE — la garde n’est pas un interrupteur', async () => {
    const att = await servie();

    expect(att.transcription?.text).toBe(TEXTE);
  });
});
