/**
 * PUT /posts/:postId — une publication mise hors ligne par la modération ne
 * se rouvre pas par une édition de son auteur (#10315). Même harnais que
 * `core.test.ts`, dont le budget de taille interdit qu'il grossisse.
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockCreatePost = jest.fn<any>().mockResolvedValue({ id: 'post-001', content: 'Hello', type: 'POST', visibility: 'PUBLIC', createdAt: new Date() });
const mockGetPostById = jest.fn<any>().mockResolvedValue({ id: 'post-001', content: 'Hello', type: 'POST' });
const mockUpdatePost = jest.fn<any>().mockResolvedValue({ id: 'post-001', content: 'Updated', type: 'POST' });
const mockDeletePost = jest.fn<any>().mockResolvedValue({ type: 'POST', visibility: 'PUBLIC' });

jest.mock('../../../../services/PostService', () => ({
  PostService: jest.fn().mockImplementation(() => ({
    createPost: (...args: any[]) => mockCreatePost(...args),
    getPostById: (...args: any[]) => mockGetPostById(...args),
    updatePost: (...args: any[]) => mockUpdatePost(...args),
    deletePost: (...args: any[]) => mockDeletePost(...args),
  })),
}));

jest.mock('../../../../services/posts/PostTranslationService', () => ({
  PostTranslationService: {
    shared: {
      translatePost: jest.fn<any>().mockResolvedValue(undefined),
      translateOnDemand: jest.fn<any>().mockResolvedValue(undefined),
    },
  },
}));

const mockExtractMentions = jest.fn<any>().mockReturnValue([]);
const mockResolveUsernames = jest.fn<any>().mockResolvedValue(new Map());
const mockCreatePostMentions = jest.fn<any>().mockResolvedValue(undefined);

jest.mock('../../../../services/MentionService', () => ({
  resolveMentionedUsers: jest.fn<any>().mockResolvedValue([]),
  MentionService: jest.fn().mockImplementation(() => ({
    extractMentions: (...args: any[]) => mockExtractMentions(...args),
    resolveUsernames: (...args: any[]) => mockResolveUsernames(...args),
    createPostMentions: (...args: any[]) => mockCreatePostMentions(...args),
  })),
}));

const mockExtractHashtags = jest.fn<any>().mockReturnValue([]);
const mockCreatePostHashtags = jest.fn<any>().mockResolvedValue(undefined);
const mockReconcileRemovedHashtags = jest.fn<any>().mockResolvedValue(undefined);

jest.mock('../../../../services/HashtagService', () => ({
  HashtagService: jest.fn().mockImplementation(() => ({
    extractHashtags: (...args: any[]) => mockExtractHashtags(...args),
    createPostHashtags: (...args: any[]) => mockCreatePostHashtags(...args),
    reconcileRemovedHashtags: (...args: any[]) => mockReconcileRemovedHashtags(...args),
  })),
}));

// GW1 — the routes consume the DECORATED fastify.notificationService (wired
// instance), not a locally constructed NotificationService: mocks are injected
// via app.decorate in buildApp below.
const mockCreatePostMentionNotificationsBatch = jest.fn<any>().mockResolvedValue(undefined);
const mockCreateFriendContentNotificationsBatch = jest.fn<any>().mockResolvedValue(undefined);

jest.mock('../../../../middleware/rate-limiter', () => ({
  createPostRouteRateLimitConfig: jest.fn<any>().mockReturnValue({}),
}));

jest.mock('../../../../utils/withMutationLog', () => ({
  // Le module réel est ÉTALÉ d'abord : `MutationResultGone` est une CLASSE
  // dont les routes font `instanceof`, et `withMutationOutcome` est le
  // chemin réel du repost. Une usine qui ne rendait que `withMutationLog`
  // les laissait à `undefined` — `instanceof undefined` lève un TypeError
  // qui se déguise en 500 sur des chemins d'erreur sans rapport.
  ...(jest.requireActual('../../../../utils/withMutationLog') as object),
  withMutationLog: jest.fn<any>().mockImplementation(({ op }: any) => op()), withMutationVerdict: jest.fn<any>().mockImplementation(async ({ op }: any) => ({ result: await op(), replayed: false })),
}));

jest.mock('../../../../utils/sanitize.js', () => ({
  SecuritySanitizer: { sanitizeText: jest.fn((t: string) => t) },
}));

// #4147 — POST /posts et POST /posts/from-attachment tirent désormais leur
// plafond de création d'un compteur PARTAGÉ (createSharedWriteRateLimitPreHandler,
// routes/posts/socialRateLimit.ts) qui lit Redis DIRECTEMENT, fail-closed
// (consignes #4147) : sans ce double, `getCacheStore().getNativeClient()`
// rend `null` en test (aucun REDIS_URL, cf. jest.setup.js) et CHAQUE création
// serait refusée avant d'atteindre ce que ce fichier vérifie. `incr` répond
// toujours « premier appel » : ce fichier ne teste PAS le plafond lui-même
// (son témoin dédié, deux comptes + épuisement du budget, vit dans
// social-write-rate-limit.test.ts) — juste un Redis DISPONIBLE.
jest.mock('../../../../services/CacheStore', () => ({
  getCacheStore: () => ({
    getNativeClient: () => ({
      incr: async () => 1,
      pexpire: async () => 1,
      pttl: async () => -1,
    }),
  }),
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { registerCoreRoutes } from '../../../../routes/posts/core';
import { registerClientMutationIdHook } from '../../../../middleware/clientMutationId';

// ─── Constants ────────────────────────────────────────────────────────────────

const USER_ID = '507f1f77bcf86cd799439011';
const POST_ID = '507f1f77bcf86cd799439022';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makePreValidationAuth(authenticated: boolean) {
  return async (req: FastifyRequest) => {
    if (authenticated) {
      (req as any).authContext = {
        isAuthenticated: true,
        registeredUser: { emailVerifiedAt: new Date(), id: USER_ID, role: 'USER' }, // #6437
      };
    } else {
      (req as any).authContext = null;
    }
  };
}

async function buildApp(opts: {
  authenticated?: boolean;
  withSocialEvents?: boolean;
  prisma?: unknown;
} = {}): Promise<FastifyInstance> {
  const { authenticated = true, withSocialEvents = false } = opts;

  const app = Fastify({ logger: false });
  const prisma = (opts.prisma ?? { post: { findFirst: async () => null } }) as any;
  const requiredAuth = makePreValidationAuth(authenticated);

  app.decorate('notificationService', {
    createPostMentionNotificationsBatch: (...args: any[]) => mockCreatePostMentionNotificationsBatch(...args),
    createFriendContentNotificationsBatch: (...args: any[]) => mockCreateFriendContentNotificationsBatch(...args),
  } as any);

  if (withSocialEvents) {
    app.decorate('socialEvents', {
      broadcastPostCreated: jest.fn<any>().mockResolvedValue(undefined),
      broadcastStoryCreated: jest.fn<any>().mockResolvedValue(undefined),
      broadcastStatusCreated: jest.fn<any>().mockResolvedValue(undefined),
      broadcastPostUpdated: jest.fn<any>().mockResolvedValue(undefined),
      broadcastStoryUpdated: jest.fn<any>().mockResolvedValue(undefined),
      broadcastStatusUpdated: jest.fn<any>().mockResolvedValue(undefined),
      broadcastPostDeleted: jest.fn<any>().mockResolvedValue(undefined),
      broadcastStoryDeleted: jest.fn<any>().mockResolvedValue(undefined),
      broadcastStatusDeleted: jest.fn<any>().mockResolvedValue(undefined),
    });
  }

  // Topologie réelle : le hook cmid est enregistré AVANT les routes, comme
  // dans `server.ts` — nécessaire pour les tests d'écho U1 STORY/STATUS
  // ci-dessous. Sans header envoyé, il ne fait rien (aucun risque pour les
  // suites existantes).
  registerClientMutationIdHook(app);

  registerCoreRoutes(app, prisma, requiredAuth);
  await app.ready();
  return app;
}

describe('PUT /posts/:postId — publication mise hors ligne par la modération (#10315)', () => {
  const prismaFor = (row: Record<string, unknown>) => {
    const updateMany = jest.fn<any>().mockResolvedValue({ count: 1 });
    return {
      prisma: {
        post: {
          findFirst: jest.fn<any>().mockResolvedValue({ authorId: USER_ID, moderationHiddenAt: null, moderationPriorVisibility: null, repostOfId: null, ...row }),
          updateMany,
        },
      },
      updateMany,
    };
  };

  it("refuse à l'auteur de rouvrir l'audience, sans rien écrire", async () => {
    mockUpdatePost.mockClear();
    const { prisma } = prismaFor({ moderationHiddenAt: new Date('2026-10-11T00:00:00Z') });
    const app = await buildApp({ prisma });
    const res = await app.inject({ method: 'PUT', url: `/posts/${POST_ID}`, payload: { visibility: 'PUBLIC' } });
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('POST_MODERATION_HELD');
    expect(mockUpdatePost).not.toHaveBeenCalled();
    await app.close();
  });

  it("laisse l'auteur rouvrir l'audience d'une publication en ligne", async () => {
    mockUpdatePost.mockClear();
    const { prisma, updateMany } = prismaFor({});
    const app = await buildApp({ prisma });
    const res = await app.inject({ method: 'PUT', url: `/posts/${POST_ID}`, payload: { visibility: 'PUBLIC' } });
    expect(res.statusCode).toBe(200);
    expect(mockUpdatePost).toHaveBeenCalledTimes(1);
    expect(updateMany).not.toHaveBeenCalled();
    await app.close();
  });

  it("un retrait posé pendant la requête refuse l'écriture conditionnelle : 403, jamais 500", async () => {
    mockUpdatePost.mockRejectedValueOnce(Object.assign(new Error('Record not found'), { code: 'P2025' }));
    const { prisma } = prismaFor({});
    const app = await buildApp({ prisma });
    const res = await app.inject({ method: 'PUT', url: `/posts/${POST_ID}`, payload: { visibility: 'PUBLIC' } });
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('POST_MODERATION_HELD');
    await app.close();
  });

  it("efface l'audience retenue par une mise en privé dès que l'auteur choisit la sienne", async () => {
    const { prisma, updateMany } = prismaFor({ moderationPriorVisibility: 'PUBLIC' });
    const app = await buildApp({ prisma });
    const res = await app.inject({ method: 'PUT', url: `/posts/${POST_ID}`, payload: { visibility: 'FRIENDS' } });
    expect(res.statusCode).toBe(200);
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: POST_ID, authorId: USER_ID, OR: [{ moderationHiddenAt: null }, { moderationHiddenAt: { isSet: false } }] },
      data: { moderationPriorVisibility: null },
    });
    await app.close();
  });
});

describe('POST /posts — republier une source hors ligne (#10315)', () => {
  it('refuse sans rien créer : la republication ne rouvre pas un retrait', async () => {
    mockCreatePost.mockClear();
    const prisma = {
      post: { findFirst: jest.fn<any>().mockResolvedValue({ visibility: 'PRIVATE', moderationHiddenAt: new Date('2026-10-11T00:00:00Z') }) },
    };
    const app = await buildApp({ prisma });
    const res = await app.inject({ method: 'POST', url: '/posts', payload: { type: 'POST', visibility: 'PRIVATE', repostOfId: '507f1f77bcf86cd799439033' } });
    expect(res.statusCode).toBe(404);
    expect(mockCreatePost).not.toHaveBeenCalled();
    await app.close();
  });
});
