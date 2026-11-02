/**
 * POST /posts et PUT /posts/:postId — le plafond quotidien des personnes
 * choisies SANS LIEN d'un post `ONLY` est consulté à la publication et à
 * l'édition, et son refus est un 429 clair qui n'écrit rien (#14105). Le seau
 * lui-même a ses témoins dans `routes/posts/__tests__/only-unlinked-budget-14105.test.ts`.
 * Même harnais que `core-moderation-hold.test.ts`.
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

const mockSpendOnlyUnlinkedBudget = jest.fn<any>();
const mockReleaseOnlyUnlinkedBudget = jest.fn<any>().mockResolvedValue(undefined);

jest.mock('../../../../routes/posts/onlyUnlinkedBudget', () => ({
  ...(jest.requireActual('../../../../routes/posts/onlyUnlinkedBudget') as object),
  spendOnlyUnlinkedBudget: (...args: any[]) => mockSpendOnlyUnlinkedBudget(...args),
  releaseOnlyUnlinkedBudget: (...args: any[]) => mockReleaseOnlyUnlinkedBudget(...args),
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { registerCoreRoutes } from '../../../../routes/posts/core';
import { withMutationVerdict } from '../../../../utils/withMutationLog';
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

const CHOISIS = ['507f1f77bcf86cd799439044', '507f1f77bcf86cd799439055'];
const REFUS = { allowed: false, retryAfter: 3600, unlinked: 51 };
const PASSE = { allowed: true, retryAfter: 0, unlinked: 2 };

describe('POST /posts — plafond des choisis sans lien (#14105)', () => {
  it('consulte le seau avec les choisis d’un post ONLY, et publie quand il passe', async () => {
    mockCreatePost.mockClear();
    mockSpendOnlyUnlinkedBudget.mockReset().mockResolvedValue(PASSE);
    const app = await buildApp();
    const res = await app.inject({ method: 'POST', url: '/posts', payload: { type: 'POST', content: 'Hi', visibility: 'ONLY', visibilityUserIds: CHOISIS } });
    expect(res.statusCode).toBe(201);
    expect(mockSpendOnlyUnlinkedBudget).toHaveBeenCalledWith(expect.objectContaining({ authorId: USER_ID, chosenIds: CHOISIS }));
    await app.close();
  });

  it('plafond atteint : 429 ONLY_UNLINKED_RECIPIENTS_LIMIT, Retry-After, rien n’est créé', async () => {
    mockCreatePost.mockClear();
    mockSpendOnlyUnlinkedBudget.mockReset().mockResolvedValue(REFUS);
    const app = await buildApp();
    const res = await app.inject({ method: 'POST', url: '/posts', payload: { type: 'POST', content: 'Hi', visibility: 'ONLY', visibilityUserIds: CHOISIS } });
    expect(res.statusCode).toBe(429);
    expect(res.headers['retry-after']).toBe('3600');
    expect(res.json()).toMatchObject({ code: 'ONLY_UNLINKED_RECIPIENTS_LIMIT', limit: 50, unlinked: 51 });
    expect(mockCreatePost).not.toHaveBeenCalled();
    await app.close();
  });

  it('une création REJOUÉE (même clientMutationId) ne recompte rien et resservit le post', async () => {
    mockSpendOnlyUnlinkedBudget.mockReset().mockResolvedValue(REFUS);
    (withMutationVerdict as jest.Mock<any>).mockImplementationOnce(async () => ({ result: { id: 'post-001', type: 'POST', visibility: 'ONLY' }, replayed: true }));
    const app = await buildApp();
    const res = await app.inject({ method: 'POST', url: '/posts', payload: { type: 'POST', content: 'Hi', visibility: 'ONLY', visibilityUserIds: CHOISIS } });
    expect(res.statusCode).toBe(201);
    expect(mockSpendOnlyUnlinkedBudget).not.toHaveBeenCalled();
    await app.close();
  });

  it('une création qui échoue après le débit le REND', async () => {
    mockSpendOnlyUnlinkedBudget.mockReset().mockResolvedValue(PASSE);
    mockReleaseOnlyUnlinkedBudget.mockClear();
    mockCreatePost.mockRejectedValueOnce(new Error('boom'));
    const app = await buildApp();
    const res = await app.inject({ method: 'POST', url: '/posts', payload: { type: 'POST', content: 'Hi', visibility: 'ONLY', visibilityUserIds: CHOISIS } });
    expect(res.statusCode).toBe(500);
    expect(mockReleaseOnlyUnlinkedBudget).toHaveBeenCalledWith(expect.objectContaining({ authorId: USER_ID, unlinked: PASSE.unlinked }));
    await app.close();
  });

  it('un post qui n’est pas ONLY ne consulte pas le seau', async () => {
    mockSpendOnlyUnlinkedBudget.mockReset().mockResolvedValue(REFUS);
    const app = await buildApp();
    const res = await app.inject({ method: 'POST', url: '/posts', payload: { type: 'POST', content: 'Hi', visibility: 'PUBLIC' } });
    expect(res.statusCode).toBe(201);
    expect(mockSpendOnlyUnlinkedBudget).not.toHaveBeenCalled();
    await app.close();
  });
});

describe('PUT /posts/:postId — plafond des choisis sans lien (#14105)', () => {
  const prismaFor = (row: Record<string, unknown>) => ({
    post: {
      findFirst: jest.fn<any>().mockResolvedValue({ authorId: USER_ID, moderationHiddenAt: null, moderationPriorVisibility: null, repostOfId: null, visibility: 'ONLY', visibilityUserIds: [CHOISIS[0]], ...row }),
      updateMany: jest.fn<any>().mockResolvedValue({ count: 1 }),
    },
  });

  it('ne compte que les choisis AJOUTÉS à la liste existante', async () => {
    mockSpendOnlyUnlinkedBudget.mockReset().mockResolvedValue(PASSE);
    const app = await buildApp({ prisma: prismaFor({}) });
    const res = await app.inject({ method: 'PUT', url: `/posts/${POST_ID}`, payload: { visibilityUserIds: CHOISIS } });
    expect(res.statusCode).toBe(200);
    expect(mockSpendOnlyUnlinkedBudget).toHaveBeenCalledWith(expect.objectContaining({ chosenIds: CHOISIS, previouslyChosen: [CHOISIS[0]] }));
    await app.close();
  });

  it('passer en ONLY depuis EXCEPT : l’ancienne liste (des exclus) n’est pas « déjà choisie »', async () => {
    mockSpendOnlyUnlinkedBudget.mockReset().mockResolvedValue(PASSE);
    const app = await buildApp({ prisma: prismaFor({ visibility: 'EXCEPT' }) });
    await app.inject({ method: 'PUT', url: `/posts/${POST_ID}`, payload: { visibility: 'ONLY', visibilityUserIds: CHOISIS } });
    expect(mockSpendOnlyUnlinkedBudget).toHaveBeenCalledWith(expect.objectContaining({ chosenIds: CHOISIS, previouslyChosen: [] }));
    await app.close();
  });

  it('une REPUBLICATION éditée compte aussi les choisis qu’on lui ajoute', async () => {
    mockSpendOnlyUnlinkedBudget.mockReset().mockResolvedValue(PASSE);
    const app = await buildApp({ prisma: prismaFor({ repostOfId: '507f1f77bcf86cd799439066' }) });
    await app.inject({ method: 'PUT', url: `/posts/${POST_ID}`, payload: { visibilityUserIds: CHOISIS } });
    expect(mockSpendOnlyUnlinkedBudget).toHaveBeenCalledWith(expect.objectContaining({ chosenIds: CHOISIS, previouslyChosen: [CHOISIS[0]] }));
    await app.close();
  });

  it('une édition qui échoue après le débit le REND', async () => {
    mockSpendOnlyUnlinkedBudget.mockReset().mockResolvedValue(PASSE);
    mockReleaseOnlyUnlinkedBudget.mockClear();
    mockUpdatePost.mockResolvedValueOnce(null);
    const app = await buildApp({ prisma: prismaFor({}) });
    const res = await app.inject({ method: 'PUT', url: `/posts/${POST_ID}`, payload: { visibilityUserIds: CHOISIS } });
    expect(res.statusCode).toBe(404);
    expect(mockReleaseOnlyUnlinkedBudget).toHaveBeenCalledWith(expect.objectContaining({ authorId: USER_ID, unlinked: PASSE.unlinked }));
    await app.close();
  });

  it('plafond atteint : 429, rien n’est écrit', async () => {
    mockUpdatePost.mockClear();
    mockSpendOnlyUnlinkedBudget.mockReset().mockResolvedValue(REFUS);
    const app = await buildApp({ prisma: prismaFor({}) });
    const res = await app.inject({ method: 'PUT', url: `/posts/${POST_ID}`, payload: { visibilityUserIds: CHOISIS } });
    expect(res.statusCode).toBe(429);
    expect(res.json().code).toBe('ONLY_UNLINKED_RECIPIENTS_LIMIT');
    expect(mockUpdatePost).not.toHaveBeenCalled();
    await app.close();
  });
});

describe('PUT /posts/:postId — un refus de saisie ne débite rien (#14105)', () => {
  it('un lieu invalide sort en 400 AVANT le débit', async () => {
    mockSpendOnlyUnlinkedBudget.mockReset().mockResolvedValue(PASSE);
    const prisma = {
      post: {
        findFirst: jest.fn<any>().mockResolvedValue({ authorId: USER_ID, moderationHiddenAt: null, moderationPriorVisibility: null, repostOfId: null, visibility: 'ONLY', visibilityUserIds: [] }),
        updateMany: jest.fn<any>().mockResolvedValue({ count: 1 }),
      },
    };
    const app = await buildApp({ prisma });
    const res = await app.inject({ method: 'PUT', url: `/posts/${POST_ID}`, payload: { visibilityUserIds: CHOISIS, location: { name: 42 } } });
    expect(res.statusCode).toBe(400);
    expect(mockSpendOnlyUnlinkedBudget).not.toHaveBeenCalled();
    await app.close();
  });
});
