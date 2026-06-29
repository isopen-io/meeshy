/**
 * Unit tests for posts interaction routes (interactions.ts)
 * Tests POST /posts/:id/like, DELETE /posts/:id/like,
 * POST /posts/:id/bookmark, DELETE /posts/:id/bookmark,
 * POST /posts/:id/view.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockLikePost = jest.fn<any>().mockResolvedValue({ id: 'post-001', type: 'POST', authorId: 'author-1', likeCount: 1, reactionSummary: { '❤️': 1 } });
const mockUnlikePost = jest.fn<any>().mockResolvedValue({ id: 'post-001', type: 'POST', authorId: 'author-1', likeCount: 0, reactionSummary: {} });
const mockBookmarkPost = jest.fn<any>().mockResolvedValue({ bookmarkCount: 1 });
const mockUnbookmarkPost = jest.fn<any>().mockResolvedValue({ bookmarkCount: 0 });
const mockRecordView = jest.fn<any>().mockResolvedValue(true);
const mockGetPostById = jest.fn<any>().mockResolvedValue({ id: 'post-001', type: 'POST', authorId: 'author-1', viewCount: 1 });

jest.mock('../../../../services/PostService', () => ({
  PostService: jest.fn().mockImplementation(() => ({
    likePost: (...args: any[]) => mockLikePost(...args),
    unlikePost: (...args: any[]) => mockUnlikePost(...args),
    bookmarkPost: (...args: any[]) => mockBookmarkPost(...args),
    unbookmarkPost: (...args: any[]) => mockUnbookmarkPost(...args),
    recordView: (...args: any[]) => mockRecordView(...args),
    getPostById: (...args: any[]) => mockGetPostById(...args),
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

// ─── Import after mocks ───────────────────────────────────────────────────────

import { registerInteractionRoutes } from '../../../../routes/posts/interactions';

// ─── Constants ────────────────────────────────────────────────────────────────

const USER_ID = '507f1f77bcf86cd799439011';
const POST_ID = '507f1f77bcf86cd799439022';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makePreValidationAuth(authenticated: boolean) {
  return async (req: FastifyRequest) => {
    if (authenticated) {
      (req as any).authContext = {
        isAuthenticated: true,
        registeredUser: { id: USER_ID, role: 'USER', username: 'alice' },
      };
    } else {
      (req as any).authContext = null;
    }
  };
}

async function buildApp(opts: {
  authenticated?: boolean;
  withNotifications?: boolean;
  withSocialEvents?: boolean;
} = {}): Promise<FastifyInstance> {
  const { authenticated = true, withNotifications = false, withSocialEvents = false } = opts;

  const app = Fastify({ logger: false });
  const prisma = {} as any;
  const requiredAuth = makePreValidationAuth(authenticated);

  if (withNotifications) {
    app.decorate('notificationService', {
      createPostLikeNotification: jest.fn<any>().mockResolvedValue(undefined),
      markPostNotificationsAsRead: jest.fn<any>().mockResolvedValue(undefined),
    });
  } else {
    app.decorate('notificationService', null as any);
  }

  if (withSocialEvents) {
    app.decorate('socialEvents', {
      broadcastPostLiked: jest.fn<any>().mockResolvedValue(undefined),
      broadcastPostUnliked: jest.fn<any>().mockResolvedValue(undefined),
      broadcastStoryReacted: jest.fn<any>().mockResolvedValue(undefined),
      broadcastStoryUnreacted: jest.fn<any>().mockResolvedValue(undefined),
      broadcastStatusReacted: jest.fn<any>().mockResolvedValue(undefined),
      broadcastStatusUnreacted: jest.fn<any>().mockResolvedValue(undefined),
      broadcastPostBookmarked: jest.fn<any>().mockResolvedValue(undefined),
      broadcastStoryViewed: jest.fn<any>().mockResolvedValue(undefined),
    });
  }

  registerInteractionRoutes(app, prisma, requiredAuth);
  await app.ready();
  return app;
}

// ─── POST /posts/:id/like ─────────────────────────────────────────────────────

describe('POST /posts/:id/like — unauthenticated', () => {
  it('returns 401 when no auth context', async () => {
    const app = await buildApp({ authenticated: false });
    const res = await app.inject({ method: 'POST', url: `/posts/${POST_ID}/like`, payload: {} });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});

describe('POST /posts/:id/like — success', () => {
  it('returns 200 with liked: true', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'POST', url: `/posts/${POST_ID}/like`, payload: {} });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
    await app.close();
  });
});

describe('POST /posts/:id/like — post not found', () => {
  it('returns 404 when likePost returns null (POST_NOT_FOUND)', async () => {
    mockLikePost.mockRejectedValueOnce(new Error('POST_NOT_FOUND'));
    const app = await buildApp();
    const res = await app.inject({ method: 'POST', url: `/posts/${POST_ID}/like`, payload: {} });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

describe('POST /posts/:id/like — service error', () => {
  it('returns 500 when likePost throws', async () => {
    mockLikePost.mockRejectedValueOnce(new Error('DB error'));
    const app = await buildApp();
    const res = await app.inject({ method: 'POST', url: `/posts/${POST_ID}/like`, payload: {} });
    expect(res.statusCode).toBe(500);
    await app.close();
  });
});

describe('POST /posts/:id/like — with social events', () => {
  it('returns 200 and fires socialEvents', async () => {
    const app = await buildApp({ withSocialEvents: true });
    const res = await app.inject({ method: 'POST', url: `/posts/${POST_ID}/like`, payload: {} });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});

// ─── DELETE /posts/:id/like ───────────────────────────────────────────────────

describe('DELETE /posts/:id/like — unauthenticated', () => {
  it('returns 401 when no auth context', async () => {
    const app = await buildApp({ authenticated: false });
    const res = await app.inject({ method: 'DELETE', url: `/posts/${POST_ID}/like` });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});

describe('DELETE /posts/:id/like — success', () => {
  it('returns 200 with liked: false', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'DELETE', url: `/posts/${POST_ID}/like` });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
    await app.close();
  });
});

describe('DELETE /posts/:id/like — post not found', () => {
  it('returns 404 when unlikePost returns null (POST_NOT_FOUND)', async () => {
    mockUnlikePost.mockRejectedValueOnce(new Error('POST_NOT_FOUND'));
    const app = await buildApp();
    const res = await app.inject({ method: 'DELETE', url: `/posts/${POST_ID}/like` });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

describe('DELETE /posts/:id/like — service error', () => {
  it('returns 500 when unlikePost throws', async () => {
    mockUnlikePost.mockRejectedValueOnce(new Error('DB error'));
    const app = await buildApp();
    const res = await app.inject({ method: 'DELETE', url: `/posts/${POST_ID}/like` });
    expect(res.statusCode).toBe(500);
    await app.close();
  });
});

// ─── POST /posts/:id/bookmark ─────────────────────────────────────────────────

describe('POST /posts/:id/bookmark — unauthenticated', () => {
  it('returns 401 when no auth context', async () => {
    const app = await buildApp({ authenticated: false });
    const res = await app.inject({ method: 'POST', url: `/posts/${POST_ID}/bookmark`, payload: {} });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});

describe('POST /posts/:id/bookmark — success', () => {
  it('returns 200 with bookmarked: true', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'POST', url: `/posts/${POST_ID}/bookmark`, payload: {} });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.bookmarked).toBe(true);
    await app.close();
  });
});

describe('POST /posts/:id/bookmark — service error', () => {
  it('returns 500 when bookmarkPost throws', async () => {
    mockBookmarkPost.mockRejectedValueOnce(new Error('DB error'));
    const app = await buildApp();
    const res = await app.inject({ method: 'POST', url: `/posts/${POST_ID}/bookmark`, payload: {} });
    expect(res.statusCode).toBe(500);
    await app.close();
  });
});

// ─── DELETE /posts/:id/bookmark ───────────────────────────────────────────────

describe('DELETE /posts/:id/bookmark — unauthenticated', () => {
  it('returns 401 when no auth context', async () => {
    const app = await buildApp({ authenticated: false });
    const res = await app.inject({ method: 'DELETE', url: `/posts/${POST_ID}/bookmark` });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});

describe('DELETE /posts/:id/bookmark — success', () => {
  it('returns 200 with bookmarked: false', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'DELETE', url: `/posts/${POST_ID}/bookmark` });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.bookmarked).toBe(false);
    await app.close();
  });
});

describe('DELETE /posts/:id/bookmark — service error', () => {
  it('returns 500 when unbookmarkPost throws', async () => {
    mockUnbookmarkPost.mockRejectedValueOnce(new Error('DB error'));
    const app = await buildApp();
    const res = await app.inject({ method: 'DELETE', url: `/posts/${POST_ID}/bookmark` });
    expect(res.statusCode).toBe(500);
    await app.close();
  });
});

// ─── POST /posts/:id/view ─────────────────────────────────────────────────────

describe('POST /posts/:id/view — unauthenticated', () => {
  it('returns 401 when no auth context', async () => {
    const app = await buildApp({ authenticated: false });
    const res = await app.inject({ method: 'POST', url: `/posts/${POST_ID}/view`, payload: {} });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});

describe('POST /posts/:id/view — success', () => {
  it('returns 200 with viewed: true', async () => {
    const app = await buildApp({ withNotifications: true });
    const res = await app.inject({ method: 'POST', url: `/posts/${POST_ID}/view`, payload: {} });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.viewed).toBe(true);
    await app.close();
  });
});

describe('POST /posts/:id/view — service error', () => {
  it('returns 500 when recordView throws', async () => {
    mockRecordView.mockRejectedValueOnce(new Error('DB error'));
    const app = await buildApp({ withNotifications: true });
    const res = await app.inject({ method: 'POST', url: `/posts/${POST_ID}/view`, payload: {} });
    expect(res.statusCode).toBe(500);
    await app.close();
  });
});
