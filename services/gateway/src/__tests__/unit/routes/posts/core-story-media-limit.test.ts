/**
 * #13590 — PUT /posts/:postId : le plafond de mediaIds suit le type STOCKÉ du post (STORY : 200, autres : 10).
 * Suite à part : core.test.ts est dans la dette héritée de taille, on n'y ajoute plus.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';

jest.mock('../../../../services/PostService', () => ({
  PostService: jest.fn().mockImplementation(() => ({
    updatePost: async () => ({ id: 'post-001', content: 'Updated', type: 'POST' }),
  })),
}));

jest.mock('../../../../services/posts/PostTranslationService', () => ({
  PostTranslationService: { shared: { translatePost: jest.fn<any>().mockResolvedValue(undefined), translateOnDemand: jest.fn<any>().mockResolvedValue(undefined) } },
}));

jest.mock('../../../../services/MentionService', () => ({
  resolveMentionedUsers: jest.fn<any>().mockResolvedValue([]),
  MentionService: jest.fn().mockImplementation(() => ({
    extractMentions: () => [],
    resolveUsernames: async () => new Map(),
    createPostMentions: async () => undefined,
  })),
}));

jest.mock('../../../../services/HashtagService', () => ({
  HashtagService: jest.fn().mockImplementation(() => ({
    extractHashtags: () => [],
    createPostHashtags: async () => undefined,
    reconcileRemovedHashtags: async () => undefined,
  })),
}));

jest.mock('../../../../middleware/rate-limiter', () => ({
  createPostRouteRateLimitConfig: jest.fn<any>().mockReturnValue({}),
}));

jest.mock('../../../../utils/withMutationLog', () => ({
  ...(jest.requireActual('../../../../utils/withMutationLog') as object),
  withMutationLog: jest.fn<any>().mockImplementation(({ op }: any) => op()),
  withMutationVerdict: jest.fn<any>().mockImplementation(async ({ op }: any) => ({ result: await op(), replayed: false })),
}));

jest.mock('../../../../utils/sanitize.js', () => ({
  SecuritySanitizer: { sanitizeText: jest.fn((t: string) => t) },
}));

jest.mock('../../../../services/CacheStore', () => ({
  getCacheStore: () => ({ getNativeClient: () => ({ incr: async () => 1, pexpire: async () => 1, pttl: async () => -1 }) }),
}));

import { registerCoreRoutes } from '../../../../routes/posts/core';
import { registerClientMutationIdHook } from '../../../../middleware/clientMutationId';

const USER_ID = '507f1f77bcf86cd799439011';
const POST_ID = '507f1f77bcf86cd799439022';

const requiredAuth = async (req: FastifyRequest) => {
  (req as any).authContext = {
    isAuthenticated: true,
    registeredUser: { emailVerifiedAt: new Date(), id: USER_ID, role: 'USER' },
  };
};

async function buildApp(storedType: string): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  const prisma = { post: { findUnique: async () => ({ type: storedType }), findFirst: async () => null } } as any;
  app.decorate('notificationService', {
    createPostMentionNotificationsBatch: async () => undefined,
    createFriendContentNotificationsBatch: async () => undefined,
  } as any);
  registerClientMutationIdHook(app);
  registerCoreRoutes(app, prisma, requiredAuth);
  await app.ready();
  return app;
}

describe('PUT /posts/:postId — mediaIds au-delà de dix (#13590)', () => {
  const mediaIds = Array.from({ length: 11 }, (_, i) => i.toString(16).padStart(24, '0'));

  it('un post non STORY garde dix médias : 400 qui nomme la borne', async () => {
    const app = await buildApp('POST');
    const res = await app.inject({ method: 'PUT', url: `/posts/${POST_ID}`, payload: { mediaIds } });
    expect(res.statusCode).toBe(400);
    expect(res.json().limit).toBe(10);
    await app.close();
  });

  it('une STORY accepte onze médias à l\'édition', async () => {
    const app = await buildApp('STORY');
    const res = await app.inject({ method: 'PUT', url: `/posts/${POST_ID}`, payload: { mediaIds } });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});
