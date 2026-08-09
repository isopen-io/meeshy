/**
 * Aimer un post suit l'audience d'INTERACTION du post.
 *
 * `POST`/`DELETE /posts/:postId/like` passent par `PostService.likePost` /
 * `unlikePost`, qui ne vérifient QUE l'existence et le non-effacement du post
 * (`PostReactionService.addReaction` fait de même). Aucune des deux ne consulte
 * `Post.visibility` : connaître un `postId` suffisait à poser une réaction
 * persistée sur un post restreint, à peser dans ses agrégats et à notifier son
 * auteur.
 *
 * Même défaut, même verdict et même refus indistinct (404) que le jumeau
 * socket `post:reaction-add` — les deux chemins doivent répondre pareil, sinon
 * l'ACL dépend du transport.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockLikePost = jest.fn<any>().mockResolvedValue({
  id: 'post-001', type: 'POST', authorId: 'author-1', likeCount: 1, reactionSummary: { '❤️': 1 },
});
const mockUnlikePost = jest.fn<any>().mockResolvedValue({
  id: 'post-001', type: 'POST', authorId: 'author-1', likeCount: 0, reactionSummary: {},
});

jest.mock('../../../../services/PostService', () => ({
  PostService: jest.fn().mockImplementation(() => ({
    likePost: (...args: any[]) => mockLikePost(...args),
    unlikePost: (...args: any[]) => mockUnlikePost(...args),
    getPostById: jest.fn<any>().mockResolvedValue(null),
  })),
}));

jest.mock('../../../../services/MediaService', () => ({
  MediaService: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../../../../services/MentionService', () => ({
  resolveMentionedUsers: jest.fn<any>().mockResolvedValue([]),
}));

jest.mock('../../../../services/TrackingLinkService', () => ({
  resolveFrontendBaseUrl: jest.fn<any>().mockReturnValue('https://app.example.com'),
  TrackingLinkService: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../../../../middleware/rate-limiter', () => ({
  createPostRouteRateLimitConfig: jest.fn<any>().mockReturnValue({}),
}));

jest.mock('../../../../utils/withMutationLog', () => ({
  withMutationLog: jest.fn<any>().mockImplementation(({ op }: any) => op()),
}));

import { registerInteractionRoutes } from '../../../../routes/posts/interactions';

// ─── Constants ────────────────────────────────────────────────────────────────

const USER_ID = '507f1f77bcf86cd799439011';
const AUTHOR_ID = '507f1f77bcf86cd7994390aa';
const POST_ID = '507f1f77bcf86cd799439022';

// ─── Harness ──────────────────────────────────────────────────────────────────

function acl(visibility: string, visibilityUserIds: string[] = [], authorId = AUTHOR_ID) {
  return { authorId, visibility, visibilityUserIds };
}

function makePrisma(opts: { post?: unknown; isFriend?: boolean; isDirectContact?: boolean } = {}) {
  return {
    post: {
      findFirst: jest.fn<any>().mockResolvedValue(opts.post === undefined ? acl('PUBLIC') : opts.post),
      update: jest.fn<any>().mockResolvedValue({}),
      updateMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
    },
    postComment: { findFirst: jest.fn<any>().mockResolvedValue(null) },
    postImpression: { create: jest.fn<any>(), createMany: jest.fn<any>() },
    friendRequest: { findFirst: jest.fn<any>().mockResolvedValue(opts.isFriend ? { id: 'fr-1' } : null) },
    communityMember: { findMany: jest.fn<any>().mockResolvedValue([]), findFirst: jest.fn<any>().mockResolvedValue(null) },
    participant: {
      findMany: jest.fn<any>().mockResolvedValue(opts.isDirectContact ? [{ conversationId: 'conv-1' }] : []),
      findFirst: jest.fn<any>().mockResolvedValue(opts.isDirectContact ? { id: 'pt-1' } : null),
    },
  } as any;
}

async function buildApp(prisma: any): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate('prisma', prisma);
  app.decorate('notificationService', null as any);
  const requiredAuth = async (req: FastifyRequest) => {
    (req as any).authContext = {
      isAuthenticated: true,
      registeredUser: { id: USER_ID, role: 'USER', username: 'alice' },
    };
  };
  registerInteractionRoutes(app, prisma, requiredAuth);
  await app.ready();
  return app;
}

beforeEach(() => {
  mockLikePost.mockClear();
  mockUnlikePost.mockClear();
});

// ─── POST /posts/:postId/like ─────────────────────────────────────────────────

describe('POST /posts/:postId/like — aimer suit l’audience d’INTERACTION', () => {
  it('refuse un tiers sur un post PRIVATE, et n’écrit aucune réaction', async () => {
    const app = await buildApp(makePrisma({ post: acl('PRIVATE') }));

    const res = await app.inject({ method: 'POST', url: `/posts/${POST_ID}/like`, payload: {} });

    expect(res.statusCode).toBe(404);
    expect(res.json().code).toBe('POST_NOT_FOUND');
    expect(mockLikePost).not.toHaveBeenCalled();
    await app.close();
  });

  it('refuse un tiers absent de la liste ONLY', async () => {
    const app = await buildApp(makePrisma({ post: acl('ONLY', [AUTHOR_ID]) }));

    const res = await app.inject({ method: 'POST', url: `/posts/${POST_ID}/like`, payload: {} });

    expect(res.statusCode).toBe(404);
    expect(mockLikePost).not.toHaveBeenCalled();
    await app.close();
  });

  it('refuse un contact DM non-ami — voir ne vaut pas interagir, comme sur le chemin socket', async () => {
    const app = await buildApp(makePrisma({ post: acl('FRIENDS'), isFriend: false, isDirectContact: true }));

    const res = await app.inject({ method: 'POST', url: `/posts/${POST_ID}/like`, payload: {} });

    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('admet un ami sur un post FRIENDS', async () => {
    const app = await buildApp(makePrisma({ post: acl('FRIENDS'), isFriend: true }));

    const res = await app.inject({ method: 'POST', url: `/posts/${POST_ID}/like`, payload: {} });

    expect(res.statusCode).toBe(200);
    expect(mockLikePost).toHaveBeenCalled();
    await app.close();
  });

  it('admet l’auteur sur son propre post PRIVATE', async () => {
    const app = await buildApp(makePrisma({ post: acl('PRIVATE', [], USER_ID) }));

    const res = await app.inject({ method: 'POST', url: `/posts/${POST_ID}/like`, payload: {} });

    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it('refuse quand le post n’existe pas ou est supprimé', async () => {
    const app = await buildApp(makePrisma({ post: null }));

    const res = await app.inject({ method: 'POST', url: `/posts/${POST_ID}/like`, payload: {} });

    expect(res.statusCode).toBe(404);
    expect(mockLikePost).not.toHaveBeenCalled();
    await app.close();
  });
});

// ─── DELETE /posts/:postId/like ───────────────────────────────────────────────

describe('DELETE /posts/:postId/like — retirer suit la même garde que poser', () => {
  it('refuse un tiers sur un post PRIVATE', async () => {
    const app = await buildApp(makePrisma({ post: acl('PRIVATE') }));

    const res = await app.inject({ method: 'DELETE', url: `/posts/${POST_ID}/like` });

    expect(res.statusCode).toBe(404);
    expect(mockUnlikePost).not.toHaveBeenCalled();
    await app.close();
  });

  it('admet un ami sur un post FRIENDS', async () => {
    const app = await buildApp(makePrisma({ post: acl('FRIENDS'), isFriend: true }));

    const res = await app.inject({ method: 'DELETE', url: `/posts/${POST_ID}/like` });

    expect(res.statusCode).toBe(200);
    expect(mockUnlikePost).toHaveBeenCalled();
    await app.close();
  });
});
