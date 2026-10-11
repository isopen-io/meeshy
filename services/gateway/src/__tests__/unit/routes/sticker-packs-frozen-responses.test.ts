/**
 * Les réponses de `/sticker-packs` FIGÉES À L'OCTET (LP0, #10148).
 *
 * Le moteur des packs se généralise pour servir les cadres par le même code ;
 * les anciens clients (web, iOS) décodent ces réponses depuis #9141 et ne
 * doivent rien voir changer. Ce témoin fige donc, AVANT toute ligne de moteur,
 * ce qui part réellement sur le fil : statut, `content-type`, `cache-control`
 * et le CORPS tel que le vrai sérialiseur (fast-json-stringify, schémas de
 * réponse de la route) le rend — refus du schéma de paramètre compris, par le
 * VRAI producteur des refus de schéma (`schemaValidationErrorResponse`),
 * monté comme `server.ts` le monte.
 *
 * La fixture `__fixtures__/sticker-packs-frozen-responses.json` a été produite
 * par le code d'AVANT LP0 (`UPDATE_FROZEN_PACK_RESPONSES=1`), et ne se
 * régénère jamais pour faire passer un changement : un écart est un contrat
 * servi qui bouge.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import Fastify, { type FastifyRequest, type InjectOptions } from 'fastify';
import multipart from '@fastify/multipart';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() }), error: jest.fn() },
}));

import { stickerPacksRoutes } from '../../../routes/sticker-packs';
import { StickerPacks } from '../../../services/stickers/StickerPacks';
import { schemaValidationErrorResponse } from '../../../utils/schema-validation-error';
import { memoryPrisma } from './sticker-packs.harness';

const FIXTURE = join(__dirname, '__fixtures__', 'sticker-packs-frozen-responses.json');

const ALICE = '68b0000000000000000000a1';
const BOB = '68b0000000000000000000b2';

type Who = { readonly userId: string; readonly anonymous?: boolean };

async function buildApp() {
  const db = memoryPrisma();
  const at = new Date('2026-10-01T08:00:00.000Z');
  db.packs.push({
    id: '68b0000000000000000000f1',
    slug: 'chats-de-paris',
    name: 'Chats de Paris',
    description: 'Des chats qui flânent sur les quais.',
    author: 'Studio Minou',
    submitterId: ALICE,
    status: 'approved',
    reviewNote: 'Superbe',
    installCount: 4,
    createdAt: at,
  });
  db.items.push(
    { id: 'i1', packId: '68b0000000000000000000f1', key: 'bonjour', title: 'Bonjour', emoji: '👋', kind: 'static', mimeType: 'image/png', filePath: 'sticker-packs/f1/bonjour.png', width: 512, height: 512, zones: null, position: 0 },
    {
      id: 'i2',
      packId: '68b0000000000000000000f1',
      key: 'bravo',
      title: 'Bravo',
      emoji: '🎉',
      kind: 'instant',
      mimeType: 'image/webp',
      filePath: 'sticker-packs/f1/bravo.webp',
      width: 512,
      height: 480,
      zones: [{ slot: 'prenom', label: 'Prénom', box: { x: 40, y: 400, width: 432, height: 90 }, defaultText: 'Léa', maxLength: 14, maxLines: 1, minFontSize: 14, maxFontSize: 64, color: '#ffffff', weight: 'black', align: 'center' }],
      position: 1,
    },
  );
  db.choices.push(
    { id: 'c1', userId: ALICE, packSlug: 'meo', installedAt: null, updatedAt: at },
    { id: 'c2', userId: ALICE, packSlug: 'chats-de-paris', installedAt: at, updatedAt: new Date('2026-10-02T08:00:00.000Z') },
    { id: 'c3', userId: ALICE, packSlug: 'glory-frame.afrique', installedAt: at, updatedAt: new Date('2026-10-03T08:00:00.000Z') },
  );

  let who: Who = { userId: ALICE };
  const app = Fastify({ logger: false });
  await app.register(multipart);
  app.setErrorHandler(async (error, _request, reply) => {
    const refusal = schemaValidationErrorResponse(error);
    if (!refusal) throw error;
    const { statusCode, ...body } = refusal;
    return reply.code(statusCode).send(body);
  });
  app.decorate('prisma', db.prisma as never);
  app.decorate('authenticate', async (request: FastifyRequest) => {
    (request as unknown as Record<string, unknown>).authContext = who.anonymous
      ? { type: 'anonymous', isAuthenticated: true, isAnonymous: true, userId: 'p1', participantId: 'p1' }
      : { type: 'user', isAuthenticated: true, isAnonymous: false, userId: who.userId, registeredUser: { id: who.userId, role: 'USER' } };
  });
  const files = { write: async () => undefined, remove: async () => undefined };
  await app.register(stickerPacksRoutes, { packs: new StickerPacks({ prisma: db.prisma, files, now: () => new Date('2026-10-04T08:00:00.000Z') }) });
  await app.ready();
  return { app, as: (next: Who) => void (who = next) };
}

type Exchange = { readonly name: string; readonly who: Who; readonly request: InjectOptions };

/** L'ordre compte : les écritures (PUT, DELETE) viennent après les lectures qu'elles changeraient. */
const EXCHANGES: readonly Exchange[] = [
  { name: 'GET / — la boutique, un intégré retiré, un tiers installé', who: { userId: ALICE }, request: { method: 'GET', url: '/' } },
  { name: 'GET /installed — jamais une clé glory-frame.*', who: { userId: ALICE }, request: { method: 'GET', url: '/installed' } },
  { name: 'GET /:slug — tiers publié, vu par un autre', who: { userId: BOB }, request: { method: 'GET', url: '/chats-de-paris' } },
  { name: 'GET /:slug — tiers publié, vu par son auteur', who: { userId: ALICE }, request: { method: 'GET', url: '/chats-de-paris' } },
  { name: 'GET /:slug — intégré', who: { userId: ALICE }, request: { method: 'GET', url: '/mee' } },
  { name: 'GET /:slug — inconnu', who: { userId: ALICE }, request: { method: 'GET', url: '/inconnu' } },
  { name: 'GET /:slug — clé de cadre, refus du schéma', who: { userId: ALICE }, request: { method: 'GET', url: '/glory-frame.afrique' } },
  { name: 'PUT /:slug/install — clé de cadre, refus du schéma', who: { userId: ALICE }, request: { method: 'PUT', url: '/glory-frame.afrique/install' } },
  { name: 'DELETE /:slug/install — clé de cadre, refus du schéma', who: { userId: ALICE }, request: { method: 'DELETE', url: '/glory-frame.afrique/install' } },
  { name: 'GET / — invité d’un lien', who: { userId: 'p1', anonymous: true }, request: { method: 'GET', url: '/' } },
  { name: 'PUT /:slug/install — tiers', who: { userId: BOB }, request: { method: 'PUT', url: '/chats-de-paris/install' } },
  { name: 'PUT /:slug/install — inconnu', who: { userId: BOB }, request: { method: 'PUT', url: '/inconnu/install' } },
  { name: 'DELETE /:slug/install — intégré', who: { userId: BOB }, request: { method: 'DELETE', url: '/mee-et-meo/install' } },
];

async function served() {
  const { app, as } = await buildApp();
  const out: Record<string, { status: number; contentType: unknown; cacheControl: unknown; body: string }> = {};
  for (const exchange of EXCHANGES) {
    as(exchange.who);
    const res = await app.inject(exchange.request);
    out[exchange.name] = { status: res.statusCode, contentType: res.headers['content-type'], cacheControl: res.headers['cache-control'] ?? null, body: res.body };
  }
  await app.close();
  return out;
}

describe('/sticker-packs — les réponses servies, figées à l’octet', () => {
  it('rend exactement ce que rendait le code d’avant le moteur de packs', async () => {
    const actual = await served();
    if (process.env.UPDATE_FROZEN_PACK_RESPONSES === '1') writeFileSync(FIXTURE, `${JSON.stringify(actual, null, 2)}\n`);
    const frozen = JSON.parse(readFileSync(FIXTURE, 'utf8')) as typeof actual;
    expect(Object.keys(actual)).toEqual(Object.keys(frozen));
    for (const name of Object.keys(frozen)) expect({ name, ...actual[name] }).toEqual({ name, ...frozen[name] });
  });

  it('ne sert jamais une clé glory-frame.* à la boutique des stickers', async () => {
    const actual = await served();
    for (const name of ['GET / — la boutique, un intégré retiré, un tiers installé', 'GET /installed — jamais une clé glory-frame.*']) {
      expect(actual[name].body).not.toContain('glory-frame');
    }
  });
});
