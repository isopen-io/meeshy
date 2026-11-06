/**
 * `/publishers` (#16274) à travers les VRAIES routes : la boutique lit un
 * éditeur sans son propriétaire, le compte connecté lit le sien, et seule
 * l'administration (BIGBOSS/ADMIN) voit le compte propriétaire.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() }), error: jest.fn() },
}));

import { packPublisherRoutes } from '../../../routes/pack-publishers';
import { PackPublishers } from '../../../services/packs/PackPublishers';
import { memoryPublisherDb } from '../services/packs/pack-publishers.fakes';

const OFFICIAL = '68d0000000000000000000a0';
const AWA = '68d0000000000000000000a1';
const ADMIN = '68d0000000000000000000ad';
const MODO = '68d0000000000000000000a3';
const verified = (username: string) => ({ username, emailVerifiedAt: new Date('2026-01-01T00:00:00Z') });

async function build() {
  const db = memoryPublisherDb({ [AWA]: verified('awa_secret'), [OFFICIAL]: verified('meeshy_off'), [ADMIN]: verified('root'), [MODO]: verified('modo') });
  const publishers = new PackPublishers({ prisma: db.prisma, officialAccountId: OFFICIAL });
  let who = { userId: AWA, role: 'USER', anonymous: false };
  const app: FastifyInstance = Fastify({ logger: false });
  app.decorate('authenticate', async (request: FastifyRequest) => {
    (request as unknown as Record<string, unknown>).authContext = who.anonymous
      ? { type: 'anonymous', isAuthenticated: true, isAnonymous: true, userId: 'p1', participantId: 'p1' }
      : { type: 'user', isAuthenticated: true, isAnonymous: false, userId: who.userId, registeredUser: { id: who.userId, role: who.role } };
    (request as unknown as Record<string, unknown>).user = { userId: who.userId, role: who.role };
  });
  await app.register(packPublisherRoutes, { publishers });
  await app.ready();
  await publishers.authorizePublication(AWA, { author: 'Studio Lumière', claimed: null });
  const as = (userId: string, role = 'USER', anonymous = false) => {
    who = { userId, role, anonymous };
  };
  return { app, as, db };
}

describe('/publishers — la boutique, le propriétaire, l’administration (#16274)', () => {
  it('GET /:slug sert le nom de boutique, jamais le compte propriétaire', async () => {
    const { app, as } = await build();
    as(MODO);
    const res = await app.inject({ method: 'GET', url: '/studio-lumiere' });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual({ slug: 'studio-lumiere', name: 'Studio Lumière', verified: false, official: false });
    expect(res.body).not.toContain(AWA);
    expect(res.body).not.toContain('awa_secret');
  });

  it('GET /meeshy sert l’éditeur officiel ; un éditeur inconnu rend 404', async () => {
    const { app } = await build();
    expect((await app.inject({ method: 'GET', url: '/meeshy' })).json().data).toEqual({ slug: 'meeshy', name: 'Meeshy', verified: true, official: true });
    expect((await app.inject({ method: 'GET', url: '/inconnu' })).statusCode).toBe(404);
  });

  it('GET /me sert l’éditeur du compte connecté, ou null', async () => {
    const { app, as } = await build();
    expect((await app.inject({ method: 'GET', url: '/me' })).json().data).toMatchObject({ slug: 'studio-lumiere' });
    as(MODO);
    expect((await app.inject({ method: 'GET', url: '/me' })).json().data).toBeNull();
  });

  it('GET /admin refuse un compte ordinaire et un modérateur : 403', async () => {
    const { app, as } = await build();
    expect((await app.inject({ method: 'GET', url: '/admin' })).statusCode).toBe(403);
    as(MODO, 'MODERATOR');
    expect((await app.inject({ method: 'GET', url: '/admin' })).statusCode).toBe(403);
  });

  it('GET /admin sert à BIGBOSS/ADMIN le compte propriétaire et son nom d’utilisateur', async () => {
    const { app, as } = await build();
    as(ADMIN, 'ADMIN');
    const res = await app.inject({ method: 'GET', url: '/admin' });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual([expect.objectContaining({ slug: 'studio-lumiere', displayName: 'Studio Lumière', nameDisputedAt: null, owner: { id: AWA, username: 'awa_secret' } })]);
  });

  it('GET /:slug/page sert la page éditeur : son identité ET le profil Meeshy qui l’édite (#16433)', async () => {
    const { app, as, db } = await build();
    db.users.get(AWA)!.displayName = 'Awa D.';
    db.users.get(AWA)!.avatar = '/u/awa.webp';
    as(MODO);
    const res = await app.inject({ method: 'GET', url: '/studio-lumiere/page' });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual({
      publisher: { slug: 'studio-lumiere', name: 'Studio Lumière', verified: false, official: false },
      owner: { id: AWA, username: 'awa_secret', displayName: 'Awa D.', avatar: '/u/awa.webp' },
      website: null,
    });
  });

  it('GET /meeshy/page nomme le compte officiel ; un éditeur inconnu rend 404', async () => {
    const { app } = await build();
    const res = await app.inject({ method: 'GET', url: '/meeshy/page' });
    expect(res.json().data).toMatchObject({ publisher: { slug: 'meeshy', official: true }, owner: { id: OFFICIAL, username: 'meeshy_off' } });
    expect((await app.inject({ method: 'GET', url: '/inconnu/page' })).statusCode).toBe(404);
  });

  it('GET /:slug/page tait un propriétaire désactivé ou supprimé : la page reste, sans lien de profil', async () => {
    const { app, db } = await build();
    db.users.get(AWA)!.deactivatedAt = new Date('2026-10-01T00:00:00Z');
    const res = await app.inject({ method: 'GET', url: '/studio-lumiere/page' });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.owner).toBeNull();
    expect(res.body).not.toContain(AWA);
    expect(res.body).not.toContain('awa_secret');
  });

  it('GET /:slug/page tait le propriétaire à un lecteur qu’il a bloqué, et à celui qui l’a bloqué', async () => {
    const { app, as, db } = await build();
    db.users.get(AWA)!.blockedUserIds = [MODO];
    as(MODO);
    const blockedByOwner = await app.inject({ method: 'GET', url: '/studio-lumiere/page' });
    expect(blockedByOwner.statusCode).toBe(200);
    expect(blockedByOwner.json().data.owner).toBeNull();
    expect(blockedByOwner.body).not.toContain('awa_secret');

    db.users.get(AWA)!.blockedUserIds = [];
    db.users.get(MODO)!.blockedUserIds = [AWA];
    const blockingOwner = await app.inject({ method: 'GET', url: '/studio-lumiere/page' });
    expect(blockingOwner.json().data.owner).toBeNull();
    expect(blockingOwner.json().data.publisher).toMatchObject({ slug: 'studio-lumiere' });
  });

  it('GET /:slug/page tait aussi le compte officiel à qui l’a bloqué : aucune exemption', async () => {
    const { app, as, db } = await build();
    db.users.get(MODO)!.blockedUserIds = [OFFICIAL];
    as(MODO);
    expect((await app.inject({ method: 'GET', url: '/meeshy/page' })).json().data.owner).toBeNull();
  });

  it('GET /:slug/page refuse un invité de lien : 403 REGISTERED_USER_REQUIRED, sans rien du propriétaire', async () => {
    const { app, as } = await build();
    as('p1', 'USER', true);
    const res = await app.inject({ method: 'GET', url: '/studio-lumiere/page' });
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('REGISTERED_USER_REQUIRED');
    expect(res.body).not.toContain(AWA);
  });

  it('refuse un invité de lien : 403 REGISTERED_USER_REQUIRED', async () => {
    const { app, as } = await build();
    as('p1', 'USER', true);
    const res = await app.inject({ method: 'GET', url: '/studio-lumiere' });
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('REGISTERED_USER_REQUIRED');
  });
});
