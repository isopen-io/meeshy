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
  withMutationLog: jest.fn().mockImplementation(async ({ op }: any) => op()),
}));

jest.mock('../../../../utils/sanitize.js', () => ({
  SecuritySanitizer: { sanitizeText: jest.fn((t: string) => t) },
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { registerCommentRoutes } from '../../../../routes/posts/comments';

// ─── Constants ────────────────────────────────────────────────────────────────

const USER_ID = '507f1f77bcf86cd799439011';
const POST_ID = '507f1f77bcf86cd799439022';
const COMMENT_ID = '507f1f77bcf86cd799439033';

const LIKE_RESULT = { likeCount: 1, reactionSummary: { '❤️': 1 }, authorId: 'other-user' };

// ─── App factory ──────────────────────────────────────────────────────────────

function makeRequiredAuth(authenticated: boolean) {
  return async (req: FastifyRequest) => {
    (req as any).authContext = authenticated
      ? { isAuthenticated: true, type: 'registered', userId: USER_ID, registeredUser: { id: USER_ID, role: 'USER' } }
      : { isAuthenticated: false, type: 'anonymous', userId: null, registeredUser: null };
  };
}

async function buildApp(authenticated = true): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  // Audience déclarée PUBLIC : ce harnais porte sur le like/unlike et la
  // suppression, pas sur le droit de voir (cf. `comments-audience.test.ts`).
  const publicAcl = { authorId: 'author-1', visibility: 'PUBLIC', visibilityUserIds: [] };
  const prisma = {
    postComment: {
      findUnique: jest.fn().mockResolvedValue({ content: 'hi' }),
      findFirst: jest.fn().mockResolvedValue({ postId: POST_ID, post: publicAcl }),
    },
    post: {
      findUnique: jest.fn().mockResolvedValue(null),
      findFirst: jest.fn().mockResolvedValue(publicAcl),
    },
  } as any;
  app.decorate('prisma', prisma);
  registerCommentRoutes(app, prisma, makeRequiredAuth(authenticated));
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
