/**
 * Unit tests for posts feed routes (feed.ts)
 * Tests GET /posts/feed, /posts/feed/stories, /posts/feed/reels,
 * /posts/feed/statuses, /posts/feed/statuses/discover,
 * /posts/user/:userId, /posts/community/:communityId, /posts/bookmarks.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockGetFeed = jest.fn<any>().mockResolvedValue({ items: [], hasMore: false, nextCursor: null });
const mockGetStories = jest.fn<any>().mockResolvedValue([]);
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

jest.mock('../../../../services/MentionService', () => ({
  resolveMentionedUsers: jest.fn<any>().mockResolvedValue([]),
}));

jest.mock('../../../../services/CacheStore', () => ({
  getCacheStore: jest.fn(() => ({})),
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { registerFeedRoutes } from '../../../../routes/posts/feed';

// ─── Constants ────────────────────────────────────────────────────────────────

const USER_ID = '507f1f77bcf86cd799439011';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makePreValidationAuth(authenticated: boolean) {
  return async (req: FastifyRequest) => {
    if (authenticated) {
      (req as any).authContext = {
        isAuthenticated: true,
        registeredUser: { id: USER_ID, role: 'USER' },
      };
    } else {
      (req as any).authContext = null;
    }
  };
}

async function buildApp(opts: {
  authenticated?: boolean;
} = {}): Promise<FastifyInstance> {
  const { authenticated = true } = opts;

  const app = Fastify({ logger: false });
  const prisma = {} as any;
  const requiredAuth = makePreValidationAuth(authenticated);
  const optionalAuth = makePreValidationAuth(authenticated);

  registerFeedRoutes(app, prisma, requiredAuth, optionalAuth);
  await app.ready();
  return app;
}

// ─── GET /posts/feed ──────────────────────────────────────────────────────────

describe('GET /posts/feed — unauthenticated', () => {
  it('returns 401 when no auth context', async () => {
    const app = await buildApp({ authenticated: false });
    const res = await app.inject({ method: 'GET', url: '/posts/feed' });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});

describe('GET /posts/feed — success', () => {
  it('returns 200 with empty feed', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/posts/feed' });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
    await app.close();
  });
});

describe('GET /posts/feed — with items and mentionedUsers', () => {
  it('returns 200 with post items', async () => {
    mockGetFeed.mockResolvedValueOnce({ items: [{ id: 'p1', content: 'hello @alice' }], hasMore: false });
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/posts/feed?limit=10' });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});

describe('GET /posts/feed — service error', () => {
  it('returns 500 when feedService throws', async () => {
    mockGetFeed.mockRejectedValueOnce(new Error('DB error'));
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/posts/feed' });
    expect(res.statusCode).toBe(500);
    await app.close();
  });
});

// ─── GET /posts/feed/stories ──────────────────────────────────────────────────

describe('GET /posts/feed/stories — unauthenticated', () => {
  it('returns 401 when no auth context', async () => {
    const app = await buildApp({ authenticated: false });
    const res = await app.inject({ method: 'GET', url: '/posts/feed/stories' });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});

describe('GET /posts/feed/stories — success', () => {
  it('returns 200 with empty stories array', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/posts/feed/stories' });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
    await app.close();
  });
});

describe('GET /posts/feed/stories — service error', () => {
  it('returns 500 when feedService throws', async () => {
    mockGetStories.mockRejectedValueOnce(new Error('DB error'));
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/posts/feed/stories' });
    expect(res.statusCode).toBe(500);
    await app.close();
  });
});

// ─── GET /posts/feed/reels ────────────────────────────────────────────────────

describe('GET /posts/feed/reels — unauthenticated', () => {
  it('returns 401 when no auth context', async () => {
    const app = await buildApp({ authenticated: false });
    const res = await app.inject({ method: 'GET', url: '/posts/feed/reels' });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});

describe('GET /posts/feed/reels — success', () => {
  it('returns 200 with empty reels', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/posts/feed/reels' });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});

describe('GET /posts/feed/reels — with seed', () => {
  it('returns 200 with seed param', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/posts/feed/reels?seed=reel-001' });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});

describe('GET /posts/feed/reels — service error', () => {
  it('returns 500 when feedService throws', async () => {
    mockGetReels.mockRejectedValueOnce(new Error('DB error'));
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/posts/feed/reels' });
    expect(res.statusCode).toBe(500);
    await app.close();
  });
});

// ─── GET /posts/feed/statuses ─────────────────────────────────────────────────

describe('GET /posts/feed/statuses — unauthenticated', () => {
  it('returns 401 when no auth context', async () => {
    const app = await buildApp({ authenticated: false });
    const res = await app.inject({ method: 'GET', url: '/posts/feed/statuses' });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});

describe('GET /posts/feed/statuses — success', () => {
  it('returns 200 with empty statuses', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/posts/feed/statuses' });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});

describe('GET /posts/feed/statuses — service error', () => {
  it('returns 500 when feedService throws', async () => {
    mockGetStatuses.mockRejectedValueOnce(new Error('DB error'));
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/posts/feed/statuses' });
    expect(res.statusCode).toBe(500);
    await app.close();
  });
});

// ─── GET /posts/feed/statuses/discover ───────────────────────────────────────

describe('GET /posts/feed/statuses/discover — unauthenticated', () => {
  it('returns 401 when no auth context', async () => {
    const app = await buildApp({ authenticated: false });
    const res = await app.inject({ method: 'GET', url: '/posts/feed/statuses/discover' });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});

describe('GET /posts/feed/statuses/discover — success', () => {
  it('returns 200 with discover statuses', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/posts/feed/statuses/discover' });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});

describe('GET /posts/feed/statuses/discover — service error', () => {
  it('returns 500 when feedService throws', async () => {
    mockGetDiscoverStatuses.mockRejectedValueOnce(new Error('DB error'));
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/posts/feed/statuses/discover' });
    expect(res.statusCode).toBe(500);
    await app.close();
  });
});

// ─── GET /posts/user/:userId ──────────────────────────────────────────────────

describe('GET /posts/user/:userId — success (authenticated)', () => {
  it('returns 200 with user posts', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: `/posts/user/${USER_ID}` });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
    await app.close();
  });
});

describe('GET /posts/user/:userId — success (unauthenticated)', () => {
  it('returns 200 even when unauthenticated (optional auth)', async () => {
    const app = await buildApp({ authenticated: false });
    const res = await app.inject({ method: 'GET', url: `/posts/user/${USER_ID}` });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});

describe('GET /posts/user/:userId — service error', () => {
  it('returns 500 when feedService throws', async () => {
    mockGetUserPosts.mockRejectedValueOnce(new Error('DB error'));
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: `/posts/user/${USER_ID}` });
    expect(res.statusCode).toBe(500);
    await app.close();
  });
});

// ─── GET /posts/community/:communityId ────────────────────────────────────────

describe('GET /posts/community/:communityId — success', () => {
  it('returns 200 with community feed', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/posts/community/comm-001' });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});

describe('GET /posts/community/:communityId — service error', () => {
  it('returns 500 when feedService throws', async () => {
    mockGetCommunityFeed.mockRejectedValueOnce(new Error('DB error'));
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/posts/community/comm-001' });
    expect(res.statusCode).toBe(500);
    await app.close();
  });
});

// ─── GET /posts/bookmarks ─────────────────────────────────────────────────────

describe('GET /posts/bookmarks — unauthenticated', () => {
  it('returns 401 when no auth context', async () => {
    const app = await buildApp({ authenticated: false });
    const res = await app.inject({ method: 'GET', url: '/posts/bookmarks' });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});

describe('GET /posts/bookmarks — success', () => {
  it('returns 200 with empty bookmarks', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/posts/bookmarks' });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});

describe('GET /posts/bookmarks — service error', () => {
  it('returns 500 when feedService throws', async () => {
    mockGetBookmarks.mockRejectedValueOnce(new Error('DB error'));
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/posts/bookmarks' });
    expect(res.statusCode).toBe(500);
    await app.close();
  });
});
