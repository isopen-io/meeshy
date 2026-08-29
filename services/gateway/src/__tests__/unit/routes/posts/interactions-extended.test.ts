/**
 * Extended unit tests for posts interaction routes (interactions.ts)
 * Covers: anonymous-view, impression, impressions/batch, engagement/batch,
 *         share, pin, views, interactions, repost.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeAll, afterAll } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockRecordAnonymousOpen = jest.fn();
const mockRecordEngagementBatch = jest.fn();
const mockSharePost = jest.fn();
const mockShareWithTrackingLink = jest.fn();
const mockGetPostShareLink = jest.fn();
const mockPinPost = jest.fn();
const mockUnpinPost = jest.fn();
const mockGetPostViews = jest.fn();
const mockGetPostInteractions = jest.fn();
const mockRepostPost = jest.fn();
const mockGetPostById = jest.fn().mockResolvedValue({ id: 'post-1', type: 'POST', authorId: 'author-1' });
const mockLikePost = jest.fn().mockResolvedValue({ id: 'p1', likeCount: 1, reactionSummary: {} });
// `unlikePost` rend une enveloppe : le post ET la réaction réellement retirée.
const mockUnlikePost = jest.fn().mockResolvedValue({
  id: 'p1', removedEmoji: '❤️', post: { id: 'p1', likeCount: 0, reactionSummary: {} },
});
const mockBookmarkPost = jest.fn().mockResolvedValue({ bookmarkCount: 1 });
const mockUnbookmarkPost = jest.fn().mockResolvedValue({ bookmarkCount: 0 });
const mockRecordView = jest.fn().mockResolvedValue(true);

jest.mock('../../../../services/PostService', () => ({
  PostService: jest.fn().mockImplementation(() => ({
    likePost: (...a: any[]) => mockLikePost(...a),
    unlikePost: (...a: any[]) => mockUnlikePost(...a),
    bookmarkPost: (...a: any[]) => mockBookmarkPost(...a),
    unbookmarkPost: (...a: any[]) => mockUnbookmarkPost(...a),
    recordView: (...a: any[]) => mockRecordView(...a),
    getPostById: (...a: any[]) => mockGetPostById(...a),
    recordAnonymousOpen: (...a: any[]) => mockRecordAnonymousOpen(...a),
    recordEngagementBatch: (...a: any[]) => mockRecordEngagementBatch(...a),
    sharePost: (...a: any[]) => mockSharePost(...a),
    shareWithTrackingLink: (...a: any[]) => mockShareWithTrackingLink(...a),
    getPostShareLink: (...a: any[]) => mockGetPostShareLink(...a),
    pinPost: (...a: any[]) => mockPinPost(...a),
    unpinPost: (...a: any[]) => mockUnpinPost(...a),
    getPostViews: (...a: any[]) => mockGetPostViews(...a),
    getPostInteractions: (...a: any[]) => mockGetPostInteractions(...a),
    repostPost: (...a: any[]) => mockRepostPost(...a),
  })),
}));

jest.mock('../../../../services/MediaService', () => ({
  MediaService: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../../../../services/MentionService', () => ({
  resolveMentionedUsers: jest.fn().mockResolvedValue([]),
}));

jest.mock('../../../../services/TrackingLinkService', () => ({
  resolveFrontendBaseUrl: jest.fn().mockReturnValue('https://app.example.com'),
  TrackingLinkService: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../../../../middleware/rate-limiter', () => ({
  createPostRouteRateLimitConfig: jest.fn().mockReturnValue({}),
}));

jest.mock('../../../../utils/withMutationLog', () => ({
  // Le module réel est ÉTALÉ d'abord : `MutationResultGone` est une CLASSE
  // dont les routes font `instanceof`, et `withMutationOutcome` est le
  // chemin réel du repost. Une usine qui ne rendait que `withMutationLog`
  // les laissait à `undefined` — `instanceof undefined` lève un TypeError
  // qui se déguise en 500 sur des chemins d'erreur sans rapport.
  ...(jest.requireActual('../../../../utils/withMutationLog') as object),
  withMutationLog: jest.fn().mockImplementation(async ({ op }: any) => op()),
}));

// #4147 — POST /posts / from-attachment / repost tirent leur plafond de
// création d'un compteur PARTAGÉ qui lit Redis directement, fail-closed
// (createSharedWriteRateLimitPreHandler, routes/posts/socialRateLimit.ts) :
// sans ce double, `getCacheStore().getNativeClient()` rend `null` en test
// (aucun REDIS_URL) et CHAQUE écriture de ce type serait refusée avant
// d'atteindre ce que ce fichier vérifie — détail complet dans core.test.ts,
// premier fichier de la série à le poser. `incr` répond toujours « premier
// appel » : ce fichier ne teste PAS le plafond (son témoin dédié vit dans
// social-write-rate-limit.test.ts) — juste un Redis DISPONIBLE.
jest.mock('../../../../services/CacheStore', () => ({
  getCacheStore: () => ({
    getNativeClient: () => ({
      incr: async () => 1,
      pexpire: async () => 1,
      pttl: async () => -1,
    }),
  }),
}));// ─── Import after mocks ───────────────────────────────────────────────────────

import { registerInteractionRoutes } from '../../../../routes/posts/interactions';

// ─── Constants ────────────────────────────────────────────────────────────────

const USER_ID = '507f1f77bcf86cd799439011';
const POST_ID = '507f1f77bcf86cd799439022';

// ─── App factory ──────────────────────────────────────────────────────────────

/**
 * Tranche ACL d'un post PUBLIC — ce que `loadPostAcl` rend au verdict
 * d'audience posé sur le favori, l'impression et le partage (issue #4146).
 */
const publicAcl = (id: string) => ({
  id, authorId: 'author-1', visibility: 'PUBLIC', visibilityUserIds: [] as string[], expiresAt: null,
});

/**
 * `post.findMany` répond désormais à DEUX questions : la passe d'audience du
 * lot d'impressions (`where.id.in`) et la résolution des racines de repost
 * (`where.repostOfId`). Ce double branche sur la seconde et rend, pour la
 * première, un post PUBLIC par id demandé — l'audience elle-même est le sujet
 * de `interactions-consumption-audience.test.ts`, pas de ce fichier.
 */
function aclAwareFindMany(repostRows: unknown[] = []) {
  return jest.fn<any>().mockImplementation(({ where }: any) => {
    if (where?.repostOfId !== undefined) return Promise.resolve(repostRows);
    return Promise.resolve(((where?.id?.in ?? []) as string[]).map(publicAcl));
  });
}

const aclAwareFindFirst = () =>
  jest.fn<any>().mockImplementation(({ where }: any) => Promise.resolve(publicAcl(where.id)));

function makeAuth(authenticated: boolean) {
  return async (req: FastifyRequest) => {
    (req as any).authContext = authenticated
      ? { isAuthenticated: true, registeredUser: { id: USER_ID, role: 'USER', username: 'alice' } }
      : null;
  };
}

async function buildApp(authenticated = true): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  const prisma = {
    postImpression: {
      create: jest.fn().mockResolvedValue({}),
      createMany: jest.fn().mockResolvedValue({ count: 2 }),
    },
    post: {
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 2 }),
      // Audience déclarée PUBLIC (cf. `interactions-audience.test.ts`).
      findFirst: jest.fn().mockResolvedValue({
        authorId: 'author-1', visibility: 'PUBLIC', visibilityUserIds: [],
      }),
      // Résolution repostOfId/originalRepostOfId pour le crédit de racine du
      // batch d'impressions (chantier reposts cohérents, tâche 1) — par
      // défaut aucun repost dans le batch. L'unitaire replie sa résolution
      // dans le `select` de `update`, aucun `findUnique` séparé nécessaire.
      // Le même délégué porte la passe d'audience du lot (#4146).
      findMany: aclAwareFindMany(),
    },
  } as any;
  app.decorate('prisma', prisma);
  app.decorate('notificationService', null as any);
  registerInteractionRoutes(app, prisma, makeAuth(authenticated));
  await app.ready();
  return app;
}

// ─── POST /posts/:postId/anonymous-view ───────────────────────────────────────

describe('POST /posts/:postId/anonymous-view', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 200 with counted=false when Authorization header is present', async () => {
    const res = await app.inject({
      method: 'POST', url: `/posts/${POST_ID}/anonymous-view`,
      headers: { authorization: 'Bearer some-token' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.counted).toBe(false);
  });

  it('returns 400 when session key is missing', async () => {
    const res = await app.inject({ method: 'POST', url: `/posts/${POST_ID}/anonymous-view` });
    expect(res.statusCode).toBe(400);
  });

  it('returns 200 with counted=true on valid session key', async () => {
    mockRecordAnonymousOpen.mockResolvedValueOnce(true);
    const res = await app.inject({
      method: 'POST', url: `/posts/${POST_ID}/anonymous-view`,
      headers: { 'x-session-token': 'valid-session-key' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.counted).toBe(true);
  });
});

// ─── POST /posts/:postId/impression ──────────────────────────────────────────

describe('POST /posts/:postId/impression (unauthenticated)', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(false); });
  afterAll(async () => { await app.close(); });

  it('returns 401 when not authenticated', async () => {
    const res = await app.inject({ method: 'POST', url: `/posts/${POST_ID}/impression`, payload: {} });
    expect(res.statusCode).toBe(401);
  });
});

describe('POST /posts/:postId/impression (authenticated)', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 200 on successful impression', async () => {
    const res = await app.inject({ method: 'POST', url: `/posts/${POST_ID}/impression`, payload: {} });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.recorded).toBe(true);
  });

  it('returns 200 and increments postOpenCount for detail source', async () => {
    const res = await app.inject({
      method: 'POST', url: `/posts/${POST_ID}/impression`,
      payload: { source: 'detail' },
    });
    expect(res.statusCode).toBe(200);
  });

  // Le viewer de story iOS envoie `source: "story"` à chaque slide révélé.
  // L'enum de validation l'ignorait → 400 systématique, `impressionCount`
  // resté à 0 sur toutes les stories malgré des vues réelles.
  it('accepts source=story (story viewer slide reveal)', async () => {
    const res = await app.inject({
      method: 'POST', url: `/posts/${POST_ID}/impression`,
      payload: { source: 'story' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.recorded).toBe(true);
  });

  it('rejects an unknown source', async () => {
    const res = await app.inject({
      method: 'POST', url: `/posts/${POST_ID}/impression`,
      payload: { source: 'not-a-surface' },
    });
    expect(res.statusCode).toBe(400);
  });
});

// ─── POST /posts/impressions/batch ────────────────────────────────────────────

describe('POST /posts/impressions/batch (unauthenticated)', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(false); });
  afterAll(async () => { await app.close(); });

  it('returns 401 when not authenticated', async () => {
    const res = await app.inject({
      method: 'POST', url: '/posts/impressions/batch',
      payload: { postIds: [POST_ID] },
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('POST /posts/impressions/batch (authenticated)', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 200 with recorded=0 when postIds is empty', async () => {
    const res = await app.inject({
      method: 'POST', url: '/posts/impressions/batch',
      payload: { postIds: [] },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.recorded).toBe(0);
  });

  it('returns 200 with count when postIds provided', async () => {
    const res = await app.inject({
      method: 'POST', url: '/posts/impressions/batch',
      payload: { postIds: [POST_ID, 'other-post-id'] },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.recorded).toBe(2);
  });

  it('accepts source=story', async () => {
    const res = await app.inject({
      method: 'POST', url: '/posts/impressions/batch',
      payload: { postIds: [POST_ID], source: 'story' },
    });
    expect(res.statusCode).toBe(200);
  });

  it('accepts source=status', async () => {
    const res = await app.inject({
      method: 'POST', url: '/posts/impressions/batch',
      payload: { postIds: [POST_ID], source: 'status' },
    });
    expect(res.statusCode).toBe(200);
  });

  /**
   * `createMany` insère une ligne par occurrence, mais `updateMany` avec
   * `id: { in: [...] }` n'incrémente chaque post QU'UNE fois — la table et le
   * compteur dénormalisé divergeaient dès qu'un id se répétait. Avec la
   * sémantique « une impression par apparition à l'écran », les répétitions
   * sont le cas NOMINAL, pas un cas limite.
   */
  it('increments impressionCount once per occurrence, not once per distinct post', async () => {
    const OTHER = '507f1f77bcf86cd799439033';
    const prisma = (app as any).prisma;
    prisma.post.updateMany.mockClear();
    prisma.postImpression.createMany.mockClear();

    const res = await app.inject({
      method: 'POST', url: '/posts/impressions/batch',
      payload: { postIds: [POST_ID, POST_ID, OTHER] },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.recorded).toBe(3);

    // Une ligne PostImpression par occurrence.
    const created = (prisma.postImpression.createMany.mock.calls[0][0] as any).data;
    expect(created).toHaveLength(3);

    // Somme des incréments par post, quelle que soit la façon de grouper les
    // updates. Le `in` est DÉDUPLIQUÉ avant de sommer : `updateMany` avec
    // `id: { in: [A, A] }` n'incrémente A qu'une fois côté base — compter le
    // doublon ici ferait passer le test sur le code bogué.
    const increments: Record<string, number> = {};
    for (const [args] of prisma.post.updateMany.mock.calls as any[]) {
      const step = args.data.impressionCount.increment as number;
      for (const id of new Set(args.where.id.in as string[])) {
        increments[id] = (increments[id] ?? 0) + step;
      }
    }
    expect(increments[POST_ID]).toBe(2);
    expect(increments[OTHER]).toBe(1);
  });

  it('caps at 50 occurrences', async () => {
    const prisma = (app as any).prisma;
    prisma.postImpression.createMany.mockClear();

    const res = await app.inject({
      method: 'POST', url: '/posts/impressions/batch',
      payload: { postIds: Array(60).fill(POST_ID) },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.recorded).toBe(50);
    expect((prisma.postImpression.createMany.mock.calls[0][0] as any).data).toHaveLength(50);
  });
});

// ─── POST /posts/engagement/batch ─────────────────────────────────────────────

describe('POST /posts/engagement/batch (unauthenticated)', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(false); });
  afterAll(async () => { await app.close(); });

  it('returns 401 when not authenticated', async () => {
    const res = await app.inject({
      method: 'POST', url: '/posts/engagement/batch',
      payload: { sessions: [] },
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('POST /posts/engagement/batch (authenticated)', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 400 on invalid payload', async () => {
    const res = await app.inject({
      method: 'POST', url: '/posts/engagement/batch',
      payload: { invalid: true },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 200 on valid engagement batch', async () => {
    mockRecordEngagementBatch.mockResolvedValueOnce(1);
    const session = {
      sessionId: '550e8400-e29b-41d4-a716-446655440000',
      postId: POST_ID,
      contentType: 'POST',
      surface: 'feed',
      startedAt: '2026-06-30T00:00:00.000Z',
      dwellMs: 2000,
    };
    const res = await app.inject({
      method: 'POST', url: '/posts/engagement/batch',
      payload: { sessions: [session] },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.recorded).toBe(1);
  });
});

// ─── POST /posts/:postId/share ────────────────────────────────────────────────

describe('POST /posts/:postId/share (unauthenticated)', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(false); });
  afterAll(async () => { await app.close(); });

  it('returns 401 when not authenticated', async () => {
    const res = await app.inject({ method: 'POST', url: `/posts/${POST_ID}/share`, payload: {} });
    expect(res.statusCode).toBe(401);
  });
});

describe('POST /posts/:postId/share (authenticated)', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 200 on plain share', async () => {
    mockSharePost.mockResolvedValueOnce({ shareCount: 5 });
    const res = await app.inject({ method: 'POST', url: `/posts/${POST_ID}/share`, payload: {} });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.shared).toBe(true);
  });

  it('returns 404 when post not found (plain share)', async () => {
    mockSharePost.mockResolvedValueOnce(null);
    const res = await app.inject({ method: 'POST', url: `/posts/${POST_ID}/share`, payload: {} });
    expect(res.statusCode).toBe(404);
  });

  it('returns 200 on tracked share with link', async () => {
    mockShareWithTrackingLink.mockResolvedValueOnce({ shareCount: 1, token: 'abc123', shortUrl: 'https://app.example.com/l/abc123' });
    const res = await app.inject({
      method: 'POST', url: `/posts/${POST_ID}/share`,
      payload: { generateLink: true },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.token).toBe('abc123');
  });

  it('returns 404 when post not found (tracked share)', async () => {
    mockShareWithTrackingLink.mockResolvedValueOnce(null);
    const res = await app.inject({
      method: 'POST', url: `/posts/${POST_ID}/share`,
      payload: { generateLink: true },
    });
    expect(res.statusCode).toBe(404);
  });
});

// ─── POST /posts/:postId/pin ──────────────────────────────────────────────────

describe('POST /posts/:postId/pin', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 200 on successful pin', async () => {
    mockPinPost.mockResolvedValueOnce({ id: POST_ID, pinnedAt: new Date() });
    const res = await app.inject({ method: 'POST', url: `/posts/${POST_ID}/pin`, payload: {} });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.pinned).toBe(true);
  });

  it('returns 404 when post not found', async () => {
    mockPinPost.mockResolvedValueOnce(null);
    const res = await app.inject({ method: 'POST', url: `/posts/${POST_ID}/pin`, payload: {} });
    expect(res.statusCode).toBe(404);
  });

  it('returns 403 when not the author', async () => {
    const err = new Error('FORBIDDEN');
    mockPinPost.mockRejectedValueOnce(err);
    const res = await app.inject({ method: 'POST', url: `/posts/${POST_ID}/pin`, payload: {} });
    expect(res.statusCode).toBe(403);
  });
});

// ─── DELETE /posts/:postId/pin ────────────────────────────────────────────────

describe('DELETE /posts/:postId/pin', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 200 on successful unpin', async () => {
    mockUnpinPost.mockResolvedValueOnce({ id: POST_ID });
    const res = await app.inject({ method: 'DELETE', url: `/posts/${POST_ID}/pin` });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.pinned).toBe(false);
  });

  it('returns 404 when post not found', async () => {
    mockUnpinPost.mockResolvedValueOnce(null);
    const res = await app.inject({ method: 'DELETE', url: `/posts/${POST_ID}/pin` });
    expect(res.statusCode).toBe(404);
  });
});

// ─── GET /posts/:postId/views ─────────────────────────────────────────────────

describe('GET /posts/:postId/views', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 200 with views list', async () => {
    mockGetPostViews.mockResolvedValueOnce({ items: [], total: 0, hasMore: false });
    const res = await app.inject({ method: 'GET', url: `/posts/${POST_ID}/views` });
    expect(res.statusCode).toBe(200);
  });

  it('returns 404 when post not found', async () => {
    mockGetPostViews.mockResolvedValueOnce(null);
    const res = await app.inject({ method: 'GET', url: `/posts/${POST_ID}/views` });
    expect(res.statusCode).toBe(404);
  });

  it('returns 403 when not the author', async () => {
    mockGetPostViews.mockRejectedValueOnce(new Error('FORBIDDEN'));
    const res = await app.inject({ method: 'GET', url: `/posts/${POST_ID}/views` });
    expect(res.statusCode).toBe(403);
  });

  it('caps an oversized client limit at 100 before hitting the service', async () => {
    mockGetPostViews.mockReset();
    mockGetPostViews.mockResolvedValueOnce({ items: [], total: 0, hasMore: false });
    await app.inject({ method: 'GET', url: `/posts/${POST_ID}/views?limit=9999&offset=5` });
    // getPostViews(postId, userId, limit, offset)
    expect(mockGetPostViews.mock.calls[0][2]).toBe(100);
    expect(mockGetPostViews.mock.calls[0][3]).toBe(5);
  });

  it('floors an explicit limit=0 to 1 (no full-page leak)', async () => {
    mockGetPostViews.mockReset();
    mockGetPostViews.mockResolvedValueOnce({ items: [], total: 0, hasMore: false });
    await app.inject({ method: 'GET', url: `/posts/${POST_ID}/views?limit=0` });
    expect(mockGetPostViews.mock.calls[0][2]).toBe(1);
  });
});

// ─── GET /posts/:postId/interactions ─────────────────────────────────────────

describe('GET /posts/:postId/interactions', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 200 with interactions data', async () => {
    mockGetPostInteractions.mockResolvedValueOnce({ viewers: [], total: 0, hasMore: false });
    const res = await app.inject({ method: 'GET', url: `/posts/${POST_ID}/interactions` });
    expect(res.statusCode).toBe(200);
  });

  it('returns 404 when post not found', async () => {
    mockGetPostInteractions.mockResolvedValueOnce(null);
    const res = await app.inject({ method: 'GET', url: `/posts/${POST_ID}/interactions` });
    expect(res.statusCode).toBe(404);
  });
});

// ─── POST /posts/:postId/repost ───────────────────────────────────────────────

describe('POST /posts/:postId/repost', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 201 on successful repost', async () => {
    mockRepostPost.mockResolvedValueOnce({ id: 'repost-1', repostOfId: POST_ID });
    const res = await app.inject({ method: 'POST', url: `/posts/${POST_ID}/repost`, payload: {} });
    expect(res.statusCode).toBe(201);
  });

  it('returns 404 when original post not found', async () => {
    mockRepostPost.mockResolvedValueOnce(null);
    const res = await app.inject({ method: 'POST', url: `/posts/${POST_ID}/repost`, payload: {} });
    expect(res.statusCode).toBe(404);
  });

  it('returns 500 on service error', async () => {
    mockRepostPost.mockRejectedValueOnce(new Error('DB crash'));
    const res = await app.inject({ method: 'POST', url: `/posts/${POST_ID}/repost`, payload: {} });
    expect(res.statusCode).toBe(500);
  });
});
