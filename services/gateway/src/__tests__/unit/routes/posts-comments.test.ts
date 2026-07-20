/**
 * Unit tests for posts/comments.ts
 * Tests GET /posts/:postId/comments,
 *       GET /posts/:postId/comments/:commentId/replies,
 *       POST /posts/:postId/comments,
 *       POST /posts/:postId/comments/:commentId/like,
 *       DELETE /posts/:postId/comments/:commentId/like,
 *       DELETE /posts/:postId/comments/:commentId
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeAll, afterAll } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockGetComments = jest.fn<any>().mockResolvedValue({ items: [], hasMore: false, nextCursor: null });
const mockGetReplies = jest.fn<any>().mockResolvedValue({ items: [], hasMore: false, nextCursor: null });
const mockAddComment = jest.fn<any>().mockResolvedValue({ id: 'comment-1', content: 'Test', authorId: '507f1f77bcf86cd799439011' });
const mockLikeComment = jest.fn<any>().mockResolvedValue({ id: 'comment-1', authorId: '507f1f77bcf86cd799439011', likeCount: 1, reactionSummary: { '❤️': 1 } });
const mockUnlikeComment = jest.fn<any>().mockResolvedValue({ id: 'comment-1', authorId: '507f1f77bcf86cd799439011', likeCount: 0, reactionSummary: {} });
const mockDeleteComment = jest.fn<any>().mockResolvedValue({ success: true });

jest.mock('../../../services/PostCommentService', () => ({
  PostCommentService: jest.fn().mockImplementation(() => ({
    getComments: (...a: any[]) => mockGetComments(...a),
    getReplies: (...a: any[]) => mockGetReplies(...a),
    addComment: (...a: any[]) => mockAddComment(...a),
    likeComment: (...a: any[]) => mockLikeComment(...a),
    unlikeComment: (...a: any[]) => mockUnlikeComment(...a),
    deleteComment: (...a: any[]) => mockDeleteComment(...a),
  })),
}));

jest.mock('../../../services/posts/PostTranslationService', () => ({
  PostTranslationService: {
    shared: { translateComment: jest.fn<any>().mockResolvedValue(undefined) },
  },
}));

jest.mock('../../../services/posts/PostAudioService', () => ({
  PostAudioService: {
    shared: { processPostAudio: jest.fn<any>().mockResolvedValue(undefined) },
  },
}));

jest.mock('../../../services/MentionService', () => ({
  MentionService: jest.fn().mockImplementation(() => ({
    extractMentions: jest.fn<any>().mockReturnValue([]),
    resolveUsernames: jest.fn<any>().mockResolvedValue(new Map()),
    createCommentMentions: jest.fn<any>().mockResolvedValue(undefined),
  })),
  resolveMentionedUsers: jest.fn<any>().mockResolvedValue([]),
}));

jest.mock('../../../middleware/rate-limiter', () => ({
  createPostRouteRateLimitConfig: () => ({}),
}));

jest.mock('../../../utils/withMutationLog', () => ({
  withMutationLog: jest.fn<any>().mockImplementation(({ op }) => op()),
}));

jest.mock('../../../utils/sanitize.js', () => ({
  SecuritySanitizer: { sanitizeText: (s: string) => s },
}));

jest.mock('../../../routes/posts/types', () => ({
  CreateCommentSchema: {
    safeParse: (data: any) => {
      if (data?.invalid) return { success: false, error: {} };
      return { success: true, data: { content: data?.content ?? 'Test comment', ...data } };
    },
  },
  FeedQuerySchema: {
    safeParse: (data: any) => ({
      success: true,
      data: { cursor: data?.cursor, limit: data?.limit ?? 20 },
    }),
  },
  LikeSchema: {
    safeParse: (data: any) => {
      if (data?.invalid) return { success: false, error: {} };
      return { success: true, data: { emoji: data?.emoji ?? '❤️', ...data } };
    },
  },
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { registerCommentRoutes } from '../../../routes/posts/comments';

// ─── Constants ────────────────────────────────────────────────────────────────

const USER_ID = '507f1f77bcf86cd799439011';
const POST_ID = '507f1f77bcf86cd799439022';
const COMMENT_ID = '507f1f77bcf86cd799439033';

// ─── buildApp ────────────────────────────────────────────────────────────────

async function buildApp({ authenticated = true } = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });

  const requiredAuth = async (req: any, reply: any) => {
    if (!authenticated) {
      return reply.status(401).send({ success: false, error: 'Unauthorized' });
    }
    (req as any).authContext = {
      isAuthenticated: true,
      type: 'user',
      isAnonymous: false,
      userId: USER_ID,
      registeredUser: { id: USER_ID, role: 'USER' },
    };
  };

  app.decorate('socialEvents', {
    broadcastCommentAdded: jest.fn<any>().mockResolvedValue(undefined),
    broadcastCommentDeleted: jest.fn<any>().mockResolvedValue(undefined),
    broadcastCommentLiked: jest.fn<any>().mockReturnValue(undefined),
  } as any);

  // prisma decorated on app (used for broadcast lookups in POST/DELETE handlers)
  app.decorate('prisma', {
    post: {
      findUnique: jest.fn<any>().mockResolvedValue(null),
    },
    postComment: {
      findUnique: jest.fn<any>().mockResolvedValue(null),
    },
  });

  registerCommentRoutes(app, {} as any, requiredAuth);
  await app.ready();
  return app;
}

// ─── GET /posts/:postId/comments ─────────────────────────────────────────────

describe('GET /posts/:postId/comments — success', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 200', async () => {
    const res = await app.inject({ method: 'GET', url: `/posts/${POST_ID}/comments` });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });
});

describe('GET /posts/:postId/comments — service error', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 500 when service throws', async () => {
    mockGetComments.mockRejectedValueOnce(new Error('DB failure'));
    const res = await app.inject({ method: 'GET', url: `/posts/${POST_ID}/comments` });
    expect(res.statusCode).toBe(500);
    expect(res.json().success).toBe(false);
  });
});

describe('GET /posts/:postId/comments — not authenticated', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp({ authenticated: false }); });
  afterAll(async () => { await app.close(); });

  it('returns 401 when not authenticated', async () => {
    const res = await app.inject({ method: 'GET', url: `/posts/${POST_ID}/comments` });
    expect(res.statusCode).toBe(401);
  });
});

// ─── GET /posts/:postId/comments/:commentId/replies ──────────────────────────

describe('GET /posts/:postId/comments/:commentId/replies — success', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 200', async () => {
    const res = await app.inject({ method: 'GET', url: `/posts/${POST_ID}/comments/${COMMENT_ID}/replies` });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });
});

describe('GET /posts/:postId/comments/:commentId/replies — service error', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 500 when service throws', async () => {
    mockGetReplies.mockRejectedValueOnce(new Error('DB failure'));
    const res = await app.inject({ method: 'GET', url: `/posts/${POST_ID}/comments/${COMMENT_ID}/replies` });
    expect(res.statusCode).toBe(500);
    expect(res.json().success).toBe(false);
  });
});

// ─── POST /posts/:postId/comments ────────────────────────────────────────────

describe('POST /posts/:postId/comments — not authenticated', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp({ authenticated: false }); });
  afterAll(async () => { await app.close(); });

  it('returns 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/posts/${POST_ID}/comments`,
      payload: { content: 'Hello' },
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('POST /posts/:postId/comments — invalid body', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 400 when body is invalid', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/posts/${POST_ID}/comments`,
      payload: { invalid: true },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().success).toBe(false);
  });
});

describe('POST /posts/:postId/comments — success', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 201', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/posts/${POST_ID}/comments`,
      payload: { content: 'Test comment' },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().success).toBe(true);
  });
});

describe('POST /posts/:postId/comments — post not found', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 404 when addComment returns null (post not found)', async () => {
    mockAddComment.mockResolvedValueOnce(null);
    const res = await app.inject({
      method: 'POST',
      url: `/posts/${POST_ID}/comments`,
      payload: { content: 'Test comment' },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().success).toBe(false);
  });
});

describe('POST /posts/:postId/comments — service error', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 500 when service throws', async () => {
    mockAddComment.mockRejectedValueOnce(new Error('Unexpected DB error'));
    const res = await app.inject({
      method: 'POST',
      url: `/posts/${POST_ID}/comments`,
      payload: { content: 'Test comment' },
    });
    expect(res.statusCode).toBe(500);
    expect(res.json().success).toBe(false);
  });
});

describe('POST /posts/:postId/comments — parent not found', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 404 when parent comment does not exist', async () => {
    mockAddComment.mockRejectedValueOnce(new Error('PARENT_NOT_FOUND'));
    const res = await app.inject({
      method: 'POST',
      url: `/posts/${POST_ID}/comments`,
      payload: { content: 'Reply', parentId: 'nonexistent-id' },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().success).toBe(false);
  });
});

describe('POST /posts/:postId/comments — media not available', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 400 when attached media is already linked', async () => {
    mockAddComment.mockRejectedValueOnce(new Error('MEDIA_NOT_AVAILABLE'));
    const res = await app.inject({
      method: 'POST',
      url: `/posts/${POST_ID}/comments`,
      payload: { content: 'Comment with media', attachmentIds: ['media-1'] },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().success).toBe(false);
  });
});

// ─── POST /posts/:postId/comments/:commentId/like ────────────────────────────

describe('POST /posts/:postId/comments/:commentId/like — not authenticated', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp({ authenticated: false }); });
  afterAll(async () => { await app.close(); });

  it('returns 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/posts/${POST_ID}/comments/${COMMENT_ID}/like`,
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('POST /posts/:postId/comments/:commentId/like — success', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 200', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/posts/${POST_ID}/comments/${COMMENT_ID}/like`,
      payload: {},
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });
});

describe('POST /posts/:postId/comments/:commentId/like — comment not found', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 404 when comment does not exist', async () => {
    mockLikeComment.mockResolvedValueOnce(null);
    const res = await app.inject({
      method: 'POST',
      url: `/posts/${POST_ID}/comments/${COMMENT_ID}/like`,
      payload: {},
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().success).toBe(false);
  });
});

describe('POST /posts/:postId/comments/:commentId/like — service error', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 500 when service throws', async () => {
    mockLikeComment.mockRejectedValueOnce(new Error('DB failure'));
    const res = await app.inject({
      method: 'POST',
      url: `/posts/${POST_ID}/comments/${COMMENT_ID}/like`,
      payload: {},
    });
    expect(res.statusCode).toBe(500);
    expect(res.json().success).toBe(false);
  });
});

// ─── DELETE /posts/:postId/comments/:commentId/like ──────────────────────────

describe('DELETE /posts/:postId/comments/:commentId/like — not authenticated', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp({ authenticated: false }); });
  afterAll(async () => { await app.close(); });

  it('returns 401', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/posts/${POST_ID}/comments/${COMMENT_ID}/like`,
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('DELETE /posts/:postId/comments/:commentId/like — success', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 200', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/posts/${POST_ID}/comments/${COMMENT_ID}/like`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });
});

describe('DELETE /posts/:postId/comments/:commentId/like — comment not found', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 404 when comment does not exist', async () => {
    mockUnlikeComment.mockResolvedValueOnce(null);
    const res = await app.inject({
      method: 'DELETE',
      url: `/posts/${POST_ID}/comments/${COMMENT_ID}/like`,
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().success).toBe(false);
  });
});

describe('DELETE /posts/:postId/comments/:commentId/like — service error', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 500 when service throws', async () => {
    mockUnlikeComment.mockRejectedValueOnce(new Error('DB failure'));
    const res = await app.inject({
      method: 'DELETE',
      url: `/posts/${POST_ID}/comments/${COMMENT_ID}/like`,
    });
    expect(res.statusCode).toBe(500);
    expect(res.json().success).toBe(false);
  });
});

// ─── DELETE /posts/:postId/comments/:commentId ───────────────────────────────

describe('DELETE /posts/:postId/comments/:commentId — not authenticated', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp({ authenticated: false }); });
  afterAll(async () => { await app.close(); });

  it('returns 401', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/posts/${POST_ID}/comments/${COMMENT_ID}`,
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('DELETE /posts/:postId/comments/:commentId — success', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 200', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/posts/${POST_ID}/comments/${COMMENT_ID}`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });
});

describe('DELETE /posts/:postId/comments/:commentId — comment not found', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 404 when comment does not exist', async () => {
    mockDeleteComment.mockResolvedValueOnce(null);
    const res = await app.inject({
      method: 'DELETE',
      url: `/posts/${POST_ID}/comments/${COMMENT_ID}`,
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().success).toBe(false);
  });
});

describe('DELETE /posts/:postId/comments/:commentId — forbidden', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 403 when user is not the comment author', async () => {
    mockDeleteComment.mockRejectedValueOnce(new Error('FORBIDDEN'));
    const res = await app.inject({
      method: 'DELETE',
      url: `/posts/${POST_ID}/comments/${COMMENT_ID}`,
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().success).toBe(false);
  });
});

describe('DELETE /posts/:postId/comments/:commentId — service error', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 500 when service throws unexpectedly', async () => {
    mockDeleteComment.mockRejectedValueOnce(new Error('Unexpected error'));
    const res = await app.inject({
      method: 'DELETE',
      url: `/posts/${POST_ID}/comments/${COMMENT_ID}`,
    });
    expect(res.statusCode).toBe(500);
    expect(res.json().success).toBe(false);
  });
});
