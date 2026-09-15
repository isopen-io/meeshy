/**
 * #6578 — LE CÂBLAGE : commenter en NOMMANT le média dont on parle, et joindre
 * les siens au PLURIEL.
 *
 * Fichier séparé de `comments.test.ts`, qui est dans `DETTE_HERITEE`
 * (`gateway-test-file-size-budget.test.ts`) et interdit d'ajout.
 *
 * Tous les témoins passent par `app.inject` : ils EXERCENT la route réelle avec
 * son schéma Zod réel, et observent ce que le service REÇOIT — jamais le texte
 * source. Le RANG est load-bearing : la citation vise le DEUXIÈME média d'un
 * post qui en porte quatre, parce qu'au rang 1 « le premier » et « celui qu'on
 * a nommé » rendent le même verdict (leçon 261).
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';

const mockAddComment = jest.fn<any>();

jest.mock('../../../../services/PostCommentService', () => ({
  PostCommentService: jest.fn().mockImplementation(() => ({
    getComments: jest.fn<any>().mockResolvedValue({ items: [], hasMore: false, nextCursor: null }),
    getReplies: jest.fn<any>().mockResolvedValue({ items: [], hasMore: false, nextCursor: null }),
    addComment: (...args: any[]) => mockAddComment(...args),
  })),
}));

jest.mock('../../../../services/posts/PostTranslationService', () => ({
  PostTranslationService: { shared: { translateComment: jest.fn<any>().mockResolvedValue(undefined) } },
}));

jest.mock('../../../../services/posts/PostAudioService', () => ({
  PostAudioService: { shared: { processPostAudio: jest.fn<any>().mockResolvedValue(undefined) } },
}));

jest.mock('../../../../services/engagement/EngagementService', () => ({
  EngagementService: jest.fn().mockImplementation(() => ({
    recordActivity: jest.fn<any>().mockResolvedValue(undefined),
  })),
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
  withMutationLog: (...args: any[]) => (args[0] as any).op(),
}));

jest.mock('../../../../utils/sanitize.js', () => ({
  SecuritySanitizer: { sanitizeText: jest.fn((t: string) => t) },
}));

import { registerCommentRoutes } from '../../../../routes/posts/comments';

const USER_ID = '507f1f77bcf86cd799439011';
const POST_ID = '507f1f77bcf86cd799439022';
const AUTRE_POST_ID = '507f1f77bcf86cd799439099';
// `id` est LOAD-BEARING : `resolveInteractionTarget` rend cette ligne telle
// quelle, et c'est SON `id` que la garde de citation oppose au `postId` du
// média. Une fixture sans `id` fait comparer à `undefined` — la garde refuse
// tout, et le témoin passerait au vert pour la mauvaise raison.
const PUBLIC_ACL = { id: POST_ID, authorId: 'author-1', visibility: 'PUBLIC', visibilityUserIds: [] };

/** Quatre médias sur le post commenté — la citation vise le DEUXIÈME. */
const QUATRE = [1, 2, 3, 4].map((rang) => ({
  id: `507f1f77bcf86cd79943910${rang}`,
  postId: POST_ID,
  mimeType: rang === 3 ? 'video/mp4' : 'image/jpeg',
}));
const DEUXIEME = QUATRE[1].id;
const TROISIEME = QUATRE[2].id;
const ETRANGER = '507f1f77bcf86cd799439200';

async function requiredAuth(req: FastifyRequest): Promise<void> {
  (req as any).authContext = {
    isAuthenticated: true,
    isAnonymous: false,
    type: 'user',
    userId: USER_ID,
    registeredUser: { id: USER_ID, role: 'USER' },
  };
}

function buildPrisma() {
  const lignes = [...QUATRE, { id: ETRANGER, postId: AUTRE_POST_ID, mimeType: 'image/png' }];
  return {
    post: {
      findFirst: jest.fn<any>().mockResolvedValue(PUBLIC_ACL),
      findUnique: jest.fn<any>().mockResolvedValue({
        authorId: 'author-1', commentCount: 1, type: 'POST', content: 'Post content',
        createdAt: new Date(), expiresAt: null, visibility: 'PUBLIC', visibilityUserIds: [],
      }),
      update: jest.fn<any>().mockResolvedValue({}),
    },
    postComment: {
      findFirst: jest.fn<any>().mockResolvedValue({ postId: POST_ID, post: PUBLIC_ACL }),
      findUnique: jest.fn<any>().mockResolvedValue(null),
    },
    postMedia: {
      findUnique: jest.fn<any>(async ({ where }: any) => lignes.find((m) => m.id === where.id) ?? null),
      findMany: jest.fn<any>(async ({ where }: any) => lignes.filter((m) => where.id.in.includes(m.id))),
    },
  } as any;
}

async function buildApp(prisma: any): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate('prisma', prisma);
  registerCommentRoutes(app, prisma, requiredAuth);
  await app.ready();
  return app;
}

beforeEach(() => {
  mockAddComment.mockReset();
  mockAddComment.mockResolvedValue({ id: 'comment-6578', content: 'celle-là', authorId: USER_ID, media: [] });
});

describe('#6578 — commenter en NOMMANT le média du post', () => {
  it('le DEUXIÈME média du post est admis, et le service reçoit l’instantané FIGÉ (ancre + nature)', async () => {
    const prisma = buildPrisma();
    const app = await buildApp(prisma);
    const res = await app.inject({
      method: 'POST', url: `/posts/${POST_ID}/comments`,
      payload: { content: 'celle-là est floue', quotedPostMedia: { postMediaId: DEUXIEME } },
    });
    expect(res.statusCode).toBe(201);
    expect(mockAddComment).toHaveBeenCalledTimes(1);
    const recu = mockAddComment.mock.calls[0];
    expect(JSON.stringify(recu)).toContain(DEUXIEME);
    const options = recu.find((a: any) => a && typeof a === 'object' && 'quotedPostMedia' in a);
    expect(options?.quotedPostMedia).toEqual({ postMediaId: DEUXIEME, kind: 'image' });
    await app.close();
  });

  it('la NATURE vient du MIME relu, pas de ce que le client déclare', async () => {
    const prisma = buildPrisma();
    const app = await buildApp(prisma);
    await app.inject({
      method: 'POST', url: `/posts/${POST_ID}/comments`,
      payload: { content: 'la vidéo', quotedPostMedia: { postMediaId: TROISIEME, kind: 'file' } },
    });
    const options = mockAddComment.mock.calls[0].find((a: any) => a && typeof a === 'object' && 'quotedPostMedia' in a);
    expect(options?.quotedPostMedia).toEqual({ postMediaId: TROISIEME, kind: 'video' });
    await app.close();
  });

  it('un média ÉTRANGER au post est REFUSÉ, et RIEN n’est écrit — une fuite, pas une faute de frappe', async () => {
    const prisma = buildPrisma();
    const app = await buildApp(prisma);
    const res = await app.inject({
      method: 'POST', url: `/posts/${POST_ID}/comments`,
      payload: { content: 'regarde ça', quotedPostMedia: { postMediaId: ETRANGER } },
    });
    expect(res.statusCode).toBe(400);
    expect(mockAddComment).not.toHaveBeenCalled();
    await app.close();
  });

  it('un média INTROUVABLE est REFUSÉ de la même façon', async () => {
    const prisma = buildPrisma();
    const app = await buildApp(prisma);
    const res = await app.inject({
      method: 'POST', url: `/posts/${POST_ID}/comments`,
      payload: { content: 'x', quotedPostMedia: { postMediaId: '507f1f77bcf86cd799439777' } },
    });
    expect(res.statusCode).toBe(400);
    expect(mockAddComment).not.toHaveBeenCalled();
    await app.close();
  });

  it('NON-RÉGRESSION — un commentaire qui ne cite rien passe, sans lire le moindre média', async () => {
    const prisma = buildPrisma();
    const app = await buildApp(prisma);
    const res = await app.inject({
      method: 'POST', url: `/posts/${POST_ID}/comments`,
      payload: { content: 'bravo' },
    });
    expect(res.statusCode).toBe(201);
    expect(prisma.postMedia.findUnique).not.toHaveBeenCalled();
    await app.close();
  });
});

describe('#6578 — « ajouter d’autres média » : le bandeau ne ment plus', () => {
  it('TROIS médias joints arrivent TOUS au service — le bornage à 1 est levé', async () => {
    const prisma = buildPrisma();
    const app = await buildApp(prisma);
    const trois = ['507f1f77bcf86cd799439301', '507f1f77bcf86cd799439302', '507f1f77bcf86cd799439303'];
    const res = await app.inject({
      method: 'POST', url: `/posts/${POST_ID}/comments`,
      payload: { content: 'mes trois photos', attachmentIds: trois },
    });
    expect(res.statusCode).toBe(201);
    const recu = mockAddComment.mock.calls[0];
    const options = recu.find((a: any) => a && typeof a === 'object' && 'mediaIds' in a);
    expect(options?.mediaIds).toEqual(trois);
    await app.close();
  });

  it('le plafond est celui des médias d’un post (MAX_POST_MEDIA), pas un nombre neuf', async () => {
    const prisma = buildPrisma();
    const app = await buildApp(prisma);
    const onze = Array.from({ length: 11 }, (_, i) => `507f1f77bcf86cd7994394${String(i).padStart(2, '0')}`);
    const res = await app.inject({
      method: 'POST', url: `/posts/${POST_ID}/comments`,
      payload: { content: 'trop', attachmentIds: onze },
    });
    expect(res.statusCode).toBe(400);
    expect(mockAddComment).not.toHaveBeenCalled();
    await app.close();
  });
});
