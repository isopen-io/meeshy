/**
 * Le fil de commentaires hérite de l'audience de son post.
 *
 * Avant ce garde-fou, les routes de commentaires ne consultaient JAMAIS
 * `Post.visibility` : n'importe quel utilisateur authentifié connaissant un
 * `postId` pouvait LIRE tout le fil d'un post `PRIVATE`/`ONLY`/`FRIENDS`
 * (contenu, médias, auteurs) et y ÉCRIRE un commentaire. Le post lui-même
 * était pourtant protégé (`PostService.getPostById` applique le filtre de
 * visibilité) et les deux handlers socket de réaction citaient déjà
 * `canUserViewPost` — le fil était la seule île sans ACL.
 *
 * Deux verdicts distincts, selon l'asymétrie déjà documentée dans
 * `postVisibility.ts` :
 *  - LIRE le fil  → `canUserConsumePost`     (amis ∪ contacts DM, comme le feed)
 *  - ÉCRIRE dedans → `canUserInteractWithPost` (amis stricts)
 *
 * Refus = 404 et non 403 : distinguer « interdit » de « inexistant » ferait de
 * la route un oracle d'existence de posts privés.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockGetComments = jest.fn<any>().mockResolvedValue({ items: [], hasMore: false, nextCursor: null });
const mockGetReplies = jest.fn<any>().mockResolvedValue({ items: [], hasMore: false, nextCursor: null });
const mockAddComment = jest.fn<any>().mockResolvedValue({ id: 'comment-001', content: 'Hello', authorId: 'user-001' });
const mockLikeComment = jest.fn<any>().mockResolvedValue({ authorId: 'author-1', likeCount: 1, reactionSummary: {} });
const mockUnlikeComment = jest.fn<any>().mockResolvedValue({ authorId: 'author-1', likeCount: 0, reactionSummary: {} });
const mockDeleteComment = jest.fn<any>().mockResolvedValue({ postId: 'post-001' });

jest.mock('../../../../services/PostCommentService', () => ({
  PostCommentService: jest.fn().mockImplementation(() => ({
    getComments: (...args: any[]) => mockGetComments(...args),
    getReplies: (...args: any[]) => mockGetReplies(...args),
    addComment: (...args: any[]) => mockAddComment(...args),
    likeComment: (...args: any[]) => mockLikeComment(...args),
    unlikeComment: (...args: any[]) => mockUnlikeComment(...args),
    deleteComment: (...args: any[]) => mockDeleteComment(...args),
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
  // Le module réel est ÉTALÉ d'abord : `MutationResultGone` est une CLASSE
  // dont les routes font `instanceof`, et `withMutationOutcome` est le
  // chemin réel du repost. Une usine qui ne rendait que `withMutationLog`
  // les laissait à `undefined` — `instanceof undefined` lève un TypeError
  // qui se déguise en 500 sur des chemins d'erreur sans rapport.
  ...(jest.requireActual('../../../../utils/withMutationLog') as object),
  withMutationLog: (args: any) => args.op(),
}));

jest.mock('../../../../utils/sanitize.js', () => ({
  SecuritySanitizer: { sanitizeText: jest.fn((t: string) => t) },
}));

import { registerCommentRoutes } from '../../../../routes/posts/comments';

// ─── Constants ────────────────────────────────────────────────────────────────

const VIEWER_ID = '507f1f77bcf86cd799439011';
const AUTHOR_ID = '507f1f77bcf86cd7994390aa';
const POST_ID = '507f1f77bcf86cd799439022';
const OTHER_POST_ID = '507f1f77bcf86cd7994390bb';
const COMMENT_ID = '507f1f77bcf86cd799439033';

// ─── Harness ──────────────────────────────────────────────────────────────────

type PostAcl = {
  id: string; authorId: string; visibility: string; visibilityUserIds: string[];
  expiresAt: Date | null;
  isQuote: boolean; repostOfId: string | null; originalRepostOfId: string | null;
};

// `id`/`isQuote:false`/`repostOfId:null` = « pas un repost » par défaut, ce
// qui vaut aussi pour `commentPost` ci-dessous (champs ignorés par
// `loadCommentPostAcl`, sans effet sur ces tests). La redirection repost
// simple → racine (`resolveInteractionTarget`/`resolveConsumptionTarget`,
// tâche 9) est couverte séparément plus bas.
function acl(visibility: string, visibilityUserIds: string[] = [], expiresAt: Date | null = null): PostAcl {
  return {
    id: POST_ID, authorId: AUTHOR_ID, visibility, visibilityUserIds, expiresAt,
    isQuote: false, repostOfId: null, originalRepostOfId: null,
  };
}

/**
 * Double Prisma décrivant UN post et son graphe social. `commentPostId` permet
 * de faire diverger le post réel du commentaire de celui annoncé par l'URL —
 * c'est le scénario du postId d'URL menteur.
 */
function makePrisma(opts: {
  post?: PostAcl | null;
  commentPost?: PostAcl | null;
  commentPostId?: string;
  isFriend?: boolean;
  isDirectContact?: boolean;
  /** La ligne `PostMention` du lecteur, `null` quand le post ne le nomme pas. */
  reference?: { expiredViewAt: Date | null } | null;
} = {}) {
  const post = opts.post === undefined ? acl('PUBLIC') : opts.post;
  const commentPost = opts.commentPost === undefined ? post : opts.commentPost;
  return {
    post: {
      findFirst: jest.fn<any>().mockResolvedValue(post),
      findUnique: jest.fn<any>().mockResolvedValue(
        post ? { ...post, commentCount: 1, type: 'POST', content: 'c', createdAt: new Date(), expiresAt: null } : null
      ),
    },
    postComment: {
      findFirst: jest.fn<any>().mockResolvedValue(
        commentPost ? { postId: opts.commentPostId ?? POST_ID, post: commentPost } : null
      ),
      findUnique: jest.fn<any>().mockResolvedValue({ id: COMMENT_ID, content: 'hi', authorId: AUTHOR_ID }),
    },
    friendRequest: {
      findFirst: jest.fn<any>().mockResolvedValue(opts.isFriend ? { id: 'fr-1' } : null),
    },
    communityMember: {
      findMany: jest.fn<any>().mockResolvedValue([]),
      findFirst: jest.fn<any>().mockResolvedValue(null),
    },
    participant: {
      findMany: jest.fn<any>().mockResolvedValue(opts.isDirectContact ? [{ conversationId: 'conv-1' }] : []),
      findFirst: jest.fn<any>().mockResolvedValue(opts.isDirectContact ? { id: 'pt-1' } : null),
    },
    postMention: {
      findUnique: jest.fn<any>().mockResolvedValue(opts.reference ?? null),
    },
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
      userId: VIEWER_ID,
      registeredUser: { id: VIEWER_ID, role: 'USER' },
    };
  };
  registerCommentRoutes(app, prisma, requiredAuth);
  await app.ready();
  return app;
}

beforeEach(() => {
  mockGetComments.mockClear();
  mockGetReplies.mockClear();
  mockAddComment.mockClear();
  mockLikeComment.mockClear();
  mockUnlikeComment.mockClear();
});

// ─── LIRE le fil ──────────────────────────────────────────────────────────────

describe('GET /posts/:postId/comments — lire le fil suit l’audience du post', () => {
  it('refuse un tiers sur un post PRIVATE, et n’interroge même pas le fil', async () => {
    const app = await buildApp(makePrisma({ post: acl('PRIVATE') }));

    const res = await app.inject({ method: 'GET', url: `/posts/${POST_ID}/comments` });

    expect(res.statusCode).toBe(404);
    expect(res.json().code).toBe('POST_NOT_FOUND');
    expect(mockGetComments).not.toHaveBeenCalled();
    await app.close();
  });

  it('refuse un tiers absent de la liste ONLY', async () => {
    const app = await buildApp(makePrisma({ post: acl('ONLY', [AUTHOR_ID]) }));

    const res = await app.inject({ method: 'GET', url: `/posts/${POST_ID}/comments` });

    expect(res.statusCode).toBe(404);
    expect(mockGetComments).not.toHaveBeenCalled();
    await app.close();
  });

  it('refuse un inconnu sur un post FRIENDS', async () => {
    const app = await buildApp(makePrisma({ post: acl('FRIENDS'), isFriend: false }));

    const res = await app.inject({ method: 'GET', url: `/posts/${POST_ID}/comments` });

    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('ADMET un contact DM non-ami sur un post FRIENDS — le feed le lui montre déjà', async () => {
    const app = await buildApp(makePrisma({ post: acl('FRIENDS'), isFriend: false, isDirectContact: true }));

    const res = await app.inject({ method: 'GET', url: `/posts/${POST_ID}/comments` });

    expect(res.statusCode).toBe(200);
    expect(mockGetComments).toHaveBeenCalled();
    await app.close();
  });

  it('laisse passer un post PUBLIC sans rien changer au comportement existant', async () => {
    const app = await buildApp(makePrisma({ post: acl('PUBLIC') }));

    const res = await app.inject({ method: 'GET', url: `/posts/${POST_ID}/comments` });

    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
    await app.close();
  });

  it('refuse quand le post n’existe pas', async () => {
    const app = await buildApp(makePrisma({ post: null }));

    const res = await app.inject({ method: 'GET', url: `/posts/${POST_ID}/comments` });

    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

/**
 * Le droit d'une RÉFÉRENCE ouvre le fil — tant qu'il vaut encore.
 *
 * Être nommé dans un contenu l'ouvre (décision produit 2026-08-19), y compris
 * une fois expiré : une fenêtre de 24 h s'ouvre à la première vue déclarée.
 * Passée cette fenêtre, le droit est ÉTEINT — et la ligne `PostMention`, elle,
 * survit (la détruire fausserait l'inbox et les compteurs). Tant que la garde
 * ne testait que son existence, `GET /posts/:id` répondait `consumed` pendant
 * que CE fil-ci servait textes, médias et identités au même lecteur.
 */
describe('GET /posts/:postId/comments — la référence ouvre le fil, sa fenêtre le referme', () => {
  const EXPIRED = new Date(Date.now() - 48 * 3600_000);

  it('ADMET un inconnu référencé dans une story FRIENDS expirée qu’il n’a pas encore ouverte', async () => {
    const app = await buildApp(makePrisma({
      post: acl('FRIENDS', [], EXPIRED),
      isFriend: false,
      reference: { expiredViewAt: null },
    }));

    const res = await app.inject({ method: 'GET', url: `/posts/${POST_ID}/comments` });

    expect(res.statusCode).toBe(200);
    expect(mockGetComments).toHaveBeenCalled();
    await app.close();
  });

  it('REFUSE le même lecteur une fois sa fenêtre de 24 h close, sans toucher au fil', async () => {
    const app = await buildApp(makePrisma({
      post: acl('FRIENDS', [], EXPIRED),
      isFriend: false,
      reference: { expiredViewAt: new Date(Date.now() - 30 * 3600_000) },
    }));

    const res = await app.inject({ method: 'GET', url: `/posts/${POST_ID}/comments` });

    expect(res.statusCode).toBe(404);
    expect(res.json().code).toBe('POST_NOT_FOUND');
    expect(mockGetComments).not.toHaveBeenCalled();
    await app.close();
  });

  it('REFUSE un référencé sur un post basculé en PRIVATE — « moi seul » l’emporte', async () => {
    const app = await buildApp(makePrisma({
      post: acl('PRIVATE'),
      reference: { expiredViewAt: null },
    }));

    const res = await app.inject({ method: 'GET', url: `/posts/${POST_ID}/comments` });

    expect(res.statusCode).toBe(404);
    expect(mockGetComments).not.toHaveBeenCalled();
    await app.close();
  });
});

describe('GET .../replies — le post est résolu DEPUIS le commentaire', () => {
  it('refuse quand le commentaire visé appartient à un post privé, même si l’URL nomme un post public', async () => {
    const prisma = makePrisma({
      post: acl('PUBLIC'),
      commentPost: acl('PRIVATE'),
      commentPostId: OTHER_POST_ID,
    });
    const app = await buildApp(prisma);

    const res = await app.inject({ method: 'GET', url: `/posts/${POST_ID}/comments/${COMMENT_ID}/replies` });

    expect(res.statusCode).toBe(404);
    expect(mockGetReplies).not.toHaveBeenCalled();
    await app.close();
  });

  it('admet les réponses d’un commentaire sur un post public', async () => {
    const app = await buildApp(makePrisma({ post: acl('PUBLIC') }));

    const res = await app.inject({ method: 'GET', url: `/posts/${POST_ID}/comments/${COMMENT_ID}/replies` });

    expect(res.statusCode).toBe(200);
    expect(mockGetReplies).toHaveBeenCalled();
    await app.close();
  });

  it('refuse quand le commentaire n’existe pas', async () => {
    const app = await buildApp(makePrisma({ commentPost: null }));

    const res = await app.inject({ method: 'GET', url: `/posts/${POST_ID}/comments/${COMMENT_ID}/replies` });

    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

// ─── ÉCRIRE dans le fil ───────────────────────────────────────────────────────

describe('POST /posts/:postId/comments — commenter suit l’audience d’INTERACTION', () => {
  it('refuse un tiers sur un post PRIVATE, et n’écrit rien', async () => {
    const app = await buildApp(makePrisma({ post: acl('PRIVATE') }));

    const res = await app.inject({
      method: 'POST',
      url: `/posts/${POST_ID}/comments`,
      payload: { content: 'intrusion' },
    });

    expect(res.statusCode).toBe(404);
    expect(mockAddComment).not.toHaveBeenCalled();
    await app.close();
  });

  it('refuse un contact DM non-ami là où la LECTURE du même fil lui est ouverte', async () => {
    const prisma = makePrisma({ post: acl('FRIENDS'), isFriend: false, isDirectContact: true });
    const app = await buildApp(prisma);

    const read = await app.inject({ method: 'GET', url: `/posts/${POST_ID}/comments` });
    const write = await app.inject({
      method: 'POST',
      url: `/posts/${POST_ID}/comments`,
      payload: { content: 'coucou' },
    });

    expect(read.statusCode).toBe(200);
    expect(write.statusCode).toBe(404);
    expect(mockAddComment).not.toHaveBeenCalled();
    await app.close();
  });

  it('admet un ami sur un post FRIENDS', async () => {
    const app = await buildApp(makePrisma({ post: acl('FRIENDS'), isFriend: true }));

    const res = await app.inject({
      method: 'POST',
      url: `/posts/${POST_ID}/comments`,
      payload: { content: 'bien vu' },
    });

    expect(res.statusCode).toBe(201);
    expect(mockAddComment).toHaveBeenCalled();
    await app.close();
  });

  it('admet l’auteur sur son propre post PRIVATE', async () => {
    const prisma = makePrisma({ post: {
      id: POST_ID, authorId: VIEWER_ID, visibility: 'PRIVATE', visibilityUserIds: [],
      expiresAt: null, isQuote: false, repostOfId: null, originalRepostOfId: null,
    } });
    const app = await buildApp(prisma);

    const res = await app.inject({
      method: 'POST',
      url: `/posts/${POST_ID}/comments`,
      payload: { content: 'note perso' },
    });

    expect(res.statusCode).toBe(201);
    await app.close();
  });
});

describe('POST/DELETE .../like — liker un commentaire suit l’audience d’INTERACTION', () => {
  it('refuse un like quand le post portant le commentaire est privé', async () => {
    const app = await buildApp(makePrisma({ commentPost: acl('PRIVATE') }));

    const res = await app.inject({
      method: 'POST',
      url: `/posts/${POST_ID}/comments/${COMMENT_ID}/like`,
      payload: {},
    });

    expect(res.statusCode).toBe(404);
    expect(mockLikeComment).not.toHaveBeenCalled();
    await app.close();
  });

  it('refuse un unlike sur le même fil privé', async () => {
    const app = await buildApp(makePrisma({ commentPost: acl('PRIVATE') }));

    const res = await app.inject({
      method: 'DELETE',
      url: `/posts/${POST_ID}/comments/${COMMENT_ID}/like`,
      payload: {},
    });

    expect(res.statusCode).toBe(404);
    expect(mockUnlikeComment).not.toHaveBeenCalled();
    await app.close();
  });

  it('refuse un contact DM non-ami — la lecture ne vaut pas droit d’interaction', async () => {
    const app = await buildApp(makePrisma({
      commentPost: acl('FRIENDS'),
      isFriend: false,
      isDirectContact: true,
    }));

    const res = await app.inject({
      method: 'POST',
      url: `/posts/${POST_ID}/comments/${COMMENT_ID}/like`,
      payload: {},
    });

    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('admet un like sur un commentaire de post public', async () => {
    const app = await buildApp(makePrisma({ post: acl('PUBLIC') }));

    const res = await app.inject({
      method: 'POST',
      url: `/posts/${POST_ID}/comments/${COMMENT_ID}/like`,
      payload: {},
    });

    expect(res.statusCode).toBe(200);
    expect(mockLikeComment).toHaveBeenCalled();
    await app.close();
  });
});

// ─── Repost simple → redirection du fil vers la racine (tâche 9) ─────────────

const ROOT_ID = '507f1f77bcf86cd799439ccc';

function repostAcl(overrides: Partial<PostAcl> = {}): PostAcl {
  return {
    id: POST_ID, authorId: AUTHOR_ID, visibility: 'PUBLIC', visibilityUserIds: [],
    expiresAt: null, isQuote: false, repostOfId: ROOT_ID, originalRepostOfId: ROOT_ID,
    ...overrides,
  };
}

function rootAcl(overrides: Partial<PostAcl> = {}): PostAcl {
  return {
    id: ROOT_ID, authorId: 'root-author-1', visibility: 'PUBLIC', visibilityUserIds: [],
    expiresAt: null, isQuote: false, repostOfId: null, originalRepostOfId: null,
    ...overrides,
  };
}

function makeRepostPrisma(byId: Record<string, PostAcl | null>) {
  return {
    post: {
      findFirst: jest.fn<any>().mockImplementation(({ where }: { where: { id: string } }) =>
        Promise.resolve(byId[where.id] ?? null)),
      findUnique: jest.fn<any>().mockImplementation(({ where }: { where: { id: string } }) => {
        const p = byId[where.id];
        return Promise.resolve(p ? { ...p, commentCount: 1, type: 'POST', content: 'c', createdAt: new Date(), expiresAt: null } : null);
      }),
    },
    postComment: {
      findFirst: jest.fn<any>().mockResolvedValue(null),
      findUnique: jest.fn<any>().mockResolvedValue({ id: COMMENT_ID, content: 'hi', authorId: AUTHOR_ID }),
    },
    friendRequest: { findFirst: jest.fn<any>().mockResolvedValue(null) },
    communityMember: { findMany: jest.fn<any>().mockResolvedValue([]), findFirst: jest.fn<any>().mockResolvedValue(null) },
    participant: { findMany: jest.fn<any>().mockResolvedValue([]), findFirst: jest.fn<any>().mockResolvedValue(null) },
  } as any;
}

describe('GET /posts/:postId/comments — repost simple renvoie le fil de la RACINE', () => {
  it('lit le fil de la racine, pas celui (vide) du repost affiché', async () => {
    const prisma = makeRepostPrisma({ [POST_ID]: repostAcl(), [ROOT_ID]: rootAcl() });
    const app = await buildApp(prisma);

    const res = await app.inject({ method: 'GET', url: `/posts/${POST_ID}/comments` });

    expect(res.statusCode).toBe(200);
    expect(mockGetComments).toHaveBeenCalledWith(ROOT_ID, undefined, 20, VIEWER_ID);
    await app.close();
  });

  it('une CITATION garde son propre fil', async () => {
    const prisma = makeRepostPrisma({ [POST_ID]: repostAcl({ isQuote: true }), [ROOT_ID]: rootAcl() });
    const app = await buildApp(prisma);

    const res = await app.inject({ method: 'GET', url: `/posts/${POST_ID}/comments` });

    expect(res.statusCode).toBe(200);
    expect(mockGetComments).toHaveBeenCalledWith(POST_ID, undefined, 20, VIEWER_ID);
    await app.close();
  });

  it('racine invisible pour l’acteur → refus standard, le fil n’est jamais interrogé', async () => {
    const prisma = makeRepostPrisma({ [POST_ID]: repostAcl(), [ROOT_ID]: rootAcl({ visibility: 'PRIVATE' }) });
    const app = await buildApp(prisma);

    const res = await app.inject({ method: 'GET', url: `/posts/${POST_ID}/comments` });

    expect(res.statusCode).toBe(404);
    expect(mockGetComments).not.toHaveBeenCalled();
    await app.close();
  });
});

describe('POST /posts/:postId/comments — repost simple atterrit sur le fil de la RACINE', () => {
  it('crée le commentaire sur la RACINE, pas sur le repost affiché', async () => {
    const prisma = makeRepostPrisma({ [POST_ID]: repostAcl(), [ROOT_ID]: rootAcl() });
    const app = await buildApp(prisma);

    const res = await app.inject({
      method: 'POST',
      url: `/posts/${POST_ID}/comments`,
      payload: { content: 'sur la racine' },
    });

    expect(res.statusCode).toBe(201);
    expect(mockAddComment).toHaveBeenCalledWith(
      ROOT_ID, VIEWER_ID, 'sur la racine', undefined, undefined, undefined, undefined, undefined, undefined,
    );
    await app.close();
  });

  it('une CITATION garde son propre fil de commentaires', async () => {
    const prisma = makeRepostPrisma({ [POST_ID]: repostAcl({ isQuote: true }), [ROOT_ID]: rootAcl() });
    const app = await buildApp(prisma);

    const res = await app.inject({
      method: 'POST',
      url: `/posts/${POST_ID}/comments`,
      payload: { content: 'sur la citation' },
    });

    expect(res.statusCode).toBe(201);
    expect(mockAddComment).toHaveBeenCalledWith(
      POST_ID, VIEWER_ID, 'sur la citation', undefined, undefined, undefined, undefined, undefined, undefined,
    );
    await app.close();
  });

  it('racine devenue invisible pour l’acteur → refus standard, aucun commentaire créé', async () => {
    const prisma = makeRepostPrisma({ [POST_ID]: repostAcl(), [ROOT_ID]: rootAcl({ visibility: 'PRIVATE' }) });
    const app = await buildApp(prisma);

    const res = await app.inject({
      method: 'POST',
      url: `/posts/${POST_ID}/comments`,
      payload: { content: 'intrusion' },
    });

    expect(res.statusCode).toBe(404);
    expect(mockAddComment).not.toHaveBeenCalled();
    await app.close();
  });
});
