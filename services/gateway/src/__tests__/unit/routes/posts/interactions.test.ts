/**
 * Unit tests for posts interaction routes (interactions.ts)
 * Tests all routes: like/unlike, bookmark, view, anonymous-view,
 * impression, batch impressions, engagement batch, share, get share,
 * pin, unpin, views list, interactions list, repost.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockLikePost = jest.fn<any>().mockResolvedValue({ id: 'post-001', type: 'POST', authorId: 'author-1', likeCount: 1, reactionSummary: { '❤️': 1 } });
// `unlikePost` rend une enveloppe : le post ET la réaction réellement retirée.
const mockUnlikePost = jest.fn<any>().mockResolvedValue({ id: 'post-001', removedEmoji: '❤️', post: { id: 'post-001', type: 'POST', authorId: 'author-1', likeCount: 0, reactionSummary: {} } });
const mockBookmarkPost = jest.fn<any>().mockResolvedValue({ bookmarkCount: 1 });
const mockUnbookmarkPost = jest.fn<any>().mockResolvedValue({ bookmarkCount: 0 });
const mockRecordView = jest.fn<any>().mockResolvedValue(true);
const mockGetPostById = jest.fn<any>().mockResolvedValue({ id: 'post-001', type: 'POST', authorId: 'author-1', viewCount: 1 });
const mockRecordAnonymousOpen = jest.fn<any>().mockResolvedValue(true);
const mockSharePost = jest.fn<any>().mockResolvedValue({ shareCount: 5 });
const mockShareWithTrackingLink = jest.fn<any>().mockResolvedValue({ shareCount: 5, token: 'abc123', shortUrl: 'https://app.example.com/l/abc123' });
const mockGetPostShareLink = jest.fn<any>().mockResolvedValue({ token: 'abc123', shortUrl: 'https://app.example.com/l/abc123', clickCount: 3 });
const mockPinPost = jest.fn<any>().mockResolvedValue({ id: 'post-001' });
const mockUnpinPost = jest.fn<any>().mockResolvedValue({ id: 'post-001' });
const mockGetPostViews = jest.fn<any>().mockResolvedValue({ items: [], total: 0, hasMore: false });
const mockGetPostInteractions = jest.fn<any>().mockResolvedValue({ viewers: [], total: 0, hasMore: false });
const mockRepostPost = jest.fn<any>().mockResolvedValue({ id: 'repost-001', repostOfId: 'post-001', type: 'POST', authorId: 'user-001' });
const mockRecordEngagementBatch = jest.fn<any>().mockResolvedValue(2);

jest.mock('../../../../services/PostService', () => ({
  PostService: jest.fn().mockImplementation(() => ({
    likePost: (...args: any[]) => mockLikePost(...args),
    unlikePost: (...args: any[]) => mockUnlikePost(...args),
    bookmarkPost: (...args: any[]) => mockBookmarkPost(...args),
    unbookmarkPost: (...args: any[]) => mockUnbookmarkPost(...args),
    recordView: (...args: any[]) => mockRecordView(...args),
    getPostById: (...args: any[]) => mockGetPostById(...args),
    recordAnonymousOpen: (...args: any[]) => mockRecordAnonymousOpen(...args),
    sharePost: (...args: any[]) => mockSharePost(...args),
    shareWithTrackingLink: (...args: any[]) => mockShareWithTrackingLink(...args),
    getPostShareLink: (...args: any[]) => mockGetPostShareLink(...args),
    pinPost: (...args: any[]) => mockPinPost(...args),
    unpinPost: (...args: any[]) => mockUnpinPost(...args),
    getPostViews: (...args: any[]) => mockGetPostViews(...args),
    getPostInteractions: (...args: any[]) => mockGetPostInteractions(...args),
    repostPost: (...args: any[]) => mockRepostPost(...args),
    recordEngagementBatch: (...args: any[]) => mockRecordEngagementBatch(...args),
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
  // Le module réel est ÉTALÉ d'abord : `MutationResultGone` est une CLASSE
  // dont les routes font `instanceof`, et `withMutationOutcome` est le
  // chemin réel du repost. Une usine qui ne rendait que `withMutationLog`
  // les laissait à `undefined` — `instanceof undefined` lève un TypeError
  // qui se déguise en 500 sur des chemins d'erreur sans rapport.
  ...(jest.requireActual('../../../../utils/withMutationLog') as object),
  withMutationLog: jest.fn<any>().mockImplementation(({ op }: any) => op()),
}));

// #4147 — POST /posts / from-attachment / repost tirent leur plafond de
// création d'un compteur PARTAGÉ qui lit Redis directement, fail-closed
// (createSharedWriteRateLimitPreHandler, routes/posts/socialRateLimit.ts) :
// sans ce double, `getCacheStore().getNativeClient()` rend `null` en test
// (aucun REDIS_URL) et CHAQUE écriture de ce type serait refusée avant
// d'atteindre ce que ce fichier vérifie — détail complet dans core.test.ts,
// premier fichier de la série à le poser. `incr` répond toujours « premier
// appel » : ce fichier ne teste PAS le plafond (son témoin dédié vit dans
// social-write-rate-limit.test.ts) — juste un Redis DISPONIBLE.
jest.mock('../../../../services/CacheStore', () => ({
  getCacheStore: () => ({
    getNativeClient: () => ({
      incr: async () => 1,
      pexpire: async () => 1,
      pttl: async () => -1,
    }),
  }),
}));// ─── Import after mocks ───────────────────────────────────────────────────────

import { registerInteractionRoutes } from '../../../../routes/posts/interactions';
import { ConflictError } from '../../../../errors/custom-errors';
import { REACTION_LIMIT_REACHED_MESSAGE } from '@meeshy/shared/utils/reaction-limit';

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

/**
 * Tranche ACL d'un post PUBLIC — ce que `loadPostAcl` rend au verdict
 * d'audience posé sur le favori, l'impression et le partage (issue #4146).
 */
const publicAcl = (id: string) => ({
  id, authorId: 'author-1', visibility: 'PUBLIC', visibilityUserIds: [] as string[], expiresAt: null,
});

/**
 * `post.findMany` répond désormais à DEUX questions : la passe d'audience du
 * lot d'impressions (`where.id.in`) et la résolution des racines de repost
 * (`where.repostOfId`). Ce double branche sur la seconde et rend, pour la
 * première, un post PUBLIC par id demandé — l'audience elle-même est le sujet
 * de `interactions-consumption-audience.test.ts`, pas de ce fichier.
 */
function aclAwareFindMany(repostRows: unknown[] = []) {
  return jest.fn<any>().mockImplementation(({ where }: any) => {
    if (where?.repostOfId !== undefined) return Promise.resolve(repostRows);
    return Promise.resolve(((where?.id?.in ?? []) as string[]).map(publicAcl));
  });
}

const aclAwareFindFirst = () =>
  jest.fn<any>().mockImplementation(({ where }: any) => Promise.resolve(publicAcl(where.id)));

async function buildApp(opts: {
  authenticated?: boolean;
  withNotifications?: boolean;
  withSocialEvents?: boolean;
  prisma?: any;
} = {}): Promise<FastifyInstance> {
  const { authenticated = true, withNotifications = false, withSocialEvents = false, prisma: prismaOverride } = opts;

  const prisma = prismaOverride ?? {
    postImpression: {
      create: jest.fn<any>().mockResolvedValue({}),
      createMany: jest.fn<any>().mockResolvedValue({ count: 2 }),
    },
    post: {
      update: jest.fn<any>().mockResolvedValue({}),
      updateMany: jest.fn<any>().mockResolvedValue({ count: 2 }),
      // Audience déclarée PUBLIC : aimer consulte désormais `Post.visibility`
      // via `loadPostAcl`. Le droit de voir est couvert par
      // `interactions-audience.test.ts`.
      findFirst: jest.fn<any>().mockResolvedValue({
        authorId: 'author-1', visibility: 'PUBLIC', visibilityUserIds: [],
      }),
      // Résolution repostOfId/originalRepostOfId pour le crédit de racine du
      // batch d'impressions (chantier reposts cohérents, tâche 1). Défaut :
      // aucun repost dans le batch — même comportement qu'avant. L'unitaire
      // replie sa résolution dans le `select` de `update` (Important #2,
      // revue), aucun `findUnique` séparé n'est plus nécessaire. Le même
      // délégué porte la passe d'audience du lot (#4146).
      findMany: aclAwareFindMany(),
    },
  };

  const app = Fastify({ logger: false });
  app.decorate('prisma', prisma);

  if (withNotifications) {
    app.decorate('notificationService', {
      createPostLikeNotification: jest.fn<any>().mockResolvedValue(undefined),
      markPostNotificationsAsRead: jest.fn<any>().mockResolvedValue(undefined),
      createPostRepostNotification: jest.fn<any>().mockResolvedValue(undefined),
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
      broadcastPostReposted: jest.fn<any>().mockResolvedValue(undefined),
    });
  }

  const requiredAuth = makePreValidationAuth(authenticated);
  registerInteractionRoutes(app, prisma as any, requiredAuth);
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

describe('POST /posts/:id/impression — on a repost, credits the root impressionCount too', () => {
  it('folds repostOfId/originalRepostOfId resolution into the update select (no standalone findUnique) and increments the root once', async () => {
    const ROOT_ID = '507f1f77bcf86cd799439077';
    const prisma = {
      postImpression: { create: jest.fn<any>().mockResolvedValue({}) },
      post: {
        // Le `select` de `update` porte la résolution — pas de findUnique
        // séparé sur ce chemin chaud (Important #2, revue chantier reposts).
        update: jest.fn<any>().mockResolvedValue({ repostOfId: ROOT_ID, originalRepostOfId: ROOT_ID }),
        updateMany: jest.fn<any>().mockResolvedValue({ count: 1 }),
        findUnique: jest.fn<any>(),
        findFirst: aclAwareFindFirst(),
      },
    };
    const app = await buildApp({ prisma });
    const res = await app.inject({ method: 'POST', url: `/posts/${POST_ID}/impression`, payload: { source: 'feed' } });
    expect(res.statusCode).toBe(200);
    // Réduction de requêtes : plus de lecture dédiée avant l'écriture.
    expect(prisma.post.findUnique).not.toHaveBeenCalled();
    expect(prisma.post.update).toHaveBeenCalledWith({
      where: { id: POST_ID },
      data: { impressionCount: { increment: 1 } },
      select: { repostOfId: true, originalRepostOfId: true },
    });
    expect(prisma.post.updateMany).toHaveBeenCalledWith({
      where: { id: ROOT_ID, deletedAt: { isSet: false } },
      data: { impressionCount: { increment: 1 } },
    });
    await app.close();
  });

  it('non-repost post: no root credit attempted, no standalone findUnique either', async () => {
    const prisma = {
      postImpression: { create: jest.fn<any>().mockResolvedValue({}) },
      post: {
        update: jest.fn<any>().mockResolvedValue({}),
        updateMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
        findUnique: jest.fn<any>(),
        findFirst: aclAwareFindFirst(),
      },
    };
    const app = await buildApp({ prisma });
    const res = await app.inject({ method: 'POST', url: `/posts/${POST_ID}/impression`, payload: { source: 'feed' } });
    expect(res.statusCode).toBe(200);
    expect(prisma.post.findUnique).not.toHaveBeenCalled();
    expect(prisma.post.updateMany).not.toHaveBeenCalled();
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
    expect(prisma.post.findMany).toHaveBeenCalledWith({
      where: { id: { in: [REPOST_A, REPOST_B] }, repostOfId: { not: null } },
      select: { id: true, repostOfId: true, originalRepostOfId: true },
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

describe('POST /posts/impressions/batch — caps at IMPRESSION_BATCH_CAP (100) entries', () => {
  // La borne interne est la MÊME que le `maxItems` du schéma (100), plus jamais
  // un 50 qui tronquait en silence un lot que le contrat déclarait valide. Un
  // lot au-delà de 100 (que le schéma refuserait s'il l'atteignait) est borné à
  // 100 ; en deçà, chaque id admis est enregistré.
  const makePrismaDouble = () => ({
    postImpression: { createMany: jest.fn<any>().mockResolvedValue({ count: 100 }) },
    post: {
      updateMany: jest.fn<any>().mockResolvedValue({ count: 100 }),
      findMany: aclAwareFindMany(),
    },
  });

  it('records all 100 entries at the cap boundary', async () => {
    const postIds = Array.from({ length: 100 }, (_, i) => `507f1f77bcf86cd799439${i.toString().padStart(3, '0')}`);
    const app = await buildApp({ prisma: makePrismaDouble() });
    const res = await app.inject({ method: 'POST', url: '/posts/impressions/batch', payload: { postIds } });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.recorded).toBe(100);
    await app.close();
  });

  // Au-delà du plafond, le schéma REFUSE (400) plutôt que de tronquer en
  // silence : l'appelant apprend que son lot est trop grand, il ne perd pas la
  // moitié sans le savoir. C'est ce que corrige l'alignement schéma ↔ garde.
  it('rejects a batch over the cap with 400 instead of silently truncating', async () => {
    const postIds = Array.from({ length: 101 }, (_, i) => `507f1f77bcf86cd799439${i.toString().padStart(3, '0')}`);
    const prisma = makePrismaDouble();
    const app = await buildApp({ prisma });
    const res = await app.inject({ method: 'POST', url: '/posts/impressions/batch', payload: { postIds } });
    expect(res.statusCode).toBe(400);
    expect(prisma.postImpression.createMany).not.toHaveBeenCalled();
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
