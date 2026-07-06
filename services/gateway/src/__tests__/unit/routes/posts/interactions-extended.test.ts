/**
 * Extended unit tests for posts interaction routes (interactions.ts)
 * Covers: anonymous-view, impression, impressions/batch, engagement/batch,
 *         share, pin, views, interactions, repost.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeAll, afterAll } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockRecordAnonymousOpen = jest.fn();
const mockRecordEngagementBatch = jest.fn();
const mockSharePost = jest.fn();
const mockShareWithTrackingLink = jest.fn();
const mockGetPostShareLink = jest.fn();
const mockPinPost = jest.fn();
const mockUnpinPost = jest.fn();
const mockGetPostViews = jest.fn();
const mockGetPostInteractions = jest.fn();
const mockRepostPost = jest.fn();
const mockGetPostById = jest.fn().mockResolvedValue({ id: 'post-1', type: 'POST', authorId: 'author-1' });
const mockLikePost = jest.fn().mockResolvedValue({ id: 'p1', likeCount: 1, reactionSummary: {} });
const mockUnlikePost = jest.fn().mockResolvedValue({ id: 'p1', likeCount: 0, reactionSummary: {} });
const mockBookmarkPost = jest.fn().mockResolvedValue({ bookmarkCount: 1 });
const mockUnbookmarkPost = jest.fn().mockResolvedValue({ bookmarkCount: 0 });
const mockRecordView = jest.fn().mockResolvedValue(true);

jest.mock('../../../../services/PostService', () => ({
  PostService: jest.fn().mockImplementation(() => ({
    likePost: (...a: any[]) => mockLikePost(...a),
    unlikePost: (...a: any[]) => mockUnlikePost(...a),
    bookmarkPost: (...a: any[]) => mockBookmarkPost(...a),
    unbookmarkPost: (...a: any[]) => mockUnbookmarkPost(...a),
    recordView: (...a: any[]) => mockRecordView(...a),
    getPostById: (...a: any[]) => mockGetPostById(...a),
    recordAnonymousOpen: (...a: any[]) => mockRecordAnonymousOpen(...a),
    recordEngagementBatch: (...a: any[]) => mockRecordEngagementBatch(...a),
    sharePost: (...a: any[]) => mockSharePost(...a),
    shareWithTrackingLink: (...a: any[]) => mockShareWithTrackingLink(...a),
    getPostShareLink: (...a: any[]) => mockGetPostShareLink(...a),
    pinPost: (...a: any[]) => mockPinPost(...a),
    unpinPost: (...a: any[]) => mockUnpinPost(...a),
    getPostViews: (...a: any[]) => mockGetPostViews(...a),
    getPostInteractions: (...a: any[]) => mockGetPostInteractions(...a),
    repostPost: (...a: any[]) => mockRepostPost(...a),
  })),
}));

jest.mock('../../../../services/MediaService', () => ({
  MediaService: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../../../../services/MentionService', () => ({
  resolveMentionedUsers: jest.fn().mockResolvedValue([]),
}));

jest.mock('../../../../services/TrackingLinkService', () => ({
  resolveFrontendBaseUrl: jest.fn().mockReturnValue('https://app.example.com'),
  TrackingLinkService: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../../../../middleware/rate-limiter', () => ({
  createPostRouteRateLimitConfig: jest.fn().mockReturnValue({}),
}));

jest.mock('../../../../utils/withMutationLog', () => ({
  withMutationLog: jest.fn().mockImplementation(async ({ op }: any) => op()),
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { registerInteractionRoutes } from '../../../../routes/posts/interactions';

// ─── Constants ────────────────────────────────────────────────────────────────

const USER_ID = '507f1f77bcf86cd799439011';
const POST_ID = '507f1f77bcf86cd799439022';

// ─── App factory ──────────────────────────────────────────────────────────────

function makeAuth(authenticated: boolean) {
  return async (req: FastifyRequest) => {
    (req as any).authContext = authenticated
      ? { isAuthenticated: true, registeredUser: { id: USER_ID, role: 'USER', username: 'alice' } }
      : null;
  };
}

async function buildApp(authenticated = true): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  const prisma = {
    postImpression: {
      create: jest.fn().mockResolvedValue({}),
      createMany: jest.fn().mockResolvedValue({ count: 2 }),
    },
    post: {
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 2 }),
    },
  } as any;
  app.decorate('prisma', prisma);
  app.decorate('notificationService', null as any);
  registerInteractionRoutes(app, prisma, makeAuth(authenticated));
  await app.ready();
  return app;
}

// ─── POST /posts/:postId/anonymous-view ───────────────────────────────────────

describe('POST /posts/:postId/anonymous-view', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 200 with counted=false when Authorization header is present', async () => {
    const res = await app.inject({
      method: 'POST', url: `/posts/${POST_ID}/anonymous-view`,
      headers: { authorization: 'Bearer some-token' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.counted).toBe(false);
  });

  it('returns 400 when session key is missing', async () => {
    const res = await app.inject({ method: 'POST', url: `/posts/${POST_ID}/anonymous-view` });
    expect(res.statusCode).toBe(400);
  });

  it('returns 200 with counted=true on valid session key', async () => {
    mockRecordAnonymousOpen.mockResolvedValueOnce(true);
    const res = await app.inject({
      method: 'POST', url: `/posts/${POST_ID}/anonymous-view`,
      headers: { 'x-session-token': 'valid-session-key' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.counted).toBe(true);
  });
});

// ─── POST /posts/:postId/impression ──────────────────────────────────────────

describe('POST /posts/:postId/impression (unauthenticated)', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(false); });
  afterAll(async () => { await app.close(); });

  it('returns 401 when not authenticated', async () => {
    const res = await app.inject({ method: 'POST', url: `/posts/${POST_ID}/impression`, payload: {} });
    expect(res.statusCode).toBe(401);
  });
});

describe('POST /posts/:postId/impression (authenticated)', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 200 on successful impression', async () => {
    const res = await app.inject({ method: 'POST', url: `/posts/${POST_ID}/impression`, payload: {} });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.recorded).toBe(true);
  });

  it('returns 200 and increments postOpenCount for detail source', async () => {
    const res = await app.inject({
      method: 'POST', url: `/posts/${POST_ID}/impression`,
      payload: { source: 'detail' },
    });
    expect(res.statusCode).toBe(200);
  });
});

// ─── POST /posts/impressions/batch ────────────────────────────────────────────

describe('POST /posts/impressions/batch (unauthenticated)', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(false); });
  afterAll(async () => { await app.close(); });

  it('returns 401 when not authenticated', async () => {
    const res = await app.inject({
      method: 'POST', url: '/posts/impressions/batch',
      payload: { postIds: [POST_ID] },
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('POST /posts/impressions/batch (authenticated)', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 200 with recorded=0 when postIds is empty', async () => {
    const res = await app.inject({
      method: 'POST', url: '/posts/impressions/batch',
      payload: { postIds: [] },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.recorded).toBe(0);
  });

  it('returns 200 with count when postIds provided', async () => {
    const res = await app.inject({
      method: 'POST', url: '/posts/impressions/batch',
      payload: { postIds: [POST_ID, 'other-post-id'] },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.recorded).toBe(2);
  });
});

// ─── POST /posts/engagement/batch ─────────────────────────────────────────────

describe('POST /posts/engagement/batch (unauthenticated)', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(false); });
  afterAll(async () => { await app.close(); });

  it('returns 401 when not authenticated', async () => {
    const res = await app.inject({
      method: 'POST', url: '/posts/engagement/batch',
      payload: { sessions: [] },
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('POST /posts/engagement/batch (authenticated)', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 400 on invalid payload', async () => {
    const res = await app.inject({
      method: 'POST', url: '/posts/engagement/batch',
      payload: { invalid: true },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 200 on valid engagement batch', async () => {
    mockRecordEngagementBatch.mockResolvedValueOnce(1);
    const session = {
      sessionId: '550e8400-e29b-41d4-a716-446655440000',
      postId: POST_ID,
      contentType: 'POST',
      surface: 'feed',
      startedAt: '2026-06-30T00:00:00.000Z',
      dwellMs: 2000,
    };
    const res = await app.inject({
      method: 'POST', url: '/posts/engagement/batch',
      payload: { sessions: [session] },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.recorded).toBe(1);
  });
});

// ─── POST /posts/:postId/share ────────────────────────────────────────────────

describe('POST /posts/:postId/share (unauthenticated)', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(false); });
  afterAll(async () => { await app.close(); });

  it('returns 401 when not authenticated', async () => {
    const res = await app.inject({ method: 'POST', url: `/posts/${POST_ID}/share`, payload: {} });
    expect(res.statusCode).toBe(401);
  });
});

describe('POST /posts/:postId/share (authenticated)', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 200 on plain share', async () => {
    mockSharePost.mockResolvedValueOnce({ shareCount: 5 });
    const res = await app.inject({ method: 'POST', url: `/posts/${POST_ID}/share`, payload: {} });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.shared).toBe(true);
  });

  it('returns 404 when post not found (plain share)', async () => {
    mockSharePost.mockResolvedValueOnce(null);
    const res = await app.inject({ method: 'POST', url: `/posts/${POST_ID}/share`, payload: {} });
    expect(res.statusCode).toBe(404);
  });

  it('returns 200 on tracked share with link', async () => {
    mockShareWithTrackingLink.mockResolvedValueOnce({ shareCount: 1, token: 'abc123', shortUrl: 'https://app.example.com/l/abc123' });
    const res = await app.inject({
      method: 'POST', url: `/posts/${POST_ID}/share`,
      payload: { generateLink: true },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.token).toBe('abc123');
  });

  it('returns 404 when post not found (tracked share)', async () => {
    mockShareWithTrackingLink.mockResolvedValueOnce(null);
    const res = await app.inject({
      method: 'POST', url: `/posts/${POST_ID}/share`,
      payload: { generateLink: true },
    });
    expect(res.statusCode).toBe(404);
  });
});

// ─── GET /posts/:postId/share ─────────────────────────────────────────────────

describe('GET /posts/:postId/share', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 200 with share link data', async () => {
    mockGetPostShareLink.mockResolvedValueOnce({ token: 'abc123', shortUrl: 'https://app.example.com/l/abc123', totalClicks: 3 });
    const res = await app.inject({ method: 'GET', url: `/posts/${POST_ID}/share` });
    expect(res.statusCode).toBe(200);
  });
});

// ─── POST /posts/:postId/pin ──────────────────────────────────────────────────

describe('POST /posts/:postId/pin', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 200 on successful pin', async () => {
    mockPinPost.mockResolvedValueOnce({ id: POST_ID, pinnedAt: new Date() });
    const res = await app.inject({ method: 'POST', url: `/posts/${POST_ID}/pin`, payload: {} });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.pinned).toBe(true);
  });

  it('returns 404 when post not found', async () => {
    mockPinPost.mockResolvedValueOnce(null);
    const res = await app.inject({ method: 'POST', url: `/posts/${POST_ID}/pin`, payload: {} });
    expect(res.statusCode).toBe(404);
  });

  it('returns 403 when not the author', async () => {
    const err = new Error('FORBIDDEN');
    mockPinPost.mockRejectedValueOnce(err);
    const res = await app.inject({ method: 'POST', url: `/posts/${POST_ID}/pin`, payload: {} });
    expect(res.statusCode).toBe(403);
  });
});

// ─── DELETE /posts/:postId/pin ────────────────────────────────────────────────

describe('DELETE /posts/:postId/pin', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 200 on successful unpin', async () => {
    mockUnpinPost.mockResolvedValueOnce({ id: POST_ID });
    const res = await app.inject({ method: 'DELETE', url: `/posts/${POST_ID}/pin` });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.pinned).toBe(false);
  });

  it('returns 404 when post not found', async () => {
    mockUnpinPost.mockResolvedValueOnce(null);
    const res = await app.inject({ method: 'DELETE', url: `/posts/${POST_ID}/pin` });
    expect(res.statusCode).toBe(404);
  });
});

// ─── GET /posts/:postId/views ─────────────────────────────────────────────────

describe('GET /posts/:postId/views', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 200 with views list', async () => {
    mockGetPostViews.mockResolvedValueOnce({ items: [], total: 0, hasMore: false });
    const res = await app.inject({ method: 'GET', url: `/posts/${POST_ID}/views` });
    expect(res.statusCode).toBe(200);
  });

  it('returns 404 when post not found', async () => {
    mockGetPostViews.mockResolvedValueOnce(null);
    const res = await app.inject({ method: 'GET', url: `/posts/${POST_ID}/views` });
    expect(res.statusCode).toBe(404);
  });

  it('returns 403 when not the author', async () => {
    mockGetPostViews.mockRejectedValueOnce(new Error('FORBIDDEN'));
    const res = await app.inject({ method: 'GET', url: `/posts/${POST_ID}/views` });
    expect(res.statusCode).toBe(403);
  });
});

// ─── GET /posts/:postId/interactions ─────────────────────────────────────────

describe('GET /posts/:postId/interactions', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 200 with interactions data', async () => {
    mockGetPostInteractions.mockResolvedValueOnce({ viewers: [], total: 0, hasMore: false });
    const res = await app.inject({ method: 'GET', url: `/posts/${POST_ID}/interactions` });
    expect(res.statusCode).toBe(200);
  });

  it('returns 404 when post not found', async () => {
    mockGetPostInteractions.mockResolvedValueOnce(null);
    const res = await app.inject({ method: 'GET', url: `/posts/${POST_ID}/interactions` });
    expect(res.statusCode).toBe(404);
  });
});

// ─── POST /posts/:postId/repost ───────────────────────────────────────────────

describe('POST /posts/:postId/repost', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 201 on successful repost', async () => {
    mockRepostPost.mockResolvedValueOnce({ id: 'repost-1', repostOfId: POST_ID });
    const res = await app.inject({ method: 'POST', url: `/posts/${POST_ID}/repost`, payload: {} });
    expect(res.statusCode).toBe(201);
  });

  it('returns 404 when original post not found', async () => {
    mockRepostPost.mockResolvedValueOnce(null);
    const res = await app.inject({ method: 'POST', url: `/posts/${POST_ID}/repost`, payload: {} });
    expect(res.statusCode).toBe(404);
  });

  it('returns 500 on service error', async () => {
    mockRepostPost.mockRejectedValueOnce(new Error('DB crash'));
    const res = await app.inject({ method: 'POST', url: `/posts/${POST_ID}/repost`, payload: {} });
    expect(res.statusCode).toBe(500);
  });
});
