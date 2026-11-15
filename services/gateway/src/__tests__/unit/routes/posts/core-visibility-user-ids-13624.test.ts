/**
 * #13624 — l'audience d'un post (visibilityUserIds) n'accepte que des ObjectId : 400 VALIDATION_ERROR, jamais un 500 Prisma.
 * Suite à part : core.test.ts est dans la dette héritée de taille, on n'y ajoute plus.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';

jest.mock('../../../../services/PostService', () => ({
  PostService: jest.fn().mockImplementation(() => ({
    updatePost: async () => ({ id: 'post-001', content: 'Updated', type: 'POST' }),
    createPost: async () => ({ id: 'post-001', content: 'Hello', type: 'POST', visibility: 'ONLY', createdAt: new Date() }),
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

import { createLinkSchema } from '../../../../routes/links/types';
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

async function buildApp(storedType = 'POST'): Promise<FastifyInstance> {
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

const FRIEND_ID = '507f1f77bcf86cd799439033';

describe('visibilityUserIds — identifiants d\'audience (#13624)', () => {
  it('PUT : un identifiant non ObjectId est refusé en 400 VALIDATION_ERROR', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'PUT', url: `/posts/${POST_ID}`, payload: { visibility: 'ONLY', visibilityUserIds: [FRIEND_ID, 'pas-un-objectid'] } });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('VALIDATION_ERROR');
    await app.close();
  });

  it('PUT : des ObjectId passent', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'PUT', url: `/posts/${POST_ID}`, payload: { visibility: 'ONLY', visibilityUserIds: [FRIEND_ID] } });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it('POST : un identifiant non ObjectId est refusé en 400 VALIDATION_ERROR', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'POST', url: '/posts', payload: { content: 'Hello', visibility: 'EXCEPT', visibilityUserIds: ['user-1'] } });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('VALIDATION_ERROR');
    await app.close();
  });

  it('POST : des ObjectId passent', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'POST', url: '/posts', payload: { content: 'Hello', visibility: 'ONLY', visibilityUserIds: [FRIEND_ID] } });
    expect(res.statusCode).toBe(201);
    await app.close();
  });
});

describe('createLinkSchema.newConversation.memberIds (#13624)', () => {
  it('refuse un identifiant de membre qui n\'est pas un ObjectId', () => {
    expect(createLinkSchema.safeParse({ newConversation: { title: 'T', memberIds: ['abc'] } }).success).toBe(false);
  });

  it('accepte des ObjectId', () => {
    expect(createLinkSchema.safeParse({ newConversation: { title: 'T', memberIds: [FRIEND_ID] } }).success).toBe(true);
  });
});
