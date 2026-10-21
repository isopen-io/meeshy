/**
 * #10157 — le pack de stickers d'EXEMPLE se publie par le VRAI circuit : une
 * VRAIE passerelle (Fastify à l'écoute, vraies routes `/sticker-packs`, vrai
 * multipart, vraie normalisation sharp des quatre dessins de `MeeStickers`),
 * atteinte par le VRAI `fetch`. Seuls la base (mémoire) et la connexion
 * (jeton = identifiant) sont des doubles.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import multipart from '@fastify/multipart';
import { readFile } from 'fs/promises';
import { join, resolve } from 'path';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() }), error: jest.fn() },
}));

import { stickerPacksRoutes } from '../../../routes/sticker-packs';
import { StickerPacks } from '../../../services/stickers/StickerPacks';
import {
  SAMPLE_STICKER_PACK_SLUG,
  assertSamplePublishTarget,
  publishSampleStickerPack,
  type PublishSamplePackDeps,
} from '../../../services/packs/samplePackPublisher';
import { memoryPrisma } from '../routes/sticker-packs.harness';

const MEE_STICKERS = resolve(__dirname, '../../../../assets/sample-sticker-pack');
const ACCOUNTS: Record<string, { id: string; role: string }> = {
  recette: { id: '68b0000000000000000000a1', role: 'USER' },
  modo: { id: '68b0000000000000000000c3', role: 'MODERATOR' },
};

async function liveGateway() {
  const db = memoryPrisma();
  const app: FastifyInstance = Fastify({ logger: false });
  await app.register(multipart);
  app.decorate('prisma', db.prisma as never);
  app.decorate('authenticate', async (request: FastifyRequest) => {
    const account = ACCOUNTS[(request.headers.authorization ?? '').replace('Bearer ', '')];
    if (account === undefined) throw Object.assign(new Error('unauthorized'), { statusCode: 401 });
    (request as unknown as Record<string, unknown>).authContext = {
      type: 'user', isAuthenticated: true, isAnonymous: false, userId: account.id, registeredUser: { id: account.id, role: account.role },
    };
  });
  app.post('/api/v1/auth/login', async (request) => {
    const { username } = request.body as { username: string };
    return { success: true, data: { token: username } };
  });
  const files = { write: async () => undefined, remove: async () => undefined };
  await app.register(stickerPacksRoutes, { prefix: '/api/v1/sticker-packs', packs: new StickerPacks({ prisma: db.prisma, files }) });
  await app.listen({ port: 0, host: '127.0.0.1' });
  const address = app.server.address();
  const port = typeof address === 'object' && address !== null ? address.port : 0;
  return { app, db, baseUrl: `http://127.0.0.1:${port}` };
}

const deps = (baseUrl: string): PublishSamplePackDeps => ({
  baseUrl,
  fetch,
  readAsset: (file) => readFile(join(MEE_STICKERS, file)),
  submitter: { username: 'recette', password: 'x' },
  reviewer: { username: 'modo', password: 'x' },
});

describe('publier le pack de stickers d’exemple par le vrai circuit', () => {
  it('propose puis publie : le pack paraît dans la boutique avec ses quatre stickers, et un second passage ne refait rien', async () => {
    const { app, db, baseUrl } = await liveGateway();
    try {
      expect(await publishSampleStickerPack(deps(baseUrl))).toBe('published');
      const shop = await app.inject({ method: 'GET', url: '/api/v1/sticker-packs', headers: { authorization: 'Bearer recette' } });
      const sample = (JSON.parse(shop.body).data as { slug: string; status: string; itemCount: number }[]).find((p) => p.slug === SAMPLE_STICKER_PACK_SLUG);
      expect(sample).toMatchObject({ status: 'approved', itemCount: 4 });
      expect(await publishSampleStickerPack(deps(baseUrl))).toBe('already-published');
      expect(db.packs.filter((p) => p.slug === SAMPLE_STICKER_PACK_SLUG)).toHaveLength(1);
    } finally {
      await app.close();
    }
  }, 30_000);

  it('un pack déjà en attente n’est que publié, sans nouvelle proposition', async () => {
    const { app, db, baseUrl } = await liveGateway();
    try {
      db.packs.push({ id: '68b0000000000000000000f9', slug: SAMPLE_STICKER_PACK_SLUG, name: 'Exemple', description: 'x', author: 'Meeshy', submitterId: ACCOUNTS.recette.id, status: 'pending', reviewNote: null, installCount: 0, createdAt: new Date() });
      expect(await publishSampleStickerPack(deps(baseUrl))).toBe('published');
      expect(db.packs.map((p) => p.status)).toEqual(['approved']);
    } finally {
      await app.close();
    }
  });
});

describe('la cible : le staging ou une machine locale, jamais la production', () => {
  it('admet le staging et les adresses locales', () => {
    for (const url of ['https://gate.staging.meeshy.me', 'http://localhost:3000', 'http://127.0.0.1:3000']) expect(() => assertSamplePublishTarget(url)).not.toThrow();
  });

  it('refuse la production et tout autre hôte, avant le moindre appel', async () => {
    for (const url of ['https://gate.meeshy.me', 'https://meeshy.me', 'http://gate.staging.meeshy.me', 'https://gate.staging.meeshy.me.evil.com']) {
      expect(() => assertSamplePublishTarget(url)).toThrow(/refusée/);
    }
    const spy = jest.fn<typeof fetch>();
    await expect(publishSampleStickerPack({ ...deps('https://gate.meeshy.me'), fetch: spy })).rejects.toThrow(/refusée/);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('une redirection n’emmène jamais les identifiants ailleurs', () => {
  it('refuse de suivre une redirection : la cible n’est jamais atteinte et la publication échoue', async () => {
    const elsewhere: FastifyInstance = Fastify({ logger: false, forceCloseConnections: true });
    const hits: string[] = [];
    elsewhere.all('/*', async (request) => { hits.push(request.url); return { success: true, data: { token: 'volé' } }; });
    await elsewhere.listen({ port: 0, host: '127.0.0.1' });
    const target = elsewhere.server.address();
    const redirector: FastifyInstance = Fastify({ logger: false, forceCloseConnections: true });
    redirector.all('/*', async (request, reply) => reply.code(307).header('location', `http://127.0.0.1:${typeof target === 'object' && target !== null ? target.port : 0}${request.url}`).send());
    await redirector.listen({ port: 0, host: '127.0.0.1' });
    const address = redirector.server.address();
    try {
      await expect(publishSampleStickerPack(deps(`http://127.0.0.1:${typeof address === 'object' && address !== null ? address.port : 0}`))).rejects.toThrow();
      expect(hits).toEqual([]);
    } finally {
      await redirector.close();
      await elsewhere.close();
    }
  });
});
