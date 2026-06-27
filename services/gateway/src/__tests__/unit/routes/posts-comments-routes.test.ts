/**
 * posts-comments-routes.test.ts
 *
 * Unit tests for src/routes/posts/comments.ts
 * Covers:
 *   - GET  /posts/:postId/comments
 *   - GET  /posts/:postId/comments/:commentId/replies
 *   - POST /posts/:postId/comments
 *   - POST /posts/:postId/comments/:commentId/like
 *   - DELETE /posts/:postId/comments/:commentId/like
 *   - DELETE /posts/:postId/comments/:commentId
 */

import Fastify, { FastifyInstance } from 'fastify';
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

// ---------------------------------------------------------------------------
// Module mocks (before imports)
// ---------------------------------------------------------------------------

jest.mock('../../../middleware/rate-limiter', () => ({
  createPostRouteRateLimitConfig: jest.fn().mockReturnValue({}),
}));

const mockGetComments         = jest.fn<any>();
const mockGetReplies          = jest.fn<any>();
const mockAddComment          = jest.fn<any>();
const mockLikeComment         = jest.fn<any>();
const mockUnlikeComment       = jest.fn<any>();
const mockDeleteComment       = jest.fn<any>();

jest.mock('../../../services/PostCommentService', () => ({
  PostCommentService: jest.fn().mockImplementation(() => ({
    getComments:   (...args: any[]) => mockGetComments(...args),
    getReplies:    (...args: any[]) => mockGetReplies(...args),
    addComment:    (...args: any[]) => mockAddComment(...args),
    likeComment:   (...args: any[]) => mockLikeComment(...args),
    unlikeComment: (...args: any[]) => mockUnlikeComment(...args),
    deleteComment: (...args: any[]) => mockDeleteComment(...args),
  })),
}));

const mockExtractMentions        = jest.fn<any>();
const mockResolveUsernames       = jest.fn<any>();
const mockCreateCommentMentions  = jest.fn<any>();
const mockResolveMentionedUsers  = jest.fn<any>();

jest.mock('../../../services/MentionService', () => ({
  MentionService: jest.fn().mockImplementation(() => ({
    extractMentions:       (...args: any[]) => mockExtractMentions(...args),
    resolveUsernames:      (...args: any[]) => mockResolveUsernames(...args),
    createCommentMentions: (...args: any[]) => mockCreateCommentMentions(...args),
  })),
  resolveMentionedUsers: (...args: any[]) => mockResolveMentionedUsers(...args),
}));

jest.mock('../../../services/posts/PostTranslationService', () => ({
  PostTranslationService: {
    shared: {
      translateComment: jest.fn<any>().mockResolvedValue(undefined),
    },
  },
}));

jest.mock('../../../services/posts/PostAudioService', () => ({
  PostAudioService: {
    shared: {
      processPostAudio: jest.fn<any>().mockResolvedValue(undefined),
    },
  },
}));

// ---------------------------------------------------------------------------
// Import route under test (after mocks)
// ---------------------------------------------------------------------------

import { registerCommentRoutes } from '../../../routes/posts/comments';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const USER_ID     = '507f1f77bcf86cd799439011';
const POST_ID     = '507f1f77bcf86cd799439022';
const COMMENT_ID  = '507f1f77bcf86cd799439033';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mockPrisma: any = {};

function makeAuthCtx(userId = USER_ID): any {
  return {
    type: 'user',
    isAnonymous: false,
    userId,
    registeredUser: { id: userId },
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
  const app = Fastify({ logger: false });
  const ctx = authCtx ?? makeAuthCtx();
  const requiredAuth = async (req: any) => { req.authContext = ctx; };
  app.decorate('prisma', mockPrisma);
  registerCommentRoutes(app, mockPrisma, requiredAuth);
  return app;
}

function makeComment(overrides: any = {}): any {
  return {
    id: COMMENT_ID,
    postId: POST_ID,
    authorId: USER_ID,
    content: 'Hello world',
    likeCount: 0,
    reactionSummary: {},
    createdAt: new Date('2024-01-01T00:00:00Z'),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// GET /posts/:postId/comments
// ---------------------------------------------------------------------------

describe('GET /posts/:postId/comments', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetComments.mockReset();
    mockResolveMentionedUsers.mockReset();
    app = buildApp();
    mockGetComments.mockResolvedValue({ items: [makeComment()], hasMore: false, nextCursor: null });
    mockResolveMentionedUsers.mockResolvedValue([]);
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 with comments list', async () => {
    await app.ready();
    const res = await app.inject({ method: 'GET', url: `/posts/${POST_ID}/comments` });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
  });

  it('includes pagination and mentionedUsers in meta', async () => {
    await app.ready();
    const res = await app.inject({ method: 'GET', url: `/posts/${POST_ID}/comments` });
    const body = JSON.parse(res.body);
    expect(body.pagination.hasMore).toBe(false);
    expect(body.meta.mentionedUsers).toEqual([]);
  });

  it('passes cursor and limit query params', async () => {
    await app.ready();
    await app.inject({ method: 'GET', url: `/posts/${POST_ID}/comments?cursor=abc&limit=5` });
    expect(mockGetComments).toHaveBeenCalledWith(POST_ID, 'abc', 5, USER_ID);
  });

  it('returns 500 on service error', async () => {
    mockGetComments.mockRejectedValue(new Error('DB error'));
    await app.ready();
    const res = await app.inject({ method: 'GET', url: `/posts/${POST_ID}/comments` });
    expect(res.statusCode).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// GET /posts/:postId/comments/:commentId/replies
// ---------------------------------------------------------------------------

describe('GET /posts/:postId/comments/:commentId/replies', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetReplies.mockReset();
    mockResolveMentionedUsers.mockReset();
    app = buildApp();
    mockGetReplies.mockResolvedValue({ items: [], hasMore: false, nextCursor: null });
    mockResolveMentionedUsers.mockResolvedValue([]);
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 with empty replies list', async () => {
    await app.ready();
    const res = await app.inject({
      method: 'GET',
      url: `/posts/${POST_ID}/comments/${COMMENT_ID}/replies`,
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data).toEqual([]);
  });

  it('calls getReplies with commentId', async () => {
    await app.ready();
    await app.inject({
      method: 'GET',
      url: `/posts/${POST_ID}/comments/${COMMENT_ID}/replies`,
    });
    expect(mockGetReplies).toHaveBeenCalledWith(COMMENT_ID, undefined, 20, USER_ID);
  });

  it('returns 500 on service error', async () => {
    mockGetReplies.mockRejectedValue(new Error('DB error'));
    await app.ready();
    const res = await app.inject({
      method: 'GET',
      url: `/posts/${POST_ID}/comments/${COMMENT_ID}/replies`,
    });
    expect(res.statusCode).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// POST /posts/:postId/comments
// ---------------------------------------------------------------------------

describe('POST /posts/:postId/comments', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockAddComment.mockReset();
    mockResolveMentionedUsers.mockReset();
    mockExtractMentions.mockReset();
    app = buildApp();
    mockAddComment.mockResolvedValue(makeComment({ id: COMMENT_ID }));
    mockResolveMentionedUsers.mockResolvedValue([]);
    mockExtractMentions.mockReturnValue([]);
  });

  afterEach(async () => { await app.close(); });

  it('returns 201 on successful comment creation', async () => {
    await app.ready();
    const res = await app.inject({
      method: 'POST', url: `/posts/${POST_ID}/comments`,
      payload: { content: 'Great post!' },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
  });

  it('calls addComment with correct args', async () => {
    await app.ready();
    await app.inject({
      method: 'POST', url: `/posts/${POST_ID}/comments`,
      payload: { content: 'My comment' },
    });
    expect(mockAddComment).toHaveBeenCalledWith(
      POST_ID,
      USER_ID,
      'My comment',
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
    );
  });

  it('returns 401 when registeredUser is null', async () => {
    const unauthApp = buildApp(unauthCtx());
    await unauthApp.ready();
    const res = await unauthApp.inject({
      method: 'POST', url: `/posts/${POST_ID}/comments`,
      payload: { content: 'Hello' },
    });
    await unauthApp.close();
    expect(res.statusCode).toBe(401);
  });

  it('returns 400 when body is invalid (empty content, no attachment)', async () => {
    await app.ready();
    const res = await app.inject({
      method: 'POST', url: `/posts/${POST_ID}/comments`,
      payload: { content: '' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 404 when post not found (addComment returns null)', async () => {
    mockAddComment.mockResolvedValue(null);
    await app.ready();
    const res = await app.inject({
      method: 'POST', url: `/posts/${POST_ID}/comments`,
      payload: { content: 'My comment' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 404 when POST_NOT_FOUND error thrown', async () => {
    mockAddComment.mockRejectedValue(new Error('POST_NOT_FOUND'));
    await app.ready();
    const res = await app.inject({
      method: 'POST', url: `/posts/${POST_ID}/comments`,
      payload: { content: 'My comment' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 400 on MEDIA_NOT_AVAILABLE error', async () => {
    mockAddComment.mockRejectedValue(new Error('MEDIA_NOT_AVAILABLE'));
    await app.ready();
    const res = await app.inject({
      method: 'POST', url: `/posts/${POST_ID}/comments`,
      payload: { content: 'My comment' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 500 on unexpected service error', async () => {
    mockAddComment.mockRejectedValue(new Error('DB error'));
    await app.ready();
    const res = await app.inject({
      method: 'POST', url: `/posts/${POST_ID}/comments`,
      payload: { content: 'My comment' },
    });
    expect(res.statusCode).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// POST /posts/:postId/comments/:commentId/like
// ---------------------------------------------------------------------------

describe('POST /posts/:postId/comments/:commentId/like', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockLikeComment.mockReset();
    app = buildApp();
    mockLikeComment.mockResolvedValue({ authorId: 'author-1', likeCount: 1, reactionSummary: {} });
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 on successful like', async () => {
    await app.ready();
    const res = await app.inject({
      method: 'POST',
      url: `/posts/${POST_ID}/comments/${COMMENT_ID}/like`,
      payload: { emoji: '👍' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.liked).toBe(true);
    expect(body.data.likeCount).toBe(1);
  });

  it('uses default emoji when payload empty', async () => {
    await app.ready();
    await app.inject({
      method: 'POST',
      url: `/posts/${POST_ID}/comments/${COMMENT_ID}/like`,
      payload: {},
    });
    expect(mockLikeComment).toHaveBeenCalledWith(COMMENT_ID, USER_ID, '❤️');
  });

  it('returns 401 when registeredUser is null', async () => {
    const unauthApp = buildApp(unauthCtx());
    await unauthApp.ready();
    const res = await unauthApp.inject({
      method: 'POST',
      url: `/posts/${POST_ID}/comments/${COMMENT_ID}/like`,
      payload: {},
    });
    await unauthApp.close();
    expect(res.statusCode).toBe(401);
  });

  it('returns 404 when comment not found', async () => {
    mockLikeComment.mockResolvedValue(null);
    await app.ready();
    const res = await app.inject({
      method: 'POST',
      url: `/posts/${POST_ID}/comments/${COMMENT_ID}/like`,
      payload: {},
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 500 on service error', async () => {
    mockLikeComment.mockRejectedValue(new Error('DB error'));
    await app.ready();
    const res = await app.inject({
      method: 'POST',
      url: `/posts/${POST_ID}/comments/${COMMENT_ID}/like`,
      payload: {},
    });
    expect(res.statusCode).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// DELETE /posts/:postId/comments/:commentId/like
// ---------------------------------------------------------------------------

describe('DELETE /posts/:postId/comments/:commentId/like', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockUnlikeComment.mockReset();
    app = buildApp();
    mockUnlikeComment.mockResolvedValue({ likeCount: 0, reactionSummary: {} });
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 with liked=false on successful unlike', async () => {
    await app.ready();
    const res = await app.inject({
      method: 'DELETE',
      url: `/posts/${POST_ID}/comments/${COMMENT_ID}/like`,
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.liked).toBe(false);
  });

  it('returns 401 when registeredUser is null', async () => {
    const unauthApp = buildApp(unauthCtx());
    await unauthApp.ready();
    const res = await unauthApp.inject({
      method: 'DELETE',
      url: `/posts/${POST_ID}/comments/${COMMENT_ID}/like`,
    });
    await unauthApp.close();
    expect(res.statusCode).toBe(401);
  });

  it('returns 404 when comment not found', async () => {
    mockUnlikeComment.mockResolvedValue(null);
    await app.ready();
    const res = await app.inject({
      method: 'DELETE',
      url: `/posts/${POST_ID}/comments/${COMMENT_ID}/like`,
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 500 on service error', async () => {
    mockUnlikeComment.mockRejectedValue(new Error('DB error'));
    await app.ready();
    const res = await app.inject({
      method: 'DELETE',
      url: `/posts/${POST_ID}/comments/${COMMENT_ID}/like`,
    });
    expect(res.statusCode).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// DELETE /posts/:postId/comments/:commentId
// ---------------------------------------------------------------------------

describe('DELETE /posts/:postId/comments/:commentId', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDeleteComment.mockReset();
    app = buildApp();
    mockDeleteComment.mockResolvedValue({ commentCount: 0 });
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 when comment deleted', async () => {
    await app.ready();
    const res = await app.inject({
      method: 'DELETE',
      url: `/posts/${POST_ID}/comments/${COMMENT_ID}`,
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.deleted).toBe(true);
  });

  it('returns 401 when registeredUser is null', async () => {
    const unauthApp = buildApp(unauthCtx());
    await unauthApp.ready();
    const res = await unauthApp.inject({
      method: 'DELETE',
      url: `/posts/${POST_ID}/comments/${COMMENT_ID}`,
    });
    await unauthApp.close();
    expect(res.statusCode).toBe(401);
  });

  it('returns 404 when comment not found', async () => {
    mockDeleteComment.mockResolvedValue(null);
    await app.ready();
    const res = await app.inject({
      method: 'DELETE',
      url: `/posts/${POST_ID}/comments/${COMMENT_ID}`,
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 403 when FORBIDDEN error thrown', async () => {
    mockDeleteComment.mockRejectedValue(new Error('FORBIDDEN'));
    await app.ready();
    const res = await app.inject({
      method: 'DELETE',
      url: `/posts/${POST_ID}/comments/${COMMENT_ID}`,
    });
    expect(res.statusCode).toBe(403);
  });

  it('returns 500 on unexpected error', async () => {
    mockDeleteComment.mockRejectedValue(new Error('DB error'));
    await app.ready();
    const res = await app.inject({
      method: 'DELETE',
      url: `/posts/${POST_ID}/comments/${COMMENT_ID}`,
    });
    expect(res.statusCode).toBe(500);
  });
});
