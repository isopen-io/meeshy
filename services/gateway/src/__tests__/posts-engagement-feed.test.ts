/**
 * Route test — GET /posts/feed exposes the denormalized engagement counters.
 *
 * The feed serves raw Post objects (postInclude uses `include`, not `select`,
 * and the route has no Fastify response schema), so every scalar Post field —
 * including postOpenCount / qualifiedViewCount / playCount — must survive in
 * the JSON response. This test guards against a future `select` narrowing that
 * would silently drop the counters.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

const POST_WITH_COUNTERS = {
  id: '507f1f77bcf86cd799439011',
  type: 'REEL',
  content: 'hello',
  postOpenCount: 7,
  qualifiedViewCount: 3,
  playCount: 12,
  viewCount: 99,
  author: { id: 'a1', username: 'author' },
};

jest.mock('../services/PostFeedService', () => ({
  PostFeedService: jest.fn().mockImplementation(() => ({
    getFeed: jest.fn<() => Promise<{ items: unknown[]; hasMore: boolean; nextCursor: string | null }>>()
      .mockResolvedValue({ items: [POST_WITH_COUNTERS], hasMore: false, nextCursor: null }),
  })),
}));

jest.mock('../services/MentionService', () => ({
  resolveMentionedUsers: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([]),
}));

jest.mock('../services/CacheStore', () => ({
  getCacheStore: jest.fn().mockReturnValue({}),
}));

const auth = (req: any, _reply: unknown, done: () => void) => {
  req.authContext = { isAuthenticated: true, registeredUser: { id: 'u1', username: 'u' } };
  done();
};

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  const prisma = {} as unknown as PrismaClient;
  const { registerFeedRoutes } = await import('../routes/posts/feed');
  app.register(async (instance) => {
    instance.addHook('preValidation', auth as any);
    registerFeedRoutes(instance, prisma, auth, auth);
  });
  await app.ready();
  return app;
}

describe('GET /posts/feed — engagement counters passthrough', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns postOpenCount / qualifiedViewCount / playCount on each post', async () => {
    const res = await app.inject({ method: 'GET', url: '/posts/feed' });
    expect(res.statusCode).toBe(200);
    const post = res.json().data[0];
    expect(post.postOpenCount).toBe(7);
    expect(post.qualifiedViewCount).toBe(3);
    expect(post.playCount).toBe(12);
    // viewCount must remain untouched by the engagement work
    expect(post.viewCount).toBe(99);
  });
});
