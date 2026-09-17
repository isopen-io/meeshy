/**
 * Integration tests — posts routes error response format
 *
 * Verifies that every posts route returns the structured
 * { success: false, error: string, message: string } shape
 * (via sendError helpers) rather than the legacy { error: 'string' } flat form.
 *
 * One endpoint is exercised per modified file:
 *   core.ts        → POST /api/v1/posts (401, 400, 500)
 *   feed.ts        → GET  /api/v1/posts/feed (401)
 *   interactions.ts → POST /api/v1/posts/:id/like (401, 404)
 *   comments.ts    → POST /api/v1/posts/:id/comments (401, 400, 404)
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

jest.mock('../../../services/PostService', () => ({
  PostService: jest.fn().mockImplementation(() => ({
    createPost: jest.fn(),
    getPostById: jest.fn<() => Promise<null>>().mockResolvedValue(null),
    updatePost: jest.fn(),
    deletePost: jest.fn(),
    likePost: jest.fn<() => Promise<null>>().mockResolvedValue(null),
    sharePost: jest.fn(),
    pinPost: jest.fn(),
    unpinPost: jest.fn(),
    recordView: jest.fn(),
    getPostViews: jest.fn(),
    getPostInteractions: jest.fn(),
    repostPost: jest.fn(),
    bookmarkPost: jest.fn(),
    unbookmarkPost: jest.fn(),
  })),
}));

jest.mock('../../../services/PostFeedService', () => ({
  PostFeedService: jest.fn().mockImplementation(() => ({
    getFeed: jest.fn<() => Promise<{ items: unknown[]; hasMore: boolean }>>().mockResolvedValue({ items: [], hasMore: false }),
    getStories: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([]),
    getStatuses: jest.fn<() => Promise<{ items: unknown[]; hasMore: boolean }>>().mockResolvedValue({ items: [], hasMore: false }),
    getDiscoverStatuses: jest.fn<() => Promise<{ items: unknown[]; hasMore: boolean }>>().mockResolvedValue({ items: [], hasMore: false }),
    getUserPosts: jest.fn<() => Promise<{ items: unknown[]; hasMore: boolean }>>().mockResolvedValue({ items: [], hasMore: false }),
    getCommunityFeed: jest.fn<() => Promise<{ items: unknown[]; hasMore: boolean }>>().mockResolvedValue({ items: [], hasMore: false }),
    getBookmarks: jest.fn<() => Promise<{ items: unknown[]; hasMore: boolean }>>().mockResolvedValue({ items: [], hasMore: false }),
  })),
}));

jest.mock('../../../services/PostCommentService', () => ({
  PostCommentService: jest.fn().mockImplementation(() => ({
    getComments: jest.fn<() => Promise<{ items: unknown[]; hasMore: boolean }>>().mockResolvedValue({ items: [], hasMore: false }),
    getReplies: jest.fn<() => Promise<{ items: unknown[]; hasMore: boolean }>>().mockResolvedValue({ items: [], hasMore: false }),
    addComment: jest.fn<() => Promise<null>>().mockResolvedValue(null),
    likeComment: jest.fn(),
    unlikeComment: jest.fn(),
    deleteComment: jest.fn(),
  })),
}));

jest.mock('../../../services/MentionService', () => ({
  resolveMentionedUsers: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([]),
  MentionService: jest.fn().mockImplementation(() => ({
    extractMentions: jest.fn(),
    resolveMentions: jest.fn(),
    validateMentions: jest.fn(),
    getSuggestions: jest.fn(),
  })),
}));

jest.mock('../../../middleware/rate-limiter', () => ({
  createPostRouteRateLimitConfig: jest.fn<() => Record<string, unknown>>().mockReturnValue({}),
}));

// #4147 — POST /posts tire son plafond de création d'un compteur PARTAGÉ qui
// lit Redis directement, fail-closed (createSharedWriteRateLimitPreHandler,
// routes/posts/socialRateLimit.ts) : sans ce double,
// `getCacheStore().getNativeClient()` rend `null` en test (aucun REDIS_URL)
// et la création serait refusée 429 avant d'atteindre les gardes 401/400/500
// que ce fichier vérifie — détail complet dans
// __tests__/unit/routes/posts/core.test.ts, premier fichier de la série à
// le poser. `incr` répond toujours « premier appel » : ce fichier ne teste
// PAS le plafond (son témoin dédié vit dans social-write-rate-limit.test.ts)
// — juste un Redis DISPONIBLE.
jest.mock('../../../services/CacheStore', () => ({
  getCacheStore: () => ({
    getNativeClient: () => ({
      incr: async () => 1,
      pexpire: async () => 1,
      pttl: async () => -1,
    }),
  }),
}));

// Le module réel est ÉTALÉ d'abord (#6293) : ce double ne rendait que
// `withMutationLog`, laissant `withMutationOutcome` et la classe
// `MutationResultGone` à `undefined`. Depuis que la route like emploie
// `withMutationOutcome` pour garder ses effets de bord au rejeu, l'appeler ici
// levait un `TypeError` que le `catch` de la route déguisait en 500 — ce fichier
// attendait 404 et lisait 500, sans qu'aucun message ne parle d'idempotence.
// Même remède que `interactions.harness.ts`, qui le documente déjà.
jest.mock('../../../utils/withMutationLog', () => ({
  // `as object` EXIGÉ : `jest.requireActual` rend `unknown`, et TS refuse
  // d'étaler `unknown` (TS2698). C'est pour cette raison que
  // `interactions.harness.ts` prend le module en PARAMÈTRE typé `object` plutôt
  // que d'appeler `requireActual` chez lui — son doc-comment le dit, et la
  // première version de ce correctif ne l'a pas lu.
  ...(jest.requireActual('../../../utils/withMutationLog') as object),
  withMutationLog: jest.fn().mockImplementation(({ op }: any) => op()),
}));

jest.mock('../../../services/MediaService', () => ({
  MediaService: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../../../services/notifications/NotificationService', () => ({
  NotificationService: jest.fn().mockImplementation(() => ({
    createPostMentionNotificationsBatch: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    createFriendContentNotificationsBatch: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    createPostCommentNotification: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    createCommentLikeNotification: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    createPostLikeNotification: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    createPostRepostNotification: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  })),
}));

const PUBLIC_ACL = { authorId: 'author-1', visibility: 'PUBLIC', visibilityUserIds: [] };

const buildMockPrisma = (): PrismaClient => ({
  // Audience déclarée PUBLIC — ce fichier porte sur le FORMAT des erreurs, pas
  // sur le droit de voir. Sans elle, la garde d'audience du fil renverrait son
  // propre 404 avant que le cas testé ne soit atteint.
  post: {
    findUnique: jest.fn<() => Promise<null>>().mockResolvedValue(null),
    findFirst: jest.fn<() => Promise<unknown>>().mockResolvedValue(PUBLIC_ACL),
  },
  postComment: {
    findUnique: jest.fn<() => Promise<null>>().mockResolvedValue(null),
    findFirst: jest.fn<() => Promise<unknown>>().mockResolvedValue({ postId: 'post-1', post: PUBLIC_ACL }),
  },
  postImpression: { create: jest.fn(), createMany: jest.fn() },
  sound: { create: jest.fn(), findMany: jest.fn(), update: jest.fn() },
} as unknown as PrismaClient);

const buildNoAuthMiddleware = () =>
  (_req: unknown, reply: any, done: () => void) => {
    (reply.request as any) = _req;
    done();
  };

const buildAuthMiddleware = (userId?: string) =>
  (req: any, _reply: unknown, done: () => void) => {
    if (userId) {
      req.authContext = {
        isAuthenticated: true,
        registeredUser: { emailVerifiedAt: new Date(), id: userId, username: 'testuser' },
      };
    }
    done();
  };

async function buildApp(authenticated: boolean): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  const prisma = buildMockPrisma();
  (app as any).prisma = prisma;
  (app as any).socialEvents = null;
  (app as any).notificationService = null;

  // Reproduit la SEULE branche de `server.ts#setErrorHandler` pertinente ici —
  // le refus de schéma Ajv (#6853) — sans réimporter tout le gestionnaire
  // global (CORS, hiérarchie d'erreurs typées…), hors du périmètre de ce
  // fichier. Sans elle, un refus de `schema.params` échappe sous la forme PAR
  // DÉFAUT de Fastify (`{statusCode, error:'Bad Request', message}`, sans
  // `success`), que ce harnais léger ne pose jamais lui-même : le témoin
  // attesterait un contrat que la production ne sert pas.
  const { schemaValidationErrorResponse } = await import('../../../utils/schema-validation-error');
  app.setErrorHandler(async (error, _request, reply) => {
    const schemaRefusal = schemaValidationErrorResponse(error);
    if (schemaRefusal) {
      const { statusCode: refusStatus, ...corpsRefus } = schemaRefusal;
      return reply.code(refusStatus).send(corpsRefus);
    }
    throw error;
  });

  const requiredAuth = buildAuthMiddleware(authenticated ? 'user-123' : undefined);
  const optionalAuth = buildAuthMiddleware(authenticated ? 'user-123' : undefined);

  const { registerCoreRoutes } = await import('../core');
  const { registerFeedRoutes } = await import('../feed');
  const { registerInteractionRoutes } = await import('../interactions');
  const { registerCommentRoutes } = await import('../comments');

  app.register(async (instance) => {
    instance.addHook('preValidation', requiredAuth as any);
    registerCoreRoutes(instance, prisma, requiredAuth);
    registerFeedRoutes(instance, prisma, requiredAuth, optionalAuth);
    registerInteractionRoutes(instance, prisma, requiredAuth);
    registerCommentRoutes(instance, prisma, requiredAuth);
  });

  await app.ready();
  return app;
}

type ErrorBody = {
  success: boolean;
  error: string;
  message?: string;
};

function assertErrorShape(body: ErrorBody) {
  expect(body.success).toBe(false);
  expect(typeof body.error).toBe('string');
  expect(body.error.length).toBeGreaterThan(0);
}

describe('posts routes — error response format', () => {
  let unauthApp: FastifyInstance;
  let authApp: FastifyInstance;

  beforeAll(async () => {
    unauthApp = await buildApp(false);
    authApp = await buildApp(true);
  });

  afterAll(async () => {
    await unauthApp.close();
    await authApp.close();
  });

  // ── core.ts ───────────────────────────────────────────────────────────────

  it('core: should return structured error on 401 when no auth (POST /posts)', async () => {
    const resp = await unauthApp.inject({ method: 'POST', url: '/posts', body: {} });
    expect(resp.statusCode).toBe(401);
    const body: ErrorBody = resp.json();
    assertErrorShape(body);
    expect(body.error).toBe('Authentication required');
  });

  it('core: should return structured error on 400 for invalid payload (POST /posts)', async () => {
    const resp = await authApp.inject({ method: 'POST', url: '/posts', body: { type: 'INVALID_TYPE' } });
    expect(resp.statusCode).toBe(400);
    const body: ErrorBody = resp.json();
    assertErrorShape(body);
    expect(body.error).toBe('Invalid request');
  });

  it('core: should return structured error on 404 for unknown post (GET /posts/:postId)', async () => {
    // Forme ObjectId VALIDE mais inconnue (#6853) : le fixture historique
    // (`nonexistent123456789012`, 23 caractères non-hex) est désormais rejeté
    // en 400 par `postIdParamsSchema` avant d'atteindre le handler — ce test
    // vise le 404 « post absent », pas le 400 « id malformé » couvert plus bas.
    const resp = await authApp.inject({ method: 'GET', url: '/posts/aaaaaaaaaaaaaaaaaaaaaaaa' });
    expect(resp.statusCode).toBe(404);
    const body: ErrorBody = resp.json();
    assertErrorShape(body);
    expect(body.error).toBe('Post not found');
  });

  // ── feed.ts ───────────────────────────────────────────────────────────────

  it('feed: should return structured error on 401 when no auth (GET /posts/feed)', async () => {
    const resp = await unauthApp.inject({ method: 'GET', url: '/posts/feed' });
    expect(resp.statusCode).toBe(401);
    const body: ErrorBody = resp.json();
    assertErrorShape(body);
    expect(body.error).toBe('Authentication required');
  });

  it('feed: should return 200 with empty items when authenticated (GET /posts/feed)', async () => {
    const resp = await authApp.inject({ method: 'GET', url: '/posts/feed' });
    expect(resp.statusCode).toBe(200);
    const body = resp.json();
    expect(body.success).toBe(true);
  });

  // ── interactions.ts ───────────────────────────────────────────────────────

  it('interactions: should return structured error on 401 when no auth (POST /posts/:id/like)', async () => {
    const resp = await unauthApp.inject({ method: 'POST', url: '/posts/abc123/like', body: {} });
    expect(resp.statusCode).toBe(401);
    const body: ErrorBody = resp.json();
    assertErrorShape(body);
    expect(body.error).toBe('Authentication required');
  });

  it('interactions: should return structured error on 404 for unknown post (POST /posts/:id/like)', async () => {
    const resp = await authApp.inject({ method: 'POST', url: '/posts/nonexistent123456789012/like', body: {} });
    expect(resp.statusCode).toBe(404);
    const body: ErrorBody = resp.json();
    assertErrorShape(body);
    expect(body.error).toBe('Post not found');
  });

  // ── comments.ts ───────────────────────────────────────────────────────────

  it('comments: should return structured error on 401 when no auth (POST /posts/:id/comments)', async () => {
    const resp = await unauthApp.inject({ method: 'POST', url: '/posts/abc123/comments', body: {} });
    expect(resp.statusCode).toBe(401);
    const body: ErrorBody = resp.json();
    assertErrorShape(body);
    expect(body.error).toBe('Authentication required');
  });

  it('comments: should return structured error on 400 for missing content (POST /posts/:id/comments)', async () => {
    const resp = await authApp.inject({ method: 'POST', url: '/posts/abc123/comments', body: {} });
    expect(resp.statusCode).toBe(400);
    const body: ErrorBody = resp.json();
    assertErrorShape(body);
    expect(body.error).toBe('Invalid request');
  });

  it('comments: should return structured error on 404 for unknown post (POST /posts/:id/comments)', async () => {
    const resp = await authApp.inject({
      method: 'POST',
      url: '/posts/nonexistent123456789012/comments',
      body: { content: 'hello' },
    });
    expect(resp.statusCode).toBe(404);
    const body: ErrorBody = resp.json();
    assertErrorShape(body);
    expect(body.error).toBe('Post not found');
  });

  // ── postId format validation (#6853) ─────────────────────────────────────
  //
  // `GET /posts/stories` tombait dans `/posts/:postId` avec `postId =
  // "stories"` — une chaîne qui n'est pas un ObjectId de 24 caractères
  // hexadécimaux — et le cast Prisma non gardé remontait en 500 générique.
  // `postIdParamsSchema` (`routes/posts/types.ts`) le refuse désormais en 400
  // AVANT le handler, sur `/posts/:postId` et ses voisins qui appellent
  // directement Prisma/`PostService` sans passer par une porte d'audience
  // déjà gardée par `isValidObjectId` (like/unlike, bookmark, share, les
  // comptent parmi les « voisins » déjà sûrs et restent hors de ce témoin).
  //
  // La classe, pas seulement `"stories"` : un slug court, une chaîne trop
  // longue, et une chaîne de la bonne LONGUEUR mais hors alphabet hexadécimal
  // (24 caractères, un `g` non-hex) — celle-ci est le cas qu'un simple
  // contrôle de longueur laisserait passer.
  const MALFORMED_POST_IDS: readonly [id: string, why: string][] = [
    ['stories', 'le cas mesuré en production'],
    ['abc', 'trop court'],
    ['a'.repeat(30), 'trop long'],
    ['g'.repeat(24), '24 caractères mais hors alphabet hexadécimal'],
  ];

  const ROUTES_WITH_POST_ID: readonly [label: string, method: string, buildUrl: (id: string) => string, body: unknown][] = [
    ['GET /posts/:postId', 'GET', (id) => `/posts/${id}`, undefined],
    ['PUT /posts/:postId', 'PUT', (id) => `/posts/${id}`, {}],
    ['DELETE /posts/:postId', 'DELETE', (id) => `/posts/${id}`, undefined],
    ['POST /posts/:postId/translate', 'POST', (id) => `/posts/${id}/translate`, { targetLanguage: 'en' }],
    ['POST /posts/:postId/pin', 'POST', (id) => `/posts/${id}/pin`, undefined],
    ['DELETE /posts/:postId/pin', 'DELETE', (id) => `/posts/${id}/pin`, undefined],
    ['GET /posts/:postId/views', 'GET', (id) => `/posts/${id}/views`, undefined],
    ['GET /posts/:postId/interactions', 'GET', (id) => `/posts/${id}/interactions`, undefined],
    ['POST /posts/:postId/republish', 'POST', (id) => `/posts/${id}/republish`, undefined],
    ['POST /posts/:postId/repost', 'POST', (id) => `/posts/${id}/repost`, {}],
  ];

  describe.each(ROUTES_WITH_POST_ID)('%s — postId non conforme', (_label, method, buildUrl, body) => {
    it.each(MALFORMED_POST_IDS)('rend 400 nommant le champ, jamais 500 (%s — %s)', async (malformedId) => {
      const resp = await authApp.inject({ method: method as 'GET' | 'POST' | 'PUT' | 'DELETE', url: buildUrl(malformedId), body });
      expect(resp.statusCode).toBe(400);
      const parsed = resp.json();
      expect(parsed.success).toBe(false);
      expect(parsed.code).toBe('VALIDATION_ERROR');
      expect(parsed.details?.some((d: { field: string }) => d.field === 'postId')).toBe(true);
    });
  });
});
