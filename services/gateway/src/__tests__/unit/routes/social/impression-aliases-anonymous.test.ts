/**
 * @jest-environment node
 *
 * #10483 G9 — les alias historiques d'impression passent en authentification
 * FACULTATIVE : un lecteur anonyme (X-Session-Token, sans `Authorization`) y
 * compte comme sur la porte canonique ; un compte et un appelant sans rien
 * reçoivent exactement ce qu'ils recevaient.
 */
import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { makeReachPrisma } from '../../../helpers/reach-prisma';

jest.mock('../../../../services/PostService', () => ({
  PostService: jest.fn().mockImplementation(() => ({
    recordView: jest.fn(async () => true),
    getPostById: jest.fn(async () => null),
    recordMediaDownloads: jest.fn(async () => null),
    recordEngagementBatch: jest.fn(async () => 0),
  })),
}));
jest.mock('../../../../services/MediaService', () => ({ MediaService: jest.fn() }));
jest.mock('../../../../services/TrackingLinkService', () => ({
  resolveFrontendBaseUrl: jest.fn(() => 'https://app.example.com'),
  TrackingLinkService: jest.fn().mockImplementation(() => ({})),
}));
jest.mock('../../../../middleware/rate-limiter', () => ({
  createPostRouteRateLimitConfig: jest.fn(() => ({})),
}));

import { registerInteractionRoutes } from '../../../../routes/posts/interactions';

const POST = '507f1f77bcf86cd799439011';
const OTHER = '507f1f77bcf86cd799439012';
const READER = '507f1f77bcf86cd7994390ff';

async function harness() {
  const fake = makeReachPrisma([{ id: POST }, { id: OTHER }]);
  const app = Fastify({ logger: false });
  app.decorate('prisma', fake.prisma as never);
  app.decorate('notificationService', { markPostNotificationsAsRead: jest.fn(async () => undefined) });
  app.decorate('socialEvents', { broadcastStoryViewed: jest.fn(async () => undefined) });

  // La garde historique : un jeton porteur = un compte, rien ⇒ 401.
  const requiredAuth = async (req: FastifyRequest, reply: FastifyReply) => {
    const bearer = req.headers.authorization?.replace('Bearer ', '');
    if (!bearer) return reply.status(401).send({ error: 'Authentication required', code: 'AUTH_REQUIRED' });
    (req as unknown as { authContext: unknown }).authContext = {
      type: 'user', isAuthenticated: true, isAnonymous: false, userId: bearer,
      registeredUser: { id: bearer, username: 'reader' },
    };
  };
  registerInteractionRoutes(app, fake.prisma as never, requiredAuth);
  await app.ready();
  return { ...fake, app };
}

const visiteur = { 'x-session-token': 'visitor_6f1c2b9e-1d2a-4c55-9a1e-0a4b5c6d7e8f' };

describe('G9 — les alias d’impression comptent un lecteur anonyme', () => {
  it('/posts/impressions/batch sans JWT, avec X-Session-Token ⇒ compteurs anonymes, aucune ligne', async () => {
    const h = await harness();
    const res = await h.app.inject({
      method: 'POST', url: '/posts/impressions/batch', headers: visiteur,
      payload: { postIds: [POST, OTHER], source: 'feed' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toMatchObject({ recorded: 2 });
    expect(h.store.read(POST)).toMatchObject({ impressionCount: 1, anonymousImpressionCount: 1 });
    expect(h.impressions).toEqual([]);
    expect(JSON.stringify(h.writes)).not.toContain(visiteur['x-session-token']);
    await h.app.close();
  });

  it('/posts/:id/impression sans JWT, avec X-Session-Token ⇒ { recorded: true }, et la seconde compte aussi (aucune fenêtre)', async () => {
    const h = await harness();
    const premier = await h.app.inject({ method: 'POST', url: `/posts/${POST}/impression`, headers: visiteur, payload: {} });
    const second = await h.app.inject({ method: 'POST', url: `/posts/${POST}/impression`, headers: visiteur, payload: {} });

    expect(premier.json().data).toMatchObject({ recorded: true });
    expect(second.json().data).toMatchObject({ recorded: true });
    expect(h.store.read(POST)).toMatchObject({ impressionCount: 2, anonymousImpressionCount: 2 });
    await h.app.close();
  });

  it('/posts/:id/anonymous-view compte la vue dans viewCount et répond { counted }', async () => {
    const h = await harness();
    const res = await h.app.inject({ method: 'POST', url: `/posts/${POST}/anonymous-view`, headers: visiteur });

    expect(res.json().data).toEqual({ counted: true });
    expect(h.store.read(POST)).toMatchObject({ viewCount: 1, anonymousViewCount: 1, postOpenCount: 1 });
    expect(h.opens[0].sessionKey).toMatch(/^[0-9a-f]{64}$/);
    await h.app.close();
  });
});

describe('G9 — un compte et un appelant sans rien reçoivent ce qu’ils recevaient', () => {
  it('avec un JWT et l’ancien corps, chaque alias garde sa forme', async () => {
    const h = await harness();
    const auth = { authorization: `Bearer ${READER}` };
    const unitaire = await h.app.inject({ method: 'POST', url: `/posts/${POST}/impression`, headers: auth, payload: { source: 'feed' } });
    const lot = await h.app.inject({ method: 'POST', url: '/posts/impressions/batch', headers: auth, payload: { postIds: [POST], source: 'feed' } });
    const vue = await h.app.inject({ method: 'POST', url: `/posts/${POST}/view`, headers: auth, payload: { duration: 1200 } });

    expect(unitaire.json().data).toMatchObject({ recorded: true });
    expect(lot.json().data).toMatchObject({ recorded: 1 });
    expect(vue.json().data).toEqual({ viewed: true });
    expect(h.impressions).toHaveLength(2);
    expect(h.store.read(POST)?.anonymousImpressionCount ?? 0).toBe(0);
    await h.app.close();
  });

  it.each([
    ['/posts/:id/view', `/posts/${POST}/view`, {}],
    ['/posts/:id/impression', `/posts/${POST}/impression`, {}],
    ['/posts/impressions/batch', '/posts/impressions/batch', { postIds: [POST] }],
  ])('%s sans JWT ni X-Session-Token ⇒ 401 inchangé', async (_nom, url, payload) => {
    const h = await harness();
    const res = await h.app.inject({ method: 'POST', url, payload });

    expect(res.statusCode).toBe(401);
    expect(h.writes).toEqual([]);
    await h.app.close();
  });

  it('/posts/:id/view avec un seul X-Session-Token reste refusé — la vue d’un compte exige un compte', async () => {
    const h = await harness();
    const res = await h.app.inject({ method: 'POST', url: `/posts/${POST}/view`, headers: visiteur, payload: {} });

    expect(res.statusCode).toBe(401);
    expect(h.writes).toEqual([]);
    await h.app.close();
  });
});
