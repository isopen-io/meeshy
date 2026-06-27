/**
 * posts-feed-routes.test.ts
 *
 * Unit tests for src/routes/posts/feed.ts
 * Covers:
 *   - GET /posts/feed
 *   - GET /posts/feed/stories
 *   - GET /posts/feed/reels
 *   - GET /posts/feed/statuses
 *   - GET /posts/feed/statuses/discover
 *   - GET /posts/user/:userId
 *   - GET /posts/community/:communityId
 *   - GET /posts/bookmarks
 */

import Fastify, { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

// ---------------------------------------------------------------------------
// Module mocks (before imports)
// ---------------------------------------------------------------------------

const mockGetFeed             = jest.fn<any>();
const mockGetStories          = jest.fn<any>();
const mockGetReels            = jest.fn<any>();
const mockGetStatuses         = jest.fn<any>();
const mockGetDiscoverStatuses = jest.fn<any>();
const mockGetUserPosts        = jest.fn<any>();
const mockGetCommunityFeed    = jest.fn<any>();
const mockGetBookmarks        = jest.fn<any>();

jest.mock('../../../services/PostFeedService', () => ({
  PostFeedService: jest.fn().mockImplementation(() => ({
    getFeed:              (...args: any[]) => mockGetFeed(...args),
    getStories:           (...args: any[]) => mockGetStories(...args),
    getReels:             (...args: any[]) => mockGetReels(...args),
    getStatuses:          (...args: any[]) => mockGetStatuses(...args),
    getDiscoverStatuses:  (...args: any[]) => mockGetDiscoverStatuses(...args),
    getUserPosts:         (...args: any[]) => mockGetUserPosts(...args),
    getCommunityFeed:     (...args: any[]) => mockGetCommunityFeed(...args),
    getBookmarks:         (...args: any[]) => mockGetBookmarks(...args),
  })),
}));

jest.mock('../../../services/CacheStore', () => ({
  getCacheStore: jest.fn().mockReturnValue({}),
}));

const mockResolveMentionedUsers = jest.fn<any>();

jest.mock('../../../services/MentionService', () => ({
  resolveMentionedUsers: (...args: any[]) => mockResolveMentionedUsers(...args),
}));

// ---------------------------------------------------------------------------
// Import route under test (after mocks)
// ---------------------------------------------------------------------------

import { registerFeedRoutes } from '../../../routes/posts/feed';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const USER_ID      = '507f1f77bcf86cd799439011';
const OTHER_USER   = '507f1f77bcf86cd799439099';
const COMMUNITY_ID = '507f1f77bcf86cd799439088';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mockPrisma: any = {};

function makeAuthCtx(userId?: string) {
  return {
    isAuthenticated: !!userId,
    registeredUser:  userId ? { id: userId } : null,
    userId:          userId ?? '',
  };
}

function makeFeedResult(overrides: any = {}) {
  return {
    items:      [],
    hasMore:    false,
    nextCursor: undefined,
    ...overrides,
  };
}

function buildApp(opts: {
  authCtx?: ReturnType<typeof makeAuthCtx> | null;
  optionalCtx?: ReturnType<typeof makeAuthCtx> | null;
} = {}): FastifyInstance {
  const { authCtx = makeAuthCtx(USER_ID), optionalCtx = makeAuthCtx(USER_ID) } = opts;
  const app = Fastify({ logger: false });

  const requiredAuth = async (req: any, reply: FastifyReply) => {
    req.authContext = authCtx;
  };
  const optionalAuth = async (req: any) => {
    req.authContext = optionalCtx;
  };

  app.decorate('prisma', mockPrisma);
  registerFeedRoutes(app, mockPrisma, requiredAuth, optionalAuth);
  return app;
}

// ---------------------------------------------------------------------------
// GET /posts/feed
// ---------------------------------------------------------------------------

describe('GET /posts/feed', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetFeed.mockReset();
    app = buildApp();
    mockGetFeed.mockResolvedValue(makeFeedResult());
    mockResolveMentionedUsers.mockResolvedValue([]);
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 with empty feed', async () => {
    await app.ready();
    const res = await app.inject({ method: 'GET', url: '/posts/feed' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data).toEqual([]);
  });

  it('calls getFeed with userId', async () => {
    await app.ready();
    await app.inject({ method: 'GET', url: '/posts/feed' });
    expect(mockGetFeed).toHaveBeenCalledWith(USER_ID, undefined, expect.any(Number));
  });

  it('returns 401 when not authenticated', async () => {
    const unauthApp = buildApp({ authCtx: makeAuthCtx() });
    await unauthApp.ready();
    const res = await unauthApp.inject({ method: 'GET', url: '/posts/feed' });
    await unauthApp.close();
    expect(res.statusCode).toBe(401);
  });

  it('returns 500 on service error', async () => {
    mockGetFeed.mockRejectedValue(new Error('DB error'));
    await app.ready();
    const res = await app.inject({ method: 'GET', url: '/posts/feed' });
    expect(res.statusCode).toBe(500);
  });

  it('includes pagination metadata', async () => {
    mockGetFeed.mockResolvedValue(makeFeedResult({ hasMore: true, nextCursor: 'cursor123' }));
    await app.ready();
    const res = await app.inject({ method: 'GET', url: '/posts/feed' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.pagination.hasMore).toBe(true);
    expect(body.pagination.nextCursor).toBe('cursor123');
  });
});

// ---------------------------------------------------------------------------
// GET /posts/feed/stories
// ---------------------------------------------------------------------------

describe('GET /posts/feed/stories', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetStories.mockReset();
    app = buildApp();
    mockGetStories.mockResolvedValue([]);
    mockResolveMentionedUsers.mockResolvedValue([]);
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 with stories', async () => {
    await app.ready();
    const res = await app.inject({ method: 'GET', url: '/posts/feed/stories' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
  });

  it('returns 401 when not authenticated', async () => {
    const unauthApp = buildApp({ authCtx: makeAuthCtx() });
    await unauthApp.ready();
    const res = await unauthApp.inject({ method: 'GET', url: '/posts/feed/stories' });
    await unauthApp.close();
    expect(res.statusCode).toBe(401);
  });

  it('returns 500 on service error', async () => {
    mockGetStories.mockRejectedValue(new Error('service error'));
    await app.ready();
    const res = await app.inject({ method: 'GET', url: '/posts/feed/stories' });
    expect(res.statusCode).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// GET /posts/feed/reels
// ---------------------------------------------------------------------------

describe('GET /posts/feed/reels', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetReels.mockReset();
    app = buildApp();
    mockGetReels.mockResolvedValue(makeFeedResult());
    mockResolveMentionedUsers.mockResolvedValue([]);
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 with reels feed', async () => {
    await app.ready();
    const res = await app.inject({ method: 'GET', url: '/posts/feed/reels' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
  });

  it('passes seed param to getReels', async () => {
    await app.ready();
    await app.inject({ method: 'GET', url: '/posts/feed/reels?seed=reel-xyz' });
    expect(mockGetReels).toHaveBeenCalledWith(USER_ID, expect.objectContaining({ seedReelId: 'reel-xyz' }));
  });

  it('returns 401 when not authenticated', async () => {
    const unauthApp = buildApp({ authCtx: makeAuthCtx() });
    await unauthApp.ready();
    const res = await unauthApp.inject({ method: 'GET', url: '/posts/feed/reels' });
    await unauthApp.close();
    expect(res.statusCode).toBe(401);
  });

  it('returns 500 on service error', async () => {
    mockGetReels.mockRejectedValue(new Error('reels error'));
    await app.ready();
    const res = await app.inject({ method: 'GET', url: '/posts/feed/reels' });
    expect(res.statusCode).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// GET /posts/feed/statuses
// ---------------------------------------------------------------------------

describe('GET /posts/feed/statuses', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetStatuses.mockReset();
    app = buildApp();
    mockGetStatuses.mockResolvedValue(makeFeedResult());
    mockResolveMentionedUsers.mockResolvedValue([]);
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 with statuses', async () => {
    await app.ready();
    const res = await app.inject({ method: 'GET', url: '/posts/feed/statuses' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
  });

  it('returns 401 when not authenticated', async () => {
    const unauthApp = buildApp({ authCtx: makeAuthCtx() });
    await unauthApp.ready();
    const res = await unauthApp.inject({ method: 'GET', url: '/posts/feed/statuses' });
    await unauthApp.close();
    expect(res.statusCode).toBe(401);
  });

  it('returns 500 on service error', async () => {
    mockGetStatuses.mockRejectedValue(new Error('statuses error'));
    await app.ready();
    const res = await app.inject({ method: 'GET', url: '/posts/feed/statuses' });
    expect(res.statusCode).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// GET /posts/feed/statuses/discover
// ---------------------------------------------------------------------------

describe('GET /posts/feed/statuses/discover', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetDiscoverStatuses.mockReset();
    app = buildApp();
    mockGetDiscoverStatuses.mockResolvedValue(makeFeedResult());
    mockResolveMentionedUsers.mockResolvedValue([]);
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 with discover statuses', async () => {
    await app.ready();
    const res = await app.inject({ method: 'GET', url: '/posts/feed/statuses/discover' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
  });

  it('returns 401 when not authenticated', async () => {
    const unauthApp = buildApp({ authCtx: makeAuthCtx() });
    await unauthApp.ready();
    const res = await unauthApp.inject({ method: 'GET', url: '/posts/feed/statuses/discover' });
    await unauthApp.close();
    expect(res.statusCode).toBe(401);
  });

  it('returns 500 on service error', async () => {
    mockGetDiscoverStatuses.mockRejectedValue(new Error('discover error'));
    await app.ready();
    const res = await app.inject({ method: 'GET', url: '/posts/feed/statuses/discover' });
    expect(res.statusCode).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// GET /posts/user/:userId
// ---------------------------------------------------------------------------

describe('GET /posts/user/:userId', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetUserPosts.mockReset();
    app = buildApp();
    mockGetUserPosts.mockResolvedValue(makeFeedResult());
    mockResolveMentionedUsers.mockResolvedValue([]);
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 with user posts (authenticated)', async () => {
    await app.ready();
    const res = await app.inject({ method: 'GET', url: `/posts/user/${OTHER_USER}` });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
  });

  it('calls getUserPosts with target userId', async () => {
    await app.ready();
    await app.inject({ method: 'GET', url: `/posts/user/${OTHER_USER}` });
    expect(mockGetUserPosts).toHaveBeenCalledWith(OTHER_USER, USER_ID, undefined, expect.any(Number));
  });

  it('returns 200 without authentication (optional auth)', async () => {
    const unauthApp = buildApp({ optionalCtx: makeAuthCtx() });
    await unauthApp.ready();
    const res = await unauthApp.inject({ method: 'GET', url: `/posts/user/${OTHER_USER}` });
    await unauthApp.close();
    expect(res.statusCode).toBe(200);
  });

  it('returns 500 on service error', async () => {
    mockGetUserPosts.mockRejectedValue(new Error('user posts error'));
    await app.ready();
    const res = await app.inject({ method: 'GET', url: `/posts/user/${OTHER_USER}` });
    expect(res.statusCode).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// GET /posts/community/:communityId
// ---------------------------------------------------------------------------

describe('GET /posts/community/:communityId', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetCommunityFeed.mockReset();
    app = buildApp();
    mockGetCommunityFeed.mockResolvedValue(makeFeedResult());
    mockResolveMentionedUsers.mockResolvedValue([]);
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 with community feed', async () => {
    await app.ready();
    const res = await app.inject({ method: 'GET', url: `/posts/community/${COMMUNITY_ID}` });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
  });

  it('calls getCommunityFeed with communityId', async () => {
    await app.ready();
    await app.inject({ method: 'GET', url: `/posts/community/${COMMUNITY_ID}` });
    expect(mockGetCommunityFeed).toHaveBeenCalledWith(COMMUNITY_ID, USER_ID, undefined, expect.any(Number));
  });

  it('returns 200 when unauthenticated (optional auth)', async () => {
    const unauthApp = buildApp({ optionalCtx: makeAuthCtx() });
    await unauthApp.ready();
    const res = await unauthApp.inject({ method: 'GET', url: `/posts/community/${COMMUNITY_ID}` });
    await unauthApp.close();
    expect(res.statusCode).toBe(200);
  });

  it('returns 500 on service error', async () => {
    mockGetCommunityFeed.mockRejectedValue(new Error('community error'));
    await app.ready();
    const res = await app.inject({ method: 'GET', url: `/posts/community/${COMMUNITY_ID}` });
    expect(res.statusCode).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// GET /posts/bookmarks
// ---------------------------------------------------------------------------

describe('GET /posts/bookmarks', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetBookmarks.mockReset();
    app = buildApp();
    mockGetBookmarks.mockResolvedValue(makeFeedResult());
    mockResolveMentionedUsers.mockResolvedValue([]);
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 with bookmarks', async () => {
    await app.ready();
    const res = await app.inject({ method: 'GET', url: '/posts/bookmarks' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
  });

  it('calls getBookmarks with userId', async () => {
    await app.ready();
    await app.inject({ method: 'GET', url: '/posts/bookmarks' });
    expect(mockGetBookmarks).toHaveBeenCalledWith(USER_ID, undefined, expect.any(Number));
  });

  it('returns 401 when not authenticated', async () => {
    const unauthApp = buildApp({ authCtx: makeAuthCtx() });
    await unauthApp.ready();
    const res = await unauthApp.inject({ method: 'GET', url: '/posts/bookmarks' });
    await unauthApp.close();
    expect(res.statusCode).toBe(401);
  });

  it('returns 500 on service error', async () => {
    mockGetBookmarks.mockRejectedValue(new Error('bookmarks error'));
    await app.ready();
    const res = await app.inject({ method: 'GET', url: '/posts/bookmarks' });
    expect(res.statusCode).toBe(500);
  });
});
