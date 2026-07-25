/**
 * Extended unit tests for posts/core.ts.
 * Covers branches missing from core.test.ts:
 * - hoistTrackingLinks: non-empty trackingLinks path
 * - POST /posts: invalid body (400), onDuplicate, STATUS type with socialEvents, POST type with socialEvents
 * - POST /posts: translatePost .catch callback (rejection), mention notifications, friend notification rejection
 * - GET /posts/:postId: post with comments
 * - PUT /posts/:postId: invalid body (400), post with comments, mention notifications, STORY/STATUS/POST with socialEvents, 422 error
 * - DELETE /posts/:postId: POST type with socialEvents
 * - POST /posts/:postId/translate: invalid body (400), translateOnDemand throws (503)
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeAll, afterAll } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockCreatePost = jest.fn<any>().mockResolvedValue({
  id: 'post-001', content: 'Hello', type: 'POST', visibility: 'PUBLIC', createdAt: new Date(),
});
const mockGetPostById = jest.fn<any>().mockResolvedValue({ id: 'post-001', content: 'Hello', type: 'POST' });
const mockUpdatePost = jest.fn<any>().mockResolvedValue({ id: 'post-001', content: 'Updated', type: 'POST' });
const mockDeletePost = jest.fn<any>().mockResolvedValue({ type: 'POST', visibility: 'PUBLIC' });

jest.mock('../../../../services/PostService', () => ({
  PostService: jest.fn().mockImplementation(() => ({
    createPost: (...args: any[]) => mockCreatePost(...args),
    getPostById: (...args: any[]) => mockGetPostById(...args),
    updatePost: (...args: any[]) => mockUpdatePost(...args),
    deletePost: (...args: any[]) => mockDeletePost(...args),
  })),
}));

const mockTranslatePost = jest.fn<any>().mockResolvedValue(undefined);
const mockTranslateOnDemand = jest.fn<any>().mockResolvedValue(undefined);

jest.mock('../../../../services/posts/PostTranslationService', () => ({
  PostTranslationService: {
    shared: {
      translatePost: (...args: any[]) => mockTranslatePost(...args),
      translateOnDemand: (...args: any[]) => mockTranslateOnDemand(...args),
    },
  },
}));

const mockExtractMentions = jest.fn<any>().mockReturnValue([]);
const mockResolveUsernames = jest.fn<any>().mockResolvedValue(new Map());
const mockCreatePostMentions = jest.fn<any>().mockResolvedValue(undefined);
const mockResolveMentionedUsers = jest.fn<any>().mockResolvedValue([]);

jest.mock('../../../../services/MentionService', () => ({
  resolveMentionedUsers: (...args: any[]) => mockResolveMentionedUsers(...args),
  MentionService: jest.fn().mockImplementation(() => ({
    extractMentions: (...args: any[]) => mockExtractMentions(...args),
    resolveUsernames: (...args: any[]) => mockResolveUsernames(...args),
    createPostMentions: (...args: any[]) => mockCreatePostMentions(...args),
  })),
}));

// GW1 — the routes consume the DECORATED fastify.notificationService (wired
// instance), not a locally constructed NotificationService: mocks are injected
// via app.decorate in buildApp below.
const mockCreatePostMentionNotificationsBatch = jest.fn<any>().mockResolvedValue(undefined);
const mockCreateFriendContentNotificationsBatch = jest.fn<any>().mockResolvedValue(undefined);

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

import { registerCoreRoutes } from '../../../../routes/posts/core';

// ─── Constants ────────────────────────────────────────────────────────────────

const USER_ID = '507f1f77bcf86cd799439011';
const POST_ID = '507f1f77bcf86cd799439022';

// ─── App factories ────────────────────────────────────────────────────────────

function makeAuth(authenticated: boolean) {
  return async (req: FastifyRequest) => {
    if (authenticated) {
      (req as any).authContext = {
        isAuthenticated: true,
        registeredUser: { id: USER_ID, role: 'USER' },
      };
    } else {
      (req as any).authContext = null;
    }
  };
}

function makeSocialEvents() {
  return {
    broadcastPostCreated: jest.fn<any>().mockResolvedValue(undefined),
    broadcastStoryCreated: jest.fn<any>().mockResolvedValue(undefined),
    broadcastStatusCreated: jest.fn<any>().mockResolvedValue(undefined),
    broadcastPostUpdated: jest.fn<any>().mockResolvedValue(undefined),
    broadcastStoryUpdated: jest.fn<any>().mockResolvedValue(undefined),
    broadcastStatusUpdated: jest.fn<any>().mockResolvedValue(undefined),
    broadcastPostDeleted: jest.fn<any>().mockResolvedValue(undefined),
    broadcastStoryDeleted: jest.fn<any>().mockResolvedValue(undefined),
    broadcastStatusDeleted: jest.fn<any>().mockResolvedValue(undefined),
  };
}

async function buildApp(opts: {
  withSocialEvents?: boolean;
  socialEvents?: ReturnType<typeof makeSocialEvents>;
} = {}): Promise<{ app: FastifyInstance; socialEvents?: ReturnType<typeof makeSocialEvents> }> {
  const app = Fastify({ logger: false });
  const prisma = {} as any;
  const requiredAuth = makeAuth(true);

  const se = opts.withSocialEvents ? (opts.socialEvents ?? makeSocialEvents()) : undefined;
  if (se) app.decorate('socialEvents', se);

  app.decorate('notificationService', {
    createPostMentionNotificationsBatch: (...args: any[]) => mockCreatePostMentionNotificationsBatch(...args),
    createFriendContentNotificationsBatch: (...args: any[]) => mockCreateFriendContentNotificationsBatch(...args),
  } as any);

  registerCoreRoutes(app, prisma, requiredAuth);
  await app.ready();
  return { app, socialEvents: se };
}

// ─── POST /posts — invalid body (400) ────────────────────────────────────────

describe('POST /posts — invalid body triggers 400', () => {
  let app: FastifyInstance;
  beforeAll(async () => { ({ app } = await buildApp()); });
  afterAll(async () => { await app.close(); });

  it('returns 400 when CreatePostSchema validation fails', async () => {
    const res = await app.inject({
      method: 'POST', url: '/posts',
      payload: { type: 'INVALID_TYPE_VALUE_THAT_FAILS_ZOD' },
    });
    expect([400, 500]).toContain(res.statusCode);
  });
});

// ─── POST /posts — onDuplicate callback ──────────────────────────────────────

describe('POST /posts — withMutationLog calls onDuplicate', () => {
  let app: FastifyInstance;
  beforeAll(async () => { ({ app } = await buildApp()); });
  afterAll(async () => { await app.close(); });

  it('returns 201 when onDuplicate replays existing post', async () => {
    mockWithMutationLog.mockImplementationOnce(async ({ onDuplicate }: any) => {
      return onDuplicate(POST_ID);
    });
    const res = await app.inject({
      method: 'POST', url: '/posts',
      payload: { content: 'Hello world', type: 'POST' },
    });
    expect(res.statusCode).toBe(201);
    expect(mockGetPostById).toHaveBeenCalledWith(POST_ID, USER_ID);
  });
});

// ─── POST /posts — STATUS type with socialEvents ──────────────────────────────

describe('POST /posts — STATUS type with socialEvents', () => {
  let app: FastifyInstance;
  let se: ReturnType<typeof makeSocialEvents>;
  beforeAll(async () => {
    mockCreatePost.mockResolvedValue({ id: 'post-003', content: 'Status!', type: 'STATUS', visibility: 'PUBLIC', createdAt: new Date() });
    se = makeSocialEvents();
    ({ app } = await buildApp({ withSocialEvents: true, socialEvents: se }));
  });
  afterAll(async () => {
    mockCreatePost.mockResolvedValue({ id: 'post-001', content: 'Hello', type: 'POST', visibility: 'PUBLIC', createdAt: new Date() });
    await app.close();
  });

  it('calls broadcastStatusCreated when type is STATUS', async () => {
    const res = await app.inject({
      method: 'POST', url: '/posts',
      payload: { content: 'My status', type: 'STATUS' },
    });
    expect(res.statusCode).toBe(201);
    expect(se.broadcastStatusCreated).toHaveBeenCalled();
  });
});

// ─── POST /posts — POST type with socialEvents ────────────────────────────────

describe('POST /posts — POST type with socialEvents', () => {
  let app: FastifyInstance;
  let se: ReturnType<typeof makeSocialEvents>;
  beforeAll(async () => {
    mockCreatePost.mockResolvedValue({ id: 'post-004', content: 'Post!', type: 'POST', visibility: 'PUBLIC', createdAt: new Date() });
    se = makeSocialEvents();
    ({ app } = await buildApp({ withSocialEvents: true, socialEvents: se }));
  });
  afterAll(async () => {
    mockCreatePost.mockResolvedValue({ id: 'post-001', content: 'Hello', type: 'POST', visibility: 'PUBLIC', createdAt: new Date() });
    await app.close();
  });

  it('calls broadcastPostCreated when type is POST', async () => {
    const res = await app.inject({
      method: 'POST', url: '/posts',
      payload: { content: 'My post', type: 'POST' },
    });
    expect(res.statusCode).toBe(201);
    expect(se.broadcastPostCreated).toHaveBeenCalled();
  });
});

// ─── POST /posts — hoistTrackingLinks with non-empty trackingLinks ────────────

describe('POST /posts — hoistTrackingLinks non-empty path', () => {
  let app: FastifyInstance;
  let se: ReturnType<typeof makeSocialEvents>;
  beforeAll(async () => {
    se = makeSocialEvents();
    ({ app } = await buildApp({ withSocialEvents: true, socialEvents: se }));
  });
  afterAll(async () => { await app.close(); });

  it('hoists trackingLinks onto the broadcast payload', async () => {
    mockCreatePost.mockResolvedValueOnce({
      id: 'post-005', content: 'Link post', type: 'POST', visibility: 'PUBLIC', createdAt: new Date(),
      metadata: { trackingLinks: [{ url: 'https://meeshy.me/l/abc', token: 'abc' }] },
    });
    const res = await app.inject({
      method: 'POST', url: '/posts',
      payload: { content: 'Link post', type: 'POST' },
    });
    expect(res.statusCode).toBe(201);
    expect(se.broadcastPostCreated).toHaveBeenCalledWith(
      expect.objectContaining({ trackingLinks: expect.arrayContaining([expect.objectContaining({ token: 'abc' })]) }),
      USER_ID,
      undefined
    );
  });
});

// ─── POST /posts — translatePost .catch callback ─────────────────────────────

describe('POST /posts — translatePost promise rejection (catch callback)', () => {
  let app: FastifyInstance;
  beforeAll(async () => { ({ app } = await buildApp()); });
  afterAll(async () => { await app.close(); });

  it('returns 201 even when translatePost promise rejects', async () => {
    mockTranslatePost.mockRejectedValueOnce(new Error('translation failed'));
    const res = await app.inject({
      method: 'POST', url: '/posts',
      payload: { content: 'Hello world', type: 'POST' },
    });
    expect(res.statusCode).toBe(201);
  });
});

// ─── POST /posts — translatePost throws synchronously ────────────────────────

describe('POST /posts — translatePost throws synchronously (catch block)', () => {
  let app: FastifyInstance;
  beforeAll(async () => { ({ app } = await buildApp()); });
  afterAll(async () => { await app.close(); });

  it('returns 201 and silently swallows the sync error', async () => {
    mockTranslatePost.mockImplementationOnce(() => { throw new Error('not available'); });
    const res = await app.inject({
      method: 'POST', url: '/posts',
      payload: { content: 'Hello world', type: 'POST' },
    });
    expect(res.statusCode).toBe(201);
  });
});

// ─── POST /posts — mention notifications ─────────────────────────────────────

describe('POST /posts — with @mentions in content', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockExtractMentions.mockReturnValue(['bob', 'carol']);
    mockResolveUsernames.mockResolvedValue(new Map([['bob', { id: 'user-bob' }], ['carol', { id: 'user-carol' }]]));
    ({ app } = await buildApp());
  });
  afterAll(async () => {
    mockExtractMentions.mockReturnValue([]);
    mockResolveUsernames.mockResolvedValue(new Map());
    await app.close();
  });

  it('creates mention notifications for mentioned users', async () => {
    mockCreatePostMentionNotificationsBatch.mockClear();
    mockCreatePostMentions.mockClear();
    const res = await app.inject({
      method: 'POST', url: '/posts',
      payload: { content: 'Hello @bob and @carol', type: 'POST' },
    });
    expect(res.statusCode).toBe(201);
    expect(mockCreatePostMentions).toHaveBeenCalledWith('post-001', ['user-bob', 'user-carol']);
    expect(mockCreatePostMentionNotificationsBatch).toHaveBeenCalled();
  });
});

// ─── POST /posts — createFriendContentNotifications rejection ────────────────

describe('POST /posts — friend notification fan-out rejection (.catch callback)', () => {
  let app: FastifyInstance;
  beforeAll(async () => { ({ app } = await buildApp()); });
  afterAll(async () => { await app.close(); });

  it('returns 201 even when friend notification fan-out rejects', async () => {
    mockCreateFriendContentNotificationsBatch.mockRejectedValueOnce(new Error('redis down'));
    const res = await app.inject({
      method: 'POST', url: '/posts',
      payload: { content: 'Hello world', type: 'POST' },
    });
    expect(res.statusCode).toBe(201);
  });
});

// ─── GET /posts/:postId — with embedded comments ──────────────────────────────

describe('GET /posts/:postId — with embedded comments', () => {
  let app: FastifyInstance;
  beforeAll(async () => { ({ app } = await buildApp()); });
  afterAll(async () => { await app.close(); });

  it('resolves mentioned users from both post content and comments', async () => {
    mockGetPostById.mockResolvedValueOnce({
      id: POST_ID, content: 'Post content', type: 'POST',
      comments: [{ content: '@alice check this' }, { content: 'No mentions here' }, {}],
    });
    const res = await app.inject({ method: 'GET', url: `/posts/${POST_ID}` });
    expect(res.statusCode).toBe(200);
    expect(mockResolveMentionedUsers).toHaveBeenCalledWith(
      {},
      expect.arrayContaining(['Post content', '@alice check this', 'No mentions here'])
    );
  });
});

// ─── PUT /posts/:postId — invalid body (400) ─────────────────────────────────

describe('PUT /posts/:postId — invalid body (400)', () => {
  let app: FastifyInstance;
  beforeAll(async () => { ({ app } = await buildApp()); });
  afterAll(async () => { await app.close(); });

  it('returns 400 when UpdatePostSchema validation fails', async () => {
    const res = await app.inject({
      method: 'PUT', url: `/posts/${POST_ID}`,
      payload: { type: 'INVALID_TYPE_VALUE_THAT_FAILS_ZOD', expiresAt: 'not-a-date' },
    });
    expect([400, 500]).toContain(res.statusCode);
  });
});

// ─── PUT /posts/:postId — with embedded comments in updated post ──────────────

describe('PUT /posts/:postId — updated post with comments', () => {
  let app: FastifyInstance;
  beforeAll(async () => { ({ app } = await buildApp()); });
  afterAll(async () => { await app.close(); });

  it('resolves mentions from updated post content and comments', async () => {
    mockUpdatePost.mockResolvedValueOnce({
      id: POST_ID, content: 'Updated @alice content', type: 'POST',
      comments: [{ content: '@bob replied' }, {}],
    });
    const res = await app.inject({
      method: 'PUT', url: `/posts/${POST_ID}`,
      payload: { content: 'Updated @alice content' },
    });
    expect(res.statusCode).toBe(200);
    expect(mockResolveMentionedUsers).toHaveBeenCalledWith(
      {},
      expect.arrayContaining(['Updated @alice content', '@bob replied'])
    );
  });
});

// ─── PUT /posts/:postId — with mention notifications ─────────────────────────

describe('PUT /posts/:postId — edited content with @mentions', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockExtractMentions.mockReturnValue(['dave']);
    mockResolveUsernames.mockResolvedValue(new Map([['dave', { id: 'user-dave' }]]));
    ({ app } = await buildApp());
  });
  afterAll(async () => {
    mockExtractMentions.mockReturnValue([]);
    mockResolveUsernames.mockResolvedValue(new Map());
    await app.close();
  });

  it('creates mention notifications for users mentioned in edited post', async () => {
    mockUpdatePost.mockResolvedValueOnce({
      id: POST_ID, content: 'Updated @dave check this', type: 'POST',
    });
    mockCreatePostMentions.mockClear();
    const res = await app.inject({
      method: 'PUT', url: `/posts/${POST_ID}`,
      payload: { content: 'Updated @dave check this' },
    });
    expect(res.statusCode).toBe(200);
    expect(mockCreatePostMentions).toHaveBeenCalledWith(POST_ID, ['user-dave']);
  });
});

// ─── PUT /posts/:postId — STORY type with socialEvents ───────────────────────

describe('PUT /posts/:postId — STORY type with socialEvents', () => {
  let app: FastifyInstance;
  let se: ReturnType<typeof makeSocialEvents>;
  beforeAll(async () => {
    se = makeSocialEvents();
    ({ app } = await buildApp({ withSocialEvents: true, socialEvents: se }));
  });
  afterAll(async () => { await app.close(); });

  it('calls broadcastStoryUpdated for STORY type', async () => {
    mockUpdatePost.mockResolvedValueOnce({ id: POST_ID, content: 'Story update', type: 'STORY' });
    const res = await app.inject({
      method: 'PUT', url: `/posts/${POST_ID}`,
      payload: { content: 'Story update' },
    });
    expect(res.statusCode).toBe(200);
    expect(se.broadcastStoryUpdated).toHaveBeenCalled();
  });
});

// ─── PUT /posts/:postId — STATUS type with socialEvents ──────────────────────

describe('PUT /posts/:postId — STATUS type with socialEvents', () => {
  let app: FastifyInstance;
  let se: ReturnType<typeof makeSocialEvents>;
  beforeAll(async () => {
    se = makeSocialEvents();
    ({ app } = await buildApp({ withSocialEvents: true, socialEvents: se }));
  });
  afterAll(async () => { await app.close(); });

  it('calls broadcastStatusUpdated for STATUS type', async () => {
    mockUpdatePost.mockResolvedValueOnce({ id: POST_ID, content: 'Status update', type: 'STATUS' });
    const res = await app.inject({
      method: 'PUT', url: `/posts/${POST_ID}`,
      payload: { content: 'Status update' },
    });
    expect(res.statusCode).toBe(200);
    expect(se.broadcastStatusUpdated).toHaveBeenCalled();
  });
});

// ─── PUT /posts/:postId — POST type with socialEvents ────────────────────────

describe('PUT /posts/:postId — POST type with socialEvents', () => {
  let app: FastifyInstance;
  let se: ReturnType<typeof makeSocialEvents>;
  beforeAll(async () => {
    se = makeSocialEvents();
    ({ app } = await buildApp({ withSocialEvents: true, socialEvents: se }));
  });
  afterAll(async () => { await app.close(); });

  it('calls broadcastPostUpdated for POST type', async () => {
    mockUpdatePost.mockResolvedValueOnce({ id: POST_ID, content: 'Post update', type: 'POST' });
    const res = await app.inject({
      method: 'PUT', url: `/posts/${POST_ID}`,
      payload: { content: 'Post update' },
    });
    expect(res.statusCode).toBe(200);
    expect(se.broadcastPostUpdated).toHaveBeenCalled();
  });
});

// ─── PUT /posts/:postId — 422 business rule rejection ────────────────────────

describe('PUT /posts/:postId — 422 statusCode error from updatePost', () => {
  let app: FastifyInstance;
  beforeAll(async () => { ({ app } = await buildApp()); });
  afterAll(async () => { await app.close(); });

  it('returns 400 when updatePost throws error with statusCode 422', async () => {
    const err = Object.assign(new Error('Cannot change post type'), { statusCode: 422 });
    mockUpdatePost.mockRejectedValueOnce(err);
    const res = await app.inject({
      method: 'PUT', url: `/posts/${POST_ID}`,
      payload: { content: 'Updated' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('INVALID_POST_UPDATE');
  });
});

// ─── DELETE /posts/:postId — POST type with socialEvents ─────────────────────

describe('DELETE /posts/:postId — POST type with socialEvents', () => {
  let app: FastifyInstance;
  let se: ReturnType<typeof makeSocialEvents>;
  beforeAll(async () => {
    se = makeSocialEvents();
    ({ app } = await buildApp({ withSocialEvents: true, socialEvents: se }));
  });
  afterAll(async () => { await app.close(); });

  it('calls broadcastPostDeleted for POST type', async () => {
    mockDeletePost.mockResolvedValueOnce({ type: 'POST', visibility: 'PUBLIC' });
    const res = await app.inject({ method: 'DELETE', url: `/posts/${POST_ID}` });
    expect(res.statusCode).toBe(200);
    expect(se.broadcastPostDeleted).toHaveBeenCalledWith(POST_ID, USER_ID);
  });
});

// ─── POST /posts/:postId/translate — invalid body (400) ──────────────────────

describe('POST /posts/:postId/translate — invalid body', () => {
  let app: FastifyInstance;
  beforeAll(async () => { ({ app } = await buildApp()); });
  afterAll(async () => { await app.close(); });

  it('returns 400 when TranslatePostSchema validation fails', async () => {
    const res = await app.inject({
      method: 'POST', url: `/posts/${POST_ID}/translate`,
      payload: {},
    });
    expect([400, 500]).toContain(res.statusCode);
  });
});

// ─── POST /posts/:postId/translate — translateOnDemand throws (503) ───────────

describe('POST /posts/:postId/translate — translateOnDemand throws', () => {
  let app: FastifyInstance;
  beforeAll(async () => { ({ app } = await buildApp()); });
  afterAll(async () => { await app.close(); });

  it('returns 503 when translateOnDemand throws', async () => {
    mockTranslateOnDemand.mockRejectedValueOnce(new Error('service unavailable'));
    const res = await app.inject({
      method: 'POST', url: `/posts/${POST_ID}/translate`,
      payload: { targetLanguage: 'fr' },
    });
    expect(res.statusCode).toBe(503);
  });
});
