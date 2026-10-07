/**
 * #9584 — `POST /posts/:postId/like` depuis la carte d'une REPUBLICATION
 * SIMPLE : le like atterrit sur l'original (`resolveInteractionTarget`, vrai
 * module) et la route fait descendre la republication traversée — identifiant
 * et auteur, déjà lus et vérifiés par la résolution — pour qu'elle reçoive son
 * PROPRE crédit.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import Fastify, { FastifyRequest } from 'fastify';

const mockLikePost = jest.fn<any>();

jest.mock('../../../../services/PostService', () => ({
  PostService: jest.fn().mockImplementation(() => ({
    likePost: (...args: any[]) => mockLikePost(...args),
    getPostById: jest.fn<any>(),
  })),
}));
jest.mock('../../../../services/MediaService', () => ({ MediaService: jest.fn().mockImplementation(() => ({})) }));
jest.mock('../../../../services/MentionService', () => ({ resolveMentionedUsers: jest.fn<any>().mockResolvedValue([]) }));
jest.mock('../../../../services/TrackingLinkService', () => ({
  resolveFrontendBaseUrl: jest.fn<any>().mockReturnValue('https://app.example.com'),
  TrackingLinkService: jest.fn().mockImplementation(() => ({})),
}));
jest.mock('../../../../middleware/rate-limiter', () => ({ createPostRouteRateLimitConfig: jest.fn<any>().mockReturnValue({}) }));
jest.mock('../../../../services/CacheStore', () => ({
  getCacheStore: () => ({ getNativeClient: () => ({ incr: async () => 1, pexpire: async () => 1, pttl: async () => -1 }) }),
}));

import { registerInteractionRoutes } from '../../../../routes/posts/interactions';

const READER = '507f1f77bcf86cd799439011';
const AUTHOR = '507f1f77bcf86cd799439044';
const REPOSTER = '507f1f77bcf86cd799439066';
const REPOST = '507f1f77bcf86cd799439022';
const ORIGINAL = '507f1f77bcf86cd799439077';

const row = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  authorId: AUTHOR,
  visibility: 'PUBLIC',
  visibilityUserIds: [] as string[],
  type: 'POST',
  expiresAt: null,
  isQuote: false,
  repostOfId: null,
  originalRepostOfId: null,
  deletedAt: null,
  ...extra,
});

async function like(posts: Record<string, ReturnType<typeof row>>, url: string) {
  const prisma = {
    post: {
      findFirst: jest.fn(({ where }: { where: { id: string } }) => Promise.resolve(posts[where.id] ?? null)),
      findMany: jest.fn<any>().mockResolvedValue([]),
      update: jest.fn<any>().mockResolvedValue({}),
    },
  };
  const app = Fastify({ logger: false });
  app.decorate('prisma', prisma as never);
  const auth = async (req: FastifyRequest) => {
    (req as any).authContext = { isAuthenticated: true, registeredUser: { id: READER, role: 'USER', username: 'alice' } };
  };
  registerInteractionRoutes(app, prisma as never, auth);
  await app.ready();
  const res = await app.inject({ method: 'POST', url, payload: { emoji: '👍' } });
  await app.close();
  return res;
}

beforeEach(() => {
  mockLikePost.mockReset().mockImplementation(async (postId: string) => ({
    ...row(postId),
    likeCount: 1,
    reactionSummary: { '👍': 1 },
    postMentions: [],
  }));
});

describe('POST /posts/:postId/like — par où le like est passé (#9584)', () => {
  it('depuis une republication simple : like posé sur l’original, la republication traversée descend avec son auteur', async () => {
    const res = await like(
      { [REPOST]: row(REPOST, { authorId: REPOSTER, repostOfId: ORIGINAL, originalRepostOfId: ORIGINAL }), [ORIGINAL]: row(ORIGINAL) },
      `/posts/${REPOST}/like`,
    );

    expect(res.statusCode).toBe(200);
    expect(mockLikePost).toHaveBeenCalledWith(ORIGINAL, READER, '👍', { through: { id: REPOST, authorId: REPOSTER } });
  });

  it('sur un post ordinaire : aucune republication traversée', async () => {
    await like({ [ORIGINAL]: row(ORIGINAL) }, `/posts/${ORIGINAL}/like`);

    expect(mockLikePost.mock.calls[0]?.[3]).toEqual({ through: undefined });
  });

  it('sur une citation : le like reste sur la citation, aucune republication nommée', async () => {
    await like(
      { [REPOST]: row(REPOST, { isQuote: true, repostOfId: ORIGINAL, originalRepostOfId: ORIGINAL }), [ORIGINAL]: row(ORIGINAL) },
      `/posts/${REPOST}/like`,
    );

    expect(mockLikePost.mock.calls[0]?.[0]).toBe(REPOST);
    expect(mockLikePost.mock.calls[0]?.[3]).toEqual({ through: undefined });
  });
});
