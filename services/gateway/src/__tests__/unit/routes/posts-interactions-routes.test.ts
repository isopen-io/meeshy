/**
 * posts-interactions-routes.test.ts
 *
 * Unit tests for src/routes/posts/interactions.ts
 * Covers all 16 interaction routes registered by registerInteractionRoutes.
 */

import Fastify, { FastifyInstance } from 'fastify';
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

// ---------------------------------------------------------------------------
// Module mocks (before imports)
// ---------------------------------------------------------------------------

jest.mock('../../../middleware/rate-limiter', () => ({
  createPostRouteRateLimitConfig: jest.fn().mockReturnValue({}),
}));

jest.mock('../../../services/MentionService', () => ({
  resolveMentionedUsers: jest.fn<any>().mockResolvedValue([]),
}));

const mockResolveFrontendBaseUrl = jest.fn<any>();
jest.mock('../../../services/TrackingLinkService', () => ({
  resolveFrontendBaseUrl: () => mockResolveFrontendBaseUrl(),
}));

const mockLikePost            = jest.fn<any>();
const mockUnlikePost          = jest.fn<any>();
const mockBookmarkPost        = jest.fn<any>();
const mockUnbookmarkPost      = jest.fn<any>();
const mockRecordView          = jest.fn<any>();
const mockRecordAnonymousOpen = jest.fn<any>();
const mockGetPostById         = jest.fn<any>();
const mockSharePost           = jest.fn<any>();
const mockShareWithTrackingLink = jest.fn<any>();
const mockGetPostShareLink    = jest.fn<any>();
const mockPinPost             = jest.fn<any>();
const mockUnpinPost           = jest.fn<any>();
const mockGetPostViews        = jest.fn<any>();
const mockGetPostInteractions = jest.fn<any>();
const mockRepostPost          = jest.fn<any>();
const mockRecordEngagementBatch = jest.fn<any>();

jest.mock('../../../services/PostService', () => ({
  PostService: jest.fn().mockImplementation(() => ({
    likePost:              (...args: any[]) => mockLikePost(...args),
    unlikePost:            (...args: any[]) => mockUnlikePost(...args),
    bookmarkPost:          (...args: any[]) => mockBookmarkPost(...args),
    unbookmarkPost:        (...args: any[]) => mockUnbookmarkPost(...args),
    recordView:            (...args: any[]) => mockRecordView(...args),
    recordAnonymousOpen:   (...args: any[]) => mockRecordAnonymousOpen(...args),
    getPostById:           (...args: any[]) => mockGetPostById(...args),
    sharePost:             (...args: any[]) => mockSharePost(...args),
    shareWithTrackingLink: (...args: any[]) => mockShareWithTrackingLink(...args),
    getPostShareLink:      (...args: any[]) => mockGetPostShareLink(...args),
    pinPost:               (...args: any[]) => mockPinPost(...args),
    unpinPost:             (...args: any[]) => mockUnpinPost(...args),
    getPostViews:          (...args: any[]) => mockGetPostViews(...args),
    getPostInteractions:   (...args: any[]) => mockGetPostInteractions(...args),
    repostPost:            (...args: any[]) => mockRepostPost(...args),
    recordEngagementBatch: (...args: any[]) => mockRecordEngagementBatch(...args),
  })),
}));

jest.mock('../../../services/MediaService', () => ({
  MediaService: jest.fn().mockImplementation(() => ({})),
}));

// ---------------------------------------------------------------------------
// Import route under test (after mocks)
// ---------------------------------------------------------------------------

import { registerInteractionRoutes } from '../../../routes/posts/interactions';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const USER_ID = '507f1f77bcf86cd799439011';
const POST_ID = '507f1f77bcf86cd799439022';

// ---------------------------------------------------------------------------
// Prisma mocks
// ---------------------------------------------------------------------------

const mockPostImpressionCreate  = jest.fn<any>();
const mockPostUpdate            = jest.fn<any>();
const mockPostImpressionCreateMany = jest.fn<any>();
const mockPostUpdateMany        = jest.fn<any>();

const mockPrisma: any = {
  postImpression: {
    create:     (...args: any[]) => mockPostImpressionCreate(...args),
    createMany: (...args: any[]) => mockPostImpressionCreateMany(...args),
  },
  post: {
    update:     (...args: any[]) => mockPostUpdate(...args),
    updateMany: (...args: any[]) => mockPostUpdateMany(...args),
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAuthCtx(userId = USER_ID): any {
  return {
    type: 'user',
    isAnonymous: false,
    userId,
    registeredUser: { id: userId, username: 'testuser' },
    hasFullAccess: true,
  };
}

function unauthCtx(): any {
  return {
    type: 'anonymous',
    isAnonymous: true,
    userId: 'anon',
    registeredUser: null,
    hasFullAccess: false,
  };
}

function buildApp(authCtx?: any): FastifyInstance {
  const ctx = authCtx ?? makeAuthCtx();
  const requiredAuth = async (req: any) => { req.authContext = ctx; };
  const app = Fastify({ logger: false });
  app.decorate('prisma', mockPrisma);
  app.decorate('notificationService', {
    markPostNotificationsAsRead: jest.fn<any>().mockResolvedValue(undefined),
    createPostLikeNotification: jest.fn<any>().mockResolvedValue(undefined),
    createPostRepostNotification: jest.fn<any>().mockResolvedValue(undefined),
  } as any);
  registerInteractionRoutes(app, mockPrisma, requiredAuth);
  return app;
}

function makePost(overrides: any = {}): any {
  return {
    id: POST_ID,
    authorId: 'author-1',
    content: 'Hello world',
    type: 'POST',
    likeCount: 1,
    shareCount: 1,
    bookmarkCount: 0,
    viewCount: 5,
    reactionSummary: { '❤️': 1 },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// POST /posts/:postId/like
// ---------------------------------------------------------------------------

describe('POST /posts/:postId/like', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockLikePost.mockReset();
    app = buildApp();
    mockLikePost.mockResolvedValue(makePost());
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 with liked=true', async () => {
    await app.ready();
    const res = await app.inject({ method: 'POST', url: `/posts/${POST_ID}/like`, payload: { emoji: '👍' } });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.liked).toBe(true);
  });

  it('returns 401 when registeredUser is null', async () => {
    const unauthApp = buildApp(unauthCtx());
    await unauthApp.ready();
    const res = await unauthApp.inject({ method: 'POST', url: `/posts/${POST_ID}/like`, payload: {} });
    await unauthApp.close();
    expect(res.statusCode).toBe(401);
  });

  it('returns 404 when post not found', async () => {
    mockLikePost.mockResolvedValue(null);
    await app.ready();
    const res = await app.inject({ method: 'POST', url: `/posts/${POST_ID}/like`, payload: {} });
    expect(res.statusCode).toBe(404);
  });

  it('returns 500 on unexpected error', async () => {
    mockLikePost.mockRejectedValue(new Error('DB error'));
    await app.ready();
    const res = await app.inject({ method: 'POST', url: `/posts/${POST_ID}/like`, payload: {} });
    expect(res.statusCode).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// DELETE /posts/:postId/like
// ---------------------------------------------------------------------------

describe('DELETE /posts/:postId/like', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockUnlikePost.mockReset();
    app = buildApp();
    mockUnlikePost.mockResolvedValue(makePost({ likeCount: 0, reactionSummary: {} }));
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 with liked=false', async () => {
    await app.ready();
    const res = await app.inject({ method: 'DELETE', url: `/posts/${POST_ID}/like` });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.liked).toBe(false);
  });

  it('returns 401 when registeredUser is null', async () => {
    const unauthApp = buildApp(unauthCtx());
    await unauthApp.ready();
    const res = await unauthApp.inject({ method: 'DELETE', url: `/posts/${POST_ID}/like` });
    await unauthApp.close();
    expect(res.statusCode).toBe(401);
  });

  it('returns 404 when post not found', async () => {
    mockUnlikePost.mockResolvedValue(null);
    await app.ready();
    const res = await app.inject({ method: 'DELETE', url: `/posts/${POST_ID}/like` });
    expect(res.statusCode).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// POST /posts/:postId/bookmark
// ---------------------------------------------------------------------------

describe('POST /posts/:postId/bookmark', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockBookmarkPost.mockReset();
    app = buildApp();
    mockBookmarkPost.mockResolvedValue({ bookmarkCount: 1 });
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 with bookmarked=true', async () => {
    await app.ready();
    const res = await app.inject({ method: 'POST', url: `/posts/${POST_ID}/bookmark` });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.bookmarked).toBe(true);
    expect(body.data.bookmarkCount).toBe(1);
  });

  it('returns 401 when registeredUser is null', async () => {
    const unauthApp = buildApp(unauthCtx());
    await unauthApp.ready();
    const res = await unauthApp.inject({ method: 'POST', url: `/posts/${POST_ID}/bookmark` });
    await unauthApp.close();
    expect(res.statusCode).toBe(401);
  });

  it('returns 500 on service error', async () => {
    mockBookmarkPost.mockRejectedValue(new Error('DB error'));
    await app.ready();
    const res = await app.inject({ method: 'POST', url: `/posts/${POST_ID}/bookmark` });
    expect(res.statusCode).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// DELETE /posts/:postId/bookmark
// ---------------------------------------------------------------------------

describe('DELETE /posts/:postId/bookmark', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockUnbookmarkPost.mockReset();
    app = buildApp();
    mockUnbookmarkPost.mockResolvedValue({ bookmarkCount: 0 });
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 with bookmarked=false', async () => {
    await app.ready();
    const res = await app.inject({ method: 'DELETE', url: `/posts/${POST_ID}/bookmark` });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.bookmarked).toBe(false);
  });

  it('returns 401 when registeredUser is null', async () => {
    const unauthApp = buildApp(unauthCtx());
    await unauthApp.ready();
    const res = await unauthApp.inject({ method: 'DELETE', url: `/posts/${POST_ID}/bookmark` });
    await unauthApp.close();
    expect(res.statusCode).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// POST /posts/:postId/view
// ---------------------------------------------------------------------------

describe('POST /posts/:postId/view', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockRecordView.mockReset();
    app = buildApp();
    mockRecordView.mockResolvedValue(false);
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 with viewed=true', async () => {
    await app.ready();
    const res = await app.inject({ method: 'POST', url: `/posts/${POST_ID}/view`, payload: { duration: 5000 } });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.viewed).toBe(true);
  });

  it('returns 401 when registeredUser is null', async () => {
    const unauthApp = buildApp(unauthCtx());
    await unauthApp.ready();
    const res = await unauthApp.inject({ method: 'POST', url: `/posts/${POST_ID}/view` });
    await unauthApp.close();
    expect(res.statusCode).toBe(401);
  });

  it('returns 500 on service error', async () => {
    mockRecordView.mockRejectedValue(new Error('DB error'));
    await app.ready();
    const res = await app.inject({ method: 'POST', url: `/posts/${POST_ID}/view` });
    expect(res.statusCode).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// POST /posts/:postId/anonymous-view
// ---------------------------------------------------------------------------

describe('POST /posts/:postId/anonymous-view', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockRecordAnonymousOpen.mockReset();
    app = buildApp();
    mockRecordAnonymousOpen.mockResolvedValue(true);
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 with counted=false when Authorization header present', async () => {
    await app.ready();
    const res = await app.inject({
      method: 'POST', url: `/posts/${POST_ID}/anonymous-view`,
      headers: { authorization: 'Bearer token' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.counted).toBe(false);
  });

  it('returns 200 with counted=true for anonymous view with valid session token', async () => {
    await app.ready();
    const res = await app.inject({
      method: 'POST', url: `/posts/${POST_ID}/anonymous-view`,
      headers: { 'x-session-token': 'session-abc123' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.counted).toBe(true);
  });

  it('returns 400 when session token is missing', async () => {
    await app.ready();
    const res = await app.inject({ method: 'POST', url: `/posts/${POST_ID}/anonymous-view` });
    expect(res.statusCode).toBe(400);
  });

  it('returns 500 on service error', async () => {
    mockRecordAnonymousOpen.mockRejectedValue(new Error('DB error'));
    await app.ready();
    const res = await app.inject({
      method: 'POST', url: `/posts/${POST_ID}/anonymous-view`,
      headers: { 'x-session-token': 'session-abc' },
    });
    expect(res.statusCode).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// POST /posts/:postId/impression
// ---------------------------------------------------------------------------

describe('POST /posts/:postId/impression', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPostImpressionCreate.mockReset();
    mockPostUpdate.mockReset();
    app = buildApp();
    mockPostImpressionCreate.mockResolvedValue({});
    mockPostUpdate.mockResolvedValue({});
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 with recorded=true', async () => {
    await app.ready();
    const res = await app.inject({
      method: 'POST', url: `/posts/${POST_ID}/impression`,
      payload: { source: 'feed' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.recorded).toBe(true);
  });

  it('returns 401 when registeredUser is null', async () => {
    const unauthApp = buildApp(unauthCtx());
    await unauthApp.ready();
    const res = await unauthApp.inject({ method: 'POST', url: `/posts/${POST_ID}/impression`, payload: {} });
    await unauthApp.close();
    expect(res.statusCode).toBe(401);
  });

  it('returns 500 on DB error', async () => {
    mockPostImpressionCreate.mockRejectedValue(new Error('DB error'));
    await app.ready();
    const res = await app.inject({ method: 'POST', url: `/posts/${POST_ID}/impression`, payload: {} });
    expect(res.statusCode).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// POST /posts/impressions/batch
// ---------------------------------------------------------------------------

describe('POST /posts/impressions/batch', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPostImpressionCreateMany.mockReset();
    mockPostUpdateMany.mockReset();
    app = buildApp();
    mockPostImpressionCreateMany.mockResolvedValue({ count: 2 });
    mockPostUpdateMany.mockResolvedValue({ count: 2 });
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 with recorded count', async () => {
    await app.ready();
    const res = await app.inject({
      method: 'POST', url: '/posts/impressions/batch',
      payload: { postIds: [POST_ID, '507f1f77bcf86cd799439099'], source: 'feed' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.recorded).toBe(2);
  });

  it('returns 200 with 0 when postIds is empty', async () => {
    await app.ready();
    const res = await app.inject({
      method: 'POST', url: '/posts/impressions/batch',
      payload: { postIds: [] },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.recorded).toBe(0);
  });

  it('returns 401 when registeredUser is null', async () => {
    const unauthApp = buildApp(unauthCtx());
    await unauthApp.ready();
    const res = await unauthApp.inject({ method: 'POST', url: '/posts/impressions/batch', payload: { postIds: [POST_ID] } });
    await unauthApp.close();
    expect(res.statusCode).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// POST /posts/engagement/batch
// ---------------------------------------------------------------------------

describe('POST /posts/engagement/batch', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockRecordEngagementBatch.mockReset();
    app = buildApp();
    mockRecordEngagementBatch.mockResolvedValue(1);
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 with recorded count on valid session', async () => {
    await app.ready();
    const res = await app.inject({
      method: 'POST', url: '/posts/engagement/batch',
      payload: {
        sessions: [{
          sessionId: '550e8400-e29b-41d4-a716-446655440000',
          postId: POST_ID,
          contentType: 'POST',
          surface: 'feed',
          startedAt: '2024-01-01T00:00:00Z',
          dwellMs: 3000,
          actions: [],
        }],
      },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.recorded).toBe(1);
  });

  it('returns 400 when body is invalid', async () => {
    await app.ready();
    const res = await app.inject({
      method: 'POST', url: '/posts/engagement/batch',
      payload: { sessions: 'not-an-array' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 401 when registeredUser is null', async () => {
    const unauthApp = buildApp(unauthCtx());
    await unauthApp.ready();
    const res = await unauthApp.inject({ method: 'POST', url: '/posts/engagement/batch', payload: { sessions: [] } });
    await unauthApp.close();
    expect(res.statusCode).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// POST /posts/:postId/share
// ---------------------------------------------------------------------------

describe('POST /posts/:postId/share', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSharePost.mockReset();
    mockShareWithTrackingLink.mockReset();
    app = buildApp();
    mockResolveFrontendBaseUrl.mockReturnValue('https://meeshy.me');
    mockSharePost.mockResolvedValue({ shareCount: 3 });
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 with shared=true (plain share)', async () => {
    await app.ready();
    const res = await app.inject({ method: 'POST', url: `/posts/${POST_ID}/share`, payload: { platform: 'twitter' } });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.shared).toBe(true);
    expect(body.data.shareCount).toBe(3);
  });

  it('returns 200 with shortUrl on generateLink=true', async () => {
    mockShareWithTrackingLink.mockResolvedValue({ shareCount: 2, token: 'abc123', shortUrl: 'https://meeshy.me/l/abc123' });
    await app.ready();
    const res = await app.inject({
      method: 'POST', url: `/posts/${POST_ID}/share`,
      payload: { generateLink: true },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.shortUrl).toBe('https://meeshy.me/l/abc123');
  });

  it('returns 404 when post not found', async () => {
    mockSharePost.mockResolvedValue(null);
    await app.ready();
    const res = await app.inject({ method: 'POST', url: `/posts/${POST_ID}/share` });
    expect(res.statusCode).toBe(404);
  });

  it('returns 401 when registeredUser is null', async () => {
    const unauthApp = buildApp(unauthCtx());
    await unauthApp.ready();
    const res = await unauthApp.inject({ method: 'POST', url: `/posts/${POST_ID}/share` });
    await unauthApp.close();
    expect(res.statusCode).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// GET /posts/:postId/share
// ---------------------------------------------------------------------------

describe('GET /posts/:postId/share', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetPostShareLink.mockReset();
    app = buildApp();
    mockResolveFrontendBaseUrl.mockReturnValue('https://meeshy.me');
    mockGetPostShareLink.mockResolvedValue({ token: 'abc123', clickCount: 5, shortUrl: 'https://meeshy.me/l/abc123' });
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 with share link analytics', async () => {
    await app.ready();
    const res = await app.inject({ method: 'GET', url: `/posts/${POST_ID}/share` });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.token).toBe('abc123');
  });

  it('returns 401 when registeredUser is null', async () => {
    const unauthApp = buildApp(unauthCtx());
    await unauthApp.ready();
    const res = await unauthApp.inject({ method: 'GET', url: `/posts/${POST_ID}/share` });
    await unauthApp.close();
    expect(res.statusCode).toBe(401);
  });

  it('returns 500 on service error', async () => {
    mockGetPostShareLink.mockRejectedValue(new Error('DB error'));
    await app.ready();
    const res = await app.inject({ method: 'GET', url: `/posts/${POST_ID}/share` });
    expect(res.statusCode).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// POST /posts/:postId/pin
// ---------------------------------------------------------------------------

describe('POST /posts/:postId/pin', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPinPost.mockReset();
    app = buildApp();
    mockPinPost.mockResolvedValue(makePost());
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 with pinned=true', async () => {
    await app.ready();
    const res = await app.inject({ method: 'POST', url: `/posts/${POST_ID}/pin` });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.pinned).toBe(true);
  });

  it('returns 404 when post not found', async () => {
    mockPinPost.mockResolvedValue(null);
    await app.ready();
    const res = await app.inject({ method: 'POST', url: `/posts/${POST_ID}/pin` });
    expect(res.statusCode).toBe(404);
  });

  it('returns 403 when FORBIDDEN error', async () => {
    mockPinPost.mockRejectedValue(new Error('FORBIDDEN'));
    await app.ready();
    const res = await app.inject({ method: 'POST', url: `/posts/${POST_ID}/pin` });
    expect(res.statusCode).toBe(403);
  });

  it('returns 401 when registeredUser is null', async () => {
    const unauthApp = buildApp(unauthCtx());
    await unauthApp.ready();
    const res = await unauthApp.inject({ method: 'POST', url: `/posts/${POST_ID}/pin` });
    await unauthApp.close();
    expect(res.statusCode).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// DELETE /posts/:postId/pin
// ---------------------------------------------------------------------------

describe('DELETE /posts/:postId/pin', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockUnpinPost.mockReset();
    app = buildApp();
    mockUnpinPost.mockResolvedValue(makePost());
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 with pinned=false', async () => {
    await app.ready();
    const res = await app.inject({ method: 'DELETE', url: `/posts/${POST_ID}/pin` });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.pinned).toBe(false);
  });

  it('returns 403 on FORBIDDEN error', async () => {
    mockUnpinPost.mockRejectedValue(new Error('FORBIDDEN'));
    await app.ready();
    const res = await app.inject({ method: 'DELETE', url: `/posts/${POST_ID}/pin` });
    expect(res.statusCode).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// GET /posts/:postId/views
// ---------------------------------------------------------------------------

describe('GET /posts/:postId/views', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetPostViews.mockReset();
    app = buildApp();
    mockGetPostViews.mockResolvedValue({ items: [{ userId: USER_ID }], total: 1, hasMore: false });
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 with views list', async () => {
    await app.ready();
    const res = await app.inject({ method: 'GET', url: `/posts/${POST_ID}/views` });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data).toHaveLength(1);
    expect(body.pagination.total).toBe(1);
  });

  it('returns 404 when post not found', async () => {
    mockGetPostViews.mockResolvedValue(null);
    await app.ready();
    const res = await app.inject({ method: 'GET', url: `/posts/${POST_ID}/views` });
    expect(res.statusCode).toBe(404);
  });

  it('returns 403 on FORBIDDEN error', async () => {
    mockGetPostViews.mockRejectedValue(new Error('FORBIDDEN'));
    await app.ready();
    const res = await app.inject({ method: 'GET', url: `/posts/${POST_ID}/views` });
    expect(res.statusCode).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// GET /posts/:postId/interactions
// ---------------------------------------------------------------------------

describe('GET /posts/:postId/interactions', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetPostInteractions.mockReset();
    app = buildApp();
    mockGetPostInteractions.mockResolvedValue({ viewers: [], total: 0, hasMore: false });
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 with interaction data', async () => {
    await app.ready();
    const res = await app.inject({ method: 'GET', url: `/posts/${POST_ID}/interactions` });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.viewers).toEqual([]);
  });

  it('returns 404 when post not found', async () => {
    mockGetPostInteractions.mockResolvedValue(null);
    await app.ready();
    const res = await app.inject({ method: 'GET', url: `/posts/${POST_ID}/interactions` });
    expect(res.statusCode).toBe(404);
  });

  it('returns 403 on FORBIDDEN error', async () => {
    mockGetPostInteractions.mockRejectedValue(new Error('FORBIDDEN'));
    await app.ready();
    const res = await app.inject({ method: 'GET', url: `/posts/${POST_ID}/interactions` });
    expect(res.statusCode).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// POST /posts/:postId/repost
// ---------------------------------------------------------------------------

describe('POST /posts/:postId/repost', () => {
  let app: FastifyInstance;

  const mockRepost = {
    id: 'repost-1',
    authorId: USER_ID,
    repostOfId: POST_ID,
    type: 'POST',
    content: 'Shared post',
    likeCount: 0,
    shareCount: 0,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockRepostPost.mockReset();
    app = buildApp();
    mockRepostPost.mockResolvedValue(mockRepost);
  });

  afterEach(async () => { await app.close(); });

  it('returns 201 on successful repost', async () => {
    await app.ready();
    const res = await app.inject({
      method: 'POST', url: `/posts/${POST_ID}/repost`,
      payload: { content: 'Check this out!', isQuote: true },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.repostOfId).toBe(POST_ID);
  });

  it('returns 404 when original post not found', async () => {
    mockRepostPost.mockResolvedValue(null);
    await app.ready();
    const res = await app.inject({ method: 'POST', url: `/posts/${POST_ID}/repost`, payload: {} });
    expect(res.statusCode).toBe(404);
  });

  it('returns 401 when registeredUser is null', async () => {
    const unauthApp = buildApp(unauthCtx());
    await unauthApp.ready();
    const res = await unauthApp.inject({ method: 'POST', url: `/posts/${POST_ID}/repost`, payload: {} });
    await unauthApp.close();
    expect(res.statusCode).toBe(401);
  });

  it('returns 403 when 403 status error thrown', async () => {
    const forbiddenErr: any = new Error('Cannot repost own post');
    forbiddenErr.statusCode = 403;
    mockRepostPost.mockRejectedValue(forbiddenErr);
    await app.ready();
    const res = await app.inject({ method: 'POST', url: `/posts/${POST_ID}/repost`, payload: {} });
    expect(res.statusCode).toBe(403);
  });

  it('returns 500 on unexpected error', async () => {
    mockRepostPost.mockRejectedValue(new Error('DB error'));
    await app.ready();
    const res = await app.inject({ method: 'POST', url: `/posts/${POST_ID}/repost`, payload: {} });
    expect(res.statusCode).toBe(500);
  });
});
