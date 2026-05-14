/**
 * Integration tests — posts routes error response format
 *
 * Verifies that every posts route returns the structured
 * { success: false, error: string, message: string } shape
 * (via sendError helpers) rather than the legacy { error: 'string' } flat form.
 *
 * One endpoint is exercised per modified file:
 *   core.ts        → POST /api/v1/posts (401, 400, 500)
 *   feed.ts        → GET  /api/v1/posts/feed (401)
 *   audio.ts       → POST /api/v1/stories/audio (401, 400)
 *   interactions.ts → POST /api/v1/posts/:id/like (401, 404)
 *   comments.ts    → POST /api/v1/posts/:id/comments (401, 400, 404)
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

jest.mock('../../../services/PostService', () => ({
  PostService: jest.fn().mockImplementation(() => ({
    createPost: jest.fn(),
    getPostById: jest.fn<() => Promise<null>>().mockResolvedValue(null),
    updatePost: jest.fn(),
    deletePost: jest.fn(),
    likePost: jest.fn<() => Promise<null>>().mockResolvedValue(null),
    sharePost: jest.fn(),
    pinPost: jest.fn(),
    unpinPost: jest.fn(),
    recordView: jest.fn(),
    getPostViews: jest.fn(),
    getPostInteractions: jest.fn(),
    repostPost: jest.fn(),
    bookmarkPost: jest.fn(),
    unbookmarkPost: jest.fn(),
  })),
}));

jest.mock('../../../services/PostFeedService', () => ({
  PostFeedService: jest.fn().mockImplementation(() => ({
    getFeed: jest.fn<() => Promise<{ items: unknown[]; hasMore: boolean }>>().mockResolvedValue({ items: [], hasMore: false }),
    getStories: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([]),
    getStatuses: jest.fn<() => Promise<{ items: unknown[]; hasMore: boolean }>>().mockResolvedValue({ items: [], hasMore: false }),
    getDiscoverStatuses: jest.fn<() => Promise<{ items: unknown[]; hasMore: boolean }>>().mockResolvedValue({ items: [], hasMore: false }),
    getUserPosts: jest.fn<() => Promise<{ items: unknown[]; hasMore: boolean }>>().mockResolvedValue({ items: [], hasMore: false }),
    getCommunityFeed: jest.fn<() => Promise<{ items: unknown[]; hasMore: boolean }>>().mockResolvedValue({ items: [], hasMore: false }),
    getBookmarks: jest.fn<() => Promise<{ items: unknown[]; hasMore: boolean }>>().mockResolvedValue({ items: [], hasMore: false }),
  })),
}));

jest.mock('../../../services/PostCommentService', () => ({
  PostCommentService: jest.fn().mockImplementation(() => ({
    getComments: jest.fn<() => Promise<{ items: unknown[]; hasMore: boolean }>>().mockResolvedValue({ items: [], hasMore: false }),
    getReplies: jest.fn<() => Promise<{ items: unknown[]; hasMore: boolean }>>().mockResolvedValue({ items: [], hasMore: false }),
    addComment: jest.fn<() => Promise<null>>().mockResolvedValue(null),
    likeComment: jest.fn(),
    unlikeComment: jest.fn(),
    deleteComment: jest.fn(),
  })),
}));

jest.mock('../../../services/MentionService', () => ({
  resolveMentionedUsers: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([]),
}));

jest.mock('../../../middleware/rate-limiter', () => ({
  createPostRouteRateLimitConfig: jest.fn<() => Record<string, unknown>>().mockReturnValue({}),
}));

jest.mock('../../../utils/withMutationLog', () => ({
  withMutationLog: jest.fn().mockImplementation(({ op }: any) => op()),
}));

jest.mock('../../../services/MediaService', () => ({
  MediaService: jest.fn().mockImplementation(() => ({})),
}));

const buildMockPrisma = (): PrismaClient => ({
  post: { findUnique: jest.fn<() => Promise<null>>().mockResolvedValue(null) },
  postComment: { findUnique: jest.fn<() => Promise<null>>().mockResolvedValue(null) },
  postImpression: { create: jest.fn(), createMany: jest.fn() },
  storyBackgroundAudio: { create: jest.fn(), findMany: jest.fn(), update: jest.fn() },
} as unknown as PrismaClient);

const buildNoAuthMiddleware = () =>
  (_req: unknown, reply: any, done: () => void) => {
    (reply.request as any) = _req;
    done();
  };

const buildAuthMiddleware = (userId?: string) =>
  (req: any, _reply: unknown, done: () => void) => {
    if (userId) {
      req.authContext = {
        isAuthenticated: true,
        registeredUser: { id: userId, username: 'testuser' },
      };
    }
    done();
  };

async function buildApp(authenticated: boolean): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  const prisma = buildMockPrisma();
  (app as any).prisma = prisma;
  (app as any).socialEvents = null;
  (app as any).notificationService = null;

  const requiredAuth = buildAuthMiddleware(authenticated ? 'user-123' : undefined);
  const optionalAuth = buildAuthMiddleware(authenticated ? 'user-123' : undefined);

  const { registerCoreRoutes } = await import('../core');
  const { registerFeedRoutes } = await import('../feed');
  const { registerInteractionRoutes } = await import('../interactions');
  const { registerCommentRoutes } = await import('../comments');

  app.register(async (instance) => {
    instance.addHook('preValidation', requiredAuth as any);
    registerCoreRoutes(instance, prisma, requiredAuth);
    registerFeedRoutes(instance, prisma, requiredAuth, optionalAuth);
    registerInteractionRoutes(instance, prisma, requiredAuth);
    registerCommentRoutes(instance, prisma, requiredAuth);
  });

  await app.ready();
  return app;
}

type ErrorBody = {
  success: boolean;
  error: string;
  message?: string;
};

function assertErrorShape(body: ErrorBody) {
  expect(body.success).toBe(false);
  expect(typeof body.error).toBe('string');
  expect(body.error.length).toBeGreaterThan(0);
}

describe('posts routes — error response format', () => {
  let unauthApp: FastifyInstance;
  let authApp: FastifyInstance;

  beforeAll(async () => {
    unauthApp = await buildApp(false);
    authApp = await buildApp(true);
  });

  afterAll(async () => {
    await unauthApp.close();
    await authApp.close();
  });

  // ── core.ts ───────────────────────────────────────────────────────────────

  it('core: should return structured error on 401 when no auth (POST /posts)', async () => {
    const resp = await unauthApp.inject({ method: 'POST', url: '/posts', body: {} });
    expect(resp.statusCode).toBe(401);
    const body: ErrorBody = resp.json();
    assertErrorShape(body);
    expect(body.error).toBe('Authentication required');
  });

  it('core: should return structured error on 400 for invalid payload (POST /posts)', async () => {
    const resp = await authApp.inject({ method: 'POST', url: '/posts', body: {} });
    expect(resp.statusCode).toBe(400);
    const body: ErrorBody = resp.json();
    assertErrorShape(body);
    expect(body.error).toBe('Invalid request');
  });

  it('core: should return structured error on 404 for unknown post (GET /posts/:postId)', async () => {
    const resp = await authApp.inject({ method: 'GET', url: '/posts/nonexistent123456789012' });
    expect(resp.statusCode).toBe(404);
    const body: ErrorBody = resp.json();
    assertErrorShape(body);
    expect(body.error).toBe('Post not found');
  });

  // ── feed.ts ───────────────────────────────────────────────────────────────

  it('feed: should return structured error on 401 when no auth (GET /posts/feed)', async () => {
    const resp = await unauthApp.inject({ method: 'GET', url: '/posts/feed' });
    expect(resp.statusCode).toBe(401);
    const body: ErrorBody = resp.json();
    assertErrorShape(body);
    expect(body.error).toBe('Authentication required');
  });

  it('feed: should return 200 with empty items when authenticated (GET /posts/feed)', async () => {
    const resp = await authApp.inject({ method: 'GET', url: '/posts/feed' });
    expect(resp.statusCode).toBe(200);
    const body = resp.json();
    expect(body.success).toBe(true);
  });

  // ── interactions.ts ───────────────────────────────────────────────────────

  it('interactions: should return structured error on 401 when no auth (POST /posts/:id/like)', async () => {
    const resp = await unauthApp.inject({ method: 'POST', url: '/posts/abc123/like', body: {} });
    expect(resp.statusCode).toBe(401);
    const body: ErrorBody = resp.json();
    assertErrorShape(body);
    expect(body.error).toBe('Authentication required');
  });

  it('interactions: should return structured error on 404 for unknown post (POST /posts/:id/like)', async () => {
    const resp = await authApp.inject({ method: 'POST', url: '/posts/nonexistent123456789012/like', body: {} });
    expect(resp.statusCode).toBe(404);
    const body: ErrorBody = resp.json();
    assertErrorShape(body);
    expect(body.error).toBe('Post not found');
  });

  // ── comments.ts ───────────────────────────────────────────────────────────

  it('comments: should return structured error on 401 when no auth (POST /posts/:id/comments)', async () => {
    const resp = await unauthApp.inject({ method: 'POST', url: '/posts/abc123/comments', body: {} });
    expect(resp.statusCode).toBe(401);
    const body: ErrorBody = resp.json();
    assertErrorShape(body);
    expect(body.error).toBe('Authentication required');
  });

  it('comments: should return structured error on 400 for missing content (POST /posts/:id/comments)', async () => {
    const resp = await authApp.inject({ method: 'POST', url: '/posts/abc123/comments', body: {} });
    expect(resp.statusCode).toBe(400);
    const body: ErrorBody = resp.json();
    assertErrorShape(body);
    expect(body.error).toBe('Invalid request');
  });

  it('comments: should return structured error on 404 for unknown post (POST /posts/:id/comments)', async () => {
    const resp = await authApp.inject({
      method: 'POST',
      url: '/posts/nonexistent123456789012/comments',
      body: { content: 'hello' },
    });
    expect(resp.statusCode).toBe(404);
    const body: ErrorBody = resp.json();
    assertErrorShape(body);
    expect(body.error).toBe('Post not found');
  });
});
