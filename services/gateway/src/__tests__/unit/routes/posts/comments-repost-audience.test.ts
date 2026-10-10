/**
 * #9584 — ce qu'un commentaire rangé sous une REPUBLICATION fait partir vers des
 * tiers a pour audience l'INTERSECTION : qui peut lire son fil, donc la
 * republication ET l'original, blocages compris. La republication seule ne
 * suffit pas — son audience peut voir un post dont l'original lui est fermé.
 *
 * Mentions (persistées et notifiées), notification à l'auteur du post, éventail
 * des stories, diffusion temps réel : chacun est témoigné ici, sur le VRAI
 * module d'audience (`postVisibility`) et un graphe d'amitié en mémoire.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import Fastify, { FastifyRequest } from 'fastify';

const mockAddComment = jest.fn<any>();
const mockResolveUsernames = jest.fn<any>();
const mockCreateCommentMentions = jest.fn<any>().mockResolvedValue(undefined);

jest.mock('../../../../services/PostCommentService', () => ({
  PostCommentService: jest.fn().mockImplementation(() => ({
    addComment: (...args: any[]) => mockAddComment(...args),
  })),
}));
jest.mock('../../../../services/posts/PostTranslationService', () => ({
  PostTranslationService: { shared: { translateComment: jest.fn<any>().mockResolvedValue(undefined) } },
}));
jest.mock('../../../../services/posts/PostAudioService', () => ({
  PostAudioService: { shared: { processPostAudio: jest.fn<any>().mockResolvedValue(undefined) } },
}));
jest.mock('../../../../services/engagement/EngagementService', () => ({
  EngagementService: jest.fn().mockImplementation(() => ({ recordActivity: jest.fn<any>().mockResolvedValue(undefined) })),
}));
jest.mock('../../../../services/MentionService', () => ({
  resolveMentionedUsers: jest.fn<any>().mockResolvedValue([]),
  MentionService: jest.fn().mockImplementation(() => ({
    extractMentions: jest.fn<any>().mockReturnValue(['bob']),
    resolveUsernames: (...args: any[]) => mockResolveUsernames(...args),
    createCommentMentions: (...args: any[]) => mockCreateCommentMentions(...args),
  })),
}));
jest.mock('../../../../middleware/rate-limiter', () => ({ createPostRouteRateLimitConfig: jest.fn<any>().mockReturnValue({}) }));
jest.mock('../../../../utils/sanitize.js', () => ({ SecuritySanitizer: { sanitizeText: jest.fn((t: string) => t) } }));

import { registerCommentRoutes } from '../../../../routes/posts/comments';

const COMMENTER = '507f1f77bcf86cd799439011';
const REPOSTER = '507f1f77bcf86cd799439012';
const ROOT_AUTHOR = '507f1f77bcf86cd799439013';
const MENTIONED = '507f1f77bcf86cd799439014';
const REPOST_ID = '507f1f77bcf86cd799439021';
const ROOT_ID = '507f1f77bcf86cd799439022';

type Graph = { readonly friends: ReadonlyArray<readonly [string, string]>; readonly blocks?: ReadonlyArray<readonly [string, string]> };

const pairIn = (pairs: ReadonlyArray<readonly [string, string]>, a: string, b: string) =>
  pairs.some(([x, y]) => (x === a && y === b) || (x === b && y === a));

/** Republication PUBLIQUE d'un original réservé aux AMIS de son auteur. */
function makePrisma(graph: Graph) {
  const rows: Record<string, Record<string, unknown>> = {
    [REPOST_ID]: {
      id: REPOST_ID, authorId: REPOSTER, visibility: 'PUBLIC', visibilityUserIds: [], expiresAt: null, type: 'POST',
      isQuote: false, repostOfId: ROOT_ID, originalRepostOfId: ROOT_ID, commentsDisabled: false, deletedAt: null, commentCount: 1, createdAt: new Date(),
    },
    [ROOT_ID]: {
      id: ROOT_ID, authorId: ROOT_AUTHOR, visibility: 'FRIENDS', visibilityUserIds: [], expiresAt: null, type: 'POST',
      isQuote: false, repostOfId: null, originalRepostOfId: null, commentsDisabled: false, deletedAt: null, commentCount: 0, createdAt: new Date(),
    },
  };
  return {
    post: {
      findFirst: jest.fn(async ({ where }: any) => rows[where.id] ?? null),
      findUnique: jest.fn(async ({ where }: any) => rows[where.id] ?? null),
    },
    postComment: { findFirst: jest.fn<any>().mockResolvedValue(null), findUnique: jest.fn<any>().mockResolvedValue(null) },
    friendRequest: {
      findFirst: jest.fn(async ({ where }: any) => {
        const [first] = where.OR as Array<{ senderId: string; receiverId: string }>;
        return pairIn(graph.friends, first!.senderId, first!.receiverId) ? { id: 'fr' } : null;
      }),
    },
    user: {
      findFirst: jest.fn(async ({ where }: any) => {
        const [side] = where.OR as Array<{ id: string; blockedUserIds: { has: string } }>;
        return pairIn(graph.blocks ?? [], side!.id, side!.blockedUserIds.has) ? { id: side!.id } : null;
      }),
      findUnique: jest.fn<any>().mockResolvedValue({ timezone: 'UTC' }),
    },
    communityMember: { findMany: jest.fn<any>().mockResolvedValue([]), findFirst: jest.fn<any>().mockResolvedValue(null) },
    participant: { findMany: jest.fn<any>().mockResolvedValue([]), findFirst: jest.fn<any>().mockResolvedValue(null) },
    postMention: { findUnique: jest.fn<any>().mockResolvedValue(null) },
    engagementQuota: { updateMany: jest.fn<any>().mockResolvedValue({ count: 1 }) },
  } as any;
}

async function commentUnderRepost(graph: Graph) {
  const prisma = makePrisma(graph);
  const notificationService = {
    createCommentMentionNotificationsBatch: jest.fn<any>().mockResolvedValue(undefined),
    createPostCommentNotification: jest.fn<any>().mockResolvedValue(undefined),
    createCommentReplyNotification: jest.fn<any>().mockResolvedValue(undefined),
    createStoryCommentNotificationsBatch: jest.fn<any>().mockResolvedValue(undefined),
  };
  const broadcastCommentAdded = jest.fn<any>().mockResolvedValue(undefined);
  const app = Fastify({ logger: false });
  app.decorate('prisma', prisma);
  app.decorate('notificationService', notificationService as never);
  app.decorate('socialEvents', { broadcastCommentAdded } as never);
  const auth = async (req: FastifyRequest) => {
    (req as any).authContext = { isAuthenticated: true, isAnonymous: false, type: 'user', userId: COMMENTER, registeredUser: { id: COMMENTER, role: 'USER' } };
  };
  registerCommentRoutes(app, prisma, auth);
  await app.ready();
  const res = await app.inject({ method: 'POST', url: `/posts/${REPOST_ID}/comments`, payload: { content: 'salut @bob' } });
  await app.close();
  return { res, notificationService, broadcastCommentAdded };
}

const COMMENTER_FRIEND_OF_ROOT: readonly [string, string] = [COMMENTER, ROOT_AUTHOR];

beforeEach(() => {
  mockAddComment.mockReset().mockResolvedValue({ id: '507f1f77bcf86cd7994390c1', content: 'salut @bob', authorId: COMMENTER, postId: REPOST_ID, media: [] });
  mockResolveUsernames.mockReset().mockResolvedValue(new Map([['bob', { id: MENTIONED }]]));
  mockCreateCommentMentions.mockClear();
});

describe('un commentaire rangé sous une republication — qui en est prévenu (#9584)', () => {
  it('nominal : un mentionné qui lit la republication ET l’original est mentionné et notifié', async () => {
    const { res, notificationService } = await commentUnderRepost({ friends: [COMMENTER_FRIEND_OF_ROOT, [MENTIONED, ROOT_AUTHOR]] });

    expect(res.statusCode).toBe(201);
    expect(res.body).not.toContain('redirectedFrom');
    expect(res.body).not.toContain(ROOT_ID);
    expect(mockCreateCommentMentions).toHaveBeenCalledWith(expect.any(String), [MENTIONED]);
    expect(notificationService.createCommentMentionNotificationsBatch).toHaveBeenCalledWith(expect.objectContaining({ mentionedUserIds: [MENTIONED] }));
  });

  it('un mentionné qui voit la republication mais pas l’original : ni mention persistée, ni notification', async () => {
    const { res, notificationService } = await commentUnderRepost({ friends: [COMMENTER_FRIEND_OF_ROOT] });

    expect(res.statusCode).toBe(201);
    expect(mockCreateCommentMentions).not.toHaveBeenCalled();
    expect(notificationService.createCommentMentionNotificationsBatch).not.toHaveBeenCalled();
  });

  it('un mentionné bloqué par l’auteur de l’original : rien, même s’il en est l’ami', async () => {
    const { notificationService } = await commentUnderRepost({
      friends: [COMMENTER_FRIEND_OF_ROOT, [MENTIONED, ROOT_AUTHOR]],
      blocks: [[ROOT_AUTHOR, MENTIONED]],
    });

    expect(mockCreateCommentMentions).not.toHaveBeenCalled();
    expect(notificationService.createCommentMentionNotificationsBatch).not.toHaveBeenCalled();
  });

  it('l’auteur de la republication qui ne lit plus l’original n’est pas notifié ; qui le lit, si', async () => {
    const blind = await commentUnderRepost({ friends: [COMMENTER_FRIEND_OF_ROOT] });
    const reading = await commentUnderRepost({ friends: [COMMENTER_FRIEND_OF_ROOT, [REPOSTER, ROOT_AUTHOR]] });

    expect(blind.notificationService.createPostCommentNotification).not.toHaveBeenCalled();
    expect(reading.notificationService.createPostCommentNotification).toHaveBeenCalledWith(
      expect.objectContaining({ postId: REPOST_ID, postAuthorId: REPOSTER }),
    );
  });

  it('l’éventail des stories, dont les destinataires ne se filtrent pas ici, ne part pas', async () => {
    const { notificationService } = await commentUnderRepost({ friends: [COMMENTER_FRIEND_OF_ROOT, [MENTIONED, ROOT_AUTHOR], [REPOSTER, ROOT_AUTHOR]] });

    expect(notificationService.createStoryCommentNotificationsBatch).not.toHaveBeenCalled();
  });

  it('la diffusion temps réel ne part pas vers l’audience de la republication : sa room et son auteur seuls', async () => {
    const { broadcastCommentAdded } = await commentUnderRepost({ friends: [COMMENTER_FRIEND_OF_ROOT] });

    expect(broadcastCommentAdded).toHaveBeenCalledWith(expect.objectContaining({ postId: REPOST_ID }), REPOSTER, 'PRIVATE', []);
  });
});
