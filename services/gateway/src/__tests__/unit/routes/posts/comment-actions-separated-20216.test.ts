/**
 * #20216 — traduire ou liker le commentaire d'un auteur qu'un blocage sépare de
 * l'appelant répond comme un commentaire ABSENT (`404 COMMENT_NOT_FOUND`), dans
 * les deux sens du blocage. La liste REST tait ce commentaire depuis #20205 :
 * un identifiant gardé d'avant le blocage ne doit pas rouvrir une action dessus
 * (la traduction, elle, rend du texte). Le vrai module d'ACL est chargé ; seul
 * le blocage est doublé, et une lecture qui échoue ferme.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, afterEach } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';

const mockLikeComment = jest.fn<any>();
const mockTranslateCommentOnDemand = jest.fn<any>().mockResolvedValue(undefined);

jest.mock('../../../../services/PostCommentService', () => ({
  PostCommentService: jest.fn().mockImplementation(() => ({
    likeComment: (...a: unknown[]) => mockLikeComment(...a),
  })),
}));

jest.mock('../../../../services/posts/PostTranslationService', () => ({
  PostTranslationService: { shared: { translateCommentOnDemand: (...a: unknown[]) => mockTranslateCommentOnDemand(...a) } },
}));

jest.mock('../../../../services/posts/PostAudioService', () => ({
  PostAudioService: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../../../../middleware/rate-limiter', () => ({
  ...(jest.requireActual('../../../../middleware/rate-limiter') as object),
  createPostRouteRateLimitConfig: jest.fn().mockReturnValue({}),
}));

jest.mock('../../../../routes/posts/socialRateLimit', () => ({
  createSocialTranslateRateLimitConfig: jest.fn().mockReturnValue(false),
}));

import { registerCommentRoutes } from '../../../../routes/posts/comments';

const LECTEUR = '507f1f77bcf86cd799420216';
const COMMENTATEUR = '507f1f77bcf86cd799420217';
const AUTEUR_POST = '507f1f77bcf86cd799420218';
const POST_ID = '507f1f77bcf86cd799420219';
const COMMENT_ID = '507f1f77bcf86cd79942021a';

type Blocage = 'aucun' | 'le-lecteur-a-bloque' | 'le-commentateur-a-bloque' | 'panne';

const bloque = (blocage: Blocage, qui: string, cible: string) =>
  (blocage === 'le-lecteur-a-bloque' && qui === LECTEUR && cible === COMMENTATEUR) ||
  (blocage === 'le-commentateur-a-bloque' && qui === COMMENTATEUR && cible === LECTEUR);

async function monter(blocage: Blocage): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  const acl = { authorId: AUTEUR_POST, visibility: 'PUBLIC', visibilityUserIds: [] };
  const prisma = {
    postComment: {
      findFirst: jest.fn(async () => ({ postId: POST_ID, authorId: COMMENTATEUR, post: acl })),
      findUnique: jest.fn(async () => ({ content: 'bonjour' })),
    },
    post: { findFirst: jest.fn(async () => acl), findUnique: jest.fn(async () => null) },
    user: {
      findFirst: jest.fn(async (args: any) => {
        if (blocage === 'panne') throw new Error('mongo indisponible');
        const [a, b] = args?.where?.OR ?? [];
        const separes = [a, b].some((c: any) => c && bloque(blocage, c.id, c.blockedUserIds?.has));
        return separes ? { id: 'x' } : null;
      }),
      findUnique: jest.fn(async () => ({ blockedUserIds: [] })),
      findMany: jest.fn(async () => []),
    },
    friendRequest: { findFirst: jest.fn(async () => null), findMany: jest.fn(async () => []) },
    userRelation: { findUnique: jest.fn(async () => null), findMany: jest.fn(async () => []) },
  } as any;
  app.decorate('prisma', prisma);
  const auth = async (req: FastifyRequest) => {
    (req as any).authContext = { isAuthenticated: true, type: 'registered', userId: LECTEUR, registeredUser: { id: LECTEUR, role: 'USER' } };
  };
  registerCommentRoutes(app, prisma, auth);
  await app.ready();
  return app;
}

const traduire = (app: FastifyInstance) =>
  app.inject({ method: 'POST', url: `/posts/${POST_ID}/comments/${COMMENT_ID}/translate`, payload: { targetLanguage: 'en' } });
const liker = (app: FastifyInstance) =>
  app.inject({ method: 'POST', url: `/posts/${POST_ID}/comments/${COMMENT_ID}/like`, payload: {} });

describe('#20216 — traduire ou liker le commentaire d’un auteur séparé répond 404', () => {
  let app: FastifyInstance | undefined;
  afterEach(async () => {
    await app?.close();
    app = undefined;
    mockLikeComment.mockReset();
    mockTranslateCommentOnDemand.mockClear();
  });

  it.each<Blocage>(['le-lecteur-a-bloque', 'le-commentateur-a-bloque', 'panne'])('traduire : %s ⇒ 404 COMMENT_NOT_FOUND, rien d’enfilé', async (blocage) => {
    app = await monter(blocage);
    const res = await traduire(app);
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ success: false, code: 'COMMENT_NOT_FOUND' });
    expect(mockTranslateCommentOnDemand).not.toHaveBeenCalled();
  });

  it.each<Blocage>(['le-lecteur-a-bloque', 'le-commentateur-a-bloque', 'panne'])('liker : %s ⇒ 404 COMMENT_NOT_FOUND, rien d’écrit', async (blocage) => {
    app = await monter(blocage);
    const res = await liker(app);
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ success: false, code: 'COMMENT_NOT_FOUND' });
    expect(mockLikeComment).not.toHaveBeenCalled();
  });

  it('sans blocage, traduire est accepté et enfilé', async () => {
    app = await monter('aucun');
    const res = await traduire(app);
    expect(res.statusCode).toBe(200);
    expect(mockTranslateCommentOnDemand).toHaveBeenCalledWith(COMMENT_ID, 'en', expect.anything());
  });

  it('sans blocage, liker écrit la réaction', async () => {
    mockLikeComment.mockResolvedValue({ likeCount: 1, reactionSummary: { '❤️': 1 }, authorId: COMMENTATEUR });
    app = await monter('aucun');
    const res = await liker(app);
    expect(res.statusCode).toBe(200);
    expect(mockLikeComment).toHaveBeenCalledWith(COMMENT_ID, LECTEUR, '❤️');
  });
});
