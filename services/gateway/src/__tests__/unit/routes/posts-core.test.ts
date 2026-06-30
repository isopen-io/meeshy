/**
 * Unit tests for posts/core.ts
 * Tests POST /posts, GET /posts/:postId,
 *       PUT /posts/:postId, DELETE /posts/:postId,
 *       POST /posts/:postId/translate
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeAll, afterAll } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockCreatePost = jest.fn<any>();
const mockGetPostById = jest.fn<any>();
const mockUpdatePost = jest.fn<any>();
const mockDeletePost = jest.fn<any>();

jest.mock('../../../services/PostService', () => ({
  PostService: jest.fn().mockImplementation(() => ({
    createPost: (...a: any[]) => mockCreatePost(...a),
    getPostById: (...a: any[]) => mockGetPostById(...a),
    updatePost: (...a: any[]) => mockUpdatePost(...a),
    deletePost: (...a: any[]) => mockDeletePost(...a),
  })),
}));

const mockExtractMentions = jest.fn<any>().mockReturnValue([]);
const mockResolveUsernames = jest.fn<any>().mockResolvedValue(new Map());
const mockCreatePostMentions = jest.fn<any>().mockResolvedValue(undefined);

jest.mock('../../../services/MentionService', () => ({
  MentionService: jest.fn().mockImplementation(() => ({
    extractMentions: (...a: any[]) => mockExtractMentions(...a),
    resolveUsernames: (...a: any[]) => mockResolveUsernames(...a),
    createPostMentions: (...a: any[]) => mockCreatePostMentions(...a),
  })),
  resolveMentionedUsers: jest.fn<any>().mockResolvedValue([]),
}));

jest.mock('../../../services/notifications/NotificationService', () => ({
  NotificationService: jest.fn().mockImplementation(() => ({
    createPostMentionNotificationsBatch: jest.fn<any>().mockResolvedValue(undefined),
    createFriendContentNotificationsBatch: jest.fn<any>().mockResolvedValue(undefined),
  })),
}));

const mockTranslatePost = jest.fn<any>().mockResolvedValue(undefined);
const mockTranslateOnDemand = jest.fn<any>().mockResolvedValue(undefined);

jest.mock('../../../services/posts/PostTranslationService', () => ({
  PostTranslationService: {
    shared: {
      translatePost: (...a: any[]) => mockTranslatePost(...a),
      translateOnDemand: (...a: any[]) => mockTranslateOnDemand(...a),
    },
  },
}));

jest.mock('../../../middleware/rate-limiter', () => ({
  createPostRouteRateLimitConfig: () => ({}),
}));

jest.mock('../../../utils/withMutationLog', () => ({
  withMutationLog: jest.fn<any>().mockImplementation(({ op }) => op()),
}));

jest.mock('../../../utils/sanitize.js', () => ({
  SecuritySanitizer: { sanitizeText: (s: string) => s },
}));

jest.mock('../../../routes/posts/types', () => ({
  CreatePostSchema: {
    safeParse: (data: any) => {
      if (data?.invalid) return { success: false, error: {} };
      return { success: true, data: { ...data, type: data.type ?? 'POST', visibility: data.visibility ?? 'PUBLIC' } };
    },
  },
  UpdatePostSchema: {
    safeParse: (data: any) => ({ success: true, data }),
  },
  TranslatePostSchema: {
    safeParse: (data: any) => ({
      success: !!(data?.targetLanguage),
      data,
    }),
  },
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { registerCoreRoutes } from '../../../routes/posts/core';

// ─── Constants ────────────────────────────────────────────────────────────────

const USER_ID = '507f1f77bcf86cd799439011';
const POST_ID = 'post-aabbcc';

const MOCK_POST = {
  id: POST_ID,
  content: 'Hello world',
  type: 'POST',
  visibility: 'PUBLIC',
  authorId: USER_ID,
  createdAt: new Date(),
};

// ─── buildApp ─────────────────────────────────────────────────────────────────

async function buildApp({ authenticated = true } = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });

  const requiredAuth = async (req: any, reply: any) => {
    if (!authenticated) {
      return reply.status(401).send({ success: false, error: 'Unauthorized' });
    }
    (req as any).authContext = {
      isAuthenticated: true,
      type: 'user',
      isAnonymous: false,
      userId: USER_ID,
      registeredUser: { id: USER_ID, role: 'USER' },
    };
  };

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

  registerCoreRoutes(app, {} as any, requiredAuth);
  await app.ready();
  return app;
}

// ─── POST /posts ──────────────────────────────────────────────────────────────

describe('POST /posts — not authenticated', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp({ authenticated: false }); });
  afterAll(async () => { await app.close(); });

  it('returns 401 when not authenticated', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/posts',
      payload: { content: 'Hello' },
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('POST /posts — invalid body', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 400 when body is invalid (sentinel: invalid=true)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/posts',
      payload: { invalid: true },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('POST /posts — success', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockCreatePost.mockResolvedValue(MOCK_POST);
    app = await buildApp();
  });
  afterAll(async () => { await app.close(); });

  it('returns 201 with success=true on valid request', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/posts',
      payload: { content: 'Hello world', type: 'POST' },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().success).toBe(true);
  });
});

describe('POST /posts — service error', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockCreatePost.mockRejectedValue(new Error('DB crash'));
    app = await buildApp();
  });
  afterAll(async () => { await app.close(); });

  it('returns 500 on service error', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/posts',
      payload: { content: 'Hello world' },
    });
    expect(res.statusCode).toBe(500);
  });
});

// ─── GET /posts/:postId ───────────────────────────────────────────────────────

describe('GET /posts/:postId — not found', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockGetPostById.mockResolvedValue(null);
    app = await buildApp();
  });
  afterAll(async () => { await app.close(); });

  it('returns 404 when post does not exist', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/posts/${POST_ID}`,
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('GET /posts/:postId — success', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockGetPostById.mockResolvedValue(MOCK_POST);
    app = await buildApp();
  });
  afterAll(async () => { await app.close(); });

  it('returns 200 with success=true', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/posts/${POST_ID}`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });
});

// ─── PUT /posts/:postId ───────────────────────────────────────────────────────

describe('PUT /posts/:postId — not authenticated', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp({ authenticated: false }); });
  afterAll(async () => { await app.close(); });

  it('returns 401 when not authenticated', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `/posts/${POST_ID}`,
      payload: { content: 'Updated' },
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('PUT /posts/:postId — not found', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockUpdatePost.mockResolvedValue(null);
    app = await buildApp();
  });
  afterAll(async () => { await app.close(); });

  it('returns 404 when post does not exist', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `/posts/${POST_ID}`,
      payload: { content: 'Updated' },
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('PUT /posts/:postId — forbidden', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockUpdatePost.mockRejectedValue(new Error('FORBIDDEN'));
    app = await buildApp();
  });
  afterAll(async () => { await app.close(); });

  it('returns 403 when user is not the post author', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `/posts/${POST_ID}`,
      payload: { content: 'Updated' },
    });
    expect(res.statusCode).toBe(403);
  });
});

describe('PUT /posts/:postId — invalid update (422 business rule)', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    const err = new Error('Invalid post update') as Error & { statusCode?: number };
    err.statusCode = 422;
    mockUpdatePost.mockRejectedValue(err);
    app = await buildApp();
  });
  afterAll(async () => { await app.close(); });

  it('returns 400 for 422 business-rule errors', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `/posts/${POST_ID}`,
      payload: { content: 'Updated' },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('PUT /posts/:postId — success', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockUpdatePost.mockResolvedValue({ ...MOCK_POST, content: 'Updated' });
    app = await buildApp();
  });
  afterAll(async () => { await app.close(); });

  it('returns 200 with success=true', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `/posts/${POST_ID}`,
      payload: { content: 'Updated' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });
});

// ─── DELETE /posts/:postId ────────────────────────────────────────────────────

describe('DELETE /posts/:postId — not authenticated', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp({ authenticated: false }); });
  afterAll(async () => { await app.close(); });

  it('returns 401 when not authenticated', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/posts/${POST_ID}`,
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('DELETE /posts/:postId — not found', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockDeletePost.mockResolvedValue(null);
    app = await buildApp();
  });
  afterAll(async () => { await app.close(); });

  it('returns 404 when post does not exist', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/posts/${POST_ID}`,
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('DELETE /posts/:postId — forbidden', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockDeletePost.mockRejectedValue(new Error('FORBIDDEN'));
    app = await buildApp();
  });
  afterAll(async () => { await app.close(); });

  it('returns 403 when user is not the post author', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/posts/${POST_ID}`,
    });
    expect(res.statusCode).toBe(403);
  });
});

describe('DELETE /posts/:postId — success', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockDeletePost.mockResolvedValue({ ...MOCK_POST, deletedAt: new Date() });
    app = await buildApp();
  });
  afterAll(async () => { await app.close(); });

  it('returns 200 with success=true', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/posts/${POST_ID}`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });
});

// ─── POST /posts/:postId/translate ────────────────────────────────────────────

describe('POST /posts/:postId/translate — post not found', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockGetPostById.mockResolvedValue(null);
    app = await buildApp();
  });
  afterAll(async () => { await app.close(); });

  it('returns 404 when post does not exist', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/posts/${POST_ID}/translate`,
      payload: { targetLanguage: 'fr' },
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('POST /posts/:postId/translate — invalid body', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    // getPostById resolves to the post (so we reach the schema check)
    // but TranslatePostSchema requires targetLanguage — omitting it gives success: false
    mockGetPostById.mockResolvedValue(MOCK_POST);
    app = await buildApp();
  });
  afterAll(async () => { await app.close(); });

  it('returns 400 when targetLanguage is missing', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/posts/${POST_ID}/translate`,
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('POST /posts/:postId/translate — translation service unavailable', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockGetPostById.mockResolvedValue(MOCK_POST);
    mockTranslateOnDemand.mockRejectedValue(new Error('service down'));
    app = await buildApp();
  });
  afterAll(async () => { await app.close(); });

  it('returns 503 when translation service throws', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/posts/${POST_ID}/translate`,
      payload: { targetLanguage: 'en' },
    });
    expect(res.statusCode).toBe(503);
  });
});

describe('POST /posts/:postId/translate — success', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockGetPostById.mockResolvedValue(MOCK_POST);
    mockTranslateOnDemand.mockResolvedValue(undefined);
    app = await buildApp();
  });
  afterAll(async () => { await app.close(); });

  it('returns 200 with success=true', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/posts/${POST_ID}/translate`,
      payload: { targetLanguage: 'fr' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });
});
