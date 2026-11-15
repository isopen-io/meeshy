/**
 * On peut TOUJOURS corriger ou retirer ses propres mots — même après avoir
 * perdu l'accès au post qui les porte. Décision d'audience de l'issue #4146,
 * écrite au-dessus de `PATCH /posts/:postId/comments/:commentId` dans
 * `routes/posts/comments.ts`.
 *
 * POURQUOI CE TÉMOIN EXISTE. L'audit de la surface sociale a relevé que ces
 * deux routes sont les seules du fil sans garde d'audience du post — leurs six
 * voisines en portent une — et a qualifié l'écart de « probablement voulu,
 * jamais écrit ». Un écart qu'on ne sait pas motiver finit par être « corrigé »
 * par le prochain lot de sécurité : la garde ajoutée rendrait alors un
 * commentaire IRRÉVOCABLE par la seule décision de l'auteur du post (rupture
 * d'amitié, bascule en `ONLY`/`PRIVATE`), ce qui est un défaut PIRE que celui
 * qu'elle croirait fermer.
 *
 * Un commentaire de décision ne se défend pas tout seul : ce fichier est la
 * moitié EXÉCUTABLE de la décision. Il exerce les vrais handlers, donc il ne
 * peut pas mourir en silence — poser la garde d'audience le fait rougir.
 *
 * Ce qu'il vérifie ENSEMBLE, parce que la décision n'est tenable que si les
 * deux tiennent :
 *  - l'auteur passe, même sur un post devenu illisible pour lui ;
 *  - un NON-auteur ne passe pas — le contrôle d'auteur du service est la garde
 *    S3 de cette ressource, et il reste la seule.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockUpdateComment = jest.fn<any>();
const mockDeleteComment = jest.fn<any>();

jest.mock('../../../../services/PostCommentService', () => ({
  PostCommentService: jest.fn().mockImplementation(() => ({
    getComments: jest.fn<any>().mockResolvedValue({ items: [], hasMore: false, nextCursor: null }),
    getReplies: jest.fn<any>().mockResolvedValue({ items: [], hasMore: false, nextCursor: null }),
    addComment: jest.fn<any>().mockResolvedValue(null),
    likeComment: jest.fn<any>().mockResolvedValue(null),
    unlikeComment: jest.fn<any>().mockResolvedValue(null),
    updateComment: (...a: any[]) => mockUpdateComment(...a),
    deleteComment: (...a: any[]) => mockDeleteComment(...a),
    getCommentAsUpdateResult: jest.fn<any>().mockResolvedValue(null),
  })),
}));

jest.mock('../../../../services/posts/PostTranslationService', () => ({
  PostTranslationService: { shared: { translateComment: jest.fn<any>().mockResolvedValue(undefined) } },
}));

jest.mock('../../../../services/posts/PostAudioService', () => ({
  PostAudioService: { shared: { processPostAudio: jest.fn<any>().mockResolvedValue(undefined) } },
}));

jest.mock('../../../../services/MentionService', () => ({
  resolveMentionedUsers: jest.fn<any>().mockResolvedValue([]),
  MentionService: jest.fn().mockImplementation(() => ({
    extractMentions: jest.fn<any>().mockReturnValue([]),
    resolveUsernames: jest.fn<any>().mockResolvedValue(new Map()),
    createCommentMentions: jest.fn<any>().mockResolvedValue(undefined),
    createCommentMentionNotificationsBatch: jest.fn<any>().mockResolvedValue(undefined),
  })),
}));

jest.mock('../../../../middleware/rate-limiter', () => ({
  createPostRouteRateLimitConfig: jest.fn<any>().mockReturnValue({}),
}));

jest.mock('../../../../utils/withMutationLog', () => ({
  ...(jest.requireActual('../../../../utils/withMutationLog') as object),
  withMutationLog: (args: any) => args.op(),
}));

jest.mock('../../../../utils/sanitize.js', () => ({
  SecuritySanitizer: { sanitizeText: jest.fn((t: string) => t) },
}));

import { registerCommentRoutes } from '../../../../routes/posts/comments';

// ─── Constants ────────────────────────────────────────────────────────────────

const COMMENT_AUTHOR_ID = '507f1f77bcf86cd799439011';
const POST_AUTHOR_ID = '507f1f77bcf86cd7994390aa';
const POST_ID = '507f1f77bcf86cd799439022';
const COMMENT_ID = '507f1f77bcf86cd799439033';

// ─── Harness ──────────────────────────────────────────────────────────────────

/**
 * Le post est `PRIVATE` et le lecteur n'est ni son auteur, ni ami, ni contact
 * DM, ni référencé : AUCUNE des voies d'audience ne l'admet. C'est la
 * configuration exacte dans laquelle une garde d'audience refuserait — donc la
 * seule où ce témoin dit quelque chose.
 */
function makePrisma() {
  const post = {
    id: POST_ID,
    authorId: POST_AUTHOR_ID,
    visibility: 'PRIVATE',
    visibilityUserIds: [] as string[],
    expiresAt: null,
    isQuote: false,
    repostOfId: null,
    originalRepostOfId: null,
  };
  return {
    post: {
      findFirst: jest.fn<any>().mockResolvedValue(post),
      findUnique: jest.fn<any>().mockResolvedValue({ ...post, commentCount: 4 }),
    },
    postComment: {
      findFirst: jest.fn<any>().mockResolvedValue({ postId: POST_ID, post }),
      findUnique: jest.fn<any>().mockResolvedValue({ postId: POST_ID }),
    },
    friendRequest: { findFirst: jest.fn<any>().mockResolvedValue(null) },
    communityMember: {
      findMany: jest.fn<any>().mockResolvedValue([]),
      findFirst: jest.fn<any>().mockResolvedValue(null),
    },
    participant: {
      findMany: jest.fn<any>().mockResolvedValue([]),
      findFirst: jest.fn<any>().mockResolvedValue(null),
    },
    postMention: { findUnique: jest.fn<any>().mockResolvedValue(null) },
  } as any;
}

async function buildApp(prisma: any): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate('prisma', prisma);
  const requiredAuth = async (req: FastifyRequest) => {
    (req as any).authContext = {
      isAuthenticated: true,
      isAnonymous: false,
      type: 'user',
      userId: COMMENT_AUTHOR_ID,
      registeredUser: { id: COMMENT_AUTHOR_ID, role: 'USER' },
    };
  };
  registerCommentRoutes(app, prisma, requiredAuth);
  await app.ready();
  return app;
}

beforeEach(() => {
  mockUpdateComment.mockReset();
  mockDeleteComment.mockReset();
  mockUpdateComment.mockResolvedValue({
    id: COMMENT_ID, postId: POST_ID, content: 'corrigé', authorId: COMMENT_AUTHOR_ID, contentChanged: true,
  });
  mockDeleteComment.mockResolvedValue({ postId: POST_ID, deletedCommentIds: [COMMENT_ID], parentId: null });
});

// ─── PATCH ────────────────────────────────────────────────────────────────────

describe('PATCH /posts/:postId/comments/:commentId — corriger ses mots survit à la perte d’accès', () => {
  it('laisse l’auteur du commentaire corriger le sien sur un post devenu PRIVATE pour lui', async () => {
    const app = await buildApp(makePrisma());

    const res = await app.inject({
      method: 'PATCH', url: `/posts/${POST_ID}/comments/${COMMENT_ID}`,
      payload: { content: 'corrigé' },
    });

    expect(res.statusCode).toBe(200);
    expect(mockUpdateComment).toHaveBeenCalledWith(
      COMMENT_ID, COMMENT_AUTHOR_ID, expect.objectContaining({ content: 'corrigé' }),
    );
    await app.close();
  });

  it('refuse toujours un NON-auteur — le contrôle d’auteur reste la garde de la ressource', async () => {
    mockUpdateComment.mockRejectedValueOnce(new Error('FORBIDDEN'));
    const app = await buildApp(makePrisma());

    const res = await app.inject({
      method: 'PATCH', url: `/posts/${POST_ID}/comments/${COMMENT_ID}`,
      payload: { content: 'pas le mien' },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('FORBIDDEN');
    await app.close();
  });
});

// ─── DELETE ───────────────────────────────────────────────────────────────────

describe('DELETE /posts/:postId/comments/:commentId — retirer ses mots survit à la perte d’accès', () => {
  it('laisse l’auteur du commentaire retirer le sien sur un post devenu PRIVATE pour lui', async () => {
    const app = await buildApp(makePrisma());

    const res = await app.inject({
      method: 'DELETE', url: `/posts/${POST_ID}/comments/${COMMENT_ID}`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual({ deleted: true });
    expect(mockDeleteComment).toHaveBeenCalledWith(COMMENT_ID, COMMENT_AUTHOR_ID);
    await app.close();
  });

  it('refuse toujours un NON-auteur', async () => {
    mockDeleteComment.mockRejectedValueOnce(new Error('FORBIDDEN'));
    const app = await buildApp(makePrisma());

    const res = await app.inject({
      method: 'DELETE', url: `/posts/${POST_ID}/comments/${COMMENT_ID}`,
    });

    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('FORBIDDEN');
    await app.close();
  });
});
