/**
 * Unit tests for posts/comments.ts
 * Tests GET /posts/:postId/comments,
 *       GET /posts/:postId/comments/:commentId/replies,
 *       POST /posts/:postId/comments,
 *       POST /posts/:postId/comments/:commentId/like,
 *       DELETE /posts/:postId/comments/:commentId/like,
 *       DELETE /posts/:postId/comments/:commentId
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeAll, afterAll } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockGetComments = jest.fn<any>().mockResolvedValue({ items: [], hasMore: false, nextCursor: null });
const mockGetReplies = jest.fn<any>().mockResolvedValue({ items: [], hasMore: false, nextCursor: null });
const mockAddComment = jest.fn<any>().mockResolvedValue({ id: 'comment-1', content: 'Test', authorId: '507f1f77bcf86cd799439011' });
const mockLikeComment = jest.fn<any>().mockResolvedValue({ id: 'comment-1', authorId: '507f1f77bcf86cd799439011', likeCount: 1, reactionSummary: { '❤️': 1 } });
const mockUnlikeComment = jest.fn<any>().mockResolvedValue({ id: 'comment-1', authorId: '507f1f77bcf86cd799439011', likeCount: 0, reactionSummary: {} });
const mockDeleteComment = jest.fn<any>().mockResolvedValue({ success: true });
const mockUpdateComment = jest.fn<any>().mockResolvedValue({
  id: 'comment-1', postId: '507f1f77bcf86cd799439022', content: 'Edited', effectFlags: 65536,
  contentChanged: true, originalLanguage: 'fr', media: [],
});

jest.mock('../../../services/PostCommentService', () => ({
  PostCommentService: jest.fn().mockImplementation(() => ({
    getComments: (...a: any[]) => mockGetComments(...a),
    getReplies: (...a: any[]) => mockGetReplies(...a),
    addComment: (...a: any[]) => mockAddComment(...a),
    likeComment: (...a: any[]) => mockLikeComment(...a),
    unlikeComment: (...a: any[]) => mockUnlikeComment(...a),
    deleteComment: (...a: any[]) => mockDeleteComment(...a),
    updateComment: (...a: any[]) => mockUpdateComment(...a),
  })),
}));

const mockTranslateCommentOnDemand = jest.fn<any>().mockResolvedValue(undefined);

jest.mock('../../../services/posts/PostTranslationService', () => ({
  PostTranslationService: {
    shared: {
      translateComment: jest.fn<any>().mockResolvedValue(undefined),
      translateCommentOnDemand: (...a: any[]) => mockTranslateCommentOnDemand(...a),
    },
  },
}));

jest.mock('../../../services/posts/PostAudioService', () => ({
  PostAudioService: {
    shared: { processPostAudio: jest.fn<any>().mockResolvedValue(undefined) },
  },
}));

jest.mock('../../../services/MentionService', () => ({
  MentionService: jest.fn().mockImplementation(() => ({
    extractMentions: jest.fn<any>().mockReturnValue([]),
    resolveUsernames: jest.fn<any>().mockResolvedValue(new Map()),
    createCommentMentions: jest.fn<any>().mockResolvedValue(undefined),
  })),
  resolveMentionedUsers: jest.fn<any>().mockResolvedValue([]),
}));

jest.mock('../../../middleware/rate-limiter', () => ({
  createPostRouteRateLimitConfig: () => ({}),
}));

jest.mock('../../../utils/withMutationLog', () => ({
  // Le module réel est ÉTALÉ d'abord : `MutationResultGone` est une CLASSE
  // dont les routes font `instanceof`, et `withMutationOutcome` est le
  // chemin réel du repost. Une usine qui ne rendait que `withMutationLog`
  // les laissait à `undefined` — `instanceof undefined` lève un TypeError
  // qui se déguise en 500 sur des chemins d'erreur sans rapport.
  ...(jest.requireActual('../../../utils/withMutationLog') as object),
  withMutationLog: jest.fn<any>().mockImplementation(({ op }) => op()),
}));

jest.mock('../../../utils/sanitize.js', () => ({
  SecuritySanitizer: { sanitizeText: (s: string) => s },
}));

jest.mock('../../../routes/posts/types', () => ({
  // AVANT #4147 : ce double ÉNUMÉRAIT les schémas à la main, sans
  // `requireActual` — exactement le piège que son propre commentaire
  // décrivait (« un inventaire à tenir à jour ») et qui s'est refermé au
  // premier export neuf consommé par ce fichier : `comments.ts` importe
  // désormais `TranslatePostSchema` (routes/posts/translate à la demande,
  // désormais validée par le MÊME schéma que le post), et ce double ne le
  // déclarait pas — `TranslatePostSchema.safeParse` aurait levé sur
  // `undefined`, faisant 500 les trois tests `.../translate` ci-dessous SANS
  // toucher à la moindre garde de la route. `requireActual` en base, avec
  // surcharge CIBLÉE des seuls schémas dont CE fichier a besoin d'un
  // comportement plus permissif que le vrai Zod (patron prescrit par
  // CLAUDE.md § « TROISIÈME exemplaire ») : tout export réel, y compris ceux
  // qu'aucune des lignes ci-dessous ne nomme, reste vivant.
  ...(jest.requireActual('../../../routes/posts/types') as object),
  // `UnlikeSchema` est le jumeau SANS défaut de `LikeSchema` : sur un retrait,
  // l'absence d'emoji vaut « retire la plus récente », alors qu'un défaut '❤️'
  // rendrait ce repli inatteignable.
  UnlikeSchema: {
    safeParse: (data: any) => ({ success: true, data: { emoji: data?.emoji } }),
  },
  CreateCommentSchema: {
    safeParse: (data: any) => {
      if (data?.invalid) return { success: false, error: {} };
      return { success: true, data: { content: data?.content ?? 'Test comment', ...data } };
    },
  },
  UpdateCommentSchema: {
    safeParse: (data: any) => {
      if (data?.invalid || (data?.content === undefined && data?.effectFlags === undefined)) {
        return { success: false, error: {} };
      }
      return { success: true, data };
    },
  },
  FeedQuerySchema: {
    safeParse: (data: any) => ({
      success: true,
      data: { cursor: data?.cursor, limit: data?.limit ?? 20 },
    }),
  },
  LikeSchema: {
    safeParse: (data: any) => {
      if (data?.invalid) return { success: false, error: {} };
      return { success: true, data: { emoji: data?.emoji ?? '❤️', ...data } };
    },
  },
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { registerCommentRoutes } from '../../../routes/posts/comments';

// ─── Constants ────────────────────────────────────────────────────────────────

const USER_ID = '507f1f77bcf86cd799439011';
const POST_ID = '507f1f77bcf86cd799439022';
const COMMENT_ID = '507f1f77bcf86cd799439033';

// ─── buildApp ────────────────────────────────────────────────────────────────

async function buildApp({ authenticated = true, withCmidDecoration = false } = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });

  const requiredAuth = async (req: any, reply: any) => {
    if (!authenticated) {
      return reply.status(401).send({ success: false, error: 'Unauthorized' });
    }
    (req as any).authContext = {
      isAuthenticated: true,
      type: 'user',
      isAnonymous: false,
      userId: USER_ID,
      registeredUser: { id: USER_ID, role: 'USER' },
    };
  };

  app.decorate('socialEvents', {
    broadcastCommentAdded: jest.fn<any>().mockResolvedValue(undefined),
    broadcastCommentUpdated: jest.fn<any>().mockResolvedValue(undefined),
    broadcastCommentDeleted: jest.fn<any>().mockResolvedValue(undefined),
    broadcastCommentLiked: jest.fn<any>().mockReturnValue(undefined),
    broadcastCommentUnliked: jest.fn<any>().mockReturnValue(undefined),
  } as any);

  // prisma decorated on app (used for broadcast lookups in POST/DELETE handlers)
  // et, depuis la garde d'audience du fil, par les routes elles-mêmes : le
  // MÊME double doit donc être passé à `registerCommentRoutes`. Audience
  // déclarée PUBLIC — ce harnais porte sur les codes de retour, pas sur le
  // droit de voir (cf. `posts/comments-audience.test.ts`).
  const publicAcl = { authorId: 'author-1', visibility: 'PUBLIC', visibilityUserIds: [] };
  const prisma = {
    post: {
      findUnique: jest.fn<any>().mockResolvedValue(null),
      findFirst: jest.fn<any>().mockResolvedValue(publicAcl),
    },
    postComment: {
      findUnique: jest.fn<any>().mockResolvedValue(null),
      findFirst: jest.fn<any>().mockResolvedValue({ postId: POST_ID, post: publicAcl }),
    },
  };
  app.decorate('prisma', prisma);

  if (withCmidDecoration) {
    // Miroir du middleware `clientMutationId` (non enregistré dans ce
    // harnais) : décore la requête depuis le header, comme en production.
    app.addHook('onRequest', async (req) => {
      const raw = req.headers['x-client-mutation-id'];
      if (typeof raw === 'string' && raw.length > 0) {
        (req as any).clientMutationId = raw;
      }
    });
  }

  registerCommentRoutes(app, prisma as any, requiredAuth);
  await app.ready();
  return app;
}

// ─── GET /posts/:postId/comments ─────────────────────────────────────────────

describe('GET /posts/:postId/comments — success', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 200', async () => {
    const res = await app.inject({ method: 'GET', url: `/posts/${POST_ID}/comments` });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });
});

describe('GET /posts/:postId/comments — service error', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 500 when service throws', async () => {
    mockGetComments.mockRejectedValueOnce(new Error('DB failure'));
    const res = await app.inject({ method: 'GET', url: `/posts/${POST_ID}/comments` });
    expect(res.statusCode).toBe(500);
    expect(res.json().success).toBe(false);
  });
});

describe('GET /posts/:postId/comments — not authenticated', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp({ authenticated: false }); });
  afterAll(async () => { await app.close(); });

  it('returns 401 when not authenticated', async () => {
    const res = await app.inject({ method: 'GET', url: `/posts/${POST_ID}/comments` });
    expect(res.statusCode).toBe(401);
  });
});

// ─── GET /posts/:postId/comments/:commentId/replies ──────────────────────────

describe('GET /posts/:postId/comments/:commentId/replies — success', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 200', async () => {
    const res = await app.inject({ method: 'GET', url: `/posts/${POST_ID}/comments/${COMMENT_ID}/replies` });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });
});

describe('GET /posts/:postId/comments/:commentId/replies — service error', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 500 when service throws', async () => {
    mockGetReplies.mockRejectedValueOnce(new Error('DB failure'));
    const res = await app.inject({ method: 'GET', url: `/posts/${POST_ID}/comments/${COMMENT_ID}/replies` });
    expect(res.statusCode).toBe(500);
    expect(res.json().success).toBe(false);
  });
});

// ─── POST /posts/:postId/comments ────────────────────────────────────────────

describe('POST /posts/:postId/comments — not authenticated', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp({ authenticated: false }); });
  afterAll(async () => { await app.close(); });

  it('returns 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/posts/${POST_ID}/comments`,
      payload: { content: 'Hello' },
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('POST /posts/:postId/comments — invalid body', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 400 when body is invalid', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/posts/${POST_ID}/comments`,
      payload: { invalid: true },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().success).toBe(false);
  });
});

describe('POST /posts/:postId/comments — success', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 201', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/posts/${POST_ID}/comments`,
      payload: { content: 'Test comment' },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().success).toBe(true);
  });
});

describe('POST /posts/:postId/comments — broadcast carries clientMutationId', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp({ withCmidDecoration: true });
    // La room de broadcast n'est résolue que si le post existe.
    ((app as any).prisma.post.findUnique as jest.Mock<any>).mockResolvedValue({
      authorId: 'author-1',
      commentCount: 4,
      type: 'post',
      content: 'p',
      createdAt: new Date(),
      expiresAt: null,
      visibility: 'PUBLIC',
      visibilityUserIds: [],
    });
  });
  afterAll(async () => { await app.close(); });

  it('echoes the request cmid in the comment:added payload so the sender can reconcile its optimistic row', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/posts/${POST_ID}/comments`,
      headers: { 'x-client-mutation-id': 'cmid-test-1234' },
      payload: { content: 'Test comment' },
    });
    expect(res.statusCode).toBe(201);
    const broadcast = (app as any).socialEvents.broadcastCommentAdded as jest.Mock<any>;
    expect(broadcast).toHaveBeenCalledTimes(1);
    expect((broadcast.mock.calls[0][0] as any).clientMutationId).toBe('cmid-test-1234');
  });

  it('omits clientMutationId from the payload when the request carries none', async () => {
    const broadcast = (app as any).socialEvents.broadcastCommentAdded as jest.Mock<any>;
    broadcast.mockClear();
    const res = await app.inject({
      method: 'POST',
      url: `/posts/${POST_ID}/comments`,
      payload: { content: 'Test comment' },
    });
    expect(res.statusCode).toBe(201);
    expect(broadcast).toHaveBeenCalledTimes(1);
    expect((broadcast.mock.calls[0][0] as any).clientMutationId).toBeUndefined();
  });
});

describe('POST /posts/:postId/comments — post not found', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 404 when addComment returns null (post not found)', async () => {
    mockAddComment.mockResolvedValueOnce(null);
    const res = await app.inject({
      method: 'POST',
      url: `/posts/${POST_ID}/comments`,
      payload: { content: 'Test comment' },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().success).toBe(false);
  });
});

describe('POST /posts/:postId/comments — service error', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 500 when service throws', async () => {
    mockAddComment.mockRejectedValueOnce(new Error('Unexpected DB error'));
    const res = await app.inject({
      method: 'POST',
      url: `/posts/${POST_ID}/comments`,
      payload: { content: 'Test comment' },
    });
    expect(res.statusCode).toBe(500);
    expect(res.json().success).toBe(false);
  });
});

describe('POST /posts/:postId/comments — parent not found', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 404 when parent comment does not exist', async () => {
    mockAddComment.mockRejectedValueOnce(new Error('PARENT_NOT_FOUND'));
    const res = await app.inject({
      method: 'POST',
      url: `/posts/${POST_ID}/comments`,
      payload: { content: 'Reply', parentId: 'nonexistent-id' },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().success).toBe(false);
  });
});

describe('POST /posts/:postId/comments — media not available', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 400 when attached media is already linked', async () => {
    mockAddComment.mockRejectedValueOnce(new Error('MEDIA_NOT_AVAILABLE'));
    const res = await app.inject({
      method: 'POST',
      url: `/posts/${POST_ID}/comments`,
      payload: { content: 'Comment with media', attachmentIds: ['media-1'] },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().success).toBe(false);
  });
});

// ─── POST /posts/:postId/comments/:commentId/like ────────────────────────────

// ─── POST /posts/:postId/comments/:commentId/translate ───────────────────────

describe('POST /posts/:postId/comments/:commentId/translate — on-demand', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 200 and fires the on-demand pipeline for the requested language', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/posts/${POST_ID}/comments/${COMMENT_ID}/translate`,
      payload: { targetLanguage: 'de' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.requested).toBe(true);
    // #4147 — `force` vient désormais de `TranslatePostSchema.safeParse`
    // (`z.boolean().optional()`), le MÊME schéma que POST /posts/:postId/translate
    // (core.ts) : un `force` omis y a TOUJOURS résolu `undefined`, jamais
    // `false` — c'était la validation à la main de cette route, disparue
    // avec ce lot, qui produisait `false` par un `body.force === true` local.
    // Attendre encore `false` ici aurait fait la preuve inverse de ce que le
    // critère 3 demande : les deux routes ne partagent le même contrat que
    // si elles produisent la MÊME valeur pour la même absence.
    expect(mockTranslateCommentOnDemand).toHaveBeenCalledWith(COMMENT_ID, 'de', { force: undefined });
  });

  it('forwards force=true for the « Retraduire » path', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/posts/${POST_ID}/comments/${COMMENT_ID}/translate`,
      payload: { targetLanguage: 'es', force: true },
    });
    expect(res.statusCode).toBe(200);
    expect(mockTranslateCommentOnDemand).toHaveBeenCalledWith(COMMENT_ID, 'es', { force: true });
  });

  it('returns 400 for a malformed language', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/posts/${POST_ID}/comments/${COMMENT_ID}/translate`,
      payload: { targetLanguage: 'x' },
    });
    expect(res.statusCode).toBe(400);
  });
});

// ─── PATCH /posts/:postId/comments/:commentId ────────────────────────────────

describe('PATCH /posts/:postId/comments/:commentId — edit own comment', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp();
    ((app as any).prisma.post.findUnique as jest.Mock<any>).mockResolvedValue({
      authorId: 'author-1', visibility: 'PUBLIC', visibilityUserIds: [],
    });
  });
  afterAll(async () => { await app.close(); });

  it('returns 200 and broadcasts comment:updated with the full comment', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/posts/${POST_ID}/comments/${COMMENT_ID}`,
      payload: { content: 'Edited', effectFlags: 65536 },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
    const broadcast = (app as any).socialEvents.broadcastCommentUpdated as jest.Mock<any>;
    expect(broadcast).toHaveBeenCalledTimes(1);
    const payload = broadcast.mock.calls[0][0] as any;
    expect(payload.postId).toBe(POST_ID);
    expect(payload.comment.content).toBe('Edited');
    // Visibilité passée BRUTE du post (jamais un défaut permissif).
    expect(broadcast.mock.calls[0][2]).toBe('PUBLIC');
  });

  it('returns 400 when nothing is updated', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/posts/${POST_ID}/comments/${COMMENT_ID}`,
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 EMPTY_CONTENT when a text comment is edited to blank', async () => {
    mockUpdateComment.mockRejectedValueOnce(new Error('EMPTY_CONTENT'));
    const res = await app.inject({
      method: 'PATCH',
      url: `/posts/${POST_ID}/comments/${COMMENT_ID}`,
      payload: { content: '   ' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('EMPTY_CONTENT');
  });

  it('real UpdateCommentSchema borne effectFlags à Int32 (Prisma Int + iOS UInt32)', () => {
    // Le schéma est mocké pour les tests de route — la borne se vérifie sur le vrai.
    const { UpdateCommentSchema } = jest.requireActual('../../../routes/posts/types') as
      typeof import('../../../routes/posts/types');
    expect(UpdateCommentSchema.safeParse({ effectFlags: 0x80000000 }).success).toBe(false);
    expect(UpdateCommentSchema.safeParse({ effectFlags: -1 }).success).toBe(false);
    expect(UpdateCommentSchema.safeParse({ effectFlags: 0x7FFFFFFF }).success).toBe(true);
    expect(UpdateCommentSchema.safeParse({}).success).toBe(false);
  });

  it('returns 403 when the caller is not the author', async () => {
    mockUpdateComment.mockRejectedValueOnce(new Error('FORBIDDEN'));
    const res = await app.inject({
      method: 'PATCH',
      url: `/posts/${POST_ID}/comments/${COMMENT_ID}`,
      payload: { content: 'Pirate' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('returns 404 when the comment does not exist', async () => {
    mockUpdateComment.mockResolvedValueOnce(null);
    const res = await app.inject({
      method: 'PATCH',
      url: `/posts/${POST_ID}/comments/${COMMENT_ID}`,
      payload: { content: 'x' },
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('PATCH /posts/:postId/comments/:commentId — not authenticated', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp({ authenticated: false }); });
  afterAll(async () => { await app.close(); });

  it('returns 401', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/posts/${POST_ID}/comments/${COMMENT_ID}`,
      payload: { content: 'x' },
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('POST /posts/:postId/comments/:commentId/like — not authenticated', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp({ authenticated: false }); });
  afterAll(async () => { await app.close(); });

  it('returns 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/posts/${POST_ID}/comments/${COMMENT_ID}/like`,
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('POST /posts/:postId/comments/:commentId/like — success', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 200', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/posts/${POST_ID}/comments/${COMMENT_ID}/like`,
      payload: {},
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });
});

describe('POST /posts/:postId/comments/:commentId/like — comment not found', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 404 when comment does not exist', async () => {
    mockLikeComment.mockResolvedValueOnce(null);
    const res = await app.inject({
      method: 'POST',
      url: `/posts/${POST_ID}/comments/${COMMENT_ID}/like`,
      payload: {},
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().success).toBe(false);
  });
});

describe('POST /posts/:postId/comments/:commentId/like — service error', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 500 when service throws', async () => {
    mockLikeComment.mockRejectedValueOnce(new Error('DB failure'));
    const res = await app.inject({
      method: 'POST',
      url: `/posts/${POST_ID}/comments/${COMMENT_ID}/like`,
      payload: {},
    });
    expect(res.statusCode).toBe(500);
    expect(res.json().success).toBe(false);
  });
});

// ─── DELETE /posts/:postId/comments/:commentId/like ──────────────────────────

describe('DELETE /posts/:postId/comments/:commentId/like — not authenticated', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp({ authenticated: false }); });
  afterAll(async () => { await app.close(); });

  it('returns 401', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/posts/${POST_ID}/comments/${COMMENT_ID}/like`,
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('DELETE /posts/:postId/comments/:commentId/like — success', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 200', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/posts/${POST_ID}/comments/${COMMENT_ID}/like`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });
});

describe('DELETE /posts/:postId/comments/:commentId/like — comment not found', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 404 when comment does not exist', async () => {
    mockUnlikeComment.mockResolvedValueOnce(null);
    const res = await app.inject({
      method: 'DELETE',
      url: `/posts/${POST_ID}/comments/${COMMENT_ID}/like`,
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().success).toBe(false);
  });
});

describe('DELETE /posts/:postId/comments/:commentId/like — service error', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 500 when service throws', async () => {
    mockUnlikeComment.mockRejectedValueOnce(new Error('DB failure'));
    const res = await app.inject({
      method: 'DELETE',
      url: `/posts/${POST_ID}/comments/${COMMENT_ID}/like`,
    });
    expect(res.statusCode).toBe(500);
    expect(res.json().success).toBe(false);
  });
});

// ─── DELETE /posts/:postId/comments/:commentId ───────────────────────────────

describe('DELETE /posts/:postId/comments/:commentId — not authenticated', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp({ authenticated: false }); });
  afterAll(async () => { await app.close(); });

  it('returns 401', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/posts/${POST_ID}/comments/${COMMENT_ID}`,
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('DELETE /posts/:postId/comments/:commentId — success', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 200', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/posts/${POST_ID}/comments/${COMMENT_ID}`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });
});

describe('DELETE /posts/:postId/comments/:commentId — comment not found', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 404 when comment does not exist', async () => {
    mockDeleteComment.mockResolvedValueOnce(null);
    const res = await app.inject({
      method: 'DELETE',
      url: `/posts/${POST_ID}/comments/${COMMENT_ID}`,
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().success).toBe(false);
  });
});

describe('DELETE /posts/:postId/comments/:commentId — forbidden', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 403 when user is not the comment author', async () => {
    mockDeleteComment.mockRejectedValueOnce(new Error('FORBIDDEN'));
    const res = await app.inject({
      method: 'DELETE',
      url: `/posts/${POST_ID}/comments/${COMMENT_ID}`,
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().success).toBe(false);
  });
});

describe('DELETE /posts/:postId/comments/:commentId — service error', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 500 when service throws unexpectedly', async () => {
    mockDeleteComment.mockRejectedValueOnce(new Error('Unexpected error'));
    const res = await app.inject({
      method: 'DELETE',
      url: `/posts/${POST_ID}/comments/${COMMENT_ID}`,
    });
    expect(res.statusCode).toBe(500);
    expect(res.json().success).toBe(false);
  });
});
