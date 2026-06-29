/**
 * Unit tests for posts comments routes (comments.ts)
 * Tests GET /posts/:postId/comments, GET /posts/:postId/comments/:commentId/replies,
 * POST /posts/:postId/comments.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockGetComments = jest.fn<any>().mockResolvedValue({ items: [], hasMore: false, nextCursor: null });
const mockGetReplies = jest.fn<any>().mockResolvedValue({ items: [], hasMore: false, nextCursor: null });
const mockAddComment = jest.fn<any>().mockResolvedValue({ id: 'comment-001', content: 'Hello', authorId: 'user-001' });

jest.mock('../../../../services/PostCommentService', () => ({
  PostCommentService: jest.fn().mockImplementation(() => ({
    getComments: (...args: any[]) => mockGetComments(...args),
    getReplies: (...args: any[]) => mockGetReplies(...args),
    addComment: (...args: any[]) => mockAddComment(...args),
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
  PostAudioService: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../../../../services/MentionService', () => ({
  resolveMentionedUsers: jest.fn<any>().mockResolvedValue([]),
  MentionService: jest.fn().mockImplementation(() => ({
    extractMentions: jest.fn<any>().mockReturnValue([]),
    resolveUsernames: jest.fn<any>().mockResolvedValue(new Map()),
    createCommentMentions: jest.fn<any>().mockResolvedValue(undefined),
  })),
}));

jest.mock('../../../../middleware/rate-limiter', () => ({
  createPostRouteRateLimitConfig: jest.fn<any>().mockReturnValue({}),
}));

jest.mock('../../../../utils/withMutationLog', () => ({
  withMutationLog: jest.fn<any>().mockImplementation(({ op }: any) => op()),
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

async function buildApp(opts: {
  authenticated?: boolean;
  prisma?: any;
} = {}): Promise<FastifyInstance> {
  const { authenticated = true, prisma = {} as any } = opts;

  const app = Fastify({ logger: false });
  app.decorate('prisma', prisma);
  const requiredAuth = makePreValidationAuth(authenticated);

  registerCommentRoutes(app, prisma, requiredAuth);
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
  it('returns 404 when addComment returns null', async () => {
    mockAddComment.mockRejectedValueOnce(Object.assign(new Error('POST_NOT_FOUND'), {}));
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
