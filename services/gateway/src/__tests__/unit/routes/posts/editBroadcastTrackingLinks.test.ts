/**
 * #9073 — l'édition d'un post recalcule sa carte de liens suivis ; la diffusion
 * socket de `PUT /posts/:postId` doit HISSER cette carte (`trackingLinks`),
 * comme la création — sinon l'audience garde l'ancienne carte jusqu'au
 * prochain fetch.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { type FastifyRequest } from 'fastify';

const mockUpdatePost = jest.fn<(...args: unknown[]) => Promise<unknown>>();

jest.mock('../../../../services/PostService', () => ({
  PostService: jest.fn().mockImplementation(() => ({
    updatePost: (...args: unknown[]) => mockUpdatePost(...args),
  })),
}));

jest.mock('../../../../services/posts/PostTranslationService', () => ({
  PostTranslationService: { shared: { translatePost: jest.fn(), translateOnDemand: jest.fn() } },
}));

jest.mock('../../../../services/MentionService', () => ({
  resolveMentionedUsers: jest.fn(async () => []),
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
  createPostRouteRateLimitConfig: jest.fn(() => ({})),
}));

jest.mock('../../../../utils/withMutationLog', () => ({
  ...(jest.requireActual('../../../../utils/withMutationLog') as object),
  withMutationLog: jest.fn(({ op }: { op: () => unknown }) => op()),
}));

jest.mock('../../../../utils/sanitize.js', () => ({
  SecuritySanitizer: { sanitizeText: jest.fn((t: string) => t) },
}));

jest.mock('../../../../services/CacheStore', () => ({
  getCacheStore: () => ({
    getNativeClient: () => ({ incr: async () => 1, pexpire: async () => 1, pttl: async () => -1 }),
  }),
}));

import { registerCoreRoutes } from '../../../../routes/posts/core';

const USER_ID = '507f1f77bcf86cd799439011';
const POST_ID = '507f1f77bcf86cd799439022';

async function buildApp() {
  const app = Fastify({ logger: false });
  const broadcastPostUpdated = jest.fn(async (_post: unknown, _authorId: string) => undefined);
  app.decorate('notificationService', {
    createPostMentionNotificationsBatch: jest.fn(async () => undefined),
    createFriendContentNotificationsBatch: jest.fn(async () => undefined),
  } as never);
  app.decorate('socialEvents', {
    broadcastPostUpdated,
    broadcastStoryUpdated: jest.fn(async () => undefined),
    broadcastStatusUpdated: jest.fn(async () => undefined),
  } as never);
  const requiredAuth = async (req: FastifyRequest) => {
    (req as unknown as { authContext: unknown }).authContext = {
      isAuthenticated: true,
      registeredUser: { emailVerifiedAt: new Date(), id: USER_ID, role: 'USER' },
    };
  };
  registerCoreRoutes(app, {} as never, requiredAuth as never);
  await app.ready();
  return { app, broadcastPostUpdated };
}

describe('PUT /posts/:postId — carte de liens suivis (#9073)', () => {
  it('hisse la carte recalculée `trackingLinks` sur la diffusion socket de l’édition', async () => {
    const trackingLinks = [{ url: 'https://new.example', token: 'NEW' }];
    mockUpdatePost.mockResolvedValueOnce({
      id: POST_ID, type: 'POST', content: 'https://new.example', visibility: 'PUBLIC',
      metadata: { trackingLinks }, createdAt: new Date(),
    });
    const { app, broadcastPostUpdated } = await buildApp();

    const res = await app.inject({ method: 'PUT', url: `/posts/${POST_ID}`, payload: { content: 'https://new.example' } });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.metadata).toEqual({ trackingLinks });
    expect(broadcastPostUpdated).toHaveBeenCalledWith(expect.objectContaining({ trackingLinks }), USER_ID);
    await app.close();
  });
});
