/**
 * Consommation — `view`, `anonymous-view`, `impression` et les deux lots.
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

describe('POST /posts/:id/view — first view marks notifications read', () => {
  it('returns 200 and marks notifications as read on first view', async () => {
    mockRecordView.mockResolvedValueOnce(true);
    const app = await buildApp({ withNotifications: true });
    const res = await app.inject({ method: 'POST', url: `/posts/${POST_ID}/view`, payload: { duration: 5000 } });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});

describe('POST /posts/:id/view — not first view (no notification mark)', () => {
  it('returns 200 without marking notifications when not first view', async () => {
    mockRecordView.mockResolvedValueOnce(false);
    const app = await buildApp({ withNotifications: true });
    const res = await app.inject({ method: 'POST', url: `/posts/${POST_ID}/view`, payload: {} });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});

describe('POST /posts/:id/view — STORY type broadcasts viewed', () => {
  it('returns 200 and broadcasts story viewed when author differs', async () => {
    mockGetPostById.mockResolvedValueOnce({ id: POST_ID, type: 'STORY', authorId: 'other-author', viewCount: 5 });
    const app = await buildApp({ withSocialEvents: true, withNotifications: true });
    const res = await app.inject({ method: 'POST', url: `/posts/${POST_ID}/view`, payload: {} });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});

describe('POST /posts/:id/view — refetches the post with the viewer for visibility', () => {
  it('passes the viewer id to getPostById so non-PUBLIC stories resolve and broadcast', async () => {
    // Régression : sans le viewer, getPostById applique le filtre PUBLIC-seul et
    // retourne null pour une story FRIENDS → broadcastStoryViewed ne partait jamais
    // alors que recordView (même filtre viewer) avait enregistré la vue.
    mockGetPostById.mockClear();
    mockGetPostById.mockResolvedValueOnce({ id: POST_ID, type: 'STORY', authorId: 'other-author', viewCount: 7 });
    const app = await buildApp({ withSocialEvents: true, withNotifications: true });
    const res = await app.inject({ method: 'POST', url: `/posts/${POST_ID}/view`, payload: {} });
    expect(res.statusCode).toBe(200);
    expect(mockGetPostById).toHaveBeenCalledWith(POST_ID, USER_ID);
    await app.close();
  });
});

describe('POST /posts/:id/view — STORY type does not broadcast when author is viewer', () => {
  it('returns 200 and skips broadcast when story author views own story', async () => {
    mockGetPostById.mockResolvedValueOnce({ id: POST_ID, type: 'STORY', authorId: USER_ID, viewCount: 1 });
    const app = await buildApp({ withSocialEvents: true, withNotifications: true });
    const res = await app.inject({ method: 'POST', url: `/posts/${POST_ID}/view`, payload: {} });
    expect(res.statusCode).toBe(200);
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

// #4044 — repro live : la vue est déjà enregistrée DURABLEMENT par
// `recordView` avant que `getPostById` (lecture lourde, sans try/catch
// propre, appelée ici pour trois champs seulement) ne soit invoquée pour
// l'enrichissement OPTIONNEL de diffusion temps réel. Un échec de CETTE
// lecture ne doit jamais transformer une vue déjà comptée en 500 permanent
// (retenté 5×, jamais résolu côté client — c'est le bug rapporté : des
// marquages de vue de story épuisant leurs tentatives avec la même erreur).

describe('POST /posts/:id/view — getPostById enrichment failure does not fail the request', () => {
  it('still returns 200 with viewed: true when getPostById throws', async () => {
    mockGetPostById.mockRejectedValueOnce(new Error('Mongo timeout'));
    const app = await buildApp({ withSocialEvents: true, withNotifications: true });
    const res = await app.inject({ method: 'POST', url: `/posts/${POST_ID}/view`, payload: {} });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.viewed).toBe(true);
    await app.close();
  });
});

// ─── POST /posts/:id/anonymous-view ──────────────────────────────────────────

describe('POST /posts/:id/anonymous-view — authenticated user is skipped', () => {
  it('returns 200 with counted: false when Authorization header present', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: `/posts/${POST_ID}/anonymous-view`,
      headers: { authorization: 'Bearer some-jwt-token' },
      payload: {},
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.counted).toBe(false);
    await app.close();
  });
});

describe('POST /posts/:id/anonymous-view — missing session key', () => {
  it('returns 400 when no X-Session-Token header', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: `/posts/${POST_ID}/anonymous-view`,
      payload: {},
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

describe('POST /posts/:id/anonymous-view — empty session key', () => {
  it('returns 400 when X-Session-Token is empty string', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: `/posts/${POST_ID}/anonymous-view`,
      headers: { 'x-session-token': '' },
      payload: {},
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

describe('POST /posts/:id/anonymous-view — session key too long', () => {
  it('returns 400 when X-Session-Token exceeds 128 chars', async () => {
    const longKey = 'a'.repeat(129);
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: `/posts/${POST_ID}/anonymous-view`,
      headers: { 'x-session-token': longKey },
      payload: {},
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

describe('POST /posts/:id/anonymous-view — success', () => {
  it('returns 200 with counted: true for valid anonymous session', async () => {
    mockRecordAnonymousOpen.mockResolvedValueOnce(true);
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: `/posts/${POST_ID}/anonymous-view`,
      headers: { 'x-session-token': 'valid-session-token-123' },
      payload: {},
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.counted).toBe(true);
    await app.close();
  });
});

describe('POST /posts/:id/anonymous-view — service error', () => {
  it('returns 500 when recordAnonymousOpen throws', async () => {
    mockRecordAnonymousOpen.mockRejectedValueOnce(new Error('DB error'));
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: `/posts/${POST_ID}/anonymous-view`,
      headers: { 'x-session-token': 'valid-session-token' },
      payload: {},
    });
    expect(res.statusCode).toBe(500);
    await app.close();
  });
});

// ─── POST /posts/:id/impression ──────────────────────────────────────────────

describe('POST /posts/:id/impression — unauthenticated', () => {
  it('returns 401 when no auth', async () => {
    const app = await buildApp({ authenticated: false });
    const res = await app.inject({ method: 'POST', url: `/posts/${POST_ID}/impression`, payload: { source: 'feed' } });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});

describe('POST /posts/:id/impression — success (feed source)', () => {
  it('returns 200 with recorded: true', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'POST', url: `/posts/${POST_ID}/impression`, payload: { source: 'feed' } });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.recorded).toBe(true);
    await app.close();
  });
});

describe('POST /posts/:id/impression — detail source increments postOpenCount', () => {
  it('returns 200 with recorded: true when source is detail', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'POST', url: `/posts/${POST_ID}/impression`, payload: { source: 'detail' } });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.recorded).toBe(true);
    await app.close();
  });
});

/**
 * #4150 — l'alias délègue au point d'ingestion, donc sa forme de requête a
 * convergé vers celle du LOT : `createMany` au lieu de `create`, et une
 * résolution de racines de repost BORNÉE PAR LOT au lieu du `select` replié
 * dans l'`update`.
 *
 * L'ancienne optimisation coûtait ZÉRO lecture — mais elle n'existe QUE pour un
 * id unique (`updateMany` ne rend aucune ligne). L'invariant est donc réénoncé,
 * pas abandonné : **une résolution de racines par LOT, jamais une par post**,
 * et toujours aucune lecture `findUnique` sur ce chemin chaud.
 */
describe('POST /posts/:id/impression — on a repost, credits the root impressionCount too', () => {
  /** Double d'audience + résolution de racines, les deux passes de `post.findMany`. */
  const findManyAvecRacines = (racines: unknown[]) =>
    jest.fn<any>().mockImplementation(({ where }: any) => {
      if (where?.repostOfId !== undefined) return Promise.resolve(racines);
      return Promise.resolve(((where?.id?.in ?? []) as string[]).map(publicAcl));
    });

  it('résout les racines en UNE passe par lot (aucun findUnique) et crédite la racine une fois', async () => {
    const ROOT_ID = '507f1f77bcf86cd799439077';
    const prisma = {
      postImpression: { createMany: jest.fn<any>().mockResolvedValue({ count: 1 }) },
      post: {
        updateMany: jest.fn<any>().mockResolvedValue({ count: 1 }),
        findUnique: jest.fn<any>(),
        findFirst: aclAwareFindFirst(),
        findMany: findManyAvecRacines([
          { id: POST_ID, repostOfId: ROOT_ID, originalRepostOfId: ROOT_ID },
        ]),
      },
    };
    const app = await buildApp({ prisma });
    const res = await app.inject({ method: 'POST', url: `/posts/${POST_ID}/impression`, payload: { source: 'feed' } });
    expect(res.statusCode).toBe(200);
    expect(prisma.post.findUnique).not.toHaveBeenCalled();
    // UNE seule passe de résolution de racines pour tout le lot.
    expect(prisma.post.findMany.mock.calls.filter(([a]: any[]) => a?.where?.repostOfId !== undefined))
      .toHaveLength(1);
    expect(prisma.post.updateMany).toHaveBeenCalledWith({
      where: { id: { in: [POST_ID] } },
      data: { impressionCount: { increment: 1 } },
    });
    expect(prisma.post.updateMany).toHaveBeenCalledWith({
      where: { id: { in: [ROOT_ID] }, deletedAt: { isSet: false } },
      data: { impressionCount: { increment: 1 } },
    });
    await app.close();
  });

  it('non-repost post: no root credit attempted, no standalone findUnique either', async () => {
    const prisma = {
      postImpression: { createMany: jest.fn<any>().mockResolvedValue({ count: 1 }) },
      post: {
        updateMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
        findUnique: jest.fn<any>(),
        findFirst: aclAwareFindFirst(),
        findMany: findManyAvecRacines([]),
      },
    };
    const app = await buildApp({ prisma });
    const res = await app.inject({ method: 'POST', url: `/posts/${POST_ID}/impression`, payload: { source: 'feed' } });
    expect(res.statusCode).toBe(200);
    expect(prisma.post.findUnique).not.toHaveBeenCalled();
    // Le seul `updateMany` est celui du post lui-même : aucun crédit de racine.
    expect(prisma.post.updateMany).toHaveBeenCalledTimes(1);
    expect(prisma.post.updateMany).toHaveBeenCalledWith({
      where: { id: { in: [POST_ID] } },
      data: { impressionCount: { increment: 1 } },
    });
    await app.close();
  });
});

describe('POST /posts/:id/impression — service error', () => {
  it('returns 500 when prisma.postImpression.create throws', async () => {
    const prisma = {
      postImpression: { create: jest.fn<any>().mockRejectedValue(new Error('DB error')) },
      post: { update: jest.fn<any>().mockResolvedValue({}), findFirst: aclAwareFindFirst() },
    };
    const app = await buildApp({ prisma });
    const res = await app.inject({ method: 'POST', url: `/posts/${POST_ID}/impression`, payload: { source: 'feed' } });
    expect(res.statusCode).toBe(500);
    await app.close();
  });
});

// ─── POST /posts/impressions/batch ───────────────────────────────────────────

describe('POST /posts/impressions/batch — unauthenticated', () => {
  it('returns 401 when no auth', async () => {
    const app = await buildApp({ authenticated: false });
    const res = await app.inject({ method: 'POST', url: '/posts/impressions/batch', payload: { postIds: [POST_ID] } });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});

describe('POST /posts/impressions/batch — success', () => {
  it('returns 200 with count of recorded impressions', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'POST', url: '/posts/impressions/batch', payload: { postIds: [POST_ID, '507f1f77bcf86cd799439099'] } });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.recorded).toBe(2);
    await app.close();
  });
});

describe('POST /posts/impressions/batch — empty postIds returns 0', () => {
  it('returns 200 with recorded: 0 for empty array', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'POST', url: '/posts/impressions/batch', payload: { postIds: [] } });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.recorded).toBe(0);
    await app.close();
  });
});

describe('POST /posts/impressions/batch — 2 reposts of the same original credit it +2, not +1', () => {
  it('resolves repostOf/originalRepostOfId in ONE findMany and groups root credits by occurrence count', async () => {
    const ROOT_ID = '507f1f77bcf86cd799439077';
    const REPOST_A = '507f1f77bcf86cd799439078';
    const REPOST_B = '507f1f77bcf86cd799439079';
    const prisma = {
      postImpression: { createMany: jest.fn<any>().mockResolvedValue({ count: 2 }) },
      post: {
        updateMany: jest.fn<any>().mockResolvedValue({ count: 1 }),
        findMany: aclAwareFindMany([
          { id: REPOST_A, repostOfId: ROOT_ID, originalRepostOfId: ROOT_ID },
          { id: REPOST_B, repostOfId: ROOT_ID, originalRepostOfId: ROOT_ID },
        ]),
      },
    };
    const app = await buildApp({ prisma });
    const res = await app.inject({
      method: 'POST',
      url: '/posts/impressions/batch',
      payload: { postIds: [REPOST_A, REPOST_B] },
    });
    expect(res.statusCode).toBe(200);

    // UNE requête pour résoudre repostOf/originalRepostOfId de tout le batch.
    // Comptée PARMI les appels au même délégué : depuis #4146 il porte aussi la
    // passe d'audience, et un `toHaveBeenCalledTimes(1)` nu ne dirait plus
    // laquelle des deux a été économisée.
    const repostResolutionCalls = prisma.post.findMany.mock.calls
      .filter(([args]: any[]) => args.where?.repostOfId !== undefined);
    expect(repostResolutionCalls).toHaveLength(1);
    // #4150 — la lecture porte désormais son propre `take`. La borne était
    // implicite (le plafond du lot, chez l'appelant) ; une borne qui ne vit que
    // chez l'appelant est une convention, pas une borne.
    expect(prisma.post.findMany).toHaveBeenCalledWith({
      where: { id: { in: [REPOST_A, REPOST_B] }, repostOfId: { not: null } },
      select: { id: true, repostOfId: true, originalRepostOfId: true },
      take: expect.any(Number),
    });

    // Chaque repost distinct du batch crédite la MÊME racine → +2, jamais +1
    // (piège `in` dédupliqué, appliqué ici au crédit de racine).
    expect(prisma.post.updateMany).toHaveBeenCalledWith({
      where: { id: { in: [ROOT_ID] }, deletedAt: { isSet: false } },
      data: { impressionCount: { increment: 2 } },
    });
    await app.close();
  });
});

describe('POST /posts/impressions/batch — caps at 50 entries', () => {
  it('returns 200 and caps batch at 50 entries', async () => {
    const postIds = Array.from({ length: 60 }, (_, i) => `507f1f77bcf86cd7994390${i.toString().padStart(2, '0')}`);
    const prisma = {
      postImpression: {
        createMany: jest.fn<any>().mockResolvedValue({ count: 50 }),
      },
      post: {
        updateMany: jest.fn<any>().mockResolvedValue({ count: 50 }),
        findMany: aclAwareFindMany(),
      },
    };
    const app = await buildApp({ prisma });
    const res = await app.inject({ method: 'POST', url: '/posts/impressions/batch', payload: { postIds } });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.recorded).toBe(50);
    await app.close();
  });
});

describe('POST /posts/impressions/batch — service error', () => {
  it('returns 500 when createMany throws', async () => {
    const prisma = {
      postImpression: { createMany: jest.fn<any>().mockRejectedValue(new Error('DB error')) },
      post: {
        updateMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
        findMany: aclAwareFindMany(),
      },
    };
    const app = await buildApp({ prisma });
    const res = await app.inject({ method: 'POST', url: '/posts/impressions/batch', payload: { postIds: [POST_ID] } });
    expect(res.statusCode).toBe(500);
    await app.close();
  });
});

// ─── POST /posts/engagement/batch ────────────────────────────────────────────

describe('POST /posts/engagement/batch — unauthenticated', () => {
  it('returns 401 when no auth', async () => {
    const app = await buildApp({ authenticated: false });
    const res = await app.inject({ method: 'POST', url: '/posts/engagement/batch', payload: { sessions: [] } });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});

describe('POST /posts/engagement/batch — invalid body (empty sessions)', () => {
  it('returns 400 when sessions array is empty (min 1)', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'POST', url: '/posts/engagement/batch', payload: { sessions: [] } });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

describe('POST /posts/engagement/batch — success', () => {
  it('returns 200 with count of recorded sessions', async () => {
    const session = {
      sessionId: '550e8400-e29b-41d4-a716-446655440000',
      postId: '507f1f77bcf86cd799439022',
      contentType: 'POST',
      surface: 'feed',
      startedAt: new Date().toISOString(),
      dwellMs: 5000,
    };
    mockRecordEngagementBatch.mockResolvedValueOnce(1);
    const app = await buildApp();
    const res = await app.inject({ method: 'POST', url: '/posts/engagement/batch', payload: { sessions: [session] } });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.recorded).toBe(1);
    await app.close();
  });
});

describe('POST /posts/engagement/batch — service error', () => {
  it('returns 500 when recordEngagementBatch throws', async () => {
    const session = {
      sessionId: '550e8400-e29b-41d4-a716-446655440001',
      postId: '507f1f77bcf86cd799439022',
      contentType: 'POST',
      surface: 'feed',
      startedAt: new Date().toISOString(),
      dwellMs: 3000,
    };
    mockRecordEngagementBatch.mockRejectedValueOnce(new Error('DB error'));
    const app = await buildApp();
    const res = await app.inject({ method: 'POST', url: '/posts/engagement/batch', payload: { sessions: [session] } });
    expect(res.statusCode).toBe(500);
    await app.close();
  });
});

// ─── POST /posts/:id/share ────────────────────────────────────────────────────

describe('POST /posts/:id/view — null body uses ?? {} fallback (line 257)', () => {
  it('returns 200 when no body is sent to view route', async () => {
    const app = await buildApp({ withNotifications: true });
    const res = await app.inject({ method: 'POST', url: `/posts/${POST_ID}/view` });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});

describe('POST /posts/:id/view — STORY viewer has no username uses ?? empty string (line 279)', () => {
  it('returns 200 using empty viewerUsername when user has no username', async () => {
    mockGetPostById.mockResolvedValueOnce({ id: POST_ID, type: 'STORY', authorId: 'other-author', viewCount: 3 });
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
        // #4150 — la vue passe par la passe d'audience de LOT du point
        // d'ingestion (`post.findMany`), pas par une lecture unitaire.
        findMany: aclAwareFindMany(),
      },
    };
    app.decorate('prisma', prisma);
    app.decorate('notificationService', {
      createPostLikeNotification: jest.fn<any>().mockResolvedValue(undefined),
      markPostNotificationsAsRead: jest.fn<any>().mockResolvedValue(undefined),
      createPostRepostNotification: jest.fn<any>().mockResolvedValue(undefined),
    });
    app.decorate('socialEvents', {
      broadcastStoryViewed: jest.fn<any>().mockResolvedValue(undefined),
      broadcastPostLiked: jest.fn<any>().mockResolvedValue(undefined),
      broadcastPostUnliked: jest.fn<any>().mockResolvedValue(undefined),
      broadcastStoryReacted: jest.fn<any>().mockResolvedValue(undefined),
      broadcastStoryUnreacted: jest.fn<any>().mockResolvedValue(undefined),
      broadcastStatusReacted: jest.fn<any>().mockResolvedValue(undefined),
      broadcastStatusUnreacted: jest.fn<any>().mockResolvedValue(undefined),
      broadcastPostBookmarked: jest.fn<any>().mockResolvedValue(undefined),
      broadcastPostReposted: jest.fn<any>().mockResolvedValue(undefined),
    });
    const noUsernameAuth = async (req: any) => {
      req.authContext = { isAuthenticated: true, registeredUser: { id: USER_ID, role: 'USER' } };
    };
    registerInteractionRoutes(app, prisma as any, noUsernameAuth);
    await app.ready();
    const res = await app.inject({ method: 'POST', url: `/posts/${POST_ID}/view`, payload: {} });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});

describe('POST /posts/:id/impression — no source in body uses ?? feed fallback (line 338)', () => {
  it('returns 200 using default source when no source field in body', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'POST', url: `/posts/${POST_ID}/impression`, payload: {} });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.recorded).toBe(true);
    await app.close();
  });
});

describe('#4150 — POST /posts/:id/view borne `duration` avant le handler', () => {
  it('refuse une durée hors bornes', async () => {
    const app = await buildApp({ withNotifications: true });

    const res = await app.inject({
      method: 'POST',
      url: `/posts/${POST_ID}/view`,
      payload: { duration: 999_999_999 },
    });

    expect(res.statusCode).toBe(400);
    await app.close();
  });

  // MESURÉ, et contraire à ce que ce témoin attendait d'abord : une clé non
  // déclarée est RETIRÉE, pas refusée — et le 200 ci-dessous n'est donc pas un
  // trou de ce lot mais le comportement du CADRE.
  //
  // Fastify compile ses schémas avec `removeAdditional: true` par défaut :
  // `additionalProperties: false` y signifie « retire », jamais « refuse ».
  // C'est la même famille de silence que le mode *strip* de Zod fermé par
  // #4589 sur les préférences, un étage plus bas — et elle ne se ferme pas
  // route par route : il faudrait changer l'option du serveur, ce qui touche
  // toute la surface et demande d'en mesurer les appelants d'abord.
  //
  // Le témoin garde donc ce qui est vrai ET ce qui compte : la clé parasite
  // n'atteint jamais le service.
  it('retire une clé non déclarée sans la faire atteindre le service (comportement du cadre)', async () => {
    const app = await buildApp({ withNotifications: true });

    const res = await app.inject({
      method: 'POST',
      url: `/posts/${POST_ID}/view`,
      payload: { duration: 1000, sneaky: 'x' },
    });

    expect(res.statusCode).toBe(200);
    // `recordView` ne reçoit QUE la durée — la troisième position de l'appel.
    const appels = mockRecordView.mock.calls;
    expect(appels[appels.length - 1][2]).toBe(1000);
    await app.close();
  });

  it('accepte une durée valide — la rigueur ne referme pas la porte', async () => {
    const app = await buildApp({ withNotifications: true });

    const res = await app.inject({
      method: 'POST',
      url: `/posts/${POST_ID}/view`,
      payload: { duration: 1500 },
    });

    expect(res.statusCode).toBe(200);
    await app.close();
  });
});
