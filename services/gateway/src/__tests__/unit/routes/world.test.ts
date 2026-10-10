/**
 * #10000 — `GET /api/v1/world` : ce que la landing lit pour faire entrer
 * quelqu'un dans World Wide. Public, sans identité, mis en cache court.
 *
 * Le VRAI module de route est monté, le VRAI schéma de réponse traverse
 * fast-json-stringify : un témoin qui n'exerce pas la sérialisation atteste un
 * contrat que personne ne respecte.
 *
 * @jest-environment node
 */

import Fastify from 'fastify';
import { describe, it, expect, jest } from '@jest/globals';
import { worldEntrySchema, type WorldEntry } from '@meeshy/shared/types/world';
import { worldRoutes, WORLD_ENTRY_CACHE_TTL_SECONDS } from '../../../routes/world';

const ENTRY: WorldEntry = {
  identifier: 'world',
  title: 'World Wide',
  shareLinkIdentifier: 'mshy_world',
  memberCount: 42,
};

function memoryCache() {
  const store = new Map<string, string>();
  return {
    store,
    get: jest.fn(async (key: string) => store.get(key) ?? null),
    set: jest.fn(async (key: string, value: string, _ttl?: number) => {
      store.set(key, value);
    }),
  };
}

async function buildApp(options: { entry?: WorldEntry | null; cache?: ReturnType<typeof memoryCache> } = {}) {
  const loadEntry = jest.fn(async () => (options.entry === undefined ? ENTRY : options.entry));
  const cache = options.cache ?? memoryCache();
  const app = Fastify();
  app.decorate('prisma', {});
  await app.register(worldRoutes, { prefix: '/api/v1', cache, loadEntry });
  await app.ready();
  return { app, loadEntry, cache };
}

describe('GET /api/v1/world', () => {
  it('sert l’entrée — identifiant, titre, lien, effectif — sans authentification', async () => {
    const { app } = await buildApp();

    const res = await app.inject({ method: 'GET', url: '/api/v1/world' });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body).toEqual({ success: true, data: ENTRY });
    expect(worldEntrySchema.parse(body.data)).toEqual(ENTRY);
    await app.close();
  });

  it('conserve le drapeau de plafond « 199+ » à travers la sérialisation', async () => {
    const capped: WorldEntry = { ...ENTRY, memberCount: 199, memberCountCapped: true };
    const { app } = await buildApp({ entry: capped });

    const res = await app.inject({ method: 'GET', url: '/api/v1/world' });

    expect(JSON.parse(res.body).data).toEqual(capped);
    await app.close();
  });

  it('ne laisse sortir AUCUNE clé hors du contrat, même si le chargeur en porte', async () => {
    const leaky = { ...ENTRY, conversationId: '507f1f77bcf86cd799439011', createdBy: '507f1f77bcf86cd799439012' };
    const { app } = await buildApp({ entry: leaky as WorldEntry });

    const res = await app.inject({ method: 'GET', url: '/api/v1/world' });

    expect(Object.keys(JSON.parse(res.body).data).sort()).toEqual(
      ['identifier', 'memberCount', 'shareLinkIdentifier', 'title'],
    );
    await app.close();
  });

  it('se laisse mettre en cache publiquement, brièvement, avec un ETag', async () => {
    const { app } = await buildApp();

    const res = await app.inject({ method: 'GET', url: '/api/v1/world' });

    expect(res.headers['cache-control']).toBe(`public, max-age=${WORLD_ENTRY_CACHE_TTL_SECONDS}, stale-while-revalidate=60`);
    expect(res.headers.etag).toMatch(/^"[0-9a-f]{64}"$/);
    await app.close();
  });

  it('répond 304 sans corps quand l’ETag du client est à jour', async () => {
    const { app } = await buildApp();
    const first = await app.inject({ method: 'GET', url: '/api/v1/world' });

    const second = await app.inject({
      method: 'GET',
      url: '/api/v1/world',
      headers: { 'if-none-match': String(first.headers.etag) },
    });

    expect(second.statusCode).toBe(304);
    expect(second.body).toBe('');
    await app.close();
  });

  it('ne relit pas la base tant que le cache serveur est frais', async () => {
    const { app, loadEntry, cache } = await buildApp();

    await app.inject({ method: 'GET', url: '/api/v1/world' });
    await app.inject({ method: 'GET', url: '/api/v1/world' });

    expect(loadEntry).toHaveBeenCalledTimes(1);
    expect(cache.set).toHaveBeenCalledWith(expect.any(String), expect.any(String), WORLD_ENTRY_CACHE_TTL_SECONDS);
    await app.close();
  });

  it('sert depuis la base quand le cache est en panne — le cache n’est jamais une condition', async () => {
    const cache = memoryCache();
    cache.get.mockRejectedValue(new Error('redis down'));
    cache.set.mockRejectedValue(new Error('redis down'));
    const { app } = await buildApp({ cache });

    const res = await app.inject({ method: 'GET', url: '/api/v1/world' });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).data).toEqual(ENTRY);
    await app.close();
  });

  it('répond 404 WORLD_UNAVAILABLE quand aucune porte n’est ouverte', async () => {
    const { app } = await buildApp({ entry: null });

    const res = await app.inject({ method: 'GET', url: '/api/v1/world' });

    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body)).toMatchObject({ success: false, code: 'WORLD_UNAVAILABLE' });
    await app.close();
  });
});
