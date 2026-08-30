/**
 * GET /social/posts?scope=… — la route CIBLE de l'issue #4149.
 *
 * Douze listes de posts vivaient derrière douze chemins ; huit d'entre elles
 * (celles que `feed.ts` servait déjà : home, stories, stories.mine, reels,
 * statuses [+ discover via `audience=public`], author, community, bookmarks)
 * convergent ici sur une SEULE route, validée par union discriminée Zod —
 * c'est CE fichier qui les couvre.
 *
 * Les trois listes restantes (`hashtag`, `nearby`, `sound`) ont rejoint
 * l'union au lot #4346, chacune ÉTENDUE depuis le schéma de sa route
 * historique (`hashtag.ts`/`nearby.ts`/`sounds.ts`) — leurs témoins
 * (parité avec la route historique, identifiant requis, gate d'audience,
 * plafond de débit indépendant) vivent dans
 * `social-posts-discovery-scopes.test.ts`, pas ici : ce fichier mocke
 * `PostFeedService` en entier, alors que `hashtag`/`nearby`/`sound` parlent
 * directement à Prisma (pas de service à mocker, un double de client requis).
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockGetFeed = jest.fn<any>().mockResolvedValue({ items: [], hasMore: false, nextCursor: null });
const mockGetStories = jest.fn<any>().mockResolvedValue({ items: [], hasMore: false, nextCursor: null, deletedIds: [], deletedIdsTruncated: false });
const mockGetReels = jest.fn<any>().mockResolvedValue({ items: [], hasMore: false, nextCursor: null });
const mockGetStatuses = jest.fn<any>().mockResolvedValue({ items: [], hasMore: false, nextCursor: null });
const mockGetDiscoverStatuses = jest.fn<any>().mockResolvedValue({ items: [], hasMore: false, nextCursor: null });
const mockGetUserPosts = jest.fn<any>().mockResolvedValue({ items: [], hasMore: false, nextCursor: null });
const mockGetCommunityFeed = jest.fn<any>().mockResolvedValue({ items: [], hasMore: false, nextCursor: null });
const mockGetBookmarks = jest.fn<any>().mockResolvedValue({ items: [], hasMore: false, nextCursor: null });

jest.mock('../../../../services/PostFeedService', () => ({
  PostFeedService: jest.fn().mockImplementation(() => ({
    getFeed: (...args: any[]) => mockGetFeed(...args),
    getStories: (...args: any[]) => mockGetStories(...args),
    getReels: (...args: any[]) => mockGetReels(...args),
    getStatuses: (...args: any[]) => mockGetStatuses(...args),
    getDiscoverStatuses: (...args: any[]) => mockGetDiscoverStatuses(...args),
    getUserPosts: (...args: any[]) => mockGetUserPosts(...args),
    getCommunityFeed: (...args: any[]) => mockGetCommunityFeed(...args),
    getBookmarks: (...args: any[]) => mockGetBookmarks(...args),
  })),
}));

jest.mock('../../../../services/CacheStore', () => ({ getCacheStore: jest.fn(() => ({})) }));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { registerFeedRoutes } from '../../../../routes/posts/feed';

// ─── Constants / helpers ──────────────────────────────────────────────────────

const USER_ID = '507f1f77bcf86cd799439011';

function makePreValidationAuth(authenticated: boolean) {
  return async (req: FastifyRequest) => {
    (req as any).authContext = authenticated
      ? { type: 'user', isAuthenticated: true, userId: USER_ID, registeredUser: { id: USER_ID, role: 'USER' } }
      : null;
  };
}

async function buildApp(opts: { authenticated?: boolean } = {}): Promise<FastifyInstance> {
  const { authenticated = true } = opts;
  const app = Fastify({ logger: false });
  const auth = makePreValidationAuth(authenticated);
  // requiredAuth/optionalAuth : `/social/posts` monte TOUJOURS sur
  // optionalAuth (le gate d'authentification par scope vit dans le handler,
  // pas dans le preValidation) — les deux reçoivent donc le même middleware
  // ici, comme le fait réellement `postRoutes` pour `optionalAuth` seul.
  registerFeedRoutes(app, {} as any, auth, auth);
  await app.ready();
  return app;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetFeed.mockResolvedValue({ items: [], hasMore: false, nextCursor: null });
  mockGetStories.mockResolvedValue({ items: [], hasMore: false, nextCursor: null, deletedIds: [], deletedIdsTruncated: false });
  mockGetReels.mockResolvedValue({ items: [], hasMore: false, nextCursor: null });
  mockGetStatuses.mockResolvedValue({ items: [], hasMore: false, nextCursor: null });
  mockGetDiscoverStatuses.mockResolvedValue({ items: [], hasMore: false, nextCursor: null });
  mockGetUserPosts.mockResolvedValue({ items: [], hasMore: false, nextCursor: null });
  mockGetCommunityFeed.mockResolvedValue({ items: [], hasMore: false, nextCursor: null });
  mockGetBookmarks.mockResolvedValue({ items: [], hasMore: false, nextCursor: null });
});

// ─── Union discriminée : le scope EST la validation (critère 1) ──────────────

describe('GET /social/posts — scope validation', () => {
  it('rejects a scope missing from the enumeration with 400, never an empty page', async () => {
    const app = await buildApp();
    // `hashtag`/`nearby`/`sound` ont rejoint l'énumération au lot #4346 — un
    // scope vraiment absent de l'union est nécessaire pour tester CETTE
    // propriété (voir `social-posts-discovery-scopes.test.ts` pour leurs
    // propres témoins de validation).
    const res = await app.inject({ method: 'GET', url: '/social/posts?scope=made-up-scope' });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('VALIDATION_ERROR');
    await app.close();
  });

  it('rejects a request with no scope at all with 400', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/social/posts' });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('rejects an invalid limit with 400 on every scope tested here (home as representative)', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/social/posts?scope=home&limit=abc' });
    expect(res.statusCode).toBe(400);
    expect(mockGetFeed).not.toHaveBeenCalled();
    await app.close();
  });
});

// ─── scope=home ────────────────────────────────────────────────────────────

describe('GET /social/posts?scope=home', () => {
  it('returns 401 unauthenticated', async () => {
    const app = await buildApp({ authenticated: false });
    const res = await app.inject({ method: 'GET', url: '/social/posts?scope=home' });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('calls getFeed and serves the unified pagination/meta envelope', async () => {
    mockGetFeed.mockResolvedValueOnce({ items: [{ id: 'p1' }], hasMore: true, nextCursor: 'cur-1' });
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/social/posts?scope=home&limit=5' });

    expect(res.statusCode).toBe(200);
    expect(mockGetFeed).toHaveBeenCalledWith(USER_ID, undefined, 5, expect.anything());
    const body = res.json();
    expect(body.pagination).toEqual({ limit: 5, hasMore: true, nextCursor: 'cur-1', form: 'keyset' });
    // Un scope sans tombstones sert les clés quand même, à vide — critère 5 :
    // « généralisé à tous les scopes », jamais réservé aux stories.
    expect(body.meta).toEqual({ deletedIds: [], deletedIdsTruncated: false });
    expect(res.headers['cache-control']).toContain('private');
    await app.close();
  });
});

// ─── scope=stories ─────────────────────────────────────────────────────────

describe('GET /social/posts?scope=stories', () => {
  it('returns 401 unauthenticated', async () => {
    const app = await buildApp({ authenticated: false });
    const res = await app.inject({ method: 'GET', url: '/social/posts?scope=stories' });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('forwards projection=tray, ignores unknown projection values, and forwards viewerRole', async () => {
    const app = await buildApp();
    await app.inject({ method: 'GET', url: '/social/posts?scope=stories&projection=tray' });
    expect(mockGetStories).toHaveBeenCalledWith(
      USER_ID,
      expect.objectContaining({ projection: 'tray', viewerRole: 'USER' }),
    );
    // `stories` (plein/tray) n'active JAMAIS l'archive auteur — c'est
    // `stories.mine` qui pose cette clé (test dédié ci-dessous).
    expect(mockGetStories.mock.calls[0][1]).not.toHaveProperty('archiveOfAuthor');

    mockGetStories.mockClear();
    await app.inject({ method: 'GET', url: '/social/posts?scope=stories&projection=whatever' });
    expect(mockGetStories).toHaveBeenCalledWith(USER_ID, expect.objectContaining({ projection: undefined }));
    await app.close();
  });

  it('parses a valid updatedSince and ignores an invalid one (full sync, not 400)', async () => {
    const app = await buildApp();
    await app.inject({ method: 'GET', url: '/social/posts?scope=stories&updatedSince=2026-07-03T10:00:00.000Z' });
    expect(mockGetStories).toHaveBeenCalledWith(
      USER_ID,
      expect.objectContaining({ updatedSince: new Date('2026-07-03T10:00:00.000Z') }),
    );

    mockGetStories.mockClear();
    const res = await app.inject({ method: 'GET', url: '/social/posts?scope=stories&updatedSince=not-a-date' });
    expect(res.statusCode).toBe(200);
    expect(mockGetStories).toHaveBeenCalledWith(USER_ID, expect.objectContaining({ updatedSince: undefined }));
    await app.close();
  });

  it('generalizes the tombstone envelope: meta.deletedIds/deletedIdsTruncated, not the story-only names', async () => {
    mockGetStories.mockResolvedValueOnce({ items: [], hasMore: false, nextCursor: null, deletedIds: ['gone-1'], deletedIdsTruncated: true });
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/social/posts?scope=stories' });
    expect(res.json().meta).toEqual({ deletedIds: ['gone-1'], deletedIdsTruncated: true });
    expect(res.json().meta.deletedStoryIds).toBeUndefined();
    await app.close();
  });
});

// ─── scope=stories.mine ────────────────────────────────────────────────────

describe('GET /social/posts?scope=stories.mine', () => {
  it('calls getStories with archiveOfAuthor:true', async () => {
    const app = await buildApp();
    await app.inject({ method: 'GET', url: '/social/posts?scope=stories.mine' });
    expect(mockGetStories).toHaveBeenCalledWith(USER_ID, expect.objectContaining({ archiveOfAuthor: true }));
    await app.close();
  });
});

// ─── scope=reels ───────────────────────────────────────────────────────────

describe('GET /social/posts?scope=reels', () => {
  it('forwards seed as seedReelId', async () => {
    const app = await buildApp();
    await app.inject({ method: 'GET', url: '/social/posts?scope=reels&seed=reel-42' });
    expect(mockGetReels).toHaveBeenCalledWith(USER_ID, expect.objectContaining({ seedReelId: 'reel-42' }));
    await app.close();
  });

  // L'exemple NOMMÉ du critère 8, rejoué sur la route CIBLE (l'alias le
  // prouve dans posts/feed.test.ts) : un seed vide est une désignation
  // malformée, jamais une absence.
  it('rejects an empty seed with 400 instead of silently switching to "Pour toi"', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/social/posts?scope=reels&seed=' });
    expect(res.statusCode).toBe(400);
    expect(mockGetReels).not.toHaveBeenCalled();
    await app.close();
  });
});

// ─── scope=statuses (+ audience=public remplace .../discover) ────────────────

describe('GET /social/posts?scope=statuses', () => {
  it('calls getStatuses without audience', async () => {
    const app = await buildApp();
    await app.inject({ method: 'GET', url: '/social/posts?scope=statuses' });
    expect(mockGetStatuses).toHaveBeenCalledWith(USER_ID, undefined, 20, expect.anything());
    expect(mockGetDiscoverStatuses).not.toHaveBeenCalled();
    await app.close();
  });

  it('calls getDiscoverStatuses when audience=public — the replacement for .../statuses/discover', async () => {
    const app = await buildApp();
    await app.inject({ method: 'GET', url: '/social/posts?scope=statuses&audience=public' });
    expect(mockGetDiscoverStatuses).toHaveBeenCalledWith(USER_ID, undefined, 20, expect.anything());
    expect(mockGetStatuses).not.toHaveBeenCalled();
    await app.close();
  });

  it('ignores an unrecognized audience value (falls back to the personal feed, not 400)', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/social/posts?scope=statuses&audience=friends' });
    expect(res.statusCode).toBe(200);
    expect(mockGetStatuses).toHaveBeenCalled();
    expect(mockGetDiscoverStatuses).not.toHaveBeenCalled();
    await app.close();
  });
});

// ─── scope=author (optionalAuth : anonyme légitime) ──────────────────────────

describe('GET /social/posts?scope=author', () => {
  it('requires authorId — 400 without it', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/social/posts?scope=author' });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('serves 200 for an unauthenticated viewer (public profile)', async () => {
    const app = await buildApp({ authenticated: false });
    const res = await app.inject({ method: 'GET', url: `/social/posts?scope=author&authorId=${USER_ID}` });
    expect(res.statusCode).toBe(200);
    expect(mockGetUserPosts).toHaveBeenCalledWith(USER_ID, undefined, undefined, 20, expect.anything());
    await app.close();
  });

  it('forwards the authenticated viewer id', async () => {
    const app = await buildApp();
    await app.inject({ method: 'GET', url: `/social/posts?scope=author&authorId=other-user` });
    expect(mockGetUserPosts).toHaveBeenCalledWith('other-user', USER_ID, undefined, 20, expect.anything());
    await app.close();
  });
});

// ─── scope=community (optionalAuth) ──────────────────────────────────────────

describe('GET /social/posts?scope=community', () => {
  it('requires communityId — 400 without it', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/social/posts?scope=community' });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('serves 200 for an unauthenticated viewer (public community feed)', async () => {
    const app = await buildApp({ authenticated: false });
    const res = await app.inject({ method: 'GET', url: '/social/posts?scope=community&communityId=comm-1' });
    expect(res.statusCode).toBe(200);
    expect(mockGetCommunityFeed).toHaveBeenCalledWith('comm-1', undefined, undefined, 20, expect.anything());
    await app.close();
  });
});

// ─── scope=bookmarks ───────────────────────────────────────────────────────

describe('GET /social/posts?scope=bookmarks', () => {
  it('returns 401 unauthenticated', async () => {
    const app = await buildApp({ authenticated: false });
    const res = await app.inject({ method: 'GET', url: '/social/posts?scope=bookmarks' });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('calls getBookmarks', async () => {
    const app = await buildApp();
    await app.inject({ method: 'GET', url: '/social/posts?scope=bookmarks' });
    expect(mockGetBookmarks).toHaveBeenCalledWith(USER_ID, undefined, 20, expect.anything());
    await app.close();
  });
});

// ─── Service error ────────────────────────────────────────────────────────────

describe('GET /social/posts — service error', () => {
  it('returns 500 when the underlying service throws', async () => {
    mockGetFeed.mockRejectedValueOnce(new Error('DB error'));
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/social/posts?scope=home' });
    expect(res.statusCode).toBe(500);
    await app.close();
  });
});
