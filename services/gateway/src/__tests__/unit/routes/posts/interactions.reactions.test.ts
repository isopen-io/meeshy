/**
 * Réactions et favoris — `like`, `unlike`, `bookmark`, `unbookmark`.
 *
 * Découpé de `interactions.test.ts` (1798 lignes, plafond 1000) par
 * RESPONSABILITÉ — #4605 lot 3. L'échafaudage partagé, ses doubles et
 * `buildApp` vivent dans `interactions.harness.ts` ; sa doc-comment explique
 * pourquoi les `jest.mock` doivent rester ICI et pourquoi l'import de la route
 * peut, lui, être au sommet du harnais.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';

// ─── Mocks — hissés au sommet de CE module, donc déclarés ici ────────────────

jest.mock('../../../../services/PostService', () => require('./interactions.harness').postServiceModule());
jest.mock('../../../../services/MediaService', () => require('./interactions.harness').mediaServiceModule());
jest.mock('../../../../services/MentionService', () => require('./interactions.harness').mentionServiceModule());
jest.mock('../../../../services/TrackingLinkService', () => require('./interactions.harness').trackingLinkServiceModule());
jest.mock('../../../../middleware/rate-limiter', () => require('./interactions.harness').rateLimiterModule());
jest.mock('../../../../utils/withMutationLog', () =>
  require('./interactions.harness').withMutationLogModule(
    jest.requireActual('../../../../utils/withMutationLog') as object
  )
);
jest.mock('../../../../services/CacheStore', () => require('./interactions.harness').cacheStoreModule());

// ─── Import après les mocks ──────────────────────────────────────────────────

import Fastify from 'fastify';

import { registerInteractionRoutes } from '../../../../routes/posts/interactions';
import { ConflictError } from '../../../../errors/custom-errors';
import { REACTION_LIMIT_REACHED_MESSAGE } from '@meeshy/shared/utils/reaction-limit';
import {
  makePreValidationAuth,
  buildApp,
  aclAwareFindMany,
  aclAwareFindFirst,
  publicAcl,
  USER_ID,
  POST_ID,
  mockLikePost,
  mockUnlikePost,
  mockBookmarkPost,
  mockUnbookmarkPost,
  mockRecordView,
  mockGetPostById,
  mockRecordAnonymousOpen,
  mockSharePost,
  mockShareWithTrackingLink,
  mockGetPostShareLink,
  mockPinPost,
  mockUnpinPost,
  mockGetPostViews,
  mockGetPostInteractions,
  mockRepostPost,
  mockRecordEngagementBatch,
} from './interactions.harness';

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
  it('returns 404 when likePost throws POST_NOT_FOUND', async () => {
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

describe('POST /posts/:id/like — reaction limit reached', () => {
  it('returns 409 with the reaction-limit message when likePost rejects with ConflictError', async () => {
    // `likePost` → `PostReactionService.addReaction` refuse la 6e réaction
    // distincte d'une personne sur le même post (ou la même story/statut,
    // même service — cf. PostReactionService.reactionLimit.test.ts) en levant
    // un `ConflictError`. La route le reconnaît déjà via `instanceof` : ce
    // test prouve qu'il ne retombe PAS sur le 500 générique.
    mockLikePost.mockRejectedValueOnce(
      new ConflictError(REACTION_LIMIT_REACHED_MESSAGE, 'REACTION_LIMIT_REACHED')
    );
    const app = await buildApp();
    const res = await app.inject({ method: 'POST', url: `/posts/${POST_ID}/like`, payload: {} });
    expect(res.statusCode).toBe(409);
    const body = res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe(REACTION_LIMIT_REACHED_MESSAGE);
    expect(body.code).toBe('REACTION_LIMIT_REACHED');
    await app.close();
  });
});

describe('POST /posts/:id/like — with social events (POST type)', () => {
  it('returns 200 and fires post liked broadcast', async () => {
    const app = await buildApp({ withSocialEvents: true });
    const res = await app.inject({ method: 'POST', url: `/posts/${POST_ID}/like`, payload: {} });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});

describe('POST /posts/:id/like — STORY type broadcast', () => {
  it('returns 200 and fires story reacted broadcast', async () => {
    mockLikePost.mockResolvedValueOnce({ id: 'story-001', type: 'STORY', authorId: 'author-1', likeCount: 1, reactionSummary: {} });
    const app = await buildApp({ withSocialEvents: true, withNotifications: true });
    const res = await app.inject({ method: 'POST', url: `/posts/${POST_ID}/like`, payload: { emoji: '🔥' } });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});

describe('POST /posts/:id/like — STATUS type broadcast', () => {
  it('returns 200 and fires status reacted broadcast', async () => {
    mockLikePost.mockResolvedValueOnce({ id: 'status-001', type: 'STATUS', authorId: 'author-1', likeCount: 1, reactionSummary: {} });
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
  it('returns 404 when unlikePost throws POST_NOT_FOUND', async () => {
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

describe('DELETE /posts/:id/like — STORY type broadcast', () => {
  it('returns 200 and fires story unreacted broadcast', async () => {
    mockUnlikePost.mockResolvedValueOnce({ id: 'story-001', removedEmoji: '❤️', post: { id: 'story-001', type: 'STORY', authorId: 'author-1', likeCount: 0, reactionSummary: {} } });
    const app = await buildApp({ withSocialEvents: true });
    const res = await app.inject({ method: 'DELETE', url: `/posts/${POST_ID}/like` });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});

describe('DELETE /posts/:id/like — STATUS type broadcast', () => {
  it('returns 200 and fires status unreacted broadcast', async () => {
    mockUnlikePost.mockResolvedValueOnce({ id: 'status-001', removedEmoji: '❤️', post: { id: 'status-001', type: 'STATUS', authorId: 'author-1', likeCount: 0, reactionSummary: {} } });
    const app = await buildApp({ withSocialEvents: true });
    const res = await app.inject({ method: 'DELETE', url: `/posts/${POST_ID}/like` });
    expect(res.statusCode).toBe(200);
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

describe('POST /posts/:id/like — onDuplicate replay path', () => {
  it('returns 200 when mutation log replays via onDuplicate', async () => {
    const { withMutationLog } = jest.requireMock('../../../../utils/withMutationLog') as any;
    withMutationLog.mockImplementationOnce(async ({ onDuplicate }: any) => {
      return onDuplicate('post-001');
    });
    mockGetPostById.mockResolvedValueOnce({ id: 'post-001', type: 'POST', authorId: 'author-1', likeCount: 1, reactionSummary: { '❤️': 1 } });
    const app = await buildApp();
    const res = await app.inject({ method: 'POST', url: `/posts/${POST_ID}/like`, payload: {} });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});

// ─── POST /posts/:id/like — POST type with notifications (lines 97, 113) ────

describe('POST /posts/:id/like — POST type with social events and notifications', () => {
  it('returns 200 and fires post liked broadcast and notification for POST type', async () => {
    mockLikePost.mockResolvedValueOnce({ id: 'post-001', type: 'POST', authorId: 'author-1', likeCount: 5, reactionSummary: { '❤️': 5 }, visibility: 'PUBLIC', visibilityUserIds: [] });
    const app = await buildApp({ withSocialEvents: true, withNotifications: true });
    const res = await app.inject({ method: 'POST', url: `/posts/${POST_ID}/like`, payload: { emoji: '❤️' } });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});

// ─── DELETE /posts/:id/like — onDuplicate path (lines 149-150) ───────────────

describe('DELETE /posts/:id/like — onDuplicate replay path', () => {
  it('returns 200 when mutation log replays via onDuplicate', async () => {
    const { withMutationLog } = jest.requireMock('../../../../utils/withMutationLog') as any;
    withMutationLog.mockImplementationOnce(async ({ onDuplicate }: any) => {
      return onDuplicate('post-001');
    });
    mockGetPostById.mockResolvedValueOnce({ id: 'post-001', type: 'POST', authorId: 'author-1', likeCount: 0, reactionSummary: {} });
    const app = await buildApp();
    const res = await app.inject({ method: 'DELETE', url: `/posts/${POST_ID}/like` });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});

// ─── DELETE /posts/:id/like — POST type broadcast (lines 176-185) ────────────

describe('DELETE /posts/:id/like — POST type with social events broadcasts post unliked', () => {
  it('returns 200 and fires broadcastPostUnliked for POST type', async () => {
    mockUnlikePost.mockResolvedValueOnce({ id: 'post-001', removedEmoji: '❤️', post: { id: 'post-001', type: 'POST', authorId: 'author-1', likeCount: 0, reactionSummary: {}, visibility: 'PUBLIC', visibilityUserIds: [] } });
    const app = await buildApp({ withSocialEvents: true });
    const res = await app.inject({ method: 'DELETE', url: `/posts/${POST_ID}/like` });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});

// ─── POST /posts/:id/repost — notification with original post (lines 698-715) ─

describe('POST /posts/:id/like — broadcastPostLiked rejects (line 97)', () => {
  it('returns 200 even when broadcast rejects', async () => {
    mockLikePost.mockResolvedValueOnce({ id: 'post-001', type: 'POST', authorId: 'author-1', likeCount: 1, reactionSummary: { '❤️': 1 }, visibility: 'PUBLIC', visibilityUserIds: [] });

    const app = Fastify({ logger: false });
    const prisma = {
      postImpression: { create: jest.fn<any>().mockResolvedValue({}), createMany: jest.fn<any>().mockResolvedValue({ count: 0 }) },
      // Audience déclarée PUBLIC (cf. `interactions-audience.test.ts`).
      post: {
        update: jest.fn<any>().mockResolvedValue({}),
        updateMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
        findFirst: jest.fn<any>().mockResolvedValue({
          authorId: 'author-1', visibility: 'PUBLIC', visibilityUserIds: [],
        }),
      },
    };
    app.decorate('prisma', prisma);
    app.decorate('notificationService', null as any);
    app.decorate('socialEvents', {
      broadcastPostLiked: jest.fn<any>().mockRejectedValue(new Error('Socket error')),
      broadcastPostUnliked: jest.fn<any>().mockResolvedValue(undefined),
      broadcastStoryReacted: jest.fn<any>().mockResolvedValue(undefined),
      broadcastStoryUnreacted: jest.fn<any>().mockResolvedValue(undefined),
      broadcastStatusReacted: jest.fn<any>().mockResolvedValue(undefined),
      broadcastStatusUnreacted: jest.fn<any>().mockResolvedValue(undefined),
      broadcastPostBookmarked: jest.fn<any>().mockResolvedValue(undefined),
      broadcastStoryViewed: jest.fn<any>().mockResolvedValue(undefined),
      broadcastPostReposted: jest.fn<any>().mockResolvedValue(undefined),
    });
    registerInteractionRoutes(app, prisma as any, makePreValidationAuth(true));
    await app.ready();

    const res = await app.inject({ method: 'POST', url: `/posts/${POST_ID}/like`, payload: { emoji: '❤️' } });
    expect(res.statusCode).toBe(200);
    await new Promise((resolve) => setImmediate(resolve));
    await app.close();
  });
});

describe('POST /posts/:id/like — createPostLikeNotification rejects (line 113)', () => {
  it('returns 200 even when notification rejects', async () => {
    mockLikePost.mockResolvedValueOnce({ id: 'post-001', type: 'POST', authorId: 'author-1', likeCount: 1, reactionSummary: { '❤️': 1 } });

    const app = Fastify({ logger: false });
    const prisma = {
      postImpression: { create: jest.fn<any>().mockResolvedValue({}), createMany: jest.fn<any>().mockResolvedValue({ count: 0 }) },
      // Audience déclarée PUBLIC (cf. `interactions-audience.test.ts`).
      post: {
        update: jest.fn<any>().mockResolvedValue({}),
        updateMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
        findFirst: jest.fn<any>().mockResolvedValue({
          authorId: 'author-1', visibility: 'PUBLIC', visibilityUserIds: [],
        }),
      },
    };
    app.decorate('prisma', prisma);
    app.decorate('notificationService', {
      createPostLikeNotification: jest.fn<any>().mockRejectedValue(new Error('Notif error')),
      markPostNotificationsAsRead: jest.fn<any>().mockResolvedValue(undefined),
      createPostRepostNotification: jest.fn<any>().mockResolvedValue(undefined),
    });
    app.decorate('socialEvents', null as any);
    registerInteractionRoutes(app, prisma as any, makePreValidationAuth(true));
    await app.ready();

    const res = await app.inject({ method: 'POST', url: `/posts/${POST_ID}/like`, payload: {} });
    expect(res.statusCode).toBe(200);
    await new Promise((resolve) => setImmediate(resolve));
    await app.close();
  });
});

describe('DELETE /posts/:id/like — broadcastPostUnliked rejects (line 185)', () => {
  it('returns 200 even when broadcast rejects', async () => {
    mockUnlikePost.mockResolvedValueOnce({ id: 'post-001', removedEmoji: '❤️', post: { id: 'post-001', type: 'POST', authorId: 'author-1', likeCount: 0, reactionSummary: {}, visibility: 'PUBLIC', visibilityUserIds: [] } });

    const app = Fastify({ logger: false });
    const prisma = {
      postImpression: { create: jest.fn<any>().mockResolvedValue({}), createMany: jest.fn<any>().mockResolvedValue({ count: 0 }) },
      // Audience déclarée PUBLIC (cf. `interactions-audience.test.ts`).
      post: {
        update: jest.fn<any>().mockResolvedValue({}),
        updateMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
        findFirst: jest.fn<any>().mockResolvedValue({
          authorId: 'author-1', visibility: 'PUBLIC', visibilityUserIds: [],
        }),
      },
    };
    app.decorate('prisma', prisma);
    app.decorate('notificationService', null as any);
    app.decorate('socialEvents', {
      broadcastPostLiked: jest.fn<any>().mockResolvedValue(undefined),
      broadcastPostUnliked: jest.fn<any>().mockRejectedValue(new Error('Socket error')),
      broadcastStoryReacted: jest.fn<any>().mockResolvedValue(undefined),
      broadcastStoryUnreacted: jest.fn<any>().mockResolvedValue(undefined),
      broadcastStatusReacted: jest.fn<any>().mockResolvedValue(undefined),
      broadcastStatusUnreacted: jest.fn<any>().mockResolvedValue(undefined),
      broadcastPostBookmarked: jest.fn<any>().mockResolvedValue(undefined),
      broadcastStoryViewed: jest.fn<any>().mockResolvedValue(undefined),
      broadcastPostReposted: jest.fn<any>().mockResolvedValue(undefined),
    });
    registerInteractionRoutes(app, prisma as any, makePreValidationAuth(true));
    await app.ready();

    const res = await app.inject({ method: 'DELETE', url: `/posts/${POST_ID}/like` });
    expect(res.statusCode).toBe(200);
    await new Promise((resolve) => setImmediate(resolve));
    await app.close();
  });
});

describe('POST /posts/:id/like — invalid emoji triggers fallback (lines 40-41)', () => {
  it('returns 200 using default heart emoji when LikeSchema length bound fails', async () => {
    // An emoji longer than EMOJI_MAX_LENGTH fails z.string().max() → parsed.success = false → emoji = '❤️'
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST', url: `/posts/${POST_ID}/like`,
      payload: { emoji: 'x'.repeat(40) },
    });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});

describe('POST /posts/:id/like — null reactionSummary uses ?? {} fallback (line 93)', () => {
  it('returns 200 using empty object when reactionSummary is null', async () => {
    mockLikePost.mockResolvedValueOnce({ id: 'post-001', type: 'POST', authorId: 'author-1', likeCount: 1, reactionSummary: null });
    const app = await buildApp({ withSocialEvents: true });
    const res = await app.inject({ method: 'POST', url: `/posts/${POST_ID}/like`, payload: {} });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});

describe('DELETE /posts/:id/like — null reactionSummary uses ?? {} fallback (line 181)', () => {
  it('returns 200 using empty object when reactionSummary is null in unlike', async () => {
    mockUnlikePost.mockResolvedValueOnce({ id: 'post-001', removedEmoji: '❤️', post: { id: 'post-001', type: 'POST', authorId: 'author-1', likeCount: 0, reactionSummary: null } });
    const app = await buildApp({ withSocialEvents: true });
    const res = await app.inject({ method: 'DELETE', url: `/posts/${POST_ID}/like` });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});

describe('DELETE /posts/:id/like — undefined visibility uses ?? PUBLIC fallback (lines 183-184)', () => {
  it('returns 200 using PUBLIC when visibility and visibilityUserIds are undefined', async () => {
    mockUnlikePost.mockResolvedValueOnce({ id: 'post-001', removedEmoji: '❤️', post: { id: 'post-001', type: 'POST', authorId: 'author-1', likeCount: 0, reactionSummary: {} } });
    const app = await buildApp({ withSocialEvents: true });
    const res = await app.inject({ method: 'DELETE', url: `/posts/${POST_ID}/like` });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});

describe('POST /posts/:id/bookmark — null bookmarkCount uses ?? 0 fallback (lines 212-215)', () => {
  it('returns 200 with bookmarkCount of 0 when result has null bookmarkCount', async () => {
    mockBookmarkPost.mockResolvedValueOnce({ bookmarkCount: null });
    const app = await buildApp({ withSocialEvents: true });
    const res = await app.inject({ method: 'POST', url: `/posts/${POST_ID}/bookmark`, payload: {} });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.bookmarkCount).toBe(0);
    await app.close();
  });
});

describe('DELETE /posts/:id/bookmark — null bookmarkCount uses ?? 0 fallback (lines 235-238)', () => {
  it('returns 200 with bookmarkCount of 0 when result has null bookmarkCount on unbookmark', async () => {
    mockUnbookmarkPost.mockResolvedValueOnce({ bookmarkCount: null });
    const app = await buildApp({ withSocialEvents: true });
    const res = await app.inject({ method: 'DELETE', url: `/posts/${POST_ID}/bookmark` });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.bookmarkCount).toBe(0);
    await app.close();
  });
});

describe('DELETE /posts/:id/like — emoji désigné', () => {
  it('transmet l\'emoji du corps au service et diffuse CET emoji', async () => {
    mockUnlikePost.mockClear();
    mockUnlikePost.mockResolvedValueOnce({
      id: 'post-001', removedEmoji: '👍',
      post: { id: 'post-001', type: 'POST', authorId: 'author-1', likeCount: 1, reactionSummary: { '❤️': 1 }, visibility: 'PUBLIC', visibilityUserIds: [] },
    });
    const app = await buildApp({ withSocialEvents: true });

    const res = await app.inject({ method: 'DELETE', url: `/posts/${POST_ID}/like`, payload: { emoji: '👍' } });

    expect(res.statusCode).toBe(200);
    expect(mockUnlikePost.mock.calls.at(-1)?.[2]).toBe('👍');
    expect((app as any).socialEvents.broadcastPostUnliked).toHaveBeenCalledWith(
      expect.objectContaining({ emoji: '👍' }),
      'author-1', 'PUBLIC', [],
    );
    await app.close();
  });

  it('corps absent ⇒ aucun emoji fabriqué : le service choisit la plus récente', async () => {
    mockUnlikePost.mockClear();
    mockUnlikePost.mockResolvedValueOnce({
      id: 'post-001', removedEmoji: '😂',
      post: { id: 'post-001', type: 'POST', authorId: 'author-1', likeCount: 0, reactionSummary: {}, visibility: 'PUBLIC', visibilityUserIds: [] },
    });
    const app = await buildApp({ withSocialEvents: true });

    const res = await app.inject({ method: 'DELETE', url: `/posts/${POST_ID}/like` });

    expect(res.statusCode).toBe(200);
    // Surtout PAS '❤️' : un défaut fabriqué ici rendrait le repli « la plus
    // récente » inatteignable pour tout client déjà déployé.
    expect(mockUnlikePost.mock.calls.at(-1)?.[2]).toBeUndefined();
    expect((app as any).socialEvents.broadcastPostUnliked).toHaveBeenCalledWith(
      expect.objectContaining({ emoji: '😂' }),
      'author-1', 'PUBLIC', [],
    );
    await app.close();
  });

  it('emoji hors format ⇒ 400, jamais un retrait à l\'aveugle', async () => {
    mockUnlikePost.mockClear();
    const app = await buildApp();

    const res = await app.inject({
      method: 'DELETE', url: `/posts/${POST_ID}/like`,
      payload: { emoji: 'pas-un-emoji-mais-une-phrase-entiere' },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('VALIDATION_ERROR');
    expect(mockUnlikePost).not.toHaveBeenCalled();
    await app.close();
  });

  it('désignation VIDE ⇒ 400 : seule la clé ABSENTE vaut « pas de désignation »', async () => {
    mockUnlikePost.mockClear();
    const app = await buildApp();

    const res = await app.inject({
      method: 'DELETE', url: `/posts/${POST_ID}/like`,
      payload: { emoji: '   ' },
    });

    expect(res.statusCode).toBe(400);
    expect(mockUnlikePost).not.toHaveBeenCalled();
    await app.close();
  });

  it('les blancs autour de l\'emoji ne changent pas ce qui est désigné', async () => {
    mockUnlikePost.mockClear();
    const app = await buildApp();

    await app.inject({
      method: 'DELETE', url: `/posts/${POST_ID}/like`,
      payload: { emoji: ' 👍 ' },
    });

    expect(mockUnlikePost.mock.calls.at(-1)?.[2]).toBe('👍');
    await app.close();
  });
});

// #4150 — `duration` est borné À LA FRONTIÈRE, plus seulement en aval.
//
// Il était lu en `(request.body as any) ?? {}` : aucun schéma, aucune borne, et
// le seul `any` du module. La valeur était bien assainie par `recordView`
// (ramenée dans [0, 300 000] ms) — mais une borne posée chez l'APPELÉ n'est pas
// une borne : elle vaut pour cet appelé, et le jour où un second consommateur
// lit le champ, il hérite d'un entier libre.
