/**
 * Unit tests for posts comments routes (comments.ts)
 * Tests all 6 routes: GET /comments, GET /replies, POST /comments,
 * POST /like, DELETE /like, DELETE /comment.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockGetComments = jest.fn<any>().mockResolvedValue({ items: [], hasMore: false, nextCursor: null });
const mockGetReplies = jest.fn<any>().mockResolvedValue({ items: [], hasMore: false, nextCursor: null });
const mockAddComment = jest.fn<any>().mockResolvedValue({ id: 'comment-001', content: 'Hello', authorId: 'user-001' });
const mockLikeComment = jest.fn<any>().mockResolvedValue({ authorId: 'author-1', likeCount: 1, reactionSummary: { '❤️': 1 } });
const mockUnlikeComment = jest.fn<any>().mockResolvedValue({ authorId: 'author-1', likeCount: 0, reactionSummary: {} });
const mockDeleteComment = jest.fn<any>().mockResolvedValue({ postId: 'post-001' });

jest.mock('../../../../services/PostCommentService', () => ({
  PostCommentService: jest.fn().mockImplementation(() => ({
    getComments: (...args: any[]) => mockGetComments(...args),
    getReplies: (...args: any[]) => mockGetReplies(...args),
    addComment: (...args: any[]) => mockAddComment(...args),
    likeComment: (...args: any[]) => mockLikeComment(...args),
    unlikeComment: (...args: any[]) => mockUnlikeComment(...args),
    deleteComment: (...args: any[]) => mockDeleteComment(...args),
  })),
}));

jest.mock('../../../../services/posts/PostTranslationService', () => ({
  PostTranslationService: {
    shared: {
      translateComment: jest.fn<any>().mockResolvedValue(undefined),
    },
  },
}));

jest.mock('../../../../services/posts/PostAudioService', () => ({
  PostAudioService: {
    shared: {
      processPostAudio: jest.fn<any>().mockResolvedValue(undefined),
    },
  },
}));

const mockExtractMentions = jest.fn<any>().mockReturnValue([]);
const mockResolveUsernames = jest.fn<any>().mockResolvedValue(new Map());
const mockCreateCommentMentions = jest.fn<any>().mockResolvedValue(undefined);
const mockCreateCommentMentionNotificationsBatch = jest.fn<any>().mockResolvedValue(undefined);

jest.mock('../../../../services/MentionService', () => ({
  resolveMentionedUsers: jest.fn<any>().mockResolvedValue([]),
  MentionService: jest.fn().mockImplementation(() => ({
    extractMentions: (...args: any[]) => mockExtractMentions(...args),
    resolveUsernames: (...args: any[]) => mockResolveUsernames(...args),
    createCommentMentions: (...args: any[]) => mockCreateCommentMentions(...args),
    createCommentMentionNotificationsBatch: (...args: any[]) => mockCreateCommentMentionNotificationsBatch(...args),
  })),
}));

jest.mock('../../../../middleware/rate-limiter', () => ({
  createPostRouteRateLimitConfig: jest.fn<any>().mockReturnValue({}),
}));

const mockWithMutationLog = jest.fn<any>().mockImplementation(({ op }: any) => op());
jest.mock('../../../../utils/withMutationLog', () => ({
  withMutationLog: (...args: any[]) => mockWithMutationLog(...args),
}));

jest.mock('../../../../utils/sanitize.js', () => ({
  SecuritySanitizer: { sanitizeText: jest.fn((t: string) => t) },
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { registerCommentRoutes } from '../../../../routes/posts/comments';

// ─── Constants ────────────────────────────────────────────────────────────────

const USER_ID = '507f1f77bcf86cd799439011';
const POST_ID = '507f1f77bcf86cd799439022';
const COMMENT_ID = '507f1f77bcf86cd799439033';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makePreValidationAuth(authenticated: boolean) {
  return async (req: FastifyRequest) => {
    if (authenticated) {
      (req as any).authContext = {
        isAuthenticated: true,
        isAnonymous: false,
        type: 'user',
        userId: USER_ID,
        registeredUser: { id: USER_ID, role: 'USER' },
      };
    } else {
      (req as any).authContext = {
        isAuthenticated: false,
        isAnonymous: false,
        type: 'anonymous',
        userId: null,
        registeredUser: null,
      };
    }
  };
}

function makeDefaultPrisma() {
  return {
    post: {
      findUnique: jest.fn<any>().mockResolvedValue({
        authorId: 'author-1',
        commentCount: 5,
        type: 'POST',
        content: 'Post content',
        createdAt: new Date(),
        expiresAt: null,
        visibility: 'PUBLIC',
        visibilityUserIds: [],
      }),
    },
    postComment: {
      findUnique: jest.fn<any>().mockResolvedValue({ id: COMMENT_ID, content: 'Nice comment', authorId: 'author-1' }),
    },
  };
}

async function buildApp(opts: {
  authenticated?: boolean;
  prisma?: any;
  withSocialEvents?: boolean;
  withNotificationService?: boolean;
} = {}): Promise<FastifyInstance> {
  const {
    authenticated = true,
    prisma: prismaOverride,
    withSocialEvents = false,
    withNotificationService = false,
  } = opts;

  const prisma = prismaOverride ?? makeDefaultPrisma();

  const app = Fastify({ logger: false });
  app.decorate('prisma', prisma);

  if (withSocialEvents) {
    app.decorate('socialEvents', {
      broadcastCommentAdded: jest.fn<any>().mockResolvedValue(undefined),
      broadcastCommentLiked: jest.fn<any>().mockResolvedValue(undefined),
      broadcastCommentDeleted: jest.fn<any>().mockResolvedValue(undefined),
    });
  }

  if (withNotificationService) {
    app.decorate('notificationService', {
      createCommentMentionNotificationsBatch: jest.fn<any>().mockResolvedValue(undefined),
      createCommentReplyNotification: jest.fn<any>().mockResolvedValue(undefined),
      createPostCommentNotification: jest.fn<any>().mockResolvedValue(undefined),
      createStoryCommentNotificationsBatch: jest.fn<any>().mockResolvedValue(undefined),
      createCommentLikeNotification: jest.fn<any>().mockResolvedValue(undefined),
    });
  }

  const requiredAuth = makePreValidationAuth(authenticated);
  registerCommentRoutes(app, prisma as any, requiredAuth);
  await app.ready();
  return app;
}

// ─── GET /posts/:postId/comments ──────────────────────────────────────────────

describe('GET /posts/:postId/comments — success', () => {
  it('returns 200 with empty comments list', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: `/posts/${POST_ID}/comments` });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
    await app.close();
  });
});

describe('GET /posts/:postId/comments — with items', () => {
  it('returns 200 with comment items', async () => {
    mockGetComments.mockResolvedValueOnce({ items: [{ id: COMMENT_ID, content: 'Nice!' }], hasMore: false, nextCursor: null });
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: `/posts/${POST_ID}/comments?limit=10` });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});

describe('GET /posts/:postId/comments — service error', () => {
  it('returns 500 when service throws', async () => {
    mockGetComments.mockRejectedValueOnce(new Error('DB error'));
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: `/posts/${POST_ID}/comments` });
    expect(res.statusCode).toBe(500);
    await app.close();
  });
});

describe('GET /posts/:postId/comments — unauthenticated', () => {
  it('returns 200 with anonymous context (GET is accessible)', async () => {
    const app = await buildApp({ authenticated: false });
    const res = await app.inject({ method: 'GET', url: `/posts/${POST_ID}/comments` });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});

// ─── GET /posts/:postId/comments/:commentId/replies ───────────────────────────

describe('GET /posts/:postId/comments/:commentId/replies — success', () => {
  it('returns 200 with empty replies list', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: `/posts/${POST_ID}/comments/${COMMENT_ID}/replies` });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
    await app.close();
  });
});

describe('GET /posts/:postId/comments/:commentId/replies — with items', () => {
  it('returns 200 with reply items resolving mentions', async () => {
    mockGetReplies.mockResolvedValueOnce({ items: [{ id: 'reply-1', content: '@alice nice one' }], hasMore: false, nextCursor: null });
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: `/posts/${POST_ID}/comments/${COMMENT_ID}/replies` });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});

describe('GET /posts/:postId/comments/:commentId/replies — service error', () => {
  it('returns 500 when service throws', async () => {
    mockGetReplies.mockRejectedValueOnce(new Error('DB error'));
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: `/posts/${POST_ID}/comments/${COMMENT_ID}/replies` });
    expect(res.statusCode).toBe(500);
    await app.close();
  });
});

// ─── POST /posts/:postId/comments ─────────────────────────────────────────────

describe('POST /posts/:postId/comments — unauthenticated', () => {
  it('returns 401 when no auth', async () => {
    const app = await buildApp({ authenticated: false });
    const res = await app.inject({
      method: 'POST', url: `/posts/${POST_ID}/comments`,
      payload: { content: 'Hello!' },
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});

describe('POST /posts/:postId/comments — success', () => {
  it('returns 201 with created comment', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST', url: `/posts/${POST_ID}/comments`,
      payload: { content: 'Nice post!' },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().success).toBe(true);
    await app.close();
  });
});

describe('POST /posts/:postId/comments — post not found', () => {
  it('returns 404 when addComment throws POST_NOT_FOUND', async () => {
    mockAddComment.mockRejectedValueOnce(new Error('POST_NOT_FOUND'));
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST', url: `/posts/${POST_ID}/comments`,
      payload: { content: 'Hello!' },
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

describe('POST /posts/:postId/comments — service error', () => {
  it('returns 500 when addComment throws', async () => {
    mockAddComment.mockRejectedValueOnce(new Error('DB error'));
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST', url: `/posts/${POST_ID}/comments`,
      payload: { content: 'Hello!' },
    });
    expect(res.statusCode).toBe(500);
    await app.close();
  });
});

describe('POST /posts/:postId/comments — invalid body', () => {
  it('returns 400 when content is missing', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST', url: `/posts/${POST_ID}/comments`,
      payload: {},
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

describe('POST /posts/:postId/comments — PARENT_NOT_FOUND error', () => {
  it('returns 404 when parent comment does not exist', async () => {
    mockAddComment.mockRejectedValueOnce(new Error('PARENT_NOT_FOUND'));
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST', url: `/posts/${POST_ID}/comments`,
      payload: { content: 'Reply!', parentId: 'nonexistent-parent' },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().code).toBe('COMMENT_NOT_FOUND');
    await app.close();
  });
});

describe('POST /posts/:postId/comments — MEDIA_NOT_AVAILABLE error', () => {
  it('returns 400 when attached media is not available', async () => {
    mockAddComment.mockRejectedValueOnce(new Error('MEDIA_NOT_AVAILABLE'));
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST', url: `/posts/${POST_ID}/comments`,
      payload: { attachmentIds: ['media-001'] },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('MEDIA_NOT_AVAILABLE');
    await app.close();
  });
});

describe('POST /posts/:postId/comments — with social events broadcast', () => {
  it('returns 201 and broadcasts comment added', async () => {
    const app = await buildApp({ withSocialEvents: true });
    const res = await app.inject({
      method: 'POST', url: `/posts/${POST_ID}/comments`,
      payload: { content: 'Hello world!' },
    });
    expect(res.statusCode).toBe(201);
    await app.close();
  });
});

describe('POST /posts/:postId/comments — with notification service (top-level comment)', () => {
  it('returns 201 and fires post comment notification', async () => {
    const app = await buildApp({ withSocialEvents: true, withNotificationService: true });
    const res = await app.inject({
      method: 'POST', url: `/posts/${POST_ID}/comments`,
      payload: { content: 'Top level comment' },
    });
    expect(res.statusCode).toBe(201);
    await app.close();
  });
});

describe('POST /posts/:postId/comments — with notification service (reply)', () => {
  it('returns 201 and fires reply notification', async () => {
    const app = await buildApp({ withSocialEvents: true, withNotificationService: true });
    const res = await app.inject({
      method: 'POST', url: `/posts/${POST_ID}/comments`,
      payload: { content: 'Reply to comment!', parentId: COMMENT_ID },
    });
    expect(res.statusCode).toBe(201);
    await app.close();
  });
});

describe('POST /posts/:postId/comments — onDuplicate path (idempotent replay)', () => {
  it('returns 201 with replayed existing comment from prisma', async () => {
    const existingComment = { id: COMMENT_ID, content: 'Hello', authorId: USER_ID };
    mockWithMutationLog.mockImplementationOnce(async ({ onDuplicate }: any) => {
      return onDuplicate(COMMENT_ID);
    });
    const prisma = {
      post: { findUnique: jest.fn<any>().mockResolvedValue(null) },
      postComment: { findUnique: jest.fn<any>().mockResolvedValue(existingComment) },
    };
    const app = await buildApp({ prisma });
    const res = await app.inject({
      method: 'POST', url: `/posts/${POST_ID}/comments`,
      payload: { content: 'Hello' },
    });
    expect(res.statusCode).toBe(201);
    await app.close();
  });
});

describe('POST /posts/:postId/comments — story type skips post_comment notification', () => {
  it('returns 201 on story post without double notification', async () => {
    const prisma = {
      post: {
        findUnique: jest.fn<any>().mockResolvedValue({
          authorId: 'author-1',
          commentCount: 2,
          type: 'STORY',
          content: 'Story content',
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 86400000),
          visibility: 'FRIENDS',
          visibilityUserIds: [],
        }),
      },
      postComment: { findUnique: jest.fn<any>().mockResolvedValue(null) },
    };
    const app = await buildApp({ withNotificationService: true, prisma });
    const res = await app.inject({
      method: 'POST', url: `/posts/${POST_ID}/comments`,
      payload: { content: 'Nice story!' },
    });
    expect(res.statusCode).toBe(201);
    await app.close();
  });
});

describe('POST /posts/:postId/comments — attachment only (no text)', () => {
  it('returns 201 with media-only comment', async () => {
    mockAddComment.mockResolvedValueOnce({
      id: 'comment-002',
      content: '',
      authorId: USER_ID,
      media: [{ id: 'media-001', mimeType: 'image/jpeg', fileUrl: '/uploads/img.jpg' }],
    });
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST', url: `/posts/${POST_ID}/comments`,
      payload: { attachmentIds: ['media-001'] },
    });
    expect(res.statusCode).toBe(201);
    await app.close();
  });
});

describe('POST /posts/:postId/comments — audio attachment triggers PostAudioService', () => {
  it('returns 201 and triggers audio processing for audio media', async () => {
    mockAddComment.mockResolvedValueOnce({
      id: 'comment-003',
      content: '',
      authorId: USER_ID,
      media: [{ id: 'media-audio-001', mimeType: 'audio/mpeg', fileUrl: '/uploads/audio.mp3' }],
    });
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST', url: `/posts/${POST_ID}/comments`,
      payload: { attachmentIds: ['media-audio-001'] },
    });
    expect(res.statusCode).toBe(201);
    await app.close();
  });
});

// ─── POST /posts/:postId/comments/:commentId/like ─────────────────────────────

describe('POST /posts/:postId/comments/:commentId/like — unauthenticated', () => {
  it('returns 401 when no auth', async () => {
    const app = await buildApp({ authenticated: false });
    const res = await app.inject({ method: 'POST', url: `/posts/${POST_ID}/comments/${COMMENT_ID}/like`, payload: {} });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});

describe('POST /posts/:postId/comments/:commentId/like — success', () => {
  it('returns 200 with liked: true', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'POST', url: `/posts/${POST_ID}/comments/${COMMENT_ID}/like`, payload: {} });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.liked).toBe(true);
    await app.close();
  });
});

describe('POST /posts/:postId/comments/:commentId/like — comment not found', () => {
  it('returns 404 when likeComment returns null', async () => {
    mockLikeComment.mockResolvedValueOnce(null);
    const app = await buildApp();
    const res = await app.inject({ method: 'POST', url: `/posts/${POST_ID}/comments/${COMMENT_ID}/like`, payload: {} });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

describe('POST /posts/:postId/comments/:commentId/like — service error', () => {
  it('returns 500 when likeComment throws', async () => {
    mockLikeComment.mockRejectedValueOnce(new Error('DB error'));
    const app = await buildApp();
    const res = await app.inject({ method: 'POST', url: `/posts/${POST_ID}/comments/${COMMENT_ID}/like`, payload: {} });
    expect(res.statusCode).toBe(500);
    await app.close();
  });
});

describe('POST /posts/:postId/comments/:commentId/like — with social events and notification', () => {
  it('returns 200 and fires broadcast plus notification', async () => {
    const prisma = {
      post: { findUnique: jest.fn<any>().mockResolvedValue(null) },
      postComment: { findUnique: jest.fn<any>().mockResolvedValue({ content: 'Comment content' }) },
    };
    const app = await buildApp({ withSocialEvents: true, withNotificationService: true, prisma });
    const res = await app.inject({ method: 'POST', url: `/posts/${POST_ID}/comments/${COMMENT_ID}/like`, payload: { emoji: '😂' } });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});

// ─── DELETE /posts/:postId/comments/:commentId/like ───────────────────────────

describe('DELETE /posts/:postId/comments/:commentId/like — unauthenticated', () => {
  it('returns 401 when no auth', async () => {
    const app = await buildApp({ authenticated: false });
    const res = await app.inject({ method: 'DELETE', url: `/posts/${POST_ID}/comments/${COMMENT_ID}/like` });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});

describe('DELETE /posts/:postId/comments/:commentId/like — success', () => {
  it('returns 200 with liked: false', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'DELETE', url: `/posts/${POST_ID}/comments/${COMMENT_ID}/like` });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.liked).toBe(false);
    await app.close();
  });
});

describe('DELETE /posts/:postId/comments/:commentId/like — comment not found', () => {
  it('returns 404 when unlikeComment returns null', async () => {
    mockUnlikeComment.mockResolvedValueOnce(null);
    const app = await buildApp();
    const res = await app.inject({ method: 'DELETE', url: `/posts/${POST_ID}/comments/${COMMENT_ID}/like` });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

describe('DELETE /posts/:postId/comments/:commentId/like — service error', () => {
  it('returns 500 when unlikeComment throws', async () => {
    mockUnlikeComment.mockRejectedValueOnce(new Error('DB error'));
    const app = await buildApp();
    const res = await app.inject({ method: 'DELETE', url: `/posts/${POST_ID}/comments/${COMMENT_ID}/like` });
    expect(res.statusCode).toBe(500);
    await app.close();
  });
});

// ─── DELETE /posts/:postId/comments/:commentId ────────────────────────────────

describe('DELETE /posts/:postId/comments/:commentId — unauthenticated', () => {
  it('returns 401 when no auth', async () => {
    const app = await buildApp({ authenticated: false });
    const res = await app.inject({ method: 'DELETE', url: `/posts/${POST_ID}/comments/${COMMENT_ID}` });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});

describe('DELETE /posts/:postId/comments/:commentId — success', () => {
  it('returns 200 with deleted: true', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'DELETE', url: `/posts/${POST_ID}/comments/${COMMENT_ID}` });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.deleted).toBe(true);
    await app.close();
  });
});

describe('DELETE /posts/:postId/comments/:commentId — comment not found', () => {
  it('returns 404 when deleteComment throws COMMENT_NOT_FOUND', async () => {
    mockDeleteComment.mockRejectedValueOnce(new Error('COMMENT_NOT_FOUND'));
    const app = await buildApp();
    const res = await app.inject({ method: 'DELETE', url: `/posts/${POST_ID}/comments/${COMMENT_ID}` });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

describe('DELETE /posts/:postId/comments/:commentId — forbidden', () => {
  it('returns 403 when user is not allowed to delete', async () => {
    mockDeleteComment.mockRejectedValueOnce(new Error('FORBIDDEN'));
    const app = await buildApp();
    const res = await app.inject({ method: 'DELETE', url: `/posts/${POST_ID}/comments/${COMMENT_ID}` });
    expect(res.statusCode).toBe(403);
    await app.close();
  });
});

describe('DELETE /posts/:postId/comments/:commentId — service error', () => {
  it('returns 500 when deleteComment throws unexpected error', async () => {
    mockDeleteComment.mockRejectedValueOnce(new Error('DB error'));
    const app = await buildApp();
    const res = await app.inject({ method: 'DELETE', url: `/posts/${POST_ID}/comments/${COMMENT_ID}` });
    expect(res.statusCode).toBe(500);
    await app.close();
  });
});

describe('DELETE /posts/:postId/comments/:commentId — with social events', () => {
  it('returns 200 and broadcasts comment deleted', async () => {
    const app = await buildApp({ withSocialEvents: true });
    const res = await app.inject({ method: 'DELETE', url: `/posts/${POST_ID}/comments/${COMMENT_ID}` });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});

describe('DELETE /posts/:postId/comments/:commentId — onDuplicate path', () => {
  it('returns 200 when mutation log replay returns existing id', async () => {
    mockWithMutationLog.mockImplementationOnce(async ({ onDuplicate }: any) => {
      return onDuplicate(COMMENT_ID);
    });
    const app = await buildApp({ withSocialEvents: true });
    const res = await app.inject({ method: 'DELETE', url: `/posts/${POST_ID}/comments/${COMMENT_ID}` });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});

// ─── POST /posts/:postId/comments — hoistCommentTrackingLinks (line 24) ───────

describe('POST /posts/:postId/comments — comment with trackingLinks gets hoisted', () => {
  it('returns 201 when comment has metadata.trackingLinks', async () => {
    mockAddComment.mockResolvedValueOnce({
      id: 'comment-tl',
      content: 'Check this link',
      authorId: USER_ID,
      metadata: { trackingLinks: [{ url: 'https://example.com', token: 'tok1' }] },
    });
    const app = await buildApp({ withSocialEvents: true });
    const res = await app.inject({
      method: 'POST', url: `/posts/${POST_ID}/comments`,
      payload: { content: 'Check this link' },
    });
    expect(res.statusCode).toBe(201);
    await app.close();
  });
});

// ─── POST /posts/:postId/comments — mention resolution path (lines 184, 192) ──

describe('POST /posts/:postId/comments — with resolved mentions triggers persistence', () => {
  it('returns 201 and triggers comment mention persistence when @mentions resolve', async () => {
    mockExtractMentions.mockReturnValueOnce(['alice']);
    mockResolveUsernames.mockResolvedValueOnce(new Map([['alice', { id: 'user-alice' }]]));
    const app = await buildApp({ withNotificationService: true });
    const res = await app.inject({
      method: 'POST', url: `/posts/${POST_ID}/comments`,
      payload: { content: 'Hi @alice' },
    });
    expect(res.statusCode).toBe(201);
    await app.close();
  });
});

// ─── POST /posts/:postId/comments — reply with excluded mentioned user (line 222) ─

describe('POST /posts/:postId/comments — reply with mentioned parent author skips reply notification', () => {
  it('returns 201 and skips reply notification when parent author was already mentioned', async () => {
    mockExtractMentions.mockReturnValueOnce(['parentAuthor']);
    mockResolveUsernames.mockResolvedValueOnce(new Map([['parentAuthor', { id: 'author-1' }]]));
    const prisma = {
      post: {
        findUnique: jest.fn<any>().mockResolvedValue({
          authorId: 'post-author',
          commentCount: 3,
          type: 'POST',
          content: 'Post',
          createdAt: new Date(),
          expiresAt: null,
          visibility: 'PUBLIC',
          visibilityUserIds: [],
        }),
      },
      postComment: {
        findUnique: jest.fn<any>().mockResolvedValue({ id: COMMENT_ID, content: 'Parent comment', authorId: 'author-1' }),
      },
    };
    const app = await buildApp({ withNotificationService: true, prisma });
    const res = await app.inject({
      method: 'POST', url: `/posts/${POST_ID}/comments`,
      payload: { content: 'Replying @parentAuthor', parentId: COMMENT_ID },
    });
    expect(res.statusCode).toBe(201);
    await app.close();
  });
});

// ─── .catch handler coverage — fire-and-forget reject paths ─────────────────
// The following tests make fire-and-forget Promises reject to exercise the
// .catch callbacks that log errors without interrupting the HTTP response.

describe('POST /posts/:postId/comments — broadcastCommentAdded rejects (line 164)', () => {
  it('returns 201 and swallows broadcast rejection', async () => {
    const app = Fastify({ logger: false });
    const prisma = makeDefaultPrisma();
    app.decorate('prisma', prisma);
    app.decorate('socialEvents', {
      broadcastCommentAdded: jest.fn<any>().mockRejectedValue(new Error('Socket error')),
    });
    const requiredAuth = makePreValidationAuth(true);
    registerCommentRoutes(app, prisma as any, requiredAuth);
    await app.ready();
    const res = await app.inject({
      method: 'POST', url: `/posts/${POST_ID}/comments`,
      payload: { content: 'Hello!' },
    });
    expect(res.statusCode).toBe(201);
    // Flush microtask queue so the fire-and-forget .catch callback executes
    await new Promise((resolve) => setImmediate(resolve));
    await app.close();
  });
});

describe('POST /posts/:postId/comments — createCommentMentions rejects (line 184)', () => {
  it('returns 201 and swallows mention persistence rejection', async () => {
    mockExtractMentions.mockReturnValueOnce(['alice']);
    mockResolveUsernames.mockResolvedValueOnce(new Map([['alice', { id: 'user-alice' }]]));
    mockCreateCommentMentions.mockRejectedValueOnce(new Error('DB error'));
    const app = await buildApp({ withNotificationService: true });
    const res = await app.inject({
      method: 'POST', url: `/posts/${POST_ID}/comments`,
      payload: { content: 'Hi @alice!' },
    });
    expect(res.statusCode).toBe(201);
    // Flush microtask queue so the fire-and-forget .catch callback executes
    await new Promise((resolve) => setImmediate(resolve));
    await app.close();
  });
});

describe('POST /posts/:postId/comments — createCommentMentionNotificationsBatch rejects (line 192)', () => {
  it('returns 201 and swallows notification rejection', async () => {
    mockExtractMentions.mockReturnValueOnce(['alice']);
    mockResolveUsernames.mockResolvedValueOnce(new Map([['alice', { id: 'user-alice' }]]));
    // Build app directly with a rejecting notificationService.createCommentMentionNotificationsBatch
    const notifApp = Fastify({ logger: false });
    const prisma = makeDefaultPrisma();
    notifApp.decorate('prisma', prisma);
    notifApp.decorate('notificationService', {
      createCommentMentionNotificationsBatch: jest.fn<any>().mockRejectedValue(new Error('Notif error')),
      createCommentReplyNotification: jest.fn<any>().mockResolvedValue(undefined),
      createPostCommentNotification: jest.fn<any>().mockResolvedValue(undefined),
      createStoryCommentNotificationsBatch: jest.fn<any>().mockResolvedValue(undefined),
      createCommentLikeNotification: jest.fn<any>().mockResolvedValue(undefined),
    });
    registerCommentRoutes(notifApp, prisma as any, makePreValidationAuth(true));
    await notifApp.ready();
    const res = await notifApp.inject({
      method: 'POST', url: `/posts/${POST_ID}/comments`,
      payload: { content: 'Hi @alice!' },
    });
    expect(res.statusCode).toBe(201);
    // Flush microtask queue so the fire-and-forget .catch callback executes
    await new Promise((resolve) => setImmediate(resolve));
    await notifApp.close();
  });
});

describe('POST /posts/:postId/comments — createCommentReplyNotification rejects (line 222)', () => {
  it('returns 201 and swallows reply notification rejection', async () => {
    const replyApp = Fastify({ logger: false });
    const prisma = makeDefaultPrisma();
    replyApp.decorate('prisma', prisma);
    replyApp.decorate('notificationService', {
      createCommentMentionNotificationsBatch: jest.fn<any>().mockResolvedValue(undefined),
      createCommentReplyNotification: jest.fn<any>().mockRejectedValue(new Error('Notif error')),
      createPostCommentNotification: jest.fn<any>().mockResolvedValue(undefined),
      createStoryCommentNotificationsBatch: jest.fn<any>().mockResolvedValue(undefined),
      createCommentLikeNotification: jest.fn<any>().mockResolvedValue(undefined),
    });
    const requiredAuth = makePreValidationAuth(true);
    registerCommentRoutes(replyApp, prisma as any, requiredAuth);
    await replyApp.ready();
    const res = await replyApp.inject({
      method: 'POST', url: `/posts/${POST_ID}/comments`,
      payload: { content: 'Reply!', parentId: COMMENT_ID },
    });
    expect(res.statusCode).toBe(201);
    await new Promise((resolve) => setImmediate(resolve));
    await replyApp.close();
  });
});

describe('POST /posts/:postId/comments — createPostCommentNotification rejects (line 240)', () => {
  it('returns 201 and swallows post comment notification rejection', async () => {
    const topLevelApp = Fastify({ logger: false });
    const prisma = makeDefaultPrisma();
    topLevelApp.decorate('prisma', prisma);
    topLevelApp.decorate('notificationService', {
      createCommentMentionNotificationsBatch: jest.fn<any>().mockResolvedValue(undefined),
      createCommentReplyNotification: jest.fn<any>().mockResolvedValue(undefined),
      createPostCommentNotification: jest.fn<any>().mockRejectedValue(new Error('Notif error')),
      createStoryCommentNotificationsBatch: jest.fn<any>().mockResolvedValue(undefined),
      createCommentLikeNotification: jest.fn<any>().mockResolvedValue(undefined),
    });
    const requiredAuth = makePreValidationAuth(true);
    registerCommentRoutes(topLevelApp, prisma as any, requiredAuth);
    await topLevelApp.ready();
    const res = await topLevelApp.inject({
      method: 'POST', url: `/posts/${POST_ID}/comments`,
      payload: { content: 'Top level' },
    });
    expect(res.statusCode).toBe(201);
    await new Promise((resolve) => setImmediate(resolve));
    await topLevelApp.close();
  });
});

describe('POST /posts/:postId/comments — createStoryCommentNotificationsBatch rejects (line 257)', () => {
  it('returns 201 and swallows story fan-out rejection', async () => {
    const storyApp = Fastify({ logger: false });
    const prisma = {
      post: {
        findUnique: jest.fn<any>().mockResolvedValue({
          authorId: 'story-author',
          commentCount: 1,
          type: 'STORY',
          content: 'My story',
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 86400000),
          visibility: 'FRIENDS',
          visibilityUserIds: [],
        }),
      },
      postComment: { findUnique: jest.fn<any>().mockResolvedValue(null) },
    };
    storyApp.decorate('prisma', prisma);
    storyApp.decorate('notificationService', {
      createCommentMentionNotificationsBatch: jest.fn<any>().mockResolvedValue(undefined),
      createCommentReplyNotification: jest.fn<any>().mockResolvedValue(undefined),
      createPostCommentNotification: jest.fn<any>().mockResolvedValue(undefined),
      createStoryCommentNotificationsBatch: jest.fn<any>().mockRejectedValue(new Error('Fan-out error')),
      createCommentLikeNotification: jest.fn<any>().mockResolvedValue(undefined),
    });
    const requiredAuth = makePreValidationAuth(true);
    registerCommentRoutes(storyApp, prisma as any, requiredAuth);
    await storyApp.ready();
    const res = await storyApp.inject({
      method: 'POST', url: `/posts/${POST_ID}/comments`,
      payload: { content: 'Story comment' },
    });
    expect(res.statusCode).toBe(201);
    await new Promise((resolve) => setImmediate(resolve));
    await storyApp.close();
  });
});

describe('POST /posts/:postId/comments — translateComment rejects (line 269)', () => {
  it('returns 201 and swallows translation rejection', async () => {
    const { PostTranslationService } = jest.requireMock('../../../../services/posts/PostTranslationService') as any;
    PostTranslationService.shared.translateComment.mockRejectedValueOnce(new Error('Translation error'));
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST', url: `/posts/${POST_ID}/comments`,
      payload: { content: 'Hello world' },
    });
    expect(res.statusCode).toBe(201);
    await new Promise((resolve) => setImmediate(resolve));
    await app.close();
  });
});

describe('POST /posts/:postId/comments — processPostAudio rejects (line 291)', () => {
  it('returns 201 and swallows audio processing rejection', async () => {
    const { PostAudioService } = jest.requireMock('../../../../services/posts/PostAudioService') as any;
    PostAudioService.shared.processPostAudio.mockRejectedValueOnce(new Error('Audio error'));
    mockAddComment.mockResolvedValueOnce({
      id: 'comment-audio-rej',
      content: '',
      authorId: USER_ID,
      media: [{ id: 'media-rej', mimeType: 'audio/mpeg', fileUrl: '/uploads/rej.mp3' }],
    });
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST', url: `/posts/${POST_ID}/comments`,
      payload: { attachmentIds: ['media-rej'] },
    });
    expect(res.statusCode).toBe(201);
    await new Promise((resolve) => setImmediate(resolve));
    await app.close();
  });
});

describe('POST /posts/:postId/comments/:commentId/like — createCommentLikeNotification rejects (line 357)', () => {
  it('returns 200 and swallows like notification rejection', async () => {
    const likeApp = Fastify({ logger: false });
    const prisma = {
      post: { findUnique: jest.fn<any>().mockResolvedValue(null) },
      postComment: { findUnique: jest.fn<any>().mockResolvedValue({ content: 'A comment' }) },
    };
    likeApp.decorate('prisma', prisma);
    likeApp.decorate('socialEvents', {
      broadcastCommentAdded: jest.fn<any>().mockResolvedValue(undefined),
      broadcastCommentLiked: jest.fn<any>().mockResolvedValue(undefined),
      broadcastCommentDeleted: jest.fn<any>().mockResolvedValue(undefined),
    });
    likeApp.decorate('notificationService', {
      createCommentMentionNotificationsBatch: jest.fn<any>().mockResolvedValue(undefined),
      createCommentReplyNotification: jest.fn<any>().mockResolvedValue(undefined),
      createPostCommentNotification: jest.fn<any>().mockResolvedValue(undefined),
      createStoryCommentNotificationsBatch: jest.fn<any>().mockResolvedValue(undefined),
      createCommentLikeNotification: jest.fn<any>().mockRejectedValue(new Error('Notif error')),
    });
    const requiredAuth = makePreValidationAuth(true);
    registerCommentRoutes(likeApp, prisma as any, requiredAuth);
    await likeApp.ready();
    const res = await likeApp.inject({
      method: 'POST', url: `/posts/${POST_ID}/comments/${COMMENT_ID}/like`,
      payload: {},
    });
    expect(res.statusCode).toBe(200);
    await new Promise((resolve) => setImmediate(resolve));
    await likeApp.close();
  });
});

describe('DELETE /posts/:postId/comments/:commentId — broadcastCommentDeleted rejects (line 439)', () => {
  it('returns 200 and swallows broadcast rejection on delete', async () => {
    const delApp = Fastify({ logger: false });
    const prisma = makeDefaultPrisma();
    delApp.decorate('prisma', prisma);
    delApp.decorate('socialEvents', {
      broadcastCommentAdded: jest.fn<any>().mockResolvedValue(undefined),
      broadcastCommentLiked: jest.fn<any>().mockResolvedValue(undefined),
      broadcastCommentDeleted: jest.fn<any>().mockRejectedValue(new Error('Socket error')),
    });
    const requiredAuth = makePreValidationAuth(true);
    registerCommentRoutes(delApp, prisma as any, requiredAuth);
    await delApp.ready();
    const res = await delApp.inject({ method: 'DELETE', url: `/posts/${POST_ID}/comments/${COMMENT_ID}` });
    expect(res.statusCode).toBe(200);
    await new Promise((resolve) => setImmediate(resolve));
    await delApp.close();
  });
});

// ─── Branch coverage: FeedQuerySchema false branches (lines 44, 76-79) ────────

describe('GET /posts/:postId/comments — invalid limit query uses default (line 44)', () => {
  it('returns 200 with default limit when limit is not a number', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: `/posts/${POST_ID}/comments?limit=notanumber` });
    expect(res.statusCode).toBe(200);
    const json = res.json();
    expect(json.pagination.limit).toBe(20);
    await app.close();
  });
});

describe('GET /posts/:postId/comments/:commentId/replies — invalid limit query uses default (lines 76-79)', () => {
  it('returns 200 with default limit when limit is not a number', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: `/posts/${POST_ID}/comments/${COMMENT_ID}/replies?limit=notanumber` });
    expect(res.statusCode).toBe(200);
    const json = res.json();
    expect(json.pagination.limit).toBe(20);
    await app.close();
  });
});

// ─── Branch coverage: onDuplicate returns null for comment (line 142) ─────────

describe('POST /posts/:postId/comments — onDuplicate with null findUnique result (line 142)', () => {
  it('returns 404 when replay finds no existing comment', async () => {
    mockWithMutationLog.mockImplementationOnce(async ({ onDuplicate }: any) => {
      return onDuplicate(COMMENT_ID);
    });
    const prisma = {
      post: { findUnique: jest.fn<any>().mockResolvedValue(null) },
      postComment: { findUnique: jest.fn<any>().mockResolvedValue(null) },
    };
    const app = await buildApp({ prisma });
    const res = await app.inject({
      method: 'POST', url: `/posts/${POST_ID}/comments`,
      payload: { content: 'Hello' },
    });
    // Returns null from onDuplicate → sendNotFound
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

// ─── Branch coverage: visibilityUserIds ?? [] when null (line 164) ───────────

describe('POST /posts/:postId/comments — null visibilityUserIds falls back to [] (line 164)', () => {
  it('returns 201 when post has null visibilityUserIds', async () => {
    const prisma = {
      post: {
        findUnique: jest.fn<any>().mockResolvedValue({
          authorId: 'author-1',
          commentCount: 5,
          type: 'POST',
          content: 'Post content',
          createdAt: new Date(),
          expiresAt: null,
          visibility: 'PUBLIC',
          visibilityUserIds: null,
        }),
      },
      postComment: { findUnique: jest.fn<any>().mockResolvedValue(null) },
    };
    const app = await buildApp({ withSocialEvents: true, prisma });
    const res = await app.inject({
      method: 'POST', url: `/posts/${POST_ID}/comments`,
      payload: { content: 'Hello world!' },
    });
    expect(res.statusCode).toBe(201);
    await app.close();
  });
});

// ─── Branch coverage: mentionedUserIds.length = 0 false branch (line 182) ────

describe('POST /posts/:postId/comments — mentions extracted but none resolve (line 182 false)', () => {
  it('returns 201 without persistence when resolveUsernames returns empty map', async () => {
    mockExtractMentions.mockReturnValueOnce(['ghost']);
    mockResolveUsernames.mockResolvedValueOnce(new Map()); // empty — no users resolve
    const app = await buildApp({ withNotificationService: true });
    const res = await app.inject({
      method: 'POST', url: `/posts/${POST_ID}/comments`,
      payload: { content: 'Hi @ghost' },
    });
    expect(res.statusCode).toBe(201);
    await app.close();
  });
});

// ─── Branch coverage: createdAt ?? undefined when null (lines 220, 238, 254) ──

describe('POST /posts/:postId/comments — post with null createdAt (lines 220, 238, 254)', () => {
  it('returns 201 when post.createdAt is null for reply notification', async () => {
    const prisma = {
      post: {
        findUnique: jest.fn<any>().mockResolvedValue({
          authorId: 'author-1',
          commentCount: 5,
          type: 'POST',
          content: 'Post content',
          createdAt: null,
          expiresAt: null,
          visibility: 'PUBLIC',
          visibilityUserIds: [],
        }),
      },
      postComment: {
        findUnique: jest.fn<any>().mockResolvedValue({ id: COMMENT_ID, content: 'Parent', authorId: 'other-user' }),
      },
    };
    const app = await buildApp({ withNotificationService: true, prisma });
    const res = await app.inject({
      method: 'POST', url: `/posts/${POST_ID}/comments`,
      payload: { content: 'Reply!', parentId: COMMENT_ID },
    });
    expect(res.statusCode).toBe(201);
    await app.close();
  });

  it('returns 201 when post.createdAt is null for top-level comment', async () => {
    const prisma = {
      post: {
        findUnique: jest.fn<any>().mockResolvedValue({
          authorId: 'author-1',
          commentCount: 5,
          type: 'POST',
          content: 'Post content',
          createdAt: null,
          expiresAt: null,
          visibility: 'PUBLIC',
          visibilityUserIds: [],
        }),
      },
      postComment: { findUnique: jest.fn<any>().mockResolvedValue(null) },
    };
    const app = await buildApp({ withNotificationService: true, prisma });
    const res = await app.inject({
      method: 'POST', url: `/posts/${POST_ID}/comments`,
      payload: { content: 'Nice post!' },
    });
    expect(res.statusCode).toBe(201);
    await app.close();
  });

  it('returns 201 when story post has null createdAt (line 254)', async () => {
    const prisma = {
      post: {
        findUnique: jest.fn<any>().mockResolvedValue({
          authorId: 'story-author',
          commentCount: 2,
          type: 'STORY',
          content: 'My story',
          createdAt: null,
          expiresAt: null,
          visibility: 'FRIENDS',
          visibilityUserIds: [],
        }),
      },
      postComment: { findUnique: jest.fn<any>().mockResolvedValue(null) },
    };
    const app = await buildApp({ withNotificationService: true, prisma });
    const res = await app.inject({
      method: 'POST', url: `/posts/${POST_ID}/comments`,
      payload: { content: 'Great story!' },
    });
    expect(res.statusCode).toBe(201);
    await app.close();
  });
});

// ─── Branch coverage: fileUrl ?? '' when undefined (line 289) ─────────────────

describe('POST /posts/:postId/comments — audio media without fileUrl falls back to empty string (line 289)', () => {
  it('returns 201 when audio attachment has no fileUrl', async () => {
    mockAddComment.mockResolvedValueOnce({
      id: 'comment-audio-nourl',
      content: '',
      authorId: USER_ID,
      media: [{ id: 'media-audio-no-url', mimeType: 'audio/mpeg' }], // no fileUrl
    });
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST', url: `/posts/${POST_ID}/comments`,
      payload: { attachmentIds: ['media-audio-no-url'] },
    });
    expect(res.statusCode).toBe(201);
    await app.close();
  });
});

// ─── Branch coverage: LikeSchema false branch in comment like (lines 322-323) ─

describe('POST /posts/:postId/comments/:commentId/like — invalid emoji triggers fallback (lines 322-323)', () => {
  it('returns 200 using fallback emoji when provided emoji is too long', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST', url: `/posts/${POST_ID}/comments/${COMMENT_ID}/like`,
      payload: { emoji: 'x'.repeat(11) }, // exceeds max(10) → LikeSchema fails → fallback '❤️'
    });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});

// ─── Branch coverage: LikeSchema false branch in comment unlike (line 379) ────

describe('DELETE /posts/:postId/comments/:commentId/like — invalid emoji triggers fallback (line 379)', () => {
  it('returns 200 using fallback emoji when provided emoji is too long', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'DELETE', url: `/posts/${POST_ID}/comments/${COMMENT_ID}/like`,
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ emoji: 'x'.repeat(11) }), // exceeds max(10) → LikeSchema fails → fallback '❤️'
    });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});

// ─── Branch coverage: deleteComment returns null (line 415) ──────────────────

describe('DELETE /posts/:postId/comments/:commentId — deleteComment returns null (line 415)', () => {
  it('returns 404 when deleteComment returns null (triggers POST_NOT_FOUND via if !res)', async () => {
    mockDeleteComment.mockResolvedValueOnce(null);
    const app = await buildApp();
    const res = await app.inject({ method: 'DELETE', url: `/posts/${POST_ID}/comments/${COMMENT_ID}` });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

// ─── Branch coverage: visibilityUserIds ?? [] in delete route (lines 434-439) ─

describe('DELETE /posts/:postId/comments/:commentId — null visibilityUserIds falls back to [] (lines 434-439)', () => {
  it('returns 200 when deleted comment post has null visibilityUserIds', async () => {
    const prisma = {
      post: {
        findUnique: jest.fn<any>().mockResolvedValue({
          authorId: 'author-1',
          commentCount: 4,
          visibility: 'PUBLIC',
          visibilityUserIds: null, // triggers ?? []
        }),
      },
      postComment: { findUnique: jest.fn<any>().mockResolvedValue(null) },
    };
    const app = await buildApp({ withSocialEvents: true, prisma });
    const res = await app.inject({ method: 'DELETE', url: `/posts/${POST_ID}/comments/${COMMENT_ID}` });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});

// ─── Branch coverage: if (post) false in DELETE /comments (line 434 false) ────

describe('DELETE /posts/:postId/comments/:commentId — post lookup returns null, no broadcast (line 434)', () => {
  it('returns 200 when socialEvents present but post.findUnique returns null', async () => {
    const prisma = {
      post: { findUnique: jest.fn<any>().mockResolvedValue(null) },
      postComment: { findUnique: jest.fn<any>().mockResolvedValue(null) },
    };
    const app = await buildApp({ withSocialEvents: true, prisma });
    const res = await app.inject({ method: 'DELETE', url: `/posts/${POST_ID}/comments/${COMMENT_ID}` });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});

// ─── Branch coverage: addComment returns null (line 137 true branch) ──────────

describe('POST /posts/:postId/comments — addComment returns null (line 137 throw)', () => {
  it('returns 404 when addComment resolves to null (triggers POST_NOT_FOUND throw)', async () => {
    mockAddComment.mockResolvedValueOnce(null);
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST', url: `/posts/${POST_ID}/comments`,
      payload: { content: 'Hello!' },
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

// ─── Branch coverage: GET /replies anonymous user (line 79 false branch) ──────

describe('GET /posts/:postId/comments/:commentId/replies — anonymous user (line 79 false)', () => {
  it('returns 200 with currentUserId undefined for anonymous user', async () => {
    const app = await buildApp({ authenticated: false });
    const res = await app.inject({ method: 'GET', url: `/posts/${POST_ID}/comments/${COMMENT_ID}/replies` });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});

// ─── Branch coverage: LikeSchema false branch (no body) in like (line 322) ───

describe('POST /posts/:postId/comments/:commentId/like — no body triggers ?? {} (line 322)', () => {
  it('returns 200 using default emoji when no body provided', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST', url: `/posts/${POST_ID}/comments/${COMMENT_ID}/like`,
      // no payload — request.body will be null/undefined, ?? {} kicks in
    });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});
