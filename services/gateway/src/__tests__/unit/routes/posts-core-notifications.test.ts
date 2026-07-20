/**
 * GW1 — posts core routes must notify through the DECORATED
 * `fastify.notificationService` (wired with pushService + socket + email by
 * server.ts), not a bare local `new NotificationService(prisma)` whose
 * pushService/io are undefined (friend_new_post/story/mood silently lost).
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';

// ─── Mocks (NotificationService is deliberately NOT mocked: the route must not
//     instantiate it at all — it must use the decorated instance) ─────────────

const mockCreatePost = jest.fn<any>();
const mockGetPostById = jest.fn<any>();
const mockUpdatePost = jest.fn<any>();

jest.mock('../../../services/PostService', () => ({
  PostService: jest.fn().mockImplementation(() => ({
    createPost: (...args: any[]) => mockCreatePost(...args),
    getPostById: (...args: any[]) => mockGetPostById(...args),
    updatePost: (...args: any[]) => mockUpdatePost(...args),
    deletePost: jest.fn<any>().mockResolvedValue({ type: 'POST', visibility: 'PUBLIC' }),
  })),
}));

jest.mock('../../../services/posts/PostTranslationService', () => ({
  PostTranslationService: {
    shared: {
      translatePost: jest.fn<any>().mockResolvedValue(undefined),
      translateOnDemand: jest.fn<any>().mockResolvedValue(undefined),
    },
  },
}));

const mockExtractMentions = jest.fn<any>().mockReturnValue([]);
const mockResolveUsernames = jest.fn<any>().mockResolvedValue(new Map());

jest.mock('../../../services/MentionService', () => ({
  resolveMentionedUsers: jest.fn<any>().mockResolvedValue([]),
  MentionService: jest.fn().mockImplementation(() => ({
    extractMentions: (...args: any[]) => mockExtractMentions(...args),
    resolveUsernames: (...args: any[]) => mockResolveUsernames(...args),
    createPostMentions: jest.fn<any>().mockResolvedValue(undefined),
  })),
}));

jest.mock('../../../middleware/rate-limiter', () => ({
  createPostRouteRateLimitConfig: jest.fn<any>().mockReturnValue({}),
}));

jest.mock('../../../utils/withMutationLog', () => ({
  withMutationLog: jest.fn<any>().mockImplementation(({ op }: any) => op()),
}));

jest.mock('../../../utils/sanitize.js', () => ({
  SecuritySanitizer: { sanitizeText: jest.fn((t: string) => t) },
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { registerCoreRoutes } from '../../../routes/posts/core';

// ─── Constants ────────────────────────────────────────────────────────────────

const USER_ID = '507f1f77bcf86cd799439011';
const POST_ID = '507f1f77bcf86cd799439022';
const FRIEND_ID = '507f1f77bcf86cd799439033';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeAuth() {
  return async (req: FastifyRequest) => {
    (req as any).authContext = {
      isAuthenticated: true,
      registeredUser: { id: USER_ID, role: 'USER' },
    };
  };
}

function makeDecoratedNotificationService() {
  return {
    createPostMentionNotificationsBatch: jest.fn<any>().mockResolvedValue(undefined),
    createFriendContentNotificationsBatch: jest.fn<any>().mockResolvedValue(undefined),
  };
}

async function buildApp(opts: { withNotificationService?: boolean } = {}) {
  const { withNotificationService = true } = opts;
  const app = Fastify({ logger: false });
  const notificationService = makeDecoratedNotificationService();
  if (withNotificationService) {
    app.decorate('notificationService', notificationService as any);
  }
  registerCoreRoutes(app, {} as any, makeAuth());
  await app.ready();
  return { app, notificationService };
}

beforeEach(() => {
  mockCreatePost.mockReset().mockResolvedValue({
    id: POST_ID,
    content: 'Hello friends',
    type: 'POST',
    visibility: 'FRIENDS',
    visibilityUserIds: [FRIEND_ID],
    createdAt: new Date('2026-07-20T10:00:00.000Z'),
  });
  mockUpdatePost.mockReset().mockResolvedValue({
    id: POST_ID,
    content: 'Edited @bob',
    type: 'POST',
  });
  mockExtractMentions.mockReset().mockReturnValue([]);
  mockResolveUsernames.mockReset().mockResolvedValue(new Map());
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('POST /posts — friend content fan-out uses fastify.notificationService', () => {
  it('calls the decorated createFriendContentNotificationsBatch (wired push/socket instance)', async () => {
    const { app, notificationService } = await buildApp();

    const res = await app.inject({
      method: 'POST',
      url: '/posts',
      payload: { content: 'Hello friends', type: 'POST', visibility: 'FRIENDS' },
    });

    expect(res.statusCode).toBe(201);
    expect(notificationService.createFriendContentNotificationsBatch).toHaveBeenCalledTimes(1);
    expect(notificationService.createFriendContentNotificationsBatch).toHaveBeenCalledWith(
      expect.objectContaining({
        postId: POST_ID,
        authorId: USER_ID,
        contentType: 'POST',
        visibility: 'FRIENDS',
      })
    );

    await app.close();
  });

  it('routes post-body mention notifications through the decorated instance', async () => {
    const { app, notificationService } = await buildApp();
    mockExtractMentions.mockReturnValue(['bob']);
    mockResolveUsernames.mockResolvedValue(new Map([['bob', { id: FRIEND_ID }]]));

    const res = await app.inject({
      method: 'POST',
      url: '/posts',
      payload: { content: 'Hello @bob', type: 'POST', visibility: 'FRIENDS' },
    });

    expect(res.statusCode).toBe(201);
    expect(notificationService.createPostMentionNotificationsBatch).toHaveBeenCalledWith(
      expect.objectContaining({
        postId: POST_ID,
        posterId: USER_ID,
        mentionedUserIds: [FRIEND_ID],
      })
    );
    expect(notificationService.createFriendContentNotificationsBatch).toHaveBeenCalledWith(
      expect.objectContaining({ excludeUserIds: [FRIEND_ID] })
    );

    await app.close();
  });

  it('still creates the post when notificationService is not decorated (degraded boot)', async () => {
    const { app } = await buildApp({ withNotificationService: false });

    const res = await app.inject({
      method: 'POST',
      url: '/posts',
      payload: { content: 'Hello friends', type: 'POST', visibility: 'FRIENDS' },
    });

    expect(res.statusCode).toBe(201);

    await app.close();
  });
});

describe('PUT /posts/:postId — edit mentions use fastify.notificationService', () => {
  it('calls the decorated createPostMentionNotificationsBatch on edit', async () => {
    const { app, notificationService } = await buildApp();
    mockExtractMentions.mockReturnValue(['bob']);
    mockResolveUsernames.mockResolvedValue(new Map([['bob', { id: FRIEND_ID }]]));

    const res = await app.inject({
      method: 'PUT',
      url: `/posts/${POST_ID}`,
      payload: { content: 'Edited @bob' },
    });

    expect(res.statusCode).toBe(200);
    expect(notificationService.createPostMentionNotificationsBatch).toHaveBeenCalledWith(
      expect.objectContaining({
        postId: POST_ID,
        posterId: USER_ID,
        mentionedUserIds: [FRIEND_ID],
      })
    );

    await app.close();
  });
});
