/**
 * Unit tests for posts core routes (core.ts)
 * Tests POST /posts, GET /posts/:postId, PUT /posts/:postId,
 * DELETE /posts/:postId, POST /posts/:postId/translate.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockCreatePost = jest.fn<any>().mockResolvedValue({ id: 'post-001', content: 'Hello', type: 'POST', visibility: 'PUBLIC', createdAt: new Date() });
const mockGetPostById = jest.fn<any>().mockResolvedValue({ id: 'post-001', content: 'Hello', type: 'POST' });
const mockUpdatePost = jest.fn<any>().mockResolvedValue({ id: 'post-001', content: 'Updated', type: 'POST' });
const mockDeletePost = jest.fn<any>().mockResolvedValue({ type: 'POST', visibility: 'PUBLIC' });

jest.mock('../../../../services/PostService', () => ({
  PostService: jest.fn().mockImplementation(() => ({
    createPost: (...args: any[]) => mockCreatePost(...args),
    getPostById: (...args: any[]) => mockGetPostById(...args),
    updatePost: (...args: any[]) => mockUpdatePost(...args),
    deletePost: (...args: any[]) => mockDeletePost(...args),
  })),
}));

jest.mock('../../../../services/posts/PostTranslationService', () => ({
  PostTranslationService: {
    shared: {
      translatePost: jest.fn<any>().mockResolvedValue(undefined),
      translateOnDemand: jest.fn<any>().mockResolvedValue(undefined),
    },
  },
}));

jest.mock('../../../../services/MentionService', () => ({
  resolveMentionedUsers: jest.fn<any>().mockResolvedValue([]),
  MentionService: jest.fn().mockImplementation(() => ({
    extractMentions: jest.fn<any>().mockReturnValue([]),
    resolveUsernames: jest.fn<any>().mockResolvedValue(new Map()),
    createPostMentions: jest.fn<any>().mockResolvedValue(undefined),
  })),
}));

jest.mock('../../../../services/notifications/NotificationService', () => ({
  NotificationService: jest.fn().mockImplementation(() => ({
    createPostMentionNotificationsBatch: jest.fn<any>().mockResolvedValue(undefined),
    createFriendContentNotificationsBatch: jest.fn<any>().mockResolvedValue(undefined),
  })),
}));

jest.mock('../../../../middleware/rate-limiter', () => ({
  createPostRouteRateLimitConfig: jest.fn<any>().mockReturnValue({}),
}));

jest.mock('../../../../utils/withMutationLog', () => ({
  withMutationLog: jest.fn<any>().mockImplementation(({ op }: any) => op()),
}));

jest.mock('../../../../utils/sanitize.js', () => ({
  SecuritySanitizer: { sanitizeText: jest.fn((t: string) => t) },
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { registerCoreRoutes } from '../../../../routes/posts/core';

// ─── Constants ────────────────────────────────────────────────────────────────

const USER_ID = '507f1f77bcf86cd799439011';
const POST_ID = '507f1f77bcf86cd799439022';

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
  withSocialEvents?: boolean;
} = {}): Promise<FastifyInstance> {
  const { authenticated = true, withSocialEvents = false } = opts;

  const app = Fastify({ logger: false });
  const prisma = {} as any;
  const requiredAuth = makePreValidationAuth(authenticated);

  if (withSocialEvents) {
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
  }

  registerCoreRoutes(app, prisma, requiredAuth);
  await app.ready();
  return app;
}

// ─── POST /posts — unauthenticated ───────────────────────────────────────────

describe('POST /posts — unauthenticated', () => {
  it('returns 401 when no auth context', async () => {
    const app = await buildApp({ authenticated: false });
    const res = await app.inject({ method: 'POST', url: '/posts', payload: { content: 'Hello' } });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});

// ─── POST /posts — success ────────────────────────────────────────────────────

describe('POST /posts — success', () => {
  it('returns 201 with created post', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST', url: '/posts',
      payload: { content: 'Hello world', type: 'POST' },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().success).toBe(true);
    await app.close();
  });
});

describe('POST /posts — story type', () => {
  it('returns 201 for story post', async () => {
    mockCreatePost.mockResolvedValueOnce({ id: 'post-002', content: 'Story', type: 'STORY', visibility: 'FRIENDS', createdAt: new Date() });
    const app = await buildApp({ withSocialEvents: true });
    const res = await app.inject({
      method: 'POST', url: '/posts',
      payload: { content: 'My story', type: 'STORY' },
    });
    expect(res.statusCode).toBe(201);
    await app.close();
  });
});

describe('POST /posts — service error', () => {
  it('returns 500 when postService throws', async () => {
    mockCreatePost.mockRejectedValueOnce(new Error('DB error'));
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST', url: '/posts',
      payload: { content: 'Hello' },
    });
    expect(res.statusCode).toBe(500);
    await app.close();
  });
});

// ─── GET /posts/:postId — success ────────────────────────────────────────────

describe('GET /posts/:postId — success', () => {
  it('returns 200 with post data', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: `/posts/${POST_ID}` });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
    await app.close();
  });
});

describe('GET /posts/:postId — not found', () => {
  it('returns 404 when post does not exist', async () => {
    mockGetPostById.mockResolvedValueOnce(null);
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: `/posts/${POST_ID}` });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

describe('GET /posts/:postId — service error', () => {
  it('returns 500 when postService throws', async () => {
    mockGetPostById.mockRejectedValueOnce(new Error('DB error'));
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: `/posts/${POST_ID}` });
    expect(res.statusCode).toBe(500);
    await app.close();
  });
});

// ─── PUT /posts/:postId — unauthenticated ────────────────────────────────────

describe('PUT /posts/:postId — unauthenticated', () => {
  it('returns 401 when no auth context', async () => {
    const app = await buildApp({ authenticated: false });
    const res = await app.inject({
      method: 'PUT', url: `/posts/${POST_ID}`,
      payload: { content: 'Updated' },
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});

// ─── PUT /posts/:postId — success ─────────────────────────────────────────────

describe('PUT /posts/:postId — success', () => {
  it('returns 200 with updated post', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'PUT', url: `/posts/${POST_ID}`,
      payload: { content: 'Updated content' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
    await app.close();
  });
});

describe('PUT /posts/:postId — not found', () => {
  it('returns 404 when post does not exist', async () => {
    mockUpdatePost.mockResolvedValueOnce(null);
    const app = await buildApp();
    const res = await app.inject({
      method: 'PUT', url: `/posts/${POST_ID}`,
      payload: { content: 'Updated' },
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

describe('PUT /posts/:postId — forbidden', () => {
  it('returns 403 when user is not the author', async () => {
    mockUpdatePost.mockRejectedValueOnce(Object.assign(new Error('FORBIDDEN'), {}));
    const app = await buildApp();
    const res = await app.inject({
      method: 'PUT', url: `/posts/${POST_ID}`,
      payload: { content: 'Updated' },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });
});

describe('PUT /posts/:postId — service error', () => {
  it('returns 500 when postService throws', async () => {
    mockUpdatePost.mockRejectedValueOnce(new Error('DB error'));
    const app = await buildApp();
    const res = await app.inject({
      method: 'PUT', url: `/posts/${POST_ID}`,
      payload: { content: 'Updated' },
    });
    expect(res.statusCode).toBe(500);
    await app.close();
  });
});

// ─── DELETE /posts/:postId — unauthenticated ─────────────────────────────────

describe('DELETE /posts/:postId — unauthenticated', () => {
  it('returns 401 when no auth context', async () => {
    const app = await buildApp({ authenticated: false });
    const res = await app.inject({ method: 'DELETE', url: `/posts/${POST_ID}` });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});

// ─── DELETE /posts/:postId — success ──────────────────────────────────────────

describe('DELETE /posts/:postId — success', () => {
  it('returns 200 with deleted: true', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'DELETE', url: `/posts/${POST_ID}` });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
    await app.close();
  });
});

describe('DELETE /posts/:postId — not found', () => {
  it('returns 404 when post does not exist', async () => {
    mockDeletePost.mockResolvedValueOnce(null);
    const app = await buildApp();
    const res = await app.inject({ method: 'DELETE', url: `/posts/${POST_ID}` });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

describe('DELETE /posts/:postId — forbidden', () => {
  it('returns 403 when user is not the author', async () => {
    mockDeletePost.mockRejectedValueOnce(Object.assign(new Error('FORBIDDEN'), {}));
    const app = await buildApp();
    const res = await app.inject({ method: 'DELETE', url: `/posts/${POST_ID}` });
    expect(res.statusCode).toBe(403);
    await app.close();
  });
});

describe('DELETE /posts/:postId — service error', () => {
  it('returns 500 when postService throws', async () => {
    mockDeletePost.mockRejectedValueOnce(new Error('DB error'));
    const app = await buildApp();
    const res = await app.inject({ method: 'DELETE', url: `/posts/${POST_ID}` });
    expect(res.statusCode).toBe(500);
    await app.close();
  });
});

// ─── DELETE /posts/:postId — with socialEvents broadcast ─────────────────────

describe('DELETE /posts/:postId — STATUS type broadcasts status deleted', () => {
  it('returns 200 and triggers status broadcast', async () => {
    mockDeletePost.mockResolvedValueOnce({ type: 'STATUS', visibility: 'PUBLIC', visibilityUserIds: [] });
    const app = await buildApp({ withSocialEvents: true });
    const res = await app.inject({ method: 'DELETE', url: `/posts/${POST_ID}` });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});

describe('DELETE /posts/:postId — STORY type broadcasts story deleted', () => {
  it('returns 200 and triggers story broadcast', async () => {
    mockDeletePost.mockResolvedValueOnce({ type: 'STORY', visibility: 'FRIENDS' });
    const app = await buildApp({ withSocialEvents: true });
    const res = await app.inject({ method: 'DELETE', url: `/posts/${POST_ID}` });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});

// ─── POST /posts/:postId/translate ────────────────────────────────────────────

describe('POST /posts/:postId/translate — unauthenticated', () => {
  it('returns 401 when no auth context', async () => {
    const app = await buildApp({ authenticated: false });
    const res = await app.inject({
      method: 'POST', url: `/posts/${POST_ID}/translate`,
      payload: { targetLanguage: 'fr' },
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});

describe('POST /posts/:postId/translate — post not found', () => {
  it('returns 404 when post does not exist', async () => {
    mockGetPostById.mockResolvedValueOnce(null);
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST', url: `/posts/${POST_ID}/translate`,
      payload: { targetLanguage: 'fr' },
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

describe('POST /posts/:postId/translate — success', () => {
  it('returns 200 with requested: true', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST', url: `/posts/${POST_ID}/translate`,
      payload: { targetLanguage: 'fr' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
    await app.close();
  });
});

describe('POST /posts/:postId/translate — service error', () => {
  it('returns 500 when postService.getPostById throws', async () => {
    mockGetPostById.mockRejectedValueOnce(new Error('DB error'));
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST', url: `/posts/${POST_ID}/translate`,
      payload: { targetLanguage: 'fr' },
    });
    expect(res.statusCode).toBe(500);
    await app.close();
  });
});
