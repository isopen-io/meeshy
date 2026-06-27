/**
 * posts-core-routes.test.ts
 *
 * Unit tests for src/routes/posts/core.ts
 * Covers:
 *   - POST   /posts
 *   - GET    /posts/:postId
 *   - PUT    /posts/:postId
 *   - DELETE /posts/:postId
 *   - POST   /posts/:postId/translate
 */

import Fastify, { FastifyInstance } from 'fastify';
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

// ---------------------------------------------------------------------------
// Module mocks (before imports)
// ---------------------------------------------------------------------------

jest.mock('../../../middleware/auth', () => ({ UnifiedAuthRequest: {} }));

const mockCreatePost  = jest.fn<any>();
const mockGetPostById = jest.fn<any>();
const mockUpdatePost  = jest.fn<any>();
const mockDeletePost  = jest.fn<any>();

jest.mock('../../../services/PostService', () => ({
  PostService: jest.fn().mockImplementation(() => ({
    createPost:  (...args: any[]) => mockCreatePost(...args),
    getPostById: (...args: any[]) => mockGetPostById(...args),
    updatePost:  (...args: any[]) => mockUpdatePost(...args),
    deletePost:  (...args: any[]) => mockDeletePost(...args),
  })),
}));

const mockResolveMentionedUsers = jest.fn<any>();

jest.mock('../../../services/MentionService', () => ({
  MentionService: jest.fn().mockImplementation(() => ({
    extractMentions:   jest.fn().mockReturnValue([]),
    resolveUsernames:  jest.fn().mockResolvedValue(new Map()),
    createPostMentions: jest.fn().mockResolvedValue(undefined),
  })),
  resolveMentionedUsers: (...args: any[]) => mockResolveMentionedUsers(...args),
}));

jest.mock('../../../services/notifications/NotificationService', () => ({
  NotificationService: jest.fn().mockImplementation(() => ({
    createPostMentionNotificationsBatch:   jest.fn().mockResolvedValue(undefined),
    createFriendContentNotificationsBatch: jest.fn().mockResolvedValue(undefined),
  })),
}));

const mockTranslateOnDemand = jest.fn<any>();

jest.mock('../../../services/posts/PostTranslationService', () => ({
  PostTranslationService: {
    shared: {
      translatePost:     jest.fn().mockResolvedValue(undefined),
      translateOnDemand: (...args: any[]) => mockTranslateOnDemand(...args),
    },
  },
}));

jest.mock('../../../utils/withMutationLog', () => ({
  withMutationLog: ({ op }: { op: () => any }) => op(),
}));

jest.mock('../../../middleware/rate-limiter', () => ({
  createPostRouteRateLimitConfig: jest.fn().mockReturnValue({}),
}));

// ---------------------------------------------------------------------------
// Import routes under test (after mocks)
// ---------------------------------------------------------------------------

import { registerCoreRoutes } from '../../../routes/posts/core';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const USER_ID = '507f1f77bcf86cd799439011';
const POST_ID = '507f1f77bcf86cd799439022';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePost(overrides: any = {}): any {
  return {
    id: POST_ID,
    type: 'POST',
    content: 'Hello world',
    authorId: USER_ID,
    visibility: 'PUBLIC',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  };
}

type AuthOverrides = {
  isAuthenticated?: boolean;
  registeredUser?: any;
};

function buildApp(authOverrides: AuthOverrides = {}): FastifyInstance {
  const authContext = {
    isAuthenticated: authOverrides.isAuthenticated ?? true,
    userId: USER_ID,
    registeredUser: authOverrides.registeredUser !== undefined
      ? authOverrides.registeredUser
      : { id: USER_ID },
  };

  const requiredAuth = async (req: any) => {
    req.authContext = authContext;
  };

  const app = Fastify({ logger: false });
  const mockPrisma: any = {};

  registerCoreRoutes(app, mockPrisma, requiredAuth);
  return app;
}

// ---------------------------------------------------------------------------
// POST /posts
// ---------------------------------------------------------------------------

describe('POST /posts', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockCreatePost.mockReset();
    mockResolveMentionedUsers.mockReset();
    app = buildApp();
    mockCreatePost.mockResolvedValue(makePost());
    mockResolveMentionedUsers.mockResolvedValue([]);
  });

  afterEach(async () => { await app.close(); });

  it('returns 201 on successful post creation', async () => {
    await app.ready();
    const res = await app.inject({
      method: 'POST', url: '/posts',
      payload: { content: 'Hello world', type: 'POST' },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
  });

  it('calls postService.createPost with correct args', async () => {
    await app.ready();
    await app.inject({
      method: 'POST', url: '/posts',
      payload: { content: 'Hello', type: 'POST' },
    });
    expect(mockCreatePost).toHaveBeenCalledWith(
      expect.objectContaining({ content: 'Hello', type: 'POST' }),
      USER_ID
    );
  });

  it('returns 401 when not authenticated', async () => {
    const unauthed = buildApp({ isAuthenticated: false, registeredUser: null });
    await unauthed.ready();
    const res = await unauthed.inject({
      method: 'POST', url: '/posts',
      payload: { content: 'Hello', type: 'POST' },
    });
    await unauthed.close();
    expect(res.statusCode).toBe(401);
  });

  it('returns 400 for invalid post data', async () => {
    await app.ready();
    const res = await app.inject({
      method: 'POST', url: '/posts',
      // EXCEPT visibility without visibilityUserIds → validation fails
      payload: { type: 'POST', visibility: 'EXCEPT' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 500 on service error', async () => {
    mockCreatePost.mockRejectedValue(new Error('DB error'));
    await app.ready();
    const res = await app.inject({
      method: 'POST', url: '/posts',
      payload: { content: 'Hello', type: 'POST' },
    });
    expect(res.statusCode).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// GET /posts/:postId
// ---------------------------------------------------------------------------

describe('GET /posts/:postId', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetPostById.mockReset();
    mockResolveMentionedUsers.mockReset();
    app = buildApp();
    mockGetPostById.mockResolvedValue(makePost());
    mockResolveMentionedUsers.mockResolvedValue([]);
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 with post data', async () => {
    await app.ready();
    const res = await app.inject({ method: 'GET', url: `/posts/${POST_ID}` });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
  });

  it('returns 404 when post not found', async () => {
    mockGetPostById.mockResolvedValue(null);
    await app.ready();
    const res = await app.inject({ method: 'GET', url: `/posts/${POST_ID}` });
    expect(res.statusCode).toBe(404);
  });

  it('returns 500 on service error', async () => {
    mockGetPostById.mockRejectedValue(new Error('DB error'));
    await app.ready();
    const res = await app.inject({ method: 'GET', url: `/posts/${POST_ID}` });
    expect(res.statusCode).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// PUT /posts/:postId
// ---------------------------------------------------------------------------

describe('PUT /posts/:postId', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockUpdatePost.mockReset();
    mockResolveMentionedUsers.mockReset();
    app = buildApp();
    mockUpdatePost.mockResolvedValue(makePost({ content: 'Updated content' }));
    mockResolveMentionedUsers.mockResolvedValue([]);
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 on successful update', async () => {
    await app.ready();
    const res = await app.inject({
      method: 'PUT', url: `/posts/${POST_ID}`,
      payload: { content: 'Updated content' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
  });

  it('returns 401 when not authenticated', async () => {
    const unauthed = buildApp({ isAuthenticated: false, registeredUser: null });
    await unauthed.ready();
    const res = await unauthed.inject({
      method: 'PUT', url: `/posts/${POST_ID}`,
      payload: { content: 'Updated' },
    });
    await unauthed.close();
    expect(res.statusCode).toBe(401);
  });

  it('returns 404 when post not found', async () => {
    mockUpdatePost.mockResolvedValue(null);
    await app.ready();
    const res = await app.inject({
      method: 'PUT', url: `/posts/${POST_ID}`,
      payload: { content: 'Updated' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 403 when user is not the author', async () => {
    mockUpdatePost.mockRejectedValue(Object.assign(new Error('FORBIDDEN'), {}));
    await app.ready();
    const res = await app.inject({
      method: 'PUT', url: `/posts/${POST_ID}`,
      payload: { content: 'Updated' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('returns 400 on invalid update data', async () => {
    await app.ready();
    const res = await app.inject({
      method: 'PUT', url: `/posts/${POST_ID}`,
      payload: { visibility: 'EXCEPT' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 500 on unexpected error', async () => {
    mockUpdatePost.mockRejectedValue(new Error('DB error'));
    await app.ready();
    const res = await app.inject({
      method: 'PUT', url: `/posts/${POST_ID}`,
      payload: { content: 'Updated' },
    });
    expect(res.statusCode).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// DELETE /posts/:postId
// ---------------------------------------------------------------------------

describe('DELETE /posts/:postId', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDeletePost.mockReset();
    app = buildApp();
    mockDeletePost.mockResolvedValue(makePost());
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 on successful deletion', async () => {
    await app.ready();
    const res = await app.inject({ method: 'DELETE', url: `/posts/${POST_ID}` });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.deleted).toBe(true);
  });

  it('returns 401 when not authenticated', async () => {
    const unauthed = buildApp({ isAuthenticated: false, registeredUser: null });
    await unauthed.ready();
    const res = await unauthed.inject({ method: 'DELETE', url: `/posts/${POST_ID}` });
    await unauthed.close();
    expect(res.statusCode).toBe(401);
  });

  it('returns 404 when post not found', async () => {
    mockDeletePost.mockResolvedValue(null);
    await app.ready();
    const res = await app.inject({ method: 'DELETE', url: `/posts/${POST_ID}` });
    expect(res.statusCode).toBe(404);
  });

  it('returns 403 when user is not the author', async () => {
    mockDeletePost.mockRejectedValue(Object.assign(new Error('FORBIDDEN'), {}));
    await app.ready();
    const res = await app.inject({ method: 'DELETE', url: `/posts/${POST_ID}` });
    expect(res.statusCode).toBe(403);
  });

  it('returns 500 on unexpected error', async () => {
    mockDeletePost.mockRejectedValue(new Error('DB error'));
    await app.ready();
    const res = await app.inject({ method: 'DELETE', url: `/posts/${POST_ID}` });
    expect(res.statusCode).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// POST /posts/:postId/translate
// ---------------------------------------------------------------------------

describe('POST /posts/:postId/translate', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetPostById.mockReset();
    mockTranslateOnDemand.mockReset();
    app = buildApp();
    mockGetPostById.mockResolvedValue(makePost());
    mockTranslateOnDemand.mockResolvedValue(undefined);
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 on successful translation request', async () => {
    await app.ready();
    const res = await app.inject({
      method: 'POST', url: `/posts/${POST_ID}/translate`,
      payload: { targetLanguage: 'fr' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.requested).toBe(true);
    expect(body.data.targetLanguage).toBe('fr');
  });

  it('returns 401 when not authenticated', async () => {
    const unauthed = buildApp({ isAuthenticated: false, registeredUser: null });
    await unauthed.ready();
    const res = await unauthed.inject({
      method: 'POST', url: `/posts/${POST_ID}/translate`,
      payload: { targetLanguage: 'fr' },
    });
    await unauthed.close();
    expect(res.statusCode).toBe(401);
  });

  it('returns 404 when post not found', async () => {
    mockGetPostById.mockResolvedValue(null);
    await app.ready();
    const res = await app.inject({
      method: 'POST', url: `/posts/${POST_ID}/translate`,
      payload: { targetLanguage: 'fr' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 400 for invalid body', async () => {
    await app.ready();
    const res = await app.inject({
      method: 'POST', url: `/posts/${POST_ID}/translate`,
      payload: { targetLanguage: 'fr-too-long-language' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 503 when translation service throws', async () => {
    mockTranslateOnDemand.mockRejectedValue(new Error('Translation service not available'));
    await app.ready();
    const res = await app.inject({
      method: 'POST', url: `/posts/${POST_ID}/translate`,
      payload: { targetLanguage: 'fr' },
    });
    expect(res.statusCode).toBe(503);
  });

  it('returns 500 on unexpected error', async () => {
    mockGetPostById.mockRejectedValue(new Error('DB error'));
    await app.ready();
    const res = await app.inject({
      method: 'POST', url: `/posts/${POST_ID}/translate`,
      payload: { targetLanguage: 'fr' },
    });
    expect(res.statusCode).toBe(500);
  });
});
