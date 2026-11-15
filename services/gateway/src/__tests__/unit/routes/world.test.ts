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

const { memberCount: _count, ...ENTRY_WITHOUT_COUNT } = ENTRY;

const MEMBER_CONTEXT = {
  type: 'user', isAuthenticated: true, isAnonymous: false,
  userId: '507f1f77bcf86cd799439011', registeredUser: { id: '507f1f77bcf86cd799439011', role: 'USER' },
};
const ANONYMOUS_CONTEXT = { type: 'anonymous', isAuthenticated: false, isAnonymous: true, userId: 'anonymous' };

async function buildApp(options: {
  entry?: WorldEntry | null;
  cache?: ReturnType<typeof memoryCache>;
  viewer?: Record<string, unknown>;
} = {}) {
  const loadEntry = jest.fn(async () => (options.entry === undefined ? ENTRY : options.entry));
  const cache = options.cache ?? memoryCache();
  const app = Fastify();
  app.decorate('prisma', {});
  const authenticate = jest.fn(async (request: any) => {
    request.authContext = options.viewer ?? ANONYMOUS_CONTEXT;
  });
  await app.register(worldRoutes, { prefix: '/api/v1', cache, loadEntry, authenticate });
  await app.ready();
  return { app, loadEntry, cache, authenticate };
}

const BEARER = { authorization: 'Bearer jeton' };

describe('GET /api/v1/world', () => {
  it('sert l’entrée — identifiant, titre, lien — sans authentification, SANS effectif (#10205)', async () => {
    const { app } = await buildApp();

    const res = await app.inject({ method: 'GET', url: '/api/v1/world' });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body).toEqual({ success: true, data: ENTRY_WITHOUT_COUNT });
    expect(worldEntrySchema.parse(body.data)).toEqual(ENTRY_WITHOUT_COUNT);
    await app.close();
  });

  it('ne sert à un invité de lien (session sans compte) aucun effectif non plus', async () => {
    const guest = { type: 'anonymous', isAuthenticated: true, isAnonymous: true, userId: 'p1', participantId: 'p1' };
    const { app } = await buildApp({ viewer: guest });

    const res = await app.inject({ method: 'GET', url: '/api/v1/world' });

    expect(JSON.parse(res.body).data).toEqual(ENTRY_WITHOUT_COUNT);
    await app.close();
  });

  // RÉTROCOMPATIBILITÉ (#9223) : `WorldEntry.memberCount` est un `Int` OBLIGATOIRE
  // du SDK iOS publié — sans lui, la carte « Entrer dans World Wide » disparaît.
  // Un client iOS (`X-Meeshy-Platform: ios`) sans compte reçoit un effectif
  // NEUTRE, jamais le vrai chiffre.
  it('sert à un client natif sans compte un effectif NEUTRE (0), jamais le vrai', async () => {
    const { app } = await buildApp();

    const res = await app.inject({ method: 'GET', url: '/api/v1/world', headers: { 'x-meeshy-platform': 'ios', 'x-meeshy-version': '1.1.2' } });

    expect(JSON.parse(res.body).data).toEqual({ ...ENTRY_WITHOUT_COUNT, memberCount: 0 });
    expect(String(res.headers.vary)).toContain('X-Meeshy-Platform');
    await app.close();
  });

  // Le web construit lui aussi `X-Meeshy-Version` (`clientSessionHeaders`) : la
  // version ne désigne PAS iOS. Seule la PLATEFORME le fait.
  it('un client web qui pose un en-tête de version garde la forme SANS effectif', async () => {
    const { app } = await buildApp();

    const res = await app.inject({ method: 'GET', url: '/api/v1/world', headers: { 'x-meeshy-platform': 'web', 'x-meeshy-version': '2.0.0', 'x-app-version': '2.0.0' } });

    expect(JSON.parse(res.body).data).toEqual(ENTRY_WITHOUT_COUNT);
    await app.close();
  });

  // Sans jeton de compte, aucune identité n'est résolue : une session invitée
  // (même révoquée — 410 ailleurs) ne change rien à une route publique, et la
  // landing ne paie pas une lecture d'identité par visite (audit 2026-10-11).
  it('ne résout aucune identité sans en-tête Authorization, même avec une session invitée', async () => {
    const guest = { type: 'anonymous', isAuthenticated: true, isAnonymous: true, userId: 'p1', participantId: 'p1' };
    const { app, authenticate } = await buildApp({ viewer: guest });

    const res = await app.inject({ method: 'GET', url: '/api/v1/world', headers: { 'x-session-token': 'revoque' } });

    expect(res.statusCode).toBe(200);
    expect(authenticate).not.toHaveBeenCalled();
    expect(JSON.parse(res.body).data).toEqual(ENTRY_WITHOUT_COUNT);
    await app.close();
  });

  it('sert l’effectif à un compte Meeshy, en cache PRIVÉ', async () => {
    const { app } = await buildApp({ viewer: MEMBER_CONTEXT });

    const res = await app.inject({ method: 'GET', url: '/api/v1/world', headers: BEARER });

    expect(JSON.parse(res.body).data).toEqual(ENTRY);
    expect(res.headers['cache-control']).toBe(`private, max-age=${WORLD_ENTRY_CACHE_TTL_SECONDS}`);
    expect(String(res.headers.vary)).toContain('Authorization');
    await app.close();
  });

  it('sert l’avatar et la bannière de World Wide à tous (#10204)', async () => {
    const branded: WorldEntry = { ...ENTRY, avatar: 'https://meeshy.me/brand/world-wide/avatar.png', banner: 'https://meeshy.me/brand/world-wide/banner.png' };
    const { app } = await buildApp({ entry: branded });

    const res = await app.inject({ method: 'GET', url: '/api/v1/world' });

    expect(JSON.parse(res.body).data).toMatchObject({ avatar: branded.avatar, banner: branded.banner });
    await app.close();
  });

  it('conserve le drapeau de plafond « 199+ » à travers la sérialisation, pour un compte', async () => {
    const capped: WorldEntry = { ...ENTRY, memberCount: 199, memberCountCapped: true };
    const { app } = await buildApp({ entry: capped, viewer: MEMBER_CONTEXT });

    const res = await app.inject({ method: 'GET', url: '/api/v1/world', headers: BEARER });

    expect(JSON.parse(res.body).data).toEqual(capped);
    await app.close();
  });

  it('ne laisse sortir AUCUNE clé hors du contrat, même si le chargeur en porte', async () => {
    const leaky = { ...ENTRY, conversationId: '507f1f77bcf86cd799439011', createdBy: '507f1f77bcf86cd799439012' };
    const { app } = await buildApp({ entry: leaky as WorldEntry });

    const res = await app.inject({ method: 'GET', url: '/api/v1/world' });

    expect(Object.keys(JSON.parse(res.body).data).sort()).toEqual(
      ['identifier', 'shareLinkIdentifier', 'title'],
    );
    await app.close();
  });

  it('se laisse mettre en cache publiquement, brièvement, avec un ETag', async () => {
    const { app } = await buildApp();

    const res = await app.inject({ method: 'GET', url: '/api/v1/world' });

    expect(res.headers['cache-control']).toBe(`public, max-age=${WORLD_ENTRY_CACHE_TTL_SECONDS}, stale-while-revalidate=60`);
    expect(String(res.headers.vary)).toContain('Authorization');
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
    expect(JSON.parse(res.body).data).toEqual(ENTRY_WITHOUT_COUNT);
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
