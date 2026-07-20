/**
 * Integration test — comment notification dedup (priority: user_mentioned wins).
 *
 * Replying to a comment WHILE mentioning that comment's author must send the
 * recipient ONLY the higher-priority `user_mentioned` notification, never the
 * lower-priority `comment_reply` on top of it. Same rule for a top-level
 * comment that mentions the post author (post_comment is suppressed).
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

const mockAddComment = jest.fn<() => Promise<unknown>>();
const mockExtractMentions = jest.fn<(content: string) => string[]>();
const mockResolveUsernames = jest.fn<() => Promise<Map<string, { id: string }>>>();
const mockCreateCommentMentions = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockResolveMentionedUsers = jest.fn<() => Promise<unknown[]>>().mockResolvedValue([]);

jest.mock('../../../services/PostCommentService', () => ({
  PostCommentService: jest.fn().mockImplementation(() => ({
    getComments: jest.fn<() => Promise<unknown>>().mockResolvedValue({ items: [], hasMore: false }),
    getReplies: jest.fn<() => Promise<unknown>>().mockResolvedValue({ items: [], hasMore: false }),
    addComment: (...args: unknown[]) => mockAddComment(...(args as [])),
    likeComment: jest.fn(),
    unlikeComment: jest.fn(),
    deleteComment: jest.fn(),
  })),
}));

jest.mock('../../../services/MentionService', () => ({
  resolveMentionedUsers: (...args: unknown[]) => mockResolveMentionedUsers(...(args as [])),
  MentionService: jest.fn().mockImplementation(() => ({
    extractMentions: (...args: unknown[]) => mockExtractMentions(...(args as [string])),
    resolveUsernames: (...args: unknown[]) => mockResolveUsernames(...(args as [])),
    createCommentMentions: (...args: unknown[]) => mockCreateCommentMentions(...(args as [])),
  })),
}));

jest.mock('../../../services/posts/PostTranslationService', () => ({
  PostTranslationService: {
    shared: { translateComment: jest.fn<() => Promise<void>>().mockResolvedValue(undefined) },
  },
}));

jest.mock('../../../services/posts/PostAudioService', () => ({
  PostAudioService: {
    shared: { processPostAudio: jest.fn<() => Promise<void>>().mockResolvedValue(undefined) },
  },
}));

jest.mock('../../../middleware/rate-limiter', () => ({
  createPostRouteRateLimitConfig: jest.fn<() => Record<string, unknown>>().mockReturnValue({}),
}));

jest.mock('../../../utils/withMutationLog', () => ({
  withMutationLog: jest.fn().mockImplementation(({ op }: any) => op()),
}));

const notif = {
  createCommentReplyNotification: jest.fn<() => Promise<unknown>>().mockResolvedValue(null),
  createCommentMentionNotificationsBatch: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  createPostCommentNotification: jest.fn<() => Promise<unknown>>().mockResolvedValue(null),
  createStoryCommentNotificationsBatch: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
};

const prismaPostFindUnique = jest.fn<() => Promise<unknown>>();
const prismaCommentFindUnique = jest.fn<() => Promise<unknown>>();

const prisma = {
  post: { findUnique: prismaPostFindUnique },
  postComment: { findUnique: prismaCommentFindUnique },
} as unknown as PrismaClient;

const COMMENTER_ID = 'user-commenter';

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  (app as any).prisma = prisma;
  (app as any).socialEvents = null;
  (app as any).notificationService = notif;

  const auth = (req: any, _reply: unknown, done: () => void) => {
    req.authContext = { isAuthenticated: true, registeredUser: { id: COMMENTER_ID, username: 'commenter' } };
    done();
  };

  const { registerCommentRoutes } = await import('../comments');
  app.register(async (instance) => {
    instance.addHook('preValidation', auth as any);
    registerCommentRoutes(instance, prisma, auth);
  });

  await app.ready();
  return app;
}

const post = (type: string, authorId: string) => ({
  authorId,
  commentCount: 1,
  type,
  content: 'post body',
  createdAt: new Date('2026-06-20T10:00:00Z'),
  expiresAt: null,
  visibility: 'PUBLIC',
  visibilityUserIds: [],
});

describe('comment notifications — user_mentioned wins over comment_reply/post_comment', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    notif.createCommentReplyNotification.mockClear();
    notif.createCommentMentionNotificationsBatch.mockClear();
    notif.createPostCommentNotification.mockClear();
    notif.createStoryCommentNotificationsBatch.mockClear();
    mockExtractMentions.mockReset().mockReturnValue([]);
    mockResolveUsernames.mockReset().mockResolvedValue(new Map());
    mockResolveMentionedUsers.mockReset().mockResolvedValue([]);
    mockAddComment.mockReset().mockResolvedValue({ id: 'comment-1', content: '', originalLanguage: 'fr' });
    prismaPostFindUnique.mockReset();
    prismaCommentFindUnique.mockReset();
  });

  it('suppresses comment_reply when the reply mentions the parent comment author', async () => {
    mockAddComment.mockResolvedValue({ id: 'reply-1', content: '@bob bravo', originalLanguage: 'fr' });
    prismaPostFindUnique.mockResolvedValue(post('STORY', 'story-owner'));
    prismaCommentFindUnique.mockResolvedValue({ authorId: 'user-bob', content: 'parent text' });
    mockExtractMentions.mockReturnValue(['bob']);
    mockResolveUsernames.mockResolvedValue(new Map([['bob', { id: 'user-bob' }]]));

    const resp = await app.inject({
      method: 'POST',
      url: '/posts/post-1/comments',
      body: { content: '@bob bravo', parentId: 'parent-1' },
    });

    expect(resp.statusCode).toBe(201);
    expect(notif.createCommentMentionNotificationsBatch).toHaveBeenCalledTimes(1);
    expect(notif.createCommentReplyNotification).not.toHaveBeenCalled();
  });

  it('still sends comment_reply when the reply mentions someone other than the parent author', async () => {
    mockAddComment.mockResolvedValue({ id: 'reply-2', content: '@carol bravo', originalLanguage: 'fr' });
    prismaPostFindUnique.mockResolvedValue(post('STORY', 'story-owner'));
    prismaCommentFindUnique.mockResolvedValue({ authorId: 'user-bob', content: 'parent text' });
    mockExtractMentions.mockReturnValue(['carol']);
    mockResolveUsernames.mockResolvedValue(new Map([['carol', { id: 'user-carol' }]]));

    const resp = await app.inject({
      method: 'POST',
      url: '/posts/post-1/comments',
      body: { content: '@carol bravo', parentId: 'parent-1' },
    });

    expect(resp.statusCode).toBe(201);
    expect(notif.createCommentMentionNotificationsBatch).toHaveBeenCalledTimes(1);
    expect(notif.createCommentReplyNotification).toHaveBeenCalledTimes(1);
  });

  it('sends comment_reply when the reply has no mention', async () => {
    mockAddComment.mockResolvedValue({ id: 'reply-3', content: 'bravo', originalLanguage: 'fr' });
    prismaPostFindUnique.mockResolvedValue(post('STORY', 'story-owner'));
    prismaCommentFindUnique.mockResolvedValue({ authorId: 'user-bob', content: 'parent text' });
    mockExtractMentions.mockReturnValue([]);

    const resp = await app.inject({
      method: 'POST',
      url: '/posts/post-1/comments',
      body: { content: 'bravo', parentId: 'parent-1' },
    });

    expect(resp.statusCode).toBe(201);
    expect(notif.createCommentReplyNotification).toHaveBeenCalledTimes(1);
    expect(notif.createCommentMentionNotificationsBatch).not.toHaveBeenCalled();
  });

  it('suppresses post_comment when a top-level comment mentions the post author', async () => {
    mockAddComment.mockResolvedValue({ id: 'top-1', content: '@bob bravo', originalLanguage: 'fr' });
    prismaPostFindUnique.mockResolvedValue(post('POST', 'user-bob'));
    mockExtractMentions.mockReturnValue(['bob']);
    mockResolveUsernames.mockResolvedValue(new Map([['bob', { id: 'user-bob' }]]));

    const resp = await app.inject({
      method: 'POST',
      url: '/posts/post-1/comments',
      body: { content: '@bob bravo' },
    });

    expect(resp.statusCode).toBe(201);
    expect(notif.createCommentMentionNotificationsBatch).toHaveBeenCalledTimes(1);
    expect(notif.createPostCommentNotification).not.toHaveBeenCalled();
  });
});
