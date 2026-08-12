/**
 * Unit tests for posts/feed.ts
 * Tests GET /posts/feed, /posts/feed/stories, /posts/feed/reels,
 *       /posts/feed/statuses, /posts/feed/statuses/discover,
 *       /posts/user/:userId, /posts/community/:communityId,
 *       /posts/bookmarks
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeAll, afterAll } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockGetFeed = jest.fn<any>();
const mockGetStories = jest.fn<any>();
const mockGetReels = jest.fn<any>();
const mockGetStatuses = jest.fn<any>();
const mockGetDiscoverStatuses = jest.fn<any>();
const mockGetUserPosts = jest.fn<any>();
const mockGetCommunityFeed = jest.fn<any>();
const mockGetBookmarks = jest.fn<any>();

jest.mock('../../../services/PostFeedService', () => ({
  PostFeedService: jest.fn().mockImplementation(() => ({
    getFeed: (...a: any[]) => mockGetFeed(...a),
    getStories: (...a: any[]) => mockGetStories(...a),
    getReels: (...a: any[]) => mockGetReels(...a),
    getStatuses: (...a: any[]) => mockGetStatuses(...a),
    getDiscoverStatuses: (...a: any[]) => mockGetDiscoverStatuses(...a),
    getUserPosts: (...a: any[]) => mockGetUserPosts(...a),
    getCommunityFeed: (...a: any[]) => mockGetCommunityFeed(...a),
    getBookmarks: (...a: any[]) => mockGetBookmarks(...a),
  })),
}));

const mockResolveMentionedUsers = jest.fn<any>().mockResolvedValue([]);
jest.mock('../../../services/MentionService', () => ({
  resolveMentionedUsers: (...a: any[]) => mockResolveMentionedUsers(...a),
}));

jest.mock('../../../services/CacheStore', () => ({
  getCacheStore: () => ({}),
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { registerFeedRoutes } from '../../../routes/posts/feed';

// ─── Constants ────────────────────────────────────────────────────────────────

const USER_ID = '507f1f77bcf86cd799439011';
const OTHER_USER_ID = '507f1f77bcf86cd799439022';
const COMMUNITY_ID = 'comm-abc';

const EMPTY_FEED = { items: [], hasMore: false, nextCursor: null };
const FEED_WITH_POSTS = {
  items: [{ id: 'post-1', content: 'Hello @world', comments: [] }],
  hasMore: true,
  nextCursor: 'cursor-abc',
};

// ─── Factory ─────────────────────────────────────────────────────────────────

async function buildApp({ authenticated = true } = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });

  const requiredAuth = async (req: any, reply: any) => {
    if (!authenticated) {
      return reply.status(401).send({ success: false, error: 'Unauthorized' });
    }
    (req as any).authContext = {
      isAuthenticated: true,
      userId: USER_ID,
      registeredUser: { id: USER_ID, role: 'USER' },
    };
  };

  const optionalAuth = async (req: any) => {
    if (authenticated) {
      (req as any).authContext = {
        isAuthenticated: true,
        userId: USER_ID,
        registeredUser: { id: USER_ID, role: 'USER' },
      };
    }
    // else: no authContext (unauthenticated guest)
  };

  registerFeedRoutes(app, {} as any, requiredAuth, optionalAuth);
  await app.ready();
  return app;
}

// ─── GET /posts/feed ──────────────────────────────────────────────────────────

describe('GET /posts/feed — not authenticated', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp({ authenticated: false }); });
  afterAll(async () => { await app.close(); });

  it('returns 401 when not authenticated', async () => {
    const res = await app.inject({ method: 'GET', url: '/posts/feed' });
    expect(res.statusCode).toBe(401);
  });
});

describe('GET /posts/feed — success', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockGetFeed.mockResolvedValue(FEED_WITH_POSTS);
    app = await buildApp();
  });
  afterAll(async () => { await app.close(); });

  it('returns 200 with feed items', async () => {
    const res = await app.inject({ method: 'GET', url: '/posts/feed' });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
    expect(res.headers['cache-control']).toContain('private');
  });

  it('calls feedService.getFeed with user id and default limit', async () => {
    await app.inject({ method: 'GET', url: '/posts/feed' });
    expect(mockGetFeed).toHaveBeenCalledWith(USER_ID, undefined, 20);
  });

  it('passes custom limit from query param', async () => {
    await app.inject({ method: 'GET', url: '/posts/feed?limit=10' });
    expect(mockGetFeed).toHaveBeenCalledWith(USER_ID, undefined, 10);
  });

  it('calls resolveMentionedUsers when feed has content', async () => {
    await app.inject({ method: 'GET', url: '/posts/feed' });
    expect(mockResolveMentionedUsers).toHaveBeenCalled();
  });
});

describe('GET /posts/feed — service error', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockGetFeed.mockRejectedValue(new Error('DB crash'));
    app = await buildApp();
  });
  afterAll(async () => { await app.close(); });

  it('returns 500 on service error', async () => {
    const res = await app.inject({ method: 'GET', url: '/posts/feed' });
    expect(res.statusCode).toBe(500);
  });
});

// ─── GET /posts/feed/stories ──────────────────────────────────────────────────

describe('GET /posts/feed/stories — success', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockGetStories.mockResolvedValue({ items: [], hasMore: false, nextCursor: null });
    app = await buildApp();
  });
  afterAll(async () => { await app.close(); });

  it('returns 200 with stories', async () => {
    const res = await app.inject({ method: 'GET', url: '/posts/feed/stories' });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });
});

describe('GET /posts/feed/stories — not authenticated', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp({ authenticated: false }); });
  afterAll(async () => { await app.close(); });

  it('returns 401 when not authenticated', async () => {
    const res = await app.inject({ method: 'GET', url: '/posts/feed/stories' });
    expect(res.statusCode).toBe(401);
  });
});

describe('GET /posts/feed/stories — service error', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockGetStories.mockRejectedValue(new Error('service error'));
    app = await buildApp();
  });
  afterAll(async () => { await app.close(); });

  it('returns 500 on error', async () => {
    const res = await app.inject({ method: 'GET', url: '/posts/feed/stories' });
    expect(res.statusCode).toBe(500);
  });
});

// ─── GET /posts/feed/reels ────────────────────────────────────────────────────

describe('GET /posts/feed/reels — success', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockGetReels.mockResolvedValue(EMPTY_FEED);
    app = await buildApp();
  });
  afterAll(async () => { await app.close(); });

  it('returns 200 with reels feed', async () => {
    const res = await app.inject({ method: 'GET', url: '/posts/feed/reels' });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });

  it('passes seed param to getReels', async () => {
    await app.inject({ method: 'GET', url: '/posts/feed/reels?seed=reel-42' });
    expect(mockGetReels).toHaveBeenCalledWith(
      USER_ID,
      expect.objectContaining({ seedReelId: 'reel-42' }),
    );
  });
});

describe('GET /posts/feed/reels — service error', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockGetReels.mockRejectedValue(new Error('reels error'));
    app = await buildApp();
  });
  afterAll(async () => { await app.close(); });

  it('returns 500 on error', async () => {
    const res = await app.inject({ method: 'GET', url: '/posts/feed/reels' });
    expect(res.statusCode).toBe(500);
  });
});

// ─── GET /posts/feed/statuses ─────────────────────────────────────────────────

describe('GET /posts/feed/statuses — success', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockGetStatuses.mockResolvedValue(EMPTY_FEED);
    app = await buildApp();
  });
  afterAll(async () => { await app.close(); });

  it('returns 200 with statuses', async () => {
    const res = await app.inject({ method: 'GET', url: '/posts/feed/statuses' });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });
});

describe('GET /posts/feed/statuses — service error', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockGetStatuses.mockRejectedValue(new Error('statuses error'));
    app = await buildApp();
  });
  afterAll(async () => { await app.close(); });

  it('returns 500 on error', async () => {
    const res = await app.inject({ method: 'GET', url: '/posts/feed/statuses' });
    expect(res.statusCode).toBe(500);
  });
});

// ─── GET /posts/feed/statuses/discover ───────────────────────────────────────

describe('GET /posts/feed/statuses/discover — success', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockGetDiscoverStatuses.mockResolvedValue(EMPTY_FEED);
    app = await buildApp();
  });
  afterAll(async () => { await app.close(); });

  it('returns 200 with discover statuses', async () => {
    const res = await app.inject({ method: 'GET', url: '/posts/feed/statuses/discover' });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });
});

describe('GET /posts/feed/statuses/discover — service error', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockGetDiscoverStatuses.mockRejectedValue(new Error('discover error'));
    app = await buildApp();
  });
  afterAll(async () => { await app.close(); });

  it('returns 500 on error', async () => {
    const res = await app.inject({ method: 'GET', url: '/posts/feed/statuses/discover' });
    expect(res.statusCode).toBe(500);
  });
});

// ─── GET /posts/user/:userId ──────────────────────────────────────────────────

describe('GET /posts/user/:userId — authenticated viewer', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockGetUserPosts.mockResolvedValue(FEED_WITH_POSTS);
    app = await buildApp();
  });
  afterAll(async () => { await app.close(); });

  it('returns 200 with user posts', async () => {
    const res = await app.inject({ method: 'GET', url: `/posts/user/${OTHER_USER_ID}` });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
    expect(res.headers['cache-control']).toContain('private');
  });

  it('passes viewerUserId to getUserPosts', async () => {
    await app.inject({ method: 'GET', url: `/posts/user/${OTHER_USER_ID}` });
    expect(mockGetUserPosts).toHaveBeenCalledWith(OTHER_USER_ID, USER_ID, undefined, 20);
  });
});

describe('GET /posts/user/:userId — unauthenticated viewer', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockGetUserPosts.mockResolvedValue(EMPTY_FEED);
    app = await buildApp({ authenticated: false });
  });
  afterAll(async () => { await app.close(); });

  it('returns 200 with null viewerUserId for guests', async () => {
    const res = await app.inject({ method: 'GET', url: `/posts/user/${OTHER_USER_ID}` });
    expect(res.statusCode).toBe(200);
    expect(mockGetUserPosts).toHaveBeenCalledWith(OTHER_USER_ID, undefined, undefined, 20);
  });
});

describe('GET /posts/user/:userId — service error', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockGetUserPosts.mockRejectedValue(new Error('user posts error'));
    app = await buildApp();
  });
  afterAll(async () => { await app.close(); });

  it('returns 500 on error', async () => {
    const res = await app.inject({ method: 'GET', url: `/posts/user/${OTHER_USER_ID}` });
    expect(res.statusCode).toBe(500);
  });
});

// ─── GET /posts/community/:communityId ───────────────────────────────────────

describe('GET /posts/community/:communityId — success', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockGetCommunityFeed.mockResolvedValue(EMPTY_FEED);
    app = await buildApp();
  });
  afterAll(async () => { await app.close(); });

  it('returns 200 with community posts', async () => {
    const res = await app.inject({ method: 'GET', url: `/posts/community/${COMMUNITY_ID}` });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });

  it('passes communityId and viewerUserId to getCommunityFeed', async () => {
    await app.inject({ method: 'GET', url: `/posts/community/${COMMUNITY_ID}` });
    expect(mockGetCommunityFeed).toHaveBeenCalledWith(COMMUNITY_ID, USER_ID, undefined, 20);
  });
});

describe('GET /posts/community/:communityId — service error', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockGetCommunityFeed.mockRejectedValue(new Error('community error'));
    app = await buildApp();
  });
  afterAll(async () => { await app.close(); });

  it('returns 500 on error', async () => {
    const res = await app.inject({ method: 'GET', url: `/posts/community/${COMMUNITY_ID}` });
    expect(res.statusCode).toBe(500);
  });
});

// ─── GET /posts/bookmarks ─────────────────────────────────────────────────────

describe('GET /posts/bookmarks — not authenticated', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp({ authenticated: false }); });
  afterAll(async () => { await app.close(); });

  it('returns 401 when not authenticated', async () => {
    const res = await app.inject({ method: 'GET', url: '/posts/bookmarks' });
    expect(res.statusCode).toBe(401);
  });
});

describe('GET /posts/bookmarks — success', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockGetBookmarks.mockResolvedValue(EMPTY_FEED);
    app = await buildApp();
  });
  afterAll(async () => { await app.close(); });

  it('returns 200 with bookmarked posts', async () => {
    const res = await app.inject({ method: 'GET', url: '/posts/bookmarks' });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
    expect(res.headers['cache-control']).toContain('private');
  });
});

describe('GET /posts/bookmarks — service error', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockGetBookmarks.mockRejectedValue(new Error('bookmarks error'));
    app = await buildApp();
  });
  afterAll(async () => { await app.close(); });

  it('returns 500 on error', async () => {
    const res = await app.inject({ method: 'GET', url: '/posts/bookmarks' });
    expect(res.statusCode).toBe(500);
  });
});
