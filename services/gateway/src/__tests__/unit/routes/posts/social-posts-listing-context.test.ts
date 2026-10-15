/**
 * #10501 — le CONTEXTE DE LISTING servi par `GET /social/posts` : chaque page
 * porte un identifiant opaque (`meta.feedRequestId`) et chaque élément sa
 * source de classement (`rankingSource`), pour que l'impression d'un client
 * dise à quelle page et à quel classement elle appartient. Additif : un
 * ancien client ne lit ni l'un ni l'autre.
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

describe('contexte de listing — meta.feedRequestId et rankingSource', () => {
  it('toute la page partage UN feedRequestId opaque, chaque élément porte sa source', async () => {
    mockGetFeed.mockResolvedValueOnce({ items: [{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }], hasMore: true, nextCursor: 'c' });
    const app = await buildApp();
    const body = (await app.inject({ method: 'GET', url: '/social/posts?scope=home' })).json();

    expect(body.meta.feedRequestId).toMatch(/^fr_[A-Za-z0-9_-]{12,}$/);
    expect(body.data.map((item: { rankingSource: string }) => item.rankingSource)).toEqual(['for_you', 'for_you', 'for_you']);
    expect(body.data.map((item: { id: string }) => item.id)).toEqual(['p1', 'p2', 'p3']);
    await app.close();
  });

  it('deux pages ont deux identifiants', async () => {
    const app = await buildApp();
    const a = (await app.inject({ method: 'GET', url: '/social/posts?scope=home' })).json();
    const b = (await app.inject({ method: 'GET', url: '/social/posts?scope=home' })).json();

    expect(a.meta.feedRequestId).not.toBe(b.meta.feedRequestId);
    await app.close();
  });

  it.each([
    ['author&authorId=507f1f77bcf86cd799439022', 'profile', mockGetUserPosts],
    ['bookmarks', 'bookmarks', mockGetBookmarks],
    ['reels', 'for_you', mockGetReels],
  ])('scope=%s ⇒ rankingSource %s', async (scope, source, mock) => {
    (mock as jest.Mock<any>).mockResolvedValueOnce({ items: [{ id: 'p1' }], hasMore: false, nextCursor: null });
    const app = await buildApp();
    const body = (await app.inject({ method: 'GET', url: `/social/posts?scope=${scope}` })).json();

    expect(body.data[0].rankingSource).toBe(source);
    expect(typeof body.meta.feedRequestId).toBe('string');
    await app.close();
  });
});
