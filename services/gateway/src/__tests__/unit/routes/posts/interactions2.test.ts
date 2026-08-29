/**
 * Extended coverage for routes/posts/interactions.ts — Part 2
 * Covers branches not reached by interactions.test.ts or interactions-extended.test.ts:
 *   - onDuplicate callbacks in like/unlike (lines 58-59, 149-150)
 *   - STORY/STATUS broadcast paths in like (lines 76, 82)
 *   - STORY/STATUS/POST broadcast paths in unlike (lines 163-185)
 *   - notifService createPostLikeNotification (lines 97, 104-113)
 *   - broadcastStoryViewed on view route (lines 274-276)
 *   - unauthenticated paths for pin/unpin/views/interactions/repost (lines 555, 581, 607, 639, 671)
 *   - error catch blocks for all routes
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeAll, beforeEach, afterAll } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';

// ─── Mocks (mock prefix required for jest.mock hoisting) ─────────────────────

const mockLikePost = jest.fn<any>();
const mockUnlikePost = jest.fn<any>();
const mockGetPostById = jest.fn<any>();
const mockRecordView = jest.fn<any>();
const mockRecordAnonymousOpen = jest.fn<any>();
const mockPinPost = jest.fn<any>();
const mockUnpinPost = jest.fn<any>();
const mockGetPostViews = jest.fn<any>();
const mockGetPostInteractions = jest.fn<any>();
const mockRepostPost = jest.fn<any>();
const mockSharePost = jest.fn<any>();
const mockShareWithTrackingLink = jest.fn<any>();
const mockGetPostShareLink = jest.fn<any>();
const mockRecordEngagementBatch = jest.fn<any>();
const mockWithMutationLog = jest.fn<any>();

jest.mock('../../../../services/PostService', () => ({
  PostService: jest.fn().mockImplementation(() => ({
    likePost: (...a: any[]) => mockLikePost(...a),
    unlikePost: (...a: any[]) => mockUnlikePost(...a),
    bookmarkPost: jest.fn<any>().mockResolvedValue({ bookmarkCount: 1 }),
    unbookmarkPost: jest.fn<any>().mockResolvedValue({ bookmarkCount: 0 }),
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
  resolveMentionedUsers: jest.fn<any>().mockResolvedValue([]),
}));

jest.mock('../../../../services/TrackingLinkService', () => ({
  resolveFrontendBaseUrl: jest.fn<any>().mockReturnValue('https://app.example.com'),
  TrackingLinkService: jest.fn<any>().mockImplementation(() => ({})),
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
  withMutationLog: (...args: any[]) => mockWithMutationLog(...args),
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { registerInteractionRoutes } from '../../../../routes/posts/interactions';

// ─── Constants ────────────────────────────────────────────────────────────────

const USER_ID = '507f1f77bcf86cd799439011';
const POST_ID = '507f1f77bcf86cd799439022';
const AUTHOR_ID = '507f1f77bcf86cd799439033';

// ─── Factories ────────────────────────────────────────────────────────────────

function makeSocialEvents() {
  return {
    broadcastPostLiked: jest.fn<any>().mockResolvedValue(undefined),
    broadcastPostUnliked: jest.fn<any>().mockResolvedValue(undefined),
    broadcastStoryReacted: jest.fn<any>(),
    broadcastStatusReacted: jest.fn<any>(),
    broadcastStoryUnreacted: jest.fn<any>(),
    broadcastStatusUnreacted: jest.fn<any>(),
    broadcastStoryViewed: jest.fn<any>(),
    broadcastPostBookmarked: jest.fn<any>(),
    broadcastPostReposted: jest.fn<any>().mockResolvedValue(undefined),
  };
}

function makeNotificationService() {
  return {
    createPostLikeNotification: jest.fn<any>().mockResolvedValue(undefined),
    markPostNotificationsAsRead: jest.fn<any>().mockResolvedValue(undefined),
    createPostRepostNotification: jest.fn<any>().mockResolvedValue(undefined),
  };
}

function makePrisma() {
  return {
    postImpression: {
      create: jest.fn<any>().mockResolvedValue({}),
      createMany: jest.fn<any>().mockResolvedValue({ count: 1 }),
    },
    post: {
      update: jest.fn<any>().mockResolvedValue({}),
      updateMany: jest.fn<any>().mockResolvedValue({ count: 1 }),
      // Audience déclarée PUBLIC (cf. `interactions-audience.test.ts`). Pas un
      // repost (`isQuote:false, repostOfId:null`) — `resolveInteractionTarget`
      // (tâche 9) renvoie donc directement ce post, `id` compris : la
      // redirection repost simple → racine est couverte séparément dans
      // `interactions-audience.test.ts`.
      findFirst: jest.fn<any>().mockResolvedValue({
        id: POST_ID, authorId: 'author-1', visibility: 'PUBLIC', visibilityUserIds: [],
        isQuote: false, repostOfId: null, originalRepostOfId: null,
      }),
      // Résolution repostOfId/originalRepostOfId pour le crédit de racine du
      // batch d'impressions (chantier reposts cohérents, tâche 1) — par
      // défaut aucun repost dans le batch. L'unitaire replie sa résolution
      // dans le `select` de `update`, aucun `findUnique` séparé nécessaire.
      // Le même délégué porte la passe d'audience du lot (#4146).
      findMany: aclAwareFindMany(),
    },
  } as any;
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

function makeAuth(authenticated: boolean) {
  return async (req: FastifyRequest) => {
    (req as any).authContext = authenticated
      ? {
          isAuthenticated: true,
          registeredUser: { id: USER_ID, role: 'USER', username: 'alice' },
        }
      : null;
  };
}

async function buildApp(opts: {
  authenticated?: boolean;
  socialEvents?: any;
  notificationService?: any;
  prisma?: any;
} = {}): Promise<FastifyInstance> {
  const { authenticated = true, socialEvents, notificationService, prisma = makePrisma() } = opts;

  const app = Fastify({ logger: false });
  if (socialEvents !== undefined) app.decorate('socialEvents', socialEvents);
  if (notificationService !== undefined) app.decorate('notificationService', notificationService);
  registerInteractionRoutes(app, prisma, makeAuth(authenticated));
  await app.ready();
  return app;
}

// ─── Default mock implementations (reset before each test) ───────────────────

beforeEach(() => {
  mockWithMutationLog.mockImplementation(async ({ op }: any) => op());
  mockLikePost.mockResolvedValue({
    id: POST_ID, type: 'POST', authorId: AUTHOR_ID, likeCount: 1, reactionSummary: {},
  });
  // `unlikePost` rend une ENVELOPPE : le post relu ET la réaction réellement
  // retirée, seul endroit d'où la route puisse l'apprendre (cf. PostService).
  mockUnlikePost.mockResolvedValue({
    id: POST_ID,
    removedEmoji: '❤️',
    post: { id: POST_ID, type: 'POST', authorId: AUTHOR_ID, likeCount: 0, reactionSummary: {} },
  });
  mockGetPostById.mockResolvedValue({
    id: POST_ID, type: 'POST', authorId: AUTHOR_ID, viewCount: 1,
  });
  mockRecordView.mockResolvedValue(true);
  mockRecordAnonymousOpen.mockResolvedValue(true);
  mockPinPost.mockResolvedValue({ id: POST_ID });
  mockUnpinPost.mockResolvedValue({ id: POST_ID });
  mockGetPostViews.mockResolvedValue({ items: [], total: 0, hasMore: false });
  mockGetPostInteractions.mockResolvedValue({ viewers: [], total: 0, hasMore: false });
  mockRepostPost.mockResolvedValue({ id: 'repost-id', repostOfId: POST_ID, shareCount: 1 });
  mockSharePost.mockResolvedValue({ shareCount: 1 });
  mockShareWithTrackingLink.mockResolvedValue({ shareCount: 1, token: 'abc123', shortUrl: 'https://app.example.com/l/abc123' });
  mockGetPostShareLink.mockResolvedValue({ shareCount: 0, link: null });
  mockRecordEngagementBatch.mockResolvedValue(1);
});

// ─── POST /posts/:postId/like — STORY type ────────────────────────────────────

describe('POST /posts/:postId/like — STORY type triggers broadcastStoryReacted', () => {
  let app: FastifyInstance;
  let socialEvents: ReturnType<typeof makeSocialEvents>;
  beforeAll(async () => {
    socialEvents = makeSocialEvents();
    app = await buildApp({ socialEvents });
  });
  afterAll(async () => { await app.close(); });

  it('calls broadcastStoryReacted when post type is STORY', async () => {
    mockLikePost.mockResolvedValueOnce({
      id: POST_ID, type: 'STORY', authorId: AUTHOR_ID, likeCount: 1, reactionSummary: {},
    });
    const res = await app.inject({ method: 'POST', url: `/posts/${POST_ID}/like`, payload: {} });
    expect(res.statusCode).toBe(200);
    expect(socialEvents.broadcastStoryReacted).toHaveBeenCalledWith(
      expect.objectContaining({ storyId: POST_ID }),
      AUTHOR_ID,
    );
    expect(socialEvents.broadcastStatusReacted).not.toHaveBeenCalled();
  });
});

// ─── POST /posts/:postId/like — STATUS type ───────────────────────────────────

describe('POST /posts/:postId/like — STATUS type triggers broadcastStatusReacted', () => {
  let app: FastifyInstance;
  let socialEvents: ReturnType<typeof makeSocialEvents>;
  beforeAll(async () => {
    socialEvents = makeSocialEvents();
    app = await buildApp({ socialEvents });
  });
  afterAll(async () => { await app.close(); });

  it('calls broadcastStatusReacted when post type is STATUS', async () => {
    mockLikePost.mockResolvedValueOnce({
      id: POST_ID, type: 'STATUS', authorId: AUTHOR_ID, likeCount: 1, reactionSummary: {},
    });
    const res = await app.inject({ method: 'POST', url: `/posts/${POST_ID}/like`, payload: {} });
    expect(res.statusCode).toBe(200);
    expect(socialEvents.broadcastStatusReacted).toHaveBeenCalledWith(
      expect.objectContaining({ statusId: POST_ID }),
      AUTHOR_ID,
    );
    expect(socialEvents.broadcastStoryReacted).not.toHaveBeenCalled();
  });
});

// ─── POST /posts/:postId/like — notifService ──────────────────────────────────

describe('POST /posts/:postId/like — notificationService fires createPostLikeNotification', () => {
  let app: FastifyInstance;
  let notificationService: ReturnType<typeof makeNotificationService>;
  beforeAll(async () => {
    notificationService = makeNotificationService();
    app = await buildApp({ notificationService });
  });
  afterAll(async () => { await app.close(); });

  it('calls createPostLikeNotification with correct params', async () => {
    const res = await app.inject({ method: 'POST', url: `/posts/${POST_ID}/like`, payload: {} });
    expect(res.statusCode).toBe(200);
    expect(notificationService.createPostLikeNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: USER_ID,
        postId: POST_ID,
        postAuthorId: AUTHOR_ID,
      }),
    );
  });
});

// ─── POST /posts/:postId/like — onDuplicate callback ─────────────────────────

describe('POST /posts/:postId/like — withMutationLog onDuplicate path', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 200 via onDuplicate path and calls getPostById', async () => {
    mockWithMutationLog.mockImplementationOnce(async ({ onDuplicate }: any) => onDuplicate(POST_ID));
    const res = await app.inject({ method: 'POST', url: `/posts/${POST_ID}/like`, payload: {} });
    expect(res.statusCode).toBe(200);
    expect(mockGetPostById).toHaveBeenCalledWith(POST_ID, USER_ID);
  });

  it('returns 404 via onDuplicate when getPostById returns null', async () => {
    mockWithMutationLog.mockImplementationOnce(async ({ onDuplicate }: any) => onDuplicate(POST_ID));
    mockGetPostById.mockResolvedValueOnce(null);
    const res = await app.inject({ method: 'POST', url: `/posts/${POST_ID}/like`, payload: {} });
    expect(res.statusCode).toBe(404);
  });
});

// ─── DELETE /posts/:postId/like — STORY type ─────────────────────────────────

describe('DELETE /posts/:postId/like — STORY type triggers broadcastStoryUnreacted', () => {
  let app: FastifyInstance;
  let socialEvents: ReturnType<typeof makeSocialEvents>;
  beforeAll(async () => {
    socialEvents = makeSocialEvents();
    app = await buildApp({ socialEvents });
  });
  afterAll(async () => { await app.close(); });

  it('calls broadcastStoryUnreacted when post type is STORY', async () => {
    mockUnlikePost.mockResolvedValueOnce({
      id: POST_ID,
      removedEmoji: '❤️',
      post: { id: POST_ID, type: 'STORY', authorId: AUTHOR_ID, likeCount: 0, reactionSummary: {} },
    });
    const res = await app.inject({ method: 'DELETE', url: `/posts/${POST_ID}/like` });
    expect(res.statusCode).toBe(200);
    expect(socialEvents.broadcastStoryUnreacted).toHaveBeenCalledWith(
      expect.objectContaining({ storyId: POST_ID }),
      AUTHOR_ID,
    );
  });
});

// ─── DELETE /posts/:postId/like — STATUS type ────────────────────────────────

describe('DELETE /posts/:postId/like — STATUS type triggers broadcastStatusUnreacted', () => {
  let app: FastifyInstance;
  let socialEvents: ReturnType<typeof makeSocialEvents>;
  beforeAll(async () => {
    socialEvents = makeSocialEvents();
    app = await buildApp({ socialEvents });
  });
  afterAll(async () => { await app.close(); });

  it('calls broadcastStatusUnreacted when post type is STATUS', async () => {
    mockUnlikePost.mockResolvedValueOnce({
      id: POST_ID,
      removedEmoji: '❤️',
      post: { id: POST_ID, type: 'STATUS', authorId: AUTHOR_ID, likeCount: 0, reactionSummary: {} },
    });
    const res = await app.inject({ method: 'DELETE', url: `/posts/${POST_ID}/like` });
    expect(res.statusCode).toBe(200);
    expect(socialEvents.broadcastStatusUnreacted).toHaveBeenCalledWith(
      expect.objectContaining({ statusId: POST_ID }),
      AUTHOR_ID,
    );
  });
});

// ─── DELETE /posts/:postId/like — POST type broadcast ────────────────────────

describe('DELETE /posts/:postId/like — POST type triggers broadcastPostUnliked', () => {
  let app: FastifyInstance;
  let socialEvents: ReturnType<typeof makeSocialEvents>;
  beforeAll(async () => {
    socialEvents = makeSocialEvents();
    app = await buildApp({ socialEvents });
  });
  afterAll(async () => { await app.close(); });

  it('calls broadcastPostUnliked when post type is POST', async () => {
    const res = await app.inject({ method: 'DELETE', url: `/posts/${POST_ID}/like` });
    expect(res.statusCode).toBe(200);
    expect(socialEvents.broadcastPostUnliked).toHaveBeenCalled();
  });
});

// ─── DELETE /posts/:postId/like — l'emoji annoncé est celui RÉELLEMENT retiré ─
//
// Le retrait ne dit pas de lui-même QUEL emoji part : la ligne `PostReaction`
// n'est lisible qu'avant sa suppression, et `PostService.unlikePost` est le
// SEUL endroit qui la lise. La route diffusait donc un `'❤️'` codé en dur — une
// affirmation qu'elle n'était pas en position de faire.
//
// Ce n'est pas resté latent : `StoryViewModel.applyStoryReactionDelta` (iOS)
// retire `event.emoji` de `currentUserReactions`. Un 😂 retiré n'y retirait
// RIEN, et la puce 😂 survivait à sa propre suppression chez son auteur — avec
// un compteur déjà décrémenté, donc une contradiction visible à l'écran.
describe("DELETE /posts/:postId/like — l'emoji diffusé est celui qui a été retiré", () => {
  let app: FastifyInstance;
  let socialEvents: ReturnType<typeof makeSocialEvents>;
  beforeAll(async () => {
    socialEvents = makeSocialEvents();
    app = await buildApp({ socialEvents });
  });
  afterAll(async () => { await app.close(); });
  beforeEach(() => {
    socialEvents.broadcastStoryUnreacted.mockClear();
    socialEvents.broadcastStatusUnreacted.mockClear();
    socialEvents.broadcastPostUnliked.mockClear();
  });

  it('STORY : diffuse le 😂 retiré, pas un ❤️ reconstruit', async () => {
    mockUnlikePost.mockResolvedValueOnce({
      id: POST_ID,
      removedEmoji: '😂',
      post: { id: POST_ID, type: 'STORY', authorId: AUTHOR_ID, likeCount: 0, reactionSummary: {} },
    });
    const res = await app.inject({ method: 'DELETE', url: `/posts/${POST_ID}/like` });
    expect(res.statusCode).toBe(200);
    expect(socialEvents.broadcastStoryUnreacted).toHaveBeenCalledWith(
      expect.objectContaining({ storyId: POST_ID, emoji: '😂' }),
      AUTHOR_ID,
    );
  });

  it('STATUS : diffuse le 🔥 retiré', async () => {
    mockUnlikePost.mockResolvedValueOnce({
      id: POST_ID,
      removedEmoji: '🔥',
      post: { id: POST_ID, type: 'STATUS', authorId: AUTHOR_ID, likeCount: 0, reactionSummary: {} },
    });
    const res = await app.inject({ method: 'DELETE', url: `/posts/${POST_ID}/like` });
    expect(res.statusCode).toBe(200);
    expect(socialEvents.broadcastStatusUnreacted).toHaveBeenCalledWith(
      expect.objectContaining({ statusId: POST_ID, emoji: '🔥' }),
      AUTHOR_ID,
    );
  });

  it('POST : diffuse le 👍 retiré', async () => {
    mockUnlikePost.mockResolvedValueOnce({
      id: POST_ID,
      removedEmoji: '👍',
      post: { id: POST_ID, type: 'POST', authorId: AUTHOR_ID, likeCount: 2, reactionSummary: { '❤️': 2 } },
    });
    const res = await app.inject({ method: 'DELETE', url: `/posts/${POST_ID}/like` });
    expect(res.statusCode).toBe(200);
    expect(socialEvents.broadcastPostUnliked).toHaveBeenCalledWith(
      expect.objectContaining({ postId: POST_ID, emoji: '👍' }),
      AUTHOR_ID, 'PUBLIC', [],
    );
  });
});

// ─── DELETE /posts/:postId/like — rien retiré ⇒ rien annoncé ─────────────────
//
// `unlikePost` est idempotent : sur un post que le lecteur n'a jamais aimé, il
// ne touche à rien et rend `removedEmoji: null`. La route annonçait quand même
// un retrait — un événement qui décrit une transition qui n'a pas eu lieu, et
// que les clients à delta appliquent (`-1`) comme les autres.
//
// Le rejeu `onDuplicate` tombe dans la même case, et pour la même raison : la
// ligne `PostReaction` est déjà partie, l'emoji retiré n'est plus lisible, et
// l'exécution d'origine a déjà diffusé. Le commentaire de la route l'affirmait
// déjà (« prevents the broadcast path from firing twice on replay ») sans que
// le code le fasse.
describe('DELETE /posts/:postId/like — aucun retrait ⇒ aucune diffusion', () => {
  let app: FastifyInstance;
  let socialEvents: ReturnType<typeof makeSocialEvents>;
  beforeAll(async () => {
    socialEvents = makeSocialEvents();
    app = await buildApp({ socialEvents });
  });
  afterAll(async () => { await app.close(); });
  beforeEach(() => {
    socialEvents.broadcastStoryUnreacted.mockClear();
    socialEvents.broadcastStatusUnreacted.mockClear();
    socialEvents.broadcastPostUnliked.mockClear();
  });

  it('ne diffuse rien quand aucune réaction du lecteur n\'existait', async () => {
    mockUnlikePost.mockResolvedValueOnce({
      id: POST_ID,
      removedEmoji: null,
      post: { id: POST_ID, type: 'POST', authorId: AUTHOR_ID, likeCount: 7, reactionSummary: { '❤️': 7 } },
    });
    const res = await app.inject({ method: 'DELETE', url: `/posts/${POST_ID}/like` });
    expect(res.statusCode).toBe(200);
    expect(socialEvents.broadcastPostUnliked).not.toHaveBeenCalled();
  });

  it('ne diffuse rien sur une STORY quand aucune réaction du lecteur n\'existait', async () => {
    mockUnlikePost.mockResolvedValueOnce({
      id: POST_ID,
      removedEmoji: null,
      post: { id: POST_ID, type: 'STORY', authorId: AUTHOR_ID, likeCount: 3, reactionSummary: { '😂': 3 } },
    });
    const res = await app.inject({ method: 'DELETE', url: `/posts/${POST_ID}/like` });
    expect(res.statusCode).toBe(200);
    expect(socialEvents.broadcastStoryUnreacted).not.toHaveBeenCalled();
  });

  it('ne re-diffuse pas sur le rejeu onDuplicate (emoji retiré non relisible)', async () => {
    mockWithMutationLog.mockImplementationOnce(async ({ onDuplicate }: any) => onDuplicate(POST_ID));
    mockGetPostById.mockResolvedValueOnce({
      id: POST_ID, type: 'POST', authorId: AUTHOR_ID, likeCount: 4, reactionSummary: { '❤️': 4 },
    });
    const res = await app.inject({ method: 'DELETE', url: `/posts/${POST_ID}/like` });
    expect(res.statusCode).toBe(200);
    expect(socialEvents.broadcastPostUnliked).not.toHaveBeenCalled();
  });
});

// ─── Réactions story/status : le compteur ABSOLU sur le fil ──────────────────
//
// `post:liked`/`post:unliked` portent `likeCount` + `reactionSummary` depuis
// toujours ; leurs jumeaux story/status ne portaient qu'un emoji et un acteur.
// Un client ne pouvait donc que compter en `±1` — non idempotent sous double
// livraison, et irrécupérable après un événement manqué. Le web l'avait acté en
// commentaire (`handleStoryReacted` : « no authoritative aggregation count »),
// c'est-à-dire en renonçant au temps réel sur ces compteurs.
//
// Les deux champs sont disponibles au site d'émission : la route tient déjà le
// post rendu par `likePost`/`unlikePost`.
describe('Réactions story/status — payload absolu (likeCount + reactionSummary)', () => {
  let app: FastifyInstance;
  let socialEvents: ReturnType<typeof makeSocialEvents>;
  beforeAll(async () => {
    socialEvents = makeSocialEvents();
    app = await buildApp({ socialEvents });
  });
  afterAll(async () => { await app.close(); });

  it('story:reacted porte le total et la ventilation', async () => {
    mockLikePost.mockResolvedValueOnce({
      id: POST_ID, type: 'STORY', authorId: AUTHOR_ID, likeCount: 3, reactionSummary: { '❤️': 2, '😂': 1 },
    });
    await app.inject({ method: 'POST', url: `/posts/${POST_ID}/like`, payload: {} });
    expect(socialEvents.broadcastStoryReacted).toHaveBeenCalledWith(
      expect.objectContaining({ likeCount: 3, reactionSummary: { '❤️': 2, '😂': 1 } }),
      AUTHOR_ID,
    );
  });

  it('status:reacted porte le total et la ventilation', async () => {
    mockLikePost.mockResolvedValueOnce({
      id: POST_ID, type: 'STATUS', authorId: AUTHOR_ID, likeCount: 1, reactionSummary: { '🔥': 1 },
    });
    await app.inject({ method: 'POST', url: `/posts/${POST_ID}/like`, payload: {} });
    expect(socialEvents.broadcastStatusReacted).toHaveBeenCalledWith(
      expect.objectContaining({ likeCount: 1, reactionSummary: { '🔥': 1 } }),
      AUTHOR_ID,
    );
  });

  it('story:unreacted porte le total APRÈS retrait', async () => {
    mockUnlikePost.mockResolvedValueOnce({
      id: POST_ID,
      removedEmoji: '😂',
      post: { id: POST_ID, type: 'STORY', authorId: AUTHOR_ID, likeCount: 2, reactionSummary: { '❤️': 2 } },
    });
    await app.inject({ method: 'DELETE', url: `/posts/${POST_ID}/like` });
    expect(socialEvents.broadcastStoryUnreacted).toHaveBeenCalledWith(
      expect.objectContaining({ likeCount: 2, reactionSummary: { '❤️': 2 } }),
      AUTHOR_ID,
    );
  });

  it('status:unreacted porte le total APRÈS retrait', async () => {
    mockUnlikePost.mockResolvedValueOnce({
      id: POST_ID,
      removedEmoji: '🔥',
      post: { id: POST_ID, type: 'STATUS', authorId: AUTHOR_ID, likeCount: 0, reactionSummary: {} },
    });
    await app.inject({ method: 'DELETE', url: `/posts/${POST_ID}/like` });
    expect(socialEvents.broadcastStatusUnreacted).toHaveBeenCalledWith(
      expect.objectContaining({ likeCount: 0, reactionSummary: {} }),
      AUTHOR_ID,
    );
  });
});

// ─── DELETE /posts/:postId/like — onDuplicate callback ───────────────────────

describe('DELETE /posts/:postId/like — withMutationLog onDuplicate path', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 200 via onDuplicate path and calls getPostById', async () => {
    mockWithMutationLog.mockImplementationOnce(async ({ onDuplicate }: any) => onDuplicate(POST_ID));
    const res = await app.inject({ method: 'DELETE', url: `/posts/${POST_ID}/like` });
    expect(res.statusCode).toBe(200);
    expect(mockGetPostById).toHaveBeenCalledWith(POST_ID, USER_ID);
  });
});

// ─── POST /posts/:postId/view — STORY type broadcastStoryViewed ──────────────

describe('POST /posts/:postId/view — STORY type triggers broadcastStoryViewed', () => {
  let app: FastifyInstance;
  let socialEvents: ReturnType<typeof makeSocialEvents>;
  let notificationService: ReturnType<typeof makeNotificationService>;
  beforeAll(async () => {
    socialEvents = makeSocialEvents();
    notificationService = makeNotificationService();
    app = await buildApp({ socialEvents, notificationService });
  });
  afterAll(async () => { await app.close(); });

  it('calls broadcastStoryViewed when post type is STORY and viewer is not the author', async () => {
    mockGetPostById.mockResolvedValueOnce({
      id: POST_ID, type: 'STORY', authorId: AUTHOR_ID, viewCount: 5,
    });
    const res = await app.inject({ method: 'POST', url: `/posts/${POST_ID}/view`, payload: {} });
    expect(res.statusCode).toBe(200);
    expect(socialEvents.broadcastStoryViewed).toHaveBeenCalledWith(
      expect.objectContaining({ storyId: POST_ID, viewerId: USER_ID }),
      AUTHOR_ID,
    );
  });

  it('does NOT call broadcastStoryViewed when the viewer is the author', async () => {
    mockGetPostById.mockResolvedValueOnce({
      id: POST_ID, type: 'STORY', authorId: USER_ID, viewCount: 5,
    });
    socialEvents.broadcastStoryViewed.mockClear();
    const res = await app.inject({ method: 'POST', url: `/posts/${POST_ID}/view`, payload: {} });
    expect(res.statusCode).toBe(200);
    expect(socialEvents.broadcastStoryViewed).not.toHaveBeenCalled();
  });

  it('does NOT call broadcastStoryViewed when post type is POST', async () => {
    mockGetPostById.mockResolvedValueOnce({
      id: POST_ID, type: 'POST', authorId: AUTHOR_ID, viewCount: 5,
    });
    socialEvents.broadcastStoryViewed.mockClear();
    const res = await app.inject({ method: 'POST', url: `/posts/${POST_ID}/view`, payload: {} });
    expect(res.statusCode).toBe(200);
    expect(socialEvents.broadcastStoryViewed).not.toHaveBeenCalled();
  });
});

// ─── Error catch blocks (anonymous-view, impression, batch, share) ────────────

describe('Error catch blocks — anonymous-view, impression, batch, share', () => {
  let app: FastifyInstance;
  let prisma: ReturnType<typeof makePrisma>;
  beforeAll(async () => {
    prisma = makePrisma();
    app = await buildApp({ prisma, notificationService: makeNotificationService() });
  });
  afterAll(async () => { await app.close(); });

  it('POST /posts/:postId/anonymous-view — returns 500 on service error', async () => {
    mockRecordAnonymousOpen.mockRejectedValueOnce(new Error('DB error'));
    const res = await app.inject({
      method: 'POST',
      url: `/posts/${POST_ID}/anonymous-view`,
      headers: { 'x-session-token': 'valid-session-token-xyz' },
    });
    expect(res.statusCode).toBe(500);
  });

  it('POST /posts/:postId/impression — returns 500 on prisma error', async () => {
    prisma.postImpression.create.mockRejectedValueOnce(new Error('DB error'));
    const res = await app.inject({
      method: 'POST',
      url: `/posts/${POST_ID}/impression`,
      payload: { source: 'feed' },
    });
    expect(res.statusCode).toBe(500);
  });

  it('POST /posts/impressions/batch — returns 500 on prisma error', async () => {
    prisma.postImpression.createMany.mockRejectedValueOnce(new Error('DB error'));
    const res = await app.inject({
      method: 'POST',
      url: '/posts/impressions/batch',
      payload: { postIds: [POST_ID], source: 'feed' },
    });
    expect(res.statusCode).toBe(500);
  });

  it('POST /posts/engagement/batch — returns 500 on service error', async () => {
    mockRecordEngagementBatch.mockRejectedValueOnce(new Error('DB error'));
    const res = await app.inject({
      method: 'POST',
      url: '/posts/engagement/batch',
      payload: {
        sessions: [{
          sessionId: '550e8400-e29b-41d4-a716-446655440000',
          postId: POST_ID,
          contentType: 'POST',
          surface: 'feed',
          startedAt: '2026-06-30T00:00:00.000Z',
          dwellMs: 1000,
        }],
      },
    });
    expect(res.statusCode).toBe(500);
  });

  it('POST /posts/:postId/share — returns 500 on service error', async () => {
    mockSharePost.mockRejectedValueOnce(new Error('DB error'));
    const res = await app.inject({
      method: 'POST',
      url: `/posts/${POST_ID}/share`,
      payload: {},
    });
    expect(res.statusCode).toBe(500);
  });
});

// ─── Pin/Unpin — unauthenticated paths ───────────────────────────────────────

describe('Pin/Unpin — unauthenticated paths', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp({ authenticated: false }); });
  afterAll(async () => { await app.close(); });

  it('POST /posts/:postId/pin — returns 401 when not authenticated', async () => {
    const res = await app.inject({ method: 'POST', url: `/posts/${POST_ID}/pin` });
    expect(res.statusCode).toBe(401);
  });

  it('DELETE /posts/:postId/pin — returns 401 when not authenticated', async () => {
    const res = await app.inject({ method: 'DELETE', url: `/posts/${POST_ID}/pin` });
    expect(res.statusCode).toBe(401);
  });
});

// ─── Pin — internal error catch ───────────────────────────────────────────────

describe('Pin — internal error catch block', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 500 when pinPost throws a non-FORBIDDEN error', async () => {
    mockPinPost.mockRejectedValueOnce(new Error('DB error'));
    const res = await app.inject({ method: 'POST', url: `/posts/${POST_ID}/pin` });
    expect(res.statusCode).toBe(500);
  });
});

// ─── Unpin — FORBIDDEN and internal error catch ───────────────────────────────

describe('Unpin — FORBIDDEN and internal error', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 403 when unpinPost throws FORBIDDEN', async () => {
    mockUnpinPost.mockRejectedValueOnce(new Error('FORBIDDEN'));
    const res = await app.inject({ method: 'DELETE', url: `/posts/${POST_ID}/pin` });
    expect(res.statusCode).toBe(403);
  });

  it('returns 500 when unpinPost throws a non-FORBIDDEN error', async () => {
    mockUnpinPost.mockRejectedValueOnce(new Error('DB error'));
    const res = await app.inject({ method: 'DELETE', url: `/posts/${POST_ID}/pin` });
    expect(res.statusCode).toBe(500);
  });
});

// ─── Views/Interactions — unauthenticated paths ───────────────────────────────

describe('Views/Interactions — unauthenticated paths', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp({ authenticated: false }); });
  afterAll(async () => { await app.close(); });

  it('GET /posts/:postId/views — returns 401 when not authenticated', async () => {
    const res = await app.inject({ method: 'GET', url: `/posts/${POST_ID}/views` });
    expect(res.statusCode).toBe(401);
  });

  it('GET /posts/:postId/interactions — returns 401 when not authenticated', async () => {
    const res = await app.inject({ method: 'GET', url: `/posts/${POST_ID}/interactions` });
    expect(res.statusCode).toBe(401);
  });
});

// ─── Views — internal error catch ─────────────────────────────────────────────

describe('Views — internal error catch block', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 500 when getPostViews throws a non-FORBIDDEN error', async () => {
    mockGetPostViews.mockRejectedValueOnce(new Error('DB error'));
    const res = await app.inject({ method: 'GET', url: `/posts/${POST_ID}/views` });
    expect(res.statusCode).toBe(500);
  });
});

// ─── Interactions — FORBIDDEN and internal error catch ───────────────────────

describe('Interactions — FORBIDDEN and internal error', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 403 when getPostInteractions throws FORBIDDEN', async () => {
    mockGetPostInteractions.mockRejectedValueOnce(new Error('FORBIDDEN'));
    const res = await app.inject({ method: 'GET', url: `/posts/${POST_ID}/interactions` });
    expect(res.statusCode).toBe(403);
  });

  it('returns 500 when getPostInteractions throws a non-FORBIDDEN error', async () => {
    mockGetPostInteractions.mockRejectedValueOnce(new Error('DB error'));
    const res = await app.inject({ method: 'GET', url: `/posts/${POST_ID}/interactions` });
    expect(res.statusCode).toBe(500);
  });
});

// ─── Repost — unauthenticated path ───────────────────────────────────────────

describe('Repost — unauthenticated', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp({ authenticated: false }); });
  afterAll(async () => { await app.close(); });

  it('POST /posts/:postId/repost — returns 401 when not authenticated', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/posts/${POST_ID}/repost`,
      payload: {},
    });
    expect(res.statusCode).toBe(401);
  });
});

// ─── Repost — FORBIDDEN (statusCode 403) error ───────────────────────────────

describe('Repost — FORBIDDEN statusCode error', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 403 when repostPost throws an error with statusCode 403', async () => {
    const forbiddenErr = new Error('Cannot repost your own post') as any;
    forbiddenErr.statusCode = 403;
    mockRepostPost.mockRejectedValueOnce(forbiddenErr);
    const res = await app.inject({
      method: 'POST',
      url: `/posts/${POST_ID}/repost`,
      payload: {},
    });
    expect(res.statusCode).toBe(403);
  });
});

// ─── Repost — notifService fires createPostRepostNotification ────────────────

describe('Repost — notificationService fires createPostRepostNotification', () => {
  let app: FastifyInstance;
  let notificationService: ReturnType<typeof makeNotificationService>;
  let socialEvents: ReturnType<typeof makeSocialEvents>;
  beforeAll(async () => {
    notificationService = makeNotificationService();
    socialEvents = makeSocialEvents();
    app = await buildApp({ notificationService, socialEvents });
  });
  afterAll(async () => { await app.close(); });

  it('calls createPostRepostNotification when repost has repostOfId and original has authorId', async () => {
    mockRepostPost.mockResolvedValueOnce({
      id: 'repost-id',
      repostOfId: POST_ID,
      shareCount: 1,
    });
    mockGetPostById.mockResolvedValueOnce({
      id: POST_ID,
      type: 'POST',
      authorId: AUTHOR_ID,
      content: 'Original post content',
    });
    const res = await app.inject({
      method: 'POST',
      url: `/posts/${POST_ID}/repost`,
      payload: {},
    });
    expect(res.statusCode).toBe(201);
    expect(notificationService.createPostRepostNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: USER_ID,
        originalPostId: POST_ID,
        postAuthorId: AUTHOR_ID,
      }),
    );
  });

  it('skips notification when repost has no repostOfId', async () => {
    mockRepostPost.mockResolvedValueOnce({
      id: 'repost-id',
      repostOfId: null,
      shareCount: 1,
    });
    notificationService.createPostRepostNotification.mockClear();
    const res = await app.inject({
      method: 'POST',
      url: `/posts/${POST_ID}/repost`,
      payload: {},
    });
    expect(res.statusCode).toBe(201);
    expect(notificationService.createPostRepostNotification).not.toHaveBeenCalled();
  });

  it('calls broadcastPostReposted when socialEvents is available', async () => {
    socialEvents.broadcastPostReposted.mockClear();
    mockRepostPost.mockResolvedValueOnce({
      id: 'repost-id',
      repostOfId: null,
      shareCount: 1,
    });
    const res = await app.inject({
      method: 'POST',
      url: `/posts/${POST_ID}/repost`,
      payload: {},
    });
    expect(res.statusCode).toBe(201);
    expect(socialEvents.broadcastPostReposted).toHaveBeenCalledWith(
      expect.objectContaining({ originalPostId: POST_ID }),
      USER_ID,
    );
  });
});

// ─── Fire-and-forget .catch() callback coverage ───────────────────────────────

describe('Like — broadcastPostLiked rejection handled by .catch()', () => {
  let app: FastifyInstance;
  let socialEvents: ReturnType<typeof makeSocialEvents>;
  beforeAll(async () => {
    socialEvents = makeSocialEvents();
    app = await buildApp({ socialEvents });
  });
  afterAll(async () => { await app.close(); });

  it('still returns 200 even when broadcastPostLiked rejects (fire-and-forget)', async () => {
    socialEvents.broadcastPostLiked.mockRejectedValueOnce(new Error('broadcast failed'));
    const res = await app.inject({ method: 'POST', url: `/posts/${POST_ID}/like`, payload: {} });
    expect(res.statusCode).toBe(200);
  });
});

describe('Like — createPostLikeNotification rejection handled by .catch()', () => {
  let app: FastifyInstance;
  let notificationService: ReturnType<typeof makeNotificationService>;
  beforeAll(async () => {
    notificationService = makeNotificationService();
    app = await buildApp({ notificationService });
  });
  afterAll(async () => { await app.close(); });

  it('still returns 200 even when createPostLikeNotification rejects (fire-and-forget)', async () => {
    notificationService.createPostLikeNotification.mockRejectedValueOnce(new Error('notify failed'));
    const res = await app.inject({ method: 'POST', url: `/posts/${POST_ID}/like`, payload: {} });
    expect(res.statusCode).toBe(200);
  });
});

describe('Unlike — broadcastPostUnliked rejection handled by .catch()', () => {
  let app: FastifyInstance;
  let socialEvents: ReturnType<typeof makeSocialEvents>;
  beforeAll(async () => {
    socialEvents = makeSocialEvents();
    app = await buildApp({ socialEvents });
  });
  afterAll(async () => { await app.close(); });

  it('still returns 200 even when broadcastPostUnliked rejects (fire-and-forget)', async () => {
    socialEvents.broadcastPostUnliked.mockRejectedValueOnce(new Error('broadcast failed'));
    const res = await app.inject({ method: 'DELETE', url: `/posts/${POST_ID}/like` });
    expect(res.statusCode).toBe(200);
  });
});

describe('Repost — broadcastPostReposted rejection handled by .catch()', () => {
  let app: FastifyInstance;
  let socialEvents: ReturnType<typeof makeSocialEvents>;
  let notificationService: ReturnType<typeof makeNotificationService>;
  beforeAll(async () => {
    socialEvents = makeSocialEvents();
    notificationService = makeNotificationService();
    app = await buildApp({ socialEvents, notificationService });
  });
  afterAll(async () => { await app.close(); });

  it('still returns 201 even when broadcastPostReposted rejects (fire-and-forget)', async () => {
    socialEvents.broadcastPostReposted.mockRejectedValueOnce(new Error('broadcast failed'));
    mockRepostPost.mockResolvedValueOnce({ id: 'repost-id', repostOfId: null, shareCount: 1 });
    const res = await app.inject({
      method: 'POST',
      url: `/posts/${POST_ID}/repost`,
      payload: {},
    });
    expect(res.statusCode).toBe(201);
  });

  it('still returns 201 even when createPostRepostNotification rejects (fire-and-forget)', async () => {
    notificationService.createPostRepostNotification.mockRejectedValueOnce(new Error('notify failed'));
    mockRepostPost.mockResolvedValueOnce({ id: 'repost-id', repostOfId: POST_ID, shareCount: 1 });
    mockGetPostById.mockResolvedValueOnce({ id: POST_ID, type: 'POST', authorId: AUTHOR_ID });
    const res = await app.inject({
      method: 'POST',
      url: `/posts/${POST_ID}/repost`,
      payload: {},
    });
    expect(res.statusCode).toBe(201);
  });
});
