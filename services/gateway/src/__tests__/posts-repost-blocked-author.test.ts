/**
 * POST /posts/:postId/repost — on ne republie ni ne cite le contenu d'un auteur
 * avec qui un blocage existe, dans un sens ou dans l'autre (#14242). La VRAIE
 * garde (`mayRepostSource` → `isBlockedWithContentAuthors`) est exécutée : seul
 * Prisma est doublé.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

const repostPost = jest.fn<(...a: unknown[]) => Promise<unknown>>().mockResolvedValue(null);
jest.mock('../services/PostService', () => ({
  PostService: jest.fn().mockImplementation(() => ({ repostPost })),
}));
jest.mock('../services/MediaService', () => ({ MediaService: jest.fn().mockImplementation(() => ({})) }));
jest.mock('../middleware/rate-limiter', () => ({ createPostRouteRateLimitConfig: jest.fn().mockReturnValue({}) }));
// Un Redis DISPONIBLE pour le plafond d'écriture partagé (son témoin : social-write-rate-limit.test.ts).
jest.mock('../services/CacheStore', () => ({
  getCacheStore: () => ({ getNativeClient: () => ({ incr: async () => 1, pexpire: async () => 1, pttl: async () => -1 }) }),
}));
jest.mock('../services/MentionService', () => ({ resolveMentionedUsers: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([]) }));

const SOURCE_ID = '507f1f77bcf86cd799439011';
const ACTOR = '507f1f77bcf86cd799439001';
const AUTHOR = '507f1f77bcf86cd799439002';

const auth = (req: any, _reply: unknown, done: () => void) => {
  req.authContext = { isAuthenticated: true, registeredUser: { id: ACTOR, username: 'u' } };
  done();
};

async function buildApp(blockedPairs: ReadonlyArray<readonly [string, string]>): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  const source = {
    id: SOURCE_ID, authorId: AUTHOR, type: 'POST', visibility: 'PUBLIC', visibilityUserIds: [] as string[],
    expiresAt: null, deletedAt: null, moderationHiddenAt: null, repostOfId: null, originalRepostOfId: null,
  };
  const prisma = {
    post: {
      findFirst: () => Promise.resolve(source),
      findMany: () => Promise.resolve([]),
    },
    user: {
      findFirst: (args: { where: { OR: Array<{ id: string; blockedUserIds: { has: string } }> } }) =>
        Promise.resolve(args.where.OR.some((c) => blockedPairs.some(([a, b]) => a === c.id && b === c.blockedUserIds.has)) ? { id: 'x' } : null),
    },
  } as unknown as PrismaClient;
  const { registerInteractionRoutes } = await import('../routes/posts/interactions');
  app.register(async (instance) => {
    instance.addHook('preValidation', auth as any);
    registerInteractionRoutes(instance, prisma, auth);
  });
  await app.ready();
  return app;
}

const repost = (app: FastifyInstance, payload: Record<string, unknown>) =>
  app.inject({ method: 'POST', url: `/posts/${SOURCE_ID}/repost`, payload });

describe('POST /posts/:postId/repost — blocage avec l’auteur (#14242)', () => {
  it.each([
    ['l’auteur a bloqué le republieur', [[AUTHOR, ACTOR]] as const],
    ['le republieur a bloqué l’auteur', [[ACTOR, AUTHOR]] as const],
  ])('%s : republier comme citer rend 404 POST_NOT_FOUND, sans rien écrire', async (_label, pairs) => {
    const app = await buildApp(pairs);
    repostPost.mockClear();
    for (const payload of [{}, { isQuote: true, content: 'regardez' }]) {
      const res = await repost(app, payload);
      expect(res.statusCode).toBe(404);
      expect(res.json()).toMatchObject({ success: false, code: 'POST_NOT_FOUND' });
    }
    expect(repostPost).not.toHaveBeenCalled();
    await app.close();
  });

  it('sans blocage, la garde laisse passer jusqu’à l’écriture', async () => {
    const app = await buildApp([]);
    repostPost.mockClear();
    await repost(app, {});
    expect(repostPost).toHaveBeenCalled();
    await app.close();
  });
});
