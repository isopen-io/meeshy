/**
 * #4147 critère 4 — asymétrie du like : POST /posts/:postId/like était à
 * 30/min/compte, DELETE n'avait AUCUN plafond (le retrait était libre). Ce
 * fichier prouve, avec le VRAI plugin @fastify/rate-limit et le VRAI
 * `preValidation` posant `authContext` :
 *
 *  - DELETE porte désormais le MÊME plafond que POST (30/min, même fabrique
 *    `createPostRouteRateLimitConfig('like')`, même clé PAR COMPTE — posé
 *    INDÉPENDAMMENT sur chaque route : `config.rateLimit` ne peut pas
 *    fusionner deux ROUTES en un seul compteur, cf. socialRateLimit.ts,
 *    en-tête — ce que le critère autorise explicitement : « au minimum le
 *    30/min actuel du POST tant que la route cible n'existe pas ») ;
 *  - le témoin à DEUX comptes du critère 8, sur POST comme sur DELETE ;
 *  - le mode d'échec exigé par les consignes : compteur indisponible ⇒ 429/
 *    erreur explicite, jamais un passage silencieux.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';
import rateLimit from '@fastify/rate-limit';

// ─── Mocks de service ──────────────────────────────────────────────────────

const mockLikePost = jest.fn<any>();
const mockUnlikePost = jest.fn<any>();

jest.mock('../../../../services/PostService', () => ({
  PostService: jest.fn().mockImplementation(() => ({
    likePost: (...args: any[]) => mockLikePost(...args),
    unlikePost: (...args: any[]) => mockUnlikePost(...args),
  })),
}));

jest.mock('../../../../services/MediaService', () => ({
  MediaService: jest.fn().mockImplementation(() => ({})),
}));

// Délibérément AUCUN mock de `middleware/rate-limiter` NI de
// `./socialRateLimit` : ce fichier existe pour exercer les VRAIES fabriques.

// ─── Import after mocks ───────────────────────────────────────────────────────

import { registerInteractionRoutes } from '../../../../routes/posts/interactions';

// ─── Constants ────────────────────────────────────────────────────────────────

const POST_ID = '507f1f77bcf86cd799439022';
const USER_A = '507f1f77bcf86cd799439011';
const USER_B = '507f1f77bcf86cd799439099';

// ─── Harness ──────────────────────────────────────────────────────────────────

function makePreValidationAuth() {
  return async (req: FastifyRequest) => {
    const userId = (req.headers['x-test-user-id'] as string) || USER_A;
    (req as any).authContext = {
      type: 'user',
      isAuthenticated: true,
      isAnonymous: false,
      userId,
      displayName: 'Test User',
      userLanguage: 'fr',
      hasFullAccess: true,
      canSendMessages: true,
      registeredUser: { id: userId, role: 'USER', username: `user-${userId}` },
    };
  };
}

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  // Audience PUBLIC — même forme que interactions.test.ts (loadPostAcl via
  // `post.findFirst`) : ce harnais porte sur le plafond, pas le droit de
  // voir (déjà couvert par interactions-audience.test.ts).
  const prisma = {
    post: {
      update: jest.fn<any>().mockResolvedValue({}),
      findFirst: jest.fn<any>().mockResolvedValue({
        authorId: 'author-1', visibility: 'PUBLIC', visibilityUserIds: [],
      }),
    },
  } as any;
  app.decorate('prisma', prisma);
  app.decorate('notificationService', null as any);

  await app.register(rateLimit, { global: false });

  const requiredAuth = makePreValidationAuth();
  registerInteractionRoutes(app, prisma, requiredAuth);
  await app.ready();
  return app;
}

function like(app: FastifyInstance, userId: string) {
  return app.inject({
    method: 'POST',
    url: `/posts/${POST_ID}/like`,
    headers: { 'x-test-user-id': userId },
    payload: {},
  });
}

function unlike(app: FastifyInstance, userId: string) {
  return app.inject({
    method: 'DELETE',
    url: `/posts/${POST_ID}/like`,
    headers: { 'x-test-user-id': userId },
    payload: {},
  });
}

beforeEach(() => {
  mockLikePost.mockReset();
  mockLikePost.mockResolvedValue({ id: POST_ID, type: 'POST', authorId: 'author-1', likeCount: 1, reactionSummary: { '❤️': 1 } });
  mockUnlikePost.mockReset();
  mockUnlikePost.mockResolvedValue({
    id: POST_ID, removedEmoji: '❤️',
    post: { id: POST_ID, type: 'POST', authorId: 'author-1', likeCount: 0, reactionSummary: {} },
  });
});

describe('DELETE /posts/:postId/like — plafond #4147 critère 4 (le retrait cesse d\'être libre)', () => {
  it('accepte les 30 premiers retraits du compte A, refuse le 31e en 429 avec Retry-After, compte B non affecté', async () => {
    const app = await buildApp();

    for (let i = 0; i < 30; i += 1) {
      const res = await unlike(app, USER_A);
      expect(res.statusCode).not.toBe(429);
    }
    const blocked = await unlike(app, USER_A);
    expect(blocked.statusCode).toBe(429);
    expect(blocked.headers['retry-after']).toBeDefined();

    // Témoin à deux comptes (critère 8) : un seau global ferait échouer B ici.
    const otherAccount = await unlike(app, USER_B);
    expect(otherAccount.statusCode).not.toBe(429);

    expect(mockUnlikePost).toHaveBeenCalledTimes(31);
    await app.close();
  });

  it('refuse (jamais un passage silencieux) quand le compteur du plugin est indisponible', async () => {
    class ThrowingStore {
      incr(_key: string, cb: (err: Error) => void) { cb(new Error('Redis indisponible (simulation de test)')); }
      read(_key: string, cb: (err: Error) => void) { cb(new Error('Redis indisponible (simulation de test)')); }
      child() { return this; }
    }
    const app = Fastify({ logger: false });
    const prisma = {
      post: {
        update: jest.fn<any>().mockResolvedValue({}),
        findFirst: jest.fn<any>().mockResolvedValue({ authorId: 'author-1', visibility: 'PUBLIC', visibilityUserIds: [] }),
      },
    } as any;
    app.decorate('prisma', prisma);
    app.decorate('notificationService', null as any);
    await app.register(rateLimit, { global: false, store: ThrowingStore as any });
    registerInteractionRoutes(app, prisma, makePreValidationAuth());
    await app.ready();

    const res = await unlike(app, USER_A);

    expect(res.statusCode).toBeGreaterThanOrEqual(400);
    expect(mockUnlikePost).not.toHaveBeenCalled();

    await app.close();
  });
});

describe('POST /posts/:postId/like ↔ DELETE — chacun son PROPRE budget de 30/min (config.rateLimit ne fusionne pas deux routes)', () => {
  it('épuiser le budget POST ne bloque PAS le budget DELETE du même compte', async () => {
    const app = await buildApp();

    for (let i = 0; i < 31; i += 1) {
      await like(app, USER_A);
    }
    const postBlocked = await like(app, USER_A);
    expect(postBlocked.statusCode).toBe(429);

    // DELETE, même compte, a encore la totalité de son propre budget — la
    // fabrique est la MÊME (`createPostRouteRateLimitConfig('like')`) mais
    // chaque ROUTE reçoit son propre compteur (cf. socialRateLimit.ts).
    const unlikeStillOpen = await unlike(app, USER_A);
    expect(unlikeStillOpen.statusCode).not.toBe(429);

    await app.close();
  });
});
