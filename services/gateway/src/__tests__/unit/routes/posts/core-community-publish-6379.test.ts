/**
 * #6379 — publier DANS une communauté (`communityId`) est réservé à ses membres actifs et à son créateur,
 * dans une communauté vivante. Sans cette garde, n'importe quel compte posait une publication dans le fil
 * d'une communauté privée, que l'onglet Publications sert à ses membres. Même refus pour tous les cas
 * (inconnue, désactivée, privée, publique) : aucun oracle d'existence.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';

const createPostCalls: unknown[][] = [];

jest.mock('../../../../services/PostService', () => ({
  PostService: jest.fn().mockImplementation(() => ({
    updatePost: async () => ({ id: 'post-001', content: 'Updated', type: 'POST' }),
    createPost: async (...args: unknown[]) => { createPostCalls.push(args); return { id: 'post-001', content: 'Hello', type: 'POST', visibility: 'PUBLIC', createdAt: new Date() }; },
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
const COMMUNITY_ID = '507f1f77bcf86cd799439044';

const requiredAuth = async (req: FastifyRequest) => {
  (req as any).authContext = {
    isAuthenticated: true,
    registeredUser: { emailVerifiedAt: new Date(), id: USER_ID, role: 'USER' },
  };
};

type Community = { readonly isPrivate: boolean; readonly createdBy: string } | null;

async function buildApp(options: { readonly community: Community; readonly activeMember: boolean }): Promise<FastifyInstance> {
  createPostCalls.length = 0;
  const app = Fastify({ logger: false });
  const prisma = {
    post: { findUnique: async () => null, findFirst: async () => null },
    community: { findFirst: async () => options.community },
    communityMember: { findFirst: async () => (options.activeMember ? { id: 'm1' } : null) },
  } as any;
  app.decorate('notificationService', {
    createPostMentionNotificationsBatch: async () => undefined,
    createFriendContentNotificationsBatch: async () => undefined,
  } as any);
  registerClientMutationIdHook(app);
  registerCoreRoutes(app, prisma, requiredAuth);
  await app.ready();
  return app;
}

const publish = (app: FastifyInstance, communityId: string) =>
  app.inject({ method: 'POST', url: '/posts', payload: { content: 'Bonjour', visibility: 'COMMUNITY', communityId } });

describe('POST /posts avec communityId — qui publie dans une communauté (#6379)', () => {
  it('un membre actif publie', async () => {
    const app = await buildApp({ community: { isPrivate: true, createdBy: 'someone' }, activeMember: true });
    expect((await publish(app, COMMUNITY_ID)).statusCode).toBe(201);
    expect(createPostCalls).toHaveLength(1);
    await app.close();
  });

  it('le créateur publie, même sans ligne active', async () => {
    const app = await buildApp({ community: { isPrivate: true, createdBy: USER_ID }, activeMember: false });
    expect((await publish(app, COMMUNITY_ID)).statusCode).toBe(201);
    await app.close();
  });

  it('un non-membre d’une communauté PRIVÉE est refusé, et rien n’est écrit', async () => {
    const app = await buildApp({ community: { isPrivate: true, createdBy: 'someone' }, activeMember: false });
    const res = await publish(app, COMMUNITY_ID);
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('COMMUNITY_POST_FORBIDDEN');
    expect(createPostCalls).toHaveLength(0);
    await app.close();
  });

  it('un non-membre d’une communauté PUBLIQUE est refusé aussi', async () => {
    const app = await buildApp({ community: { isPrivate: false, createdBy: 'someone' }, activeMember: false });
    expect((await publish(app, COMMUNITY_ID)).json().code).toBe('COMMUNITY_POST_FORBIDDEN');
    expect(createPostCalls).toHaveLength(0);
    await app.close();
  });

  it('une communauté désactivée ou inconnue rend le MÊME refus', async () => {
    const app = await buildApp({ community: null, activeMember: true });
    const res = await publish(app, COMMUNITY_ID);
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('COMMUNITY_POST_FORBIDDEN');
    await app.close();
  });

  it('un identifiant malformé rend le même refus, jamais un 500', async () => {
    const app = await buildApp({ community: { isPrivate: false, createdBy: 'someone' }, activeMember: true });
    const res = await publish(app, 'pas-un-objectid');
    expect(res.statusCode).toBe(403);
    expect(createPostCalls).toHaveLength(0);
    await app.close();
  });

  it('sans communityId, rien ne change', async () => {
    const app = await buildApp({ community: null, activeMember: false });
    const res = await app.inject({ method: 'POST', url: '/posts', payload: { content: 'Bonjour', visibility: 'PUBLIC' } });
    expect(res.statusCode).toBe(201);
    await app.close();
  });
});
