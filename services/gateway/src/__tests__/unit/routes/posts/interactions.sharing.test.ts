/**
 * Diffusion et listes — `share`, `pin`, listes de vues et d'interactions, `repost`.
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

describe('POST /posts/:id/share — unauthenticated', () => {
  it('returns 401 when no auth', async () => {
    const app = await buildApp({ authenticated: false });
    const res = await app.inject({ method: 'POST', url: `/posts/${POST_ID}/share`, payload: {} });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});

describe('POST /posts/:id/share — success plain share', () => {
  it('returns 200 with shared: true and shareCount', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'POST', url: `/posts/${POST_ID}/share`, payload: { platform: 'twitter' } });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.shared).toBe(true);
    expect(res.json().data.shareCount).toBe(5);
    await app.close();
  });
});

describe('POST /posts/:id/share — post not found on plain share', () => {
  it('returns 404 when sharePost returns null', async () => {
    mockSharePost.mockResolvedValueOnce(null);
    const app = await buildApp();
    const res = await app.inject({ method: 'POST', url: `/posts/${POST_ID}/share`, payload: {} });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

describe('POST /posts/:id/share — success with tracking link', () => {
  it('returns 200 with shortUrl and token when generateLink is true', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'POST', url: `/posts/${POST_ID}/share`, payload: { generateLink: true } });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.shortUrl).toBeDefined();
    expect(res.json().data.token).toBe('abc123');
    await app.close();
  });
});

describe('POST /posts/:id/share — post not found with tracking link', () => {
  it('returns 404 when shareWithTrackingLink returns null', async () => {
    mockShareWithTrackingLink.mockResolvedValueOnce(null);
    const app = await buildApp();
    const res = await app.inject({ method: 'POST', url: `/posts/${POST_ID}/share`, payload: { generateLink: true } });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

describe('POST /posts/:id/share — service error', () => {
  it('returns 500 when sharePost throws', async () => {
    mockSharePost.mockRejectedValueOnce(new Error('DB error'));
    const app = await buildApp();
    const res = await app.inject({ method: 'POST', url: `/posts/${POST_ID}/share`, payload: {} });
    expect(res.statusCode).toBe(500);
    await app.close();
  });
});

// ─── GET /posts/:id/share — RETIRÉE (#4190) ──────────────────────────────────
// Les trois témoins (401, 200, 500) sont partis avec la route : aucun des trois
// clients ne l'appelait — le web n'émet que le POST (`posts.service.ts` →
// `sharePost`), qui reste vivant JUSTE AU-DESSUS sur le MÊME chemin. C'est
// pourquoi ce retrait ne pouvait pas se décider depuis l'URL, seulement depuis
// le couple méthode+chemin, et pourquoi le double `mockGetPostShareLink` reste
// câblé plus haut : `PostService.getPostShareLink` existe toujours, elle n'a
// simplement plus de porte HTTP. Même forme que chez les deux frères déjà
// ajustés, `interactions2.test.ts` et `interactions-extended.test.ts`.

// ─── POST /posts/:id/pin ──────────────────────────────────────────────────────

describe('POST /posts/:id/pin — unauthenticated', () => {
  it('returns 401 when no auth', async () => {
    const app = await buildApp({ authenticated: false });
    const res = await app.inject({ method: 'POST', url: `/posts/${POST_ID}/pin`, payload: {} });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});

describe('POST /posts/:id/pin — success', () => {
  it('returns 200 with pinned: true', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'POST', url: `/posts/${POST_ID}/pin`, payload: {} });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.pinned).toBe(true);
    await app.close();
  });
});

describe('POST /posts/:id/pin — post not found', () => {
  it('returns 404 when pinPost returns null', async () => {
    mockPinPost.mockResolvedValueOnce(null);
    const app = await buildApp();
    const res = await app.inject({ method: 'POST', url: `/posts/${POST_ID}/pin`, payload: {} });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

describe('POST /posts/:id/pin — forbidden', () => {
  it('returns 403 when user is not the author', async () => {
    mockPinPost.mockRejectedValueOnce(new Error('FORBIDDEN'));
    const app = await buildApp();
    const res = await app.inject({ method: 'POST', url: `/posts/${POST_ID}/pin`, payload: {} });
    expect(res.statusCode).toBe(403);
    await app.close();
  });
});

describe('POST /posts/:id/pin — service error', () => {
  it('returns 500 when pinPost throws', async () => {
    mockPinPost.mockRejectedValueOnce(new Error('DB error'));
    const app = await buildApp();
    const res = await app.inject({ method: 'POST', url: `/posts/${POST_ID}/pin`, payload: {} });
    expect(res.statusCode).toBe(500);
    await app.close();
  });
});

// ─── DELETE /posts/:id/pin ────────────────────────────────────────────────────

describe('DELETE /posts/:id/pin — unauthenticated', () => {
  it('returns 401 when no auth', async () => {
    const app = await buildApp({ authenticated: false });
    const res = await app.inject({ method: 'DELETE', url: `/posts/${POST_ID}/pin` });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});

describe('DELETE /posts/:id/pin — success', () => {
  it('returns 200 with pinned: false', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'DELETE', url: `/posts/${POST_ID}/pin` });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.pinned).toBe(false);
    await app.close();
  });
});

describe('DELETE /posts/:id/pin — post not found', () => {
  it('returns 404 when unpinPost returns null', async () => {
    mockUnpinPost.mockResolvedValueOnce(null);
    const app = await buildApp();
    const res = await app.inject({ method: 'DELETE', url: `/posts/${POST_ID}/pin` });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

describe('DELETE /posts/:id/pin — forbidden', () => {
  it('returns 403 when user is not the author', async () => {
    mockUnpinPost.mockRejectedValueOnce(new Error('FORBIDDEN'));
    const app = await buildApp();
    const res = await app.inject({ method: 'DELETE', url: `/posts/${POST_ID}/pin` });
    expect(res.statusCode).toBe(403);
    await app.close();
  });
});

describe('DELETE /posts/:id/pin — service error', () => {
  it('returns 500 when unpinPost throws', async () => {
    mockUnpinPost.mockRejectedValueOnce(new Error('DB error'));
    const app = await buildApp();
    const res = await app.inject({ method: 'DELETE', url: `/posts/${POST_ID}/pin` });
    expect(res.statusCode).toBe(500);
    await app.close();
  });
});

// ─── GET /posts/:id/views ─────────────────────────────────────────────────────

describe('GET /posts/:id/views — unauthenticated', () => {
  it('returns 401 when no auth', async () => {
    const app = await buildApp({ authenticated: false });
    const res = await app.inject({ method: 'GET', url: `/posts/${POST_ID}/views` });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});

describe('GET /posts/:id/views — success', () => {
  it('returns 200 with views list', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: `/posts/${POST_ID}/views` });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
    await app.close();
  });
});

describe('GET /posts/:id/views — post not found', () => {
  it('returns 404 when getPostViews returns null', async () => {
    mockGetPostViews.mockResolvedValueOnce(null);
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: `/posts/${POST_ID}/views` });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

describe('GET /posts/:id/views — forbidden', () => {
  it('returns 403 when user is not the author', async () => {
    mockGetPostViews.mockRejectedValueOnce(new Error('FORBIDDEN'));
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: `/posts/${POST_ID}/views` });
    expect(res.statusCode).toBe(403);
    await app.close();
  });
});

describe('GET /posts/:id/views — service error', () => {
  it('returns 500 when getPostViews throws', async () => {
    mockGetPostViews.mockRejectedValueOnce(new Error('DB error'));
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: `/posts/${POST_ID}/views` });
    expect(res.statusCode).toBe(500);
    await app.close();
  });
});

// ─── GET /posts/:id/interactions ─────────────────────────────────────────────

describe('GET /posts/:id/interactions — unauthenticated', () => {
  it('returns 401 when no auth', async () => {
    const app = await buildApp({ authenticated: false });
    const res = await app.inject({ method: 'GET', url: `/posts/${POST_ID}/interactions` });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});

describe('GET /posts/:id/interactions — success', () => {
  it('returns 200 with interactions list', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: `/posts/${POST_ID}/interactions` });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
    await app.close();
  });
});

describe('GET /posts/:id/interactions — post not found', () => {
  it('returns 404 when getPostInteractions returns null', async () => {
    mockGetPostInteractions.mockResolvedValueOnce(null);
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: `/posts/${POST_ID}/interactions` });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

describe('GET /posts/:id/interactions — forbidden', () => {
  it('returns 403 when user is not the author', async () => {
    mockGetPostInteractions.mockRejectedValueOnce(new Error('FORBIDDEN'));
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: `/posts/${POST_ID}/interactions` });
    expect(res.statusCode).toBe(403);
    await app.close();
  });
});

describe('GET /posts/:id/interactions — service error', () => {
  it('returns 500 when getPostInteractions throws', async () => {
    mockGetPostInteractions.mockRejectedValueOnce(new Error('DB error'));
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: `/posts/${POST_ID}/interactions` });
    expect(res.statusCode).toBe(500);
    await app.close();
  });
});

// ─── POST /posts/:id/repost ───────────────────────────────────────────────────

describe('POST /posts/:id/repost — unauthenticated', () => {
  it('returns 401 when no auth', async () => {
    const app = await buildApp({ authenticated: false });
    const res = await app.inject({ method: 'POST', url: `/posts/${POST_ID}/repost`, payload: {} });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});

describe('POST /posts/:id/repost — success', () => {
  it('returns 201 with repost data', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'POST', url: `/posts/${POST_ID}/repost`, payload: { isQuote: false } });
    expect(res.statusCode).toBe(201);
    expect(res.json().success).toBe(true);
    await app.close();
  });
});

describe('POST /posts/:id/repost — original post not found', () => {
  it('returns 404 when repostPost returns null', async () => {
    mockRepostPost.mockResolvedValueOnce(null);
    const app = await buildApp();
    const res = await app.inject({ method: 'POST', url: `/posts/${POST_ID}/repost`, payload: {} });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

describe('POST /posts/:id/repost — forbidden', () => {
  it('returns 403 when repostPost throws with statusCode 403', async () => {
    mockRepostPost.mockRejectedValueOnce(Object.assign(new Error('Cannot repost'), { statusCode: 403 }));
    const app = await buildApp();
    const res = await app.inject({ method: 'POST', url: `/posts/${POST_ID}/repost`, payload: {} });
    expect(res.statusCode).toBe(403);
    await app.close();
  });
});

describe('POST /posts/:id/repost — service error', () => {
  it('returns 500 when repostPost throws', async () => {
    mockRepostPost.mockRejectedValueOnce(new Error('DB error'));
    const app = await buildApp();
    const res = await app.inject({ method: 'POST', url: `/posts/${POST_ID}/repost`, payload: {} });
    expect(res.statusCode).toBe(500);
    await app.close();
  });
});

describe('POST /posts/:id/repost — with social events', () => {
  it('returns 201 and fires broadcast and notification', async () => {
    const app = await buildApp({ withSocialEvents: true, withNotifications: true });
    const res = await app.inject({ method: 'POST', url: `/posts/${POST_ID}/repost`, payload: { isQuote: true, content: 'My take' } });
    expect(res.statusCode).toBe(201);
    await app.close();
  });
});

// ─── POST /posts/:id/like — onDuplicate path (lines 58-59) ───────────────────

describe('POST /posts/:id/repost — with notifications fires repost notification when original found', () => {
  it('returns 201 and fires createPostRepostNotification when original author found', async () => {
    mockRepostPost.mockResolvedValueOnce({ id: 'repost-001', repostOfId: POST_ID, type: 'POST', authorId: USER_ID });
    mockGetPostById.mockResolvedValueOnce({ id: POST_ID, authorId: 'original-author', type: 'POST', content: 'Original content', createdAt: new Date() });
    const app = await buildApp({ withNotifications: true });
    const res = await app.inject({ method: 'POST', url: `/posts/${POST_ID}/repost`, payload: {} });
    expect(res.statusCode).toBe(201);
    await app.close();
  });
});

// ─── .catch branch coverage: fire-and-forget promise rejection paths ──────────

describe('POST /posts/:id/repost — broadcastPostReposted rejects (line 698)', () => {
  it('returns 201 even when broadcast rejects', async () => {
    mockRepostPost.mockResolvedValueOnce({ id: 'repost-001', repostOfId: POST_ID, type: 'POST', authorId: USER_ID });

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
      broadcastPostUnliked: jest.fn<any>().mockResolvedValue(undefined),
      broadcastStoryReacted: jest.fn<any>().mockResolvedValue(undefined),
      broadcastStoryUnreacted: jest.fn<any>().mockResolvedValue(undefined),
      broadcastStatusReacted: jest.fn<any>().mockResolvedValue(undefined),
      broadcastStatusUnreacted: jest.fn<any>().mockResolvedValue(undefined),
      broadcastPostBookmarked: jest.fn<any>().mockResolvedValue(undefined),
      broadcastStoryViewed: jest.fn<any>().mockResolvedValue(undefined),
      broadcastPostReposted: jest.fn<any>().mockRejectedValue(new Error('Socket error')),
    });
    registerInteractionRoutes(app, prisma as any, makePreValidationAuth(true));
    await app.ready();

    const res = await app.inject({ method: 'POST', url: `/posts/${POST_ID}/repost`, payload: {} });
    expect(res.statusCode).toBe(201);
    await new Promise((resolve) => setImmediate(resolve));
    await app.close();
  });
});

describe('POST /posts/:id/repost — createPostRepostNotification rejects (line 715)', () => {
  it('returns 201 even when notification rejects', async () => {
    mockRepostPost.mockResolvedValueOnce({ id: 'repost-001', repostOfId: POST_ID, type: 'POST', authorId: USER_ID });
    mockGetPostById.mockResolvedValueOnce({ id: POST_ID, authorId: 'original-author', type: 'POST', content: 'Original', createdAt: new Date() });

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
      createPostLikeNotification: jest.fn<any>().mockResolvedValue(undefined),
      markPostNotificationsAsRead: jest.fn<any>().mockResolvedValue(undefined),
      createPostRepostNotification: jest.fn<any>().mockRejectedValue(new Error('Notif error')),
    });
    app.decorate('socialEvents', null as any);
    registerInteractionRoutes(app, prisma as any, makePreValidationAuth(true));
    await app.ready();

    const res = await app.inject({ method: 'POST', url: `/posts/${POST_ID}/repost`, payload: {} });
    expect(res.statusCode).toBe(201);
    await new Promise((resolve) => setImmediate(resolve));
    await app.close();
  });
});

// ─── Branch coverage: null-coalescing and ternary false branches ─────────────

describe('POST /posts/:id/share — no body uses ?? {} fallback (line 480)', () => {
  it('returns 200 using share defaults when no body provided', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'POST', url: `/posts/${POST_ID}/share` });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});

// GARDE RETOURNÉE (fil rouge du repost, 2026-08-25) — elle gravait le défaut.
//
// Elle exigeait 201 « using fallback when RepostSchema.safeParse fails ». Ce
// repli (`parsed.success ? parsed.data : { isQuote: false }`) jetait D'UN SEUL
// COUP `targetType`, `content` ET `visibility` — puis le service appliquait
// `?? PostType.POST`. Une source ÉPHÉMÈRE repartait donc en post PERMANENT
// sans le moindre signal, ce qui est exactement ce que la Loi 5 (« le repost
// miroite ») interdit et ce que `RepostPostPayload.targetType` (obligatoire
// dans la file durable iOS) existe pour ne pas avoir à contourner.
//
// La garde n'est pas supprimée : elle est RÉÉCRITE dans l'autre sens. Un corps
// invalide se refuse.

describe('POST /posts/:id/repost — un corps invalide est REFUSÉ, jamais déprécié en POST', () => {
  it('returns 400 when RepostSchema.safeParse fails', async () => {
    const app = await buildApp();
    // Send isQuote as a non-boolean string to make RepostSchema.safeParse fail
    const res = await app.inject({
      method: 'POST', url: `/posts/${POST_ID}/repost`,
      payload: { isQuote: 'not-a-boolean' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('VALIDATION_ERROR');
    await app.close();
  });
});

// ─── DELETE /posts/:id/like — QUELLE réaction part ───────────────────────────
//
// Règle produit (2026-08-25) : re-toucher le cœur retire la DERNIÈRE réaction
// posée, une par une. Le client connaît sa propre pile — la route doit donc
// pouvoir recevoir l'emoji à retirer, et le transmettre TEL QUEL au service.
// Elle n'avait aucun `Body` : le geste partait à l'aveugle et le service
// tirait un élément d'un ensemble non ordonné, dont l'emoji alimentait ensuite
// la diffusion. Un client optimiste qui retirait un pouce s'entendait annoncer
// le départ d'un cœur, et se désynchronisait sur un geste RÉUSSI.
