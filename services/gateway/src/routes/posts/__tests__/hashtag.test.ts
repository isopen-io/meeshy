/**
 * GET /posts/hashtag/:tag + GET /hashtags/trending.
 *
 * Design : docs/superpowers/specs/2026-08-03-post-hashtags-and-rich-content-design.md §3
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify from 'fastify';
import { registerHashtagRoutes } from '../hashtag';

function auth(userId = 'user-abc') {
  return async (request: unknown) => {
    (request as Record<string, unknown>)['authContext'] = {
      type: 'registered', registeredUser: { id: userId, username: 'tester' },
      userId, hasFullAccess: true,
    };
  };
}

async function buildApp(prisma: unknown, userId = 'user-abc') {
  const app = Fastify();
  registerHashtagRoutes(app, prisma as import('@meeshy/shared/prisma/client').PrismaClient, auth(userId));
  await app.ready();
  return app;
}

function basePrisma(overrides: Record<string, unknown> = {}) {
  return {
    hashtag: {
      findUnique: jest.fn<() => Promise<unknown>>().mockResolvedValue(null),
      findMany: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([]),
    },
    postHashtag: {
      findMany: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([]),
    },
    post: {
      findMany: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([]),
    },
    communityMember: {
      findMany: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([]),
    },
    ...overrides,
  } as unknown as import('@meeshy/shared/prisma/client').PrismaClient & {
    hashtag: { findUnique: jest.Mock; findMany: jest.Mock };
    postHashtag: { findMany: jest.Mock };
    post: { findMany: jest.Mock };
    communityMember: { findMany: jest.Mock };
  };
}

describe('GET /posts/hashtag/:tag', () => {
  it('test_hashtag_unknownTag_returnsEmptyArray_not404', async () => {
    const prisma = basePrisma();
    const app = await buildApp(prisma);
    const res = await app.inject({ method: 'GET', url: '/posts/hashtag/inconnu' });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual([]);
    await app.close();
  });

  it('test_hashtag_normalizesTagParamToLowercase', async () => {
    const prisma = basePrisma();
    const app = await buildApp(prisma);
    await app.inject({ method: 'GET', url: '/posts/hashtag/Paris' });
    expect(prisma.hashtag.findUnique).toHaveBeenCalledWith({ where: { tag: 'paris' } });
    await app.close();
  });

  it('test_hashtag_returnsPostsAndReelsTaggedWithIt_mostRecentFirst', async () => {
    const prisma = basePrisma({
      hashtag: { findUnique: jest.fn<() => Promise<unknown>>().mockResolvedValue({ id: 'h1', tag: 'paris' }) },
      postHashtag: {
        findMany: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([{ postId: 'p1' }, { postId: 'p2' }]),
      },
      post: {
        findMany: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([
          { id: 'p1', type: 'POST', visibility: 'PUBLIC', content: 'Belle #paris' },
          { id: 'p2', type: 'REEL', visibility: 'PUBLIC', content: 'Reel #paris' },
        ]),
      },
    });
    const app = await buildApp(prisma);
    const res = await app.inject({ method: 'GET', url: '/posts/hashtag/paris' });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.map((p: { id: string }) => p.id)).toEqual(['p1', 'p2']);
    expect(res.json().pagination).toEqual({ limit: 20, hasMore: false, nextCursor: null });
    await app.close();
  });

  it('test_hashtag_scopesPostTypeToPostAndReel', async () => {
    const prisma = basePrisma({
      hashtag: { findUnique: jest.fn<() => Promise<unknown>>().mockResolvedValue({ id: 'h1', tag: 'paris' }) },
      postHashtag: { findMany: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([{ postId: 'p1' }]) },
    });
    const app = await buildApp(prisma);
    await app.inject({ method: 'GET', url: '/posts/hashtag/paris' });
    expect(prisma.post.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ type: { in: ['POST', 'REEL'] } }),
    }));
    await app.close();
  });

  it('test_hashtag_neverExposesFriendsOnlyOrPrivateVisibility', async () => {
    const prisma = basePrisma({
      hashtag: { findUnique: jest.fn<() => Promise<unknown>>().mockResolvedValue({ id: 'h1', tag: 'paris' }) },
      postHashtag: { findMany: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([{ postId: 'p1' }]) },
    });
    const app = await buildApp(prisma);
    await app.inject({ method: 'GET', url: '/posts/hashtag/paris' });
    const where = (prisma.post.findMany as jest.Mock).mock.calls[0][0].where;
    const visibilitiesInOr = where.OR.map((clause: Record<string, unknown>) => clause.visibility).filter(Boolean);
    expect(visibilitiesInOr).toEqual(['PUBLIC', 'COMMUNITY']);
    await app.close();
  });

  it('test_hashtag_unauthenticated_returns401', async () => {
    const prisma = basePrisma();
    const app = Fastify();
    registerHashtagRoutes(app, prisma as any, async () => {
      throw Object.assign(new Error('unauthenticated'), { statusCode: 401 });
    });
    await app.ready();
    const res = await app.inject({ method: 'GET', url: '/posts/hashtag/paris' });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});

describe('GET /hashtags/trending', () => {
  it('test_trending_returnsHashtagsOrderedByUsageCountDescending', async () => {
    const prisma = basePrisma({
      hashtag: {
        findMany: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([
          { tag: 'paris', usageCount: 42 },
          { tag: 'lyon', usageCount: 10 },
        ]),
      },
    });
    const app = await buildApp(prisma);
    const res = await app.inject({ method: 'GET', url: '/hashtags/trending' });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual([{ tag: 'paris', usageCount: 42 }, { tag: 'lyon', usageCount: 10 }]);
    expect(prisma.hashtag.findMany).toHaveBeenCalledWith(expect.objectContaining({ orderBy: { usageCount: 'desc' } }));
    await app.close();
  });

  it('test_trending_defaultsLimitTo20', async () => {
    const prisma = basePrisma();
    const app = await buildApp(prisma);
    await app.inject({ method: 'GET', url: '/hashtags/trending' });
    expect(prisma.hashtag.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 20 }));
    await app.close();
  });

  it('test_trending_respectsExplicitLimit', async () => {
    const prisma = basePrisma();
    const app = await buildApp(prisma);
    await app.inject({ method: 'GET', url: '/hashtags/trending?limit=5' });
    expect(prisma.hashtag.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 5 }));
    await app.close();
  });

  it('test_trending_rejectsLimitAboveMax', async () => {
    const prisma = basePrisma();
    const app = await buildApp(prisma);
    const res = await app.inject({ method: 'GET', url: '/hashtags/trending?limit=999' });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});
