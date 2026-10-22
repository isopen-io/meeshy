/**
 * Unit tests for comment like/unlike/delete routes (comments.ts)
 * Tests POST/:commentId/like, DELETE/:commentId/like, DELETE/:commentId.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeAll, afterAll } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockLikeComment = jest.fn();
const mockUnlikeComment = jest.fn();
const mockDeleteComment = jest.fn();
const mockGetComments = jest.fn().mockResolvedValue({ items: [], hasMore: false, nextCursor: null });
const mockGetReplies = jest.fn().mockResolvedValue({ items: [], hasMore: false, nextCursor: null });
const mockAddComment = jest.fn().mockResolvedValue({ id: 'c1', content: 'hi', authorId: 'u1' });

jest.mock('../../../../services/PostCommentService', () => ({
  PostCommentService: jest.fn().mockImplementation(() => ({
    getComments: (...a: any[]) => mockGetComments(...a),
    getReplies: (...a: any[]) => mockGetReplies(...a),
    addComment: (...a: any[]) => mockAddComment(...a),
    likeComment: (...a: any[]) => mockLikeComment(...a),
    unlikeComment: (...a: any[]) => mockUnlikeComment(...a),
    deleteComment: (...a: any[]) => mockDeleteComment(...a),
  })),
}));

const mockCreateNotification = jest.fn<any>().mockResolvedValue({ id: 'notif-1' });

jest.mock('../../../../services/notifications/notification-service-registry', () => ({
  getSharedNotificationService: () => ({ createNotification: (...a: any[]) => mockCreateNotification(...a) }),
}));

jest.mock('../../../../services/posts/PostTranslationService', () => ({
  PostTranslationService: { shared: { translateComment: jest.fn().mockResolvedValue(undefined) } },
}));

jest.mock('../../../../services/posts/PostAudioService', () => ({
  PostAudioService: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../../../../services/MentionService', () => ({
  resolveMentionedUsers: jest.fn().mockResolvedValue([]),
  MentionService: jest.fn().mockImplementation(() => ({
    extractMentions: jest.fn().mockReturnValue([]),
    resolveUsernames: jest.fn().mockResolvedValue(new Map()),
    createCommentMentions: jest.fn().mockResolvedValue(undefined),
  })),
}));

jest.mock('../../../../middleware/rate-limiter', () => ({
  createPostRouteRateLimitConfig: jest.fn().mockReturnValue({}),
}));

jest.mock('../../../../utils/withMutationLog', () => ({
  // Le module réel est ÉTALÉ d'abord : `MutationResultGone` est une CLASSE
  // dont les routes font `instanceof`, et `withMutationOutcome` est le
  // chemin réel du repost. Une usine qui ne rendait que `withMutationLog`
  // les laissait à `undefined` — `instanceof undefined` lève un TypeError
  // qui se déguise en 500 sur des chemins d'erreur sans rapport.
  ...(jest.requireActual('../../../../utils/withMutationLog') as object),
  withMutationLog: jest.fn().mockImplementation(async ({ op }: any) => op()),
}));

jest.mock('../../../../utils/sanitize.js', () => ({
  SecuritySanitizer: { sanitizeText: jest.fn((t: string) => t) },
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { registerCommentRoutes } from '../../../../routes/posts/comments';
import { ConflictError } from '../../../../errors/custom-errors';
import { REACTION_LIMIT_REACHED_MESSAGE } from '@meeshy/shared/utils/reaction-limit';

// ─── Constants ────────────────────────────────────────────────────────────────

const USER_ID = '507f1f77bcf86cd799439011';
const POST_ID = '507f1f77bcf86cd799439022';
const COMMENT_ID = '507f1f77bcf86cd799439033';

const LIKE_RESULT = { likeCount: 1, reactionSummary: { '❤️': 1 }, authorId: 'other-user' };

// ─── App factory ──────────────────────────────────────────────────────────────

function makeRequiredAuth(authenticated: boolean, role = 'USER') {
  return async (req: FastifyRequest) => {
    (req as any).authContext = authenticated
      ? { isAuthenticated: true, type: 'registered', userId: USER_ID, registeredUser: { id: USER_ID, role } }
      : { isAuthenticated: false, type: 'anonymous', userId: null, registeredUser: null };
  };
}

async function buildApp(
  authenticated = true,
  opts: { role?: string; commentAuthorId?: string; commentAuthorRole?: string } = {},
): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  // Audience déclarée PUBLIC : ce harnais porte sur le like/unlike et la
  // suppression, pas sur le droit de voir (cf. `comments-audience.test.ts`).
  const publicAcl = { authorId: 'author-1', visibility: 'PUBLIC', visibilityUserIds: [] };
  const commentAuthorId = opts.commentAuthorId ?? USER_ID;
  const prisma = {
    postComment: {
      findUnique: jest.fn().mockResolvedValue({ content: 'hi' }),
      // La cible d'un DELETE se relit par `select: { authorId, postId }` (#11149).
      findFirst: jest.fn().mockImplementation(async (args: any) =>
        args?.select?.authorId ? { authorId: commentAuthorId, postId: POST_ID } : { postId: POST_ID, post: publicAcl }),
    },
    post: {
      findUnique: jest.fn().mockResolvedValue(null),
      findFirst: jest.fn().mockResolvedValue(publicAcl),
    },
    user: {
      findUnique: jest.fn().mockResolvedValue({ role: opts.commentAuthorRole ?? 'USER', systemLanguage: 'fr' }),
    },
    adminAuditLog: { create: jest.fn().mockResolvedValue({ id: 'audit-1' }) },
  } as any;
  app.decorate('prisma', prisma);
  registerCommentRoutes(app, prisma, makeRequiredAuth(authenticated, opts.role));
  await app.ready();
  return app;
}

// ─── POST /posts/:postId/comments/:commentId/like ─────────────────────────────

describe('POST /posts/:postId/comments/:commentId/like (unauthenticated)', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(false); });
  afterAll(async () => { await app.close(); });

  it('returns 401 when not authenticated', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/posts/${POST_ID}/comments/${COMMENT_ID}/like`,
      payload: {},
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('POST /posts/:postId/comments/:commentId/like (authenticated)', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 200 on successful like', async () => {
    mockLikeComment.mockResolvedValueOnce(LIKE_RESULT);
    const res = await app.inject({
      method: 'POST',
      url: `/posts/${POST_ID}/comments/${COMMENT_ID}/like`,
      payload: {},
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.liked).toBe(true);
  });

  it('returns 404 when comment not found', async () => {
    mockLikeComment.mockResolvedValueOnce(null);
    const res = await app.inject({
      method: 'POST',
      url: `/posts/${POST_ID}/comments/${COMMENT_ID}/like`,
      payload: {},
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 500 on service error', async () => {
    mockLikeComment.mockRejectedValueOnce(new Error('DB error'));
    const res = await app.inject({
      method: 'POST',
      url: `/posts/${POST_ID}/comments/${COMMENT_ID}/like`,
      payload: {},
    });
    expect(res.statusCode).toBe(500);
  });

  it('returns 409 with the reaction-limit message when likeComment rejects with ConflictError (cap reached)', async () => {
    // `likeComment` (fallback REST — second chemin de création, cf.
    // PostCommentService.reactionLimit.test.ts) refuse la 6e réaction
    // distincte via un `ConflictError` — un refus légitime, pas une panne.
    mockLikeComment.mockRejectedValueOnce(
      new ConflictError(REACTION_LIMIT_REACHED_MESSAGE, 'REACTION_LIMIT_REACHED')
    );
    const res = await app.inject({
      method: 'POST',
      url: `/posts/${POST_ID}/comments/${COMMENT_ID}/like`,
      payload: {},
    });
    expect(res.statusCode).toBe(409);
    const body = res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe(REACTION_LIMIT_REACHED_MESSAGE);
    expect(body.code).toBe('REACTION_LIMIT_REACHED');
  });
});

// ─── Adresse de diffusion : le `:postId` de l'URL n'est pas une autorité ──────
//
// Jumeau REST du même invariant que `CommentReactionHandler` côté socket : la
// garde d'audience résout déjà le post DEPUIS le commentaire
// (`loadCommentPostAcl`), donc la route tient la vérité — elle ne doit pas
// diffuser vers le `:postId` du chemin, que l'appelant choisit librement.
//
// Le cas nominal ne discrimine rien : sur un post ordinaire les deux ids sont
// égaux. Le seul témoin utile est celui où ils DIVERGENT — ce qui se produit
// pour de vrai sur un repost simple, dont le client affiche l'id alors que le
// commentaire vit sur la racine (`resolveInteractionTarget` à l'écriture,
// `resolveConsumptionTarget` au room-join).

describe('POST /posts/:postId/comments/:commentId/like — adresse de diffusion', () => {
  const REAL_POST_ID = '507f1f77bcf86cd7994390aa';
  let app: FastifyInstance;
  let broadcastCommentLiked: jest.Mock;
  let createCommentLikeNotification: jest.Mock;
  let postFindUnique: jest.Mock;

  beforeAll(async () => {
    app = Fastify({ logger: false });
    const publicAcl = { authorId: 'author-1', visibility: 'PUBLIC', visibilityUserIds: [] };
    postFindUnique = jest.fn().mockResolvedValue({ type: 'REEL' }) as jest.Mock;
    const prisma = {
      postComment: {
        findUnique: jest.fn().mockResolvedValue({ content: 'hi' }),
        // Le commentaire appartient à REAL_POST_ID, pas au `:postId` de l'URL.
        findFirst: jest.fn().mockResolvedValue({ postId: REAL_POST_ID, post: publicAcl }),
      },
      post: {
        findUnique: postFindUnique,
        findFirst: jest.fn().mockResolvedValue(publicAcl),
      },
    } as any;
    broadcastCommentLiked = jest.fn() as jest.Mock;
    createCommentLikeNotification = jest.fn().mockResolvedValue(undefined) as jest.Mock;
    app.decorate('prisma', prisma);
    app.decorate('socialEvents', { broadcastCommentLiked } as any);
    app.decorate('notificationService', { createCommentLikeNotification } as any);
    registerCommentRoutes(app, prisma, makeRequiredAuth(true));
    await app.ready();
  });
  afterAll(async () => { await app.close(); });

  it('broadcasts to the post the COMMENT belongs to, not the one in the URL', async () => {
    mockLikeComment.mockResolvedValueOnce(LIKE_RESULT);

    const res = await app.inject({
      method: 'POST',
      url: `/posts/${POST_ID}/comments/${COMMENT_ID}/like`,
      payload: {},
    });

    expect(res.statusCode).toBe(200);
    // `postId` est la CLÉ de cache côté client (`patchCommentInPostCaches`) et
    // adresse `ROOMS.post(...)` dans `broadcastCommentLiked`. Servi depuis
    // l'URL, il diffuse dans une room où les lecteurs du fil ne sont pas, et
    // écrit l'agrégation d'un commentaire dans le cache d'un post étranger.
    expect(broadcastCommentLiked).toHaveBeenCalledWith(
      expect.objectContaining({ postId: REAL_POST_ID, commentId: COMMENT_ID }),
      LIKE_RESULT.authorId,
    );
  });

  it('types and targets the notification from the COMMENT post', async () => {
    mockLikeComment.mockResolvedValueOnce(LIKE_RESULT);

    await app.inject({
      method: 'POST',
      url: `/posts/${POST_ID}/comments/${COMMENT_ID}/like`,
      payload: {},
    });
    await new Promise((r) => setImmediate(r));

    // `postType` est le discriminant qui décide de la surface ouverte au tap
    // (lecteur de réel / viewer éphémère / détail). Relu sur l'id de l'URL, il
    // ouvre la mauvaise surface — ou une que le destinataire ne peut pas voir.
    expect(postFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: REAL_POST_ID } }),
    );
    expect(createCommentLikeNotification).toHaveBeenCalledWith(
      expect.objectContaining({ postId: REAL_POST_ID }),
    );
  });
});

// ─── DELETE /posts/:postId/comments/:commentId/like ───────────────────────────

describe('DELETE /posts/:postId/comments/:commentId/like (unauthenticated)', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(false); });
  afterAll(async () => { await app.close(); });

  it('returns 401 when not authenticated', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/posts/${POST_ID}/comments/${COMMENT_ID}/like`,
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('DELETE /posts/:postId/comments/:commentId/like (authenticated)', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 200 on successful unlike', async () => {
    mockUnlikeComment.mockResolvedValueOnce({ likeCount: 0, reactionSummary: {} });
    const res = await app.inject({
      method: 'DELETE',
      url: `/posts/${POST_ID}/comments/${COMMENT_ID}/like`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.liked).toBe(false);
  });

  it('returns 404 when comment not found', async () => {
    mockUnlikeComment.mockResolvedValueOnce(null);
    const res = await app.inject({
      method: 'DELETE',
      url: `/posts/${POST_ID}/comments/${COMMENT_ID}/like`,
    });
    expect(res.statusCode).toBe(404);
  });
});

// ─── La jumelle DESCENDANTE de `comment:liked` ────────────────────────────────
//
// La pose diffuse `comment:liked` (compteur ABSOLU) au commentateur et à la
// room du post ; le retrait ne diffusait RIEN. Le compteur d'un commentaire ne
// savait donc que monter en direct : un lecteur du fil voyait le « 1 » arriver
// et ne le voyait jamais repartir. Pire côté iOS, où `FeedSocketHandler`
// PERSISTE la valeur reçue — le compte gonflé survivait au redémarrage jusqu'au
// prochain REST.
//
// Même grille close que `post:liked` / `post:unliked`, dont ce couple est le
// calque exact (mêmes rooms, même charge absolue, mêmes clients).

describe('DELETE /posts/:postId/comments/:commentId/like — diffusion', () => {
  const REAL_POST_ID = '507f1f77bcf86cd7994390aa';
  const UNLIKE_RESULT = { likeCount: 0, reactionSummary: {}, authorId: 'other-user' };
  let app: FastifyInstance;
  let broadcastCommentUnliked: jest.Mock;

  beforeAll(async () => {
    app = Fastify({ logger: false });
    const publicAcl = { authorId: 'author-1', visibility: 'PUBLIC', visibilityUserIds: [] };
    const prisma = {
      postComment: {
        findUnique: jest.fn().mockResolvedValue({ content: 'hi' }),
        // Le commentaire appartient à REAL_POST_ID, pas au `:postId` de l'URL.
        findFirst: jest.fn().mockResolvedValue({ postId: REAL_POST_ID, post: publicAcl }),
      },
      post: {
        findUnique: jest.fn().mockResolvedValue({ type: 'REEL' }),
        findFirst: jest.fn().mockResolvedValue(publicAcl),
      },
    } as any;
    broadcastCommentUnliked = jest.fn() as jest.Mock;
    app.decorate('prisma', prisma);
    app.decorate('socialEvents', { broadcastCommentUnliked } as any);
    registerCommentRoutes(app, prisma, makeRequiredAuth(true));
    await app.ready();
  });
  afterAll(async () => { await app.close(); });

  it('broadcasts the new absolute count so the like can come back DOWN live', async () => {
    mockUnlikeComment.mockResolvedValueOnce(UNLIKE_RESULT);

    const res = await app.inject({
      method: 'DELETE',
      url: `/posts/${POST_ID}/comments/${COMMENT_ID}/like`,
    });

    expect(res.statusCode).toBe(200);
    // `postId` = celui du COMMENTAIRE (jamais l'URL) — même invariant que la
    // pose : il adresse `ROOMS.post(...)` et sert de clé de cache client.
    expect(broadcastCommentUnliked).toHaveBeenCalledWith(
      expect.objectContaining({
        postId: REAL_POST_ID,
        commentId: COMMENT_ID,
        userId: USER_ID,
        likeCount: 0,
      }),
      UNLIKE_RESULT.authorId,
    );
  });

  it('does not broadcast when the service could not resolve a comment author', async () => {
    // Même garde que la pose : sans destinataire nommé, la diffusion ciblée
    // n'a pas d'adresse. Rien ne part plutôt qu'un `emitToUser(undefined)`.
    mockUnlikeComment.mockResolvedValueOnce({ likeCount: 0, reactionSummary: {}, authorId: null });
    broadcastCommentUnliked.mockClear();

    const res = await app.inject({
      method: 'DELETE',
      url: `/posts/${POST_ID}/comments/${COMMENT_ID}/like`,
    });

    expect(res.statusCode).toBe(200);
    expect(broadcastCommentUnliked).not.toHaveBeenCalled();
  });
});

// ─── DELETE /posts/:postId/comments/:commentId ────────────────────────────────

describe('DELETE /posts/:postId/comments/:commentId (unauthenticated)', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(false); });
  afterAll(async () => { await app.close(); });

  it('returns 401 when not authenticated', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/posts/${POST_ID}/comments/${COMMENT_ID}`,
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('DELETE /posts/:postId/comments/:commentId (authenticated)', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 200 on successful delete', async () => {
    mockDeleteComment.mockResolvedValueOnce({ postId: POST_ID });
    const res = await app.inject({
      method: 'DELETE',
      url: `/posts/${POST_ID}/comments/${COMMENT_ID}`,
    });
    expect(res.statusCode).toBe(200);
  });

  it('returns 404 when comment not found', async () => {
    mockDeleteComment.mockResolvedValueOnce(null);
    const res = await app.inject({
      method: 'DELETE',
      url: `/posts/${POST_ID}/comments/${COMMENT_ID}`,
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 500 on unexpected service error', async () => {
    mockDeleteComment.mockRejectedValueOnce(new Error('DB crash'));
    const res = await app.inject({
      method: 'DELETE',
      url: `/posts/${POST_ID}/comments/${COMMENT_ID}`,
    });
    expect(res.statusCode).toBe(500);
  });
});

describe('DELETE /posts/:postId/comments/:commentId — retrait par la modération (#11149)', () => {
  const OTHER = '507f1f77bcf86cd799439044';

  it("refuse 403 un simple utilisateur sur le commentaire d'un autre", async () => {
    mockDeleteComment.mockReset().mockRejectedValueOnce(new Error('FORBIDDEN'));
    const app = await buildApp(true, { commentAuthorId: OTHER });
    const res = await app.inject({ method: 'DELETE', url: `/posts/${POST_ID}/comments/${COMMENT_ID}`, payload: { reason: 'Hors charte' } });
    await app.close();

    expect(res.statusCode).toBe(403);
    expect(mockDeleteComment).not.toHaveBeenCalledWith(COMMENT_ID, USER_ID, undefined, { byModeration: true });
  });

  it('refuse 403 un MODERATOR sur le commentaire d’un ADMIN', async () => {
    mockDeleteComment.mockReset().mockRejectedValueOnce(new Error('FORBIDDEN'));
    const app = await buildApp(true, { role: 'MODERATOR', commentAuthorId: OTHER, commentAuthorRole: 'ADMIN' });
    const res = await app.inject({ method: 'DELETE', url: `/posts/${POST_ID}/comments/${COMMENT_ID}`, payload: { reason: 'Hors charte' } });
    await app.close();

    expect(res.statusCode).toBe(403);
    expect(mockDeleteComment).not.toHaveBeenCalledWith(COMMENT_ID, USER_ID, undefined, { byModeration: true });
  });

  it('exige un motif : 400 MODERATION_REASON_REQUIRED', async () => {
    mockDeleteComment.mockReset().mockRejectedValueOnce(new Error('FORBIDDEN'));
    const app = await buildApp(true, { role: 'MODERATOR', commentAuthorId: OTHER });
    const res = await app.inject({ method: 'DELETE', url: `/posts/${POST_ID}/comments/${COMMENT_ID}` });
    await app.close();

    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('MODERATION_REASON_REQUIRED');
    expect(mockDeleteComment).not.toHaveBeenCalledWith(COMMENT_ID, USER_ID, undefined, { byModeration: true });
  });

  it("retire par la modération, journalise REMOVE_CONTENT et prévient l'auteur", async () => {
    mockDeleteComment.mockReset()
      .mockRejectedValueOnce(new Error('FORBIDDEN'))
      .mockResolvedValueOnce({ postId: POST_ID, deletedCommentIds: [COMMENT_ID], parentId: null });
    mockCreateNotification.mockClear();
    const app = await buildApp(true, { role: 'ADMIN', commentAuthorId: OTHER });
    const prisma = (app as any).prisma;
    const res = await app.inject({ method: 'DELETE', url: `/posts/${POST_ID}/comments/${COMMENT_ID}`, payload: { reason: ' Harcèlement ' } });
    await new Promise((resolve) => setImmediate(resolve));
    await app.close();

    expect(res.statusCode).toBe(200);
    expect(mockDeleteComment).toHaveBeenCalledWith(COMMENT_ID, USER_ID, undefined, { byModeration: true });
    expect(prisma.adminAuditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      action: 'REMOVE_CONTENT', entity: 'Comment', entityId: COMMENT_ID, adminId: USER_ID, userId: OTHER,
      metadata: JSON.stringify({ reason: 'Harcèlement', via: 'app' }),
    }) });
    expect(mockCreateNotification).toHaveBeenCalledWith(expect.objectContaining({
      userId: OTHER,
      type: 'content_removed',
      title: 'Votre commentaire a été retiré par la modération',
      metadata: { contentType: 'comment', contentId: COMMENT_ID, postId: POST_ID, reason: 'Harcèlement' },
    }));
  });

  it("l'auteur retire le sien sans corps : ni motif, ni audit, ni notification", async () => {
    mockDeleteComment.mockReset().mockResolvedValueOnce({ postId: POST_ID });
    mockCreateNotification.mockClear();
    const app = await buildApp();
    const prisma = (app as any).prisma;
    const res = await app.inject({ method: 'DELETE', url: `/posts/${POST_ID}/comments/${COMMENT_ID}` });
    await app.close();

    expect(res.statusCode).toBe(200);
    expect(mockDeleteComment).toHaveBeenCalledWith(COMMENT_ID, USER_ID);
    expect(prisma.adminAuditLog.create).not.toHaveBeenCalled();
    expect(mockCreateNotification).not.toHaveBeenCalled();
  });
});
