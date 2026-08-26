/**
 * Aimer un post suit l'audience d'INTERACTION du post.
 *
 * `POST`/`DELETE /posts/:postId/like` passent par `PostService.likePost` /
 * `unlikePost`, qui ne vérifient QUE l'existence et le non-effacement du post
 * (`PostReactionService.addReaction` fait de même). Aucune des deux ne consulte
 * `Post.visibility` : connaître un `postId` suffisait à poser une réaction
 * persistée sur un post restreint, à peser dans ses agrégats et à notifier son
 * auteur.
 *
 * Même défaut, même verdict et même refus indistinct (404) que le jumeau
 * socket `post:reaction-add` — les deux chemins doivent répondre pareil, sinon
 * l'ACL dépend du transport.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockLikePost = jest.fn<any>().mockResolvedValue({
  id: 'post-001', type: 'POST', authorId: 'author-1', likeCount: 1, reactionSummary: { '❤️': 1 },
});
// `unlikePost` rend une enveloppe : le post ET la réaction réellement retirée.
const mockUnlikePost = jest.fn<any>().mockResolvedValue({
  id: 'post-001',
  removedEmoji: '❤️',
  post: { id: 'post-001', type: 'POST', authorId: 'author-1', likeCount: 0, reactionSummary: {} },
});

jest.mock('../../../../services/PostService', () => ({
  PostService: jest.fn().mockImplementation(() => ({
    likePost: (...args: any[]) => mockLikePost(...args),
    unlikePost: (...args: any[]) => mockUnlikePost(...args),
    getPostById: jest.fn<any>().mockResolvedValue(null),
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

import { registerInteractionRoutes } from '../../../../routes/posts/interactions';

// ─── Constants ────────────────────────────────────────────────────────────────

const USER_ID = '507f1f77bcf86cd799439011';
const AUTHOR_ID = '507f1f77bcf86cd7994390aa';
const POST_ID = '507f1f77bcf86cd799439022';

// ─── Harness ──────────────────────────────────────────────────────────────────

function acl(visibility: string, visibilityUserIds: string[] = [], authorId = AUTHOR_ID) {
  return { authorId, visibility, visibilityUserIds };
}

function makePrisma(opts: { post?: unknown; isFriend?: boolean; isDirectContact?: boolean } = {}) {
  return {
    post: {
      findFirst: jest.fn<any>().mockResolvedValue(opts.post === undefined ? acl('PUBLIC') : opts.post),
      update: jest.fn<any>().mockResolvedValue({}),
      updateMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
    },
    postComment: { findFirst: jest.fn<any>().mockResolvedValue(null) },
    postImpression: { create: jest.fn<any>(), createMany: jest.fn<any>() },
    friendRequest: { findFirst: jest.fn<any>().mockResolvedValue(opts.isFriend ? { id: 'fr-1' } : null) },
    communityMember: { findMany: jest.fn<any>().mockResolvedValue([]), findFirst: jest.fn<any>().mockResolvedValue(null) },
    participant: {
      findMany: jest.fn<any>().mockResolvedValue(opts.isDirectContact ? [{ conversationId: 'conv-1' }] : []),
      findFirst: jest.fn<any>().mockResolvedValue(opts.isDirectContact ? { id: 'pt-1' } : null),
    },
  } as any;
}

async function buildApp(prisma: any): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate('prisma', prisma);
  app.decorate('notificationService', null as any);
  const requiredAuth = async (req: FastifyRequest) => {
    (req as any).authContext = {
      isAuthenticated: true,
      registeredUser: { id: USER_ID, role: 'USER', username: 'alice' },
    };
  };
  registerInteractionRoutes(app, prisma, requiredAuth);
  await app.ready();
  return app;
}

beforeEach(() => {
  mockLikePost.mockClear();
  mockUnlikePost.mockClear();
});

// ─── POST /posts/:postId/like ─────────────────────────────────────────────────

describe('POST /posts/:postId/like — aimer suit l’audience d’INTERACTION', () => {
  it('refuse un tiers sur un post PRIVATE, et n’écrit aucune réaction', async () => {
    const app = await buildApp(makePrisma({ post: acl('PRIVATE') }));

    const res = await app.inject({ method: 'POST', url: `/posts/${POST_ID}/like`, payload: {} });

    expect(res.statusCode).toBe(404);
    expect(res.json().code).toBe('POST_NOT_FOUND');
    expect(mockLikePost).not.toHaveBeenCalled();
    await app.close();
  });

  it('refuse un tiers absent de la liste ONLY', async () => {
    const app = await buildApp(makePrisma({ post: acl('ONLY', [AUTHOR_ID]) }));

    const res = await app.inject({ method: 'POST', url: `/posts/${POST_ID}/like`, payload: {} });

    expect(res.statusCode).toBe(404);
    expect(mockLikePost).not.toHaveBeenCalled();
    await app.close();
  });

  it('refuse un contact DM non-ami — voir ne vaut pas interagir, comme sur le chemin socket', async () => {
    const app = await buildApp(makePrisma({ post: acl('FRIENDS'), isFriend: false, isDirectContact: true }));

    const res = await app.inject({ method: 'POST', url: `/posts/${POST_ID}/like`, payload: {} });

    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('admet un ami sur un post FRIENDS', async () => {
    const app = await buildApp(makePrisma({ post: acl('FRIENDS'), isFriend: true }));

    const res = await app.inject({ method: 'POST', url: `/posts/${POST_ID}/like`, payload: {} });

    expect(res.statusCode).toBe(200);
    expect(mockLikePost).toHaveBeenCalled();
    await app.close();
  });

  it('admet l’auteur sur son propre post PRIVATE', async () => {
    const app = await buildApp(makePrisma({ post: acl('PRIVATE', [], USER_ID) }));

    const res = await app.inject({ method: 'POST', url: `/posts/${POST_ID}/like`, payload: {} });

    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it('refuse quand le post n’existe pas ou est supprimé', async () => {
    const app = await buildApp(makePrisma({ post: null }));

    const res = await app.inject({ method: 'POST', url: `/posts/${POST_ID}/like`, payload: {} });

    expect(res.statusCode).toBe(404);
    expect(mockLikePost).not.toHaveBeenCalled();
    await app.close();
  });
});

// ─── DELETE /posts/:postId/like ───────────────────────────────────────────────

describe('DELETE /posts/:postId/like — retirer suit la même garde que poser', () => {
  it('refuse un tiers sur un post PRIVATE', async () => {
    const app = await buildApp(makePrisma({ post: acl('PRIVATE') }));

    const res = await app.inject({ method: 'DELETE', url: `/posts/${POST_ID}/like` });

    expect(res.statusCode).toBe(404);
    expect(mockUnlikePost).not.toHaveBeenCalled();
    await app.close();
  });

  it('admet un ami sur un post FRIENDS', async () => {
    const app = await buildApp(makePrisma({ post: acl('FRIENDS'), isFriend: true }));

    const res = await app.inject({ method: 'DELETE', url: `/posts/${POST_ID}/like` });

    expect(res.statusCode).toBe(200);
    expect(mockUnlikePost).toHaveBeenCalled();
    await app.close();
  });
});

// ─── Repost simple → redirection vers la racine (tâche 9) ────────────────────

const ROOT_ID = '507f1f77bcf86cd799439ccc';
const OTHER_REPOST_ID = '507f1f77bcf86cd799439ddd';

function repostRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: POST_ID,
    authorId: AUTHOR_ID,
    visibility: 'PUBLIC',
    visibilityUserIds: [],
    isQuote: false,
    repostOfId: ROOT_ID,
    originalRepostOfId: ROOT_ID,
    ...overrides,
  };
}

function rootRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: ROOT_ID,
    authorId: 'root-author-1',
    visibility: 'PUBLIC',
    visibilityUserIds: [],
    isQuote: false,
    repostOfId: null,
    originalRepostOfId: null,
    ...overrides,
  };
}

function makeRedirectPrisma(byId: Record<string, unknown | null>) {
  return {
    post: {
      findFirst: jest.fn<any>().mockImplementation(({ where }: { where: { id: string } }) =>
        Promise.resolve(byId[where.id] ?? null)),
      update: jest.fn<any>().mockResolvedValue({}),
      updateMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
    },
    postComment: { findFirst: jest.fn<any>().mockResolvedValue(null) },
    postImpression: { create: jest.fn<any>(), createMany: jest.fn<any>() },
    friendRequest: { findFirst: jest.fn<any>().mockResolvedValue(null) },
    communityMember: { findMany: jest.fn<any>().mockResolvedValue([]), findFirst: jest.fn<any>().mockResolvedValue(null) },
    participant: { findMany: jest.fn<any>().mockResolvedValue([]), findFirst: jest.fn<any>().mockResolvedValue(null) },
  } as any;
}

describe('POST /posts/:postId/like — repost simple redirige vers la racine', () => {
  it('aime la RACINE, pas le repost affiché — likePost reçoit l’id de la racine', async () => {
    const prisma = makeRedirectPrisma({ [POST_ID]: repostRecord(), [ROOT_ID]: rootRecord() });
    const app = await buildApp(prisma);

    const res = await app.inject({ method: 'POST', url: `/posts/${POST_ID}/like`, payload: {} });

    expect(res.statusCode).toBe(200);
    expect(mockLikePost).toHaveBeenCalledWith(ROOT_ID, USER_ID, expect.any(String));
    await app.close();
  });

  it('idempotence : liker via deux reposts distincts du MÊME original cible tous les deux la racine', async () => {
    const prisma = makeRedirectPrisma({
      [POST_ID]: repostRecord({ id: POST_ID }),
      [OTHER_REPOST_ID]: repostRecord({ id: OTHER_REPOST_ID }),
      [ROOT_ID]: rootRecord(),
    });
    const app = await buildApp(prisma);

    await app.inject({ method: 'POST', url: `/posts/${POST_ID}/like`, payload: {} });
    await app.inject({ method: 'POST', url: `/posts/${OTHER_REPOST_ID}/like`, payload: {} });

    expect(mockLikePost).toHaveBeenNthCalledWith(1, ROOT_ID, USER_ID, expect.any(String));
    expect(mockLikePost).toHaveBeenNthCalledWith(2, ROOT_ID, USER_ID, expect.any(String));
    await app.close();
  });

  it('une CITATION garde sa vie sociale propre — likePost reçoit l’id de la citation elle-même', async () => {
    const prisma = makeRedirectPrisma({
      [POST_ID]: repostRecord({ isQuote: true }),
      [ROOT_ID]: rootRecord(),
    });
    const app = await buildApp(prisma);

    const res = await app.inject({ method: 'POST', url: `/posts/${POST_ID}/like`, payload: {} });

    expect(res.statusCode).toBe(200);
    expect(mockLikePost).toHaveBeenCalledWith(POST_ID, USER_ID, expect.any(String));
    await app.close();
  });

  it('racine devenue invisible pour l’acteur → refus standard, aucun like posé (jamais un crédit silencieux)', async () => {
    const prisma = makeRedirectPrisma({
      [POST_ID]: repostRecord(),
      [ROOT_ID]: rootRecord({ visibility: 'PRIVATE' }),
    });
    const app = await buildApp(prisma);

    const res = await app.inject({ method: 'POST', url: `/posts/${POST_ID}/like`, payload: {} });

    expect(res.statusCode).toBe(404);
    expect(res.json().code).toBe('POST_NOT_FOUND');
    expect(mockLikePost).not.toHaveBeenCalled();
    await app.close();
  });

  // Review task-9, critique #1 : un repost simple SOURCÉ depuis une
  // STORY/STATUS ne redirige JAMAIS — il porte son propre instantané et
  // garde SA PROPRE vie sociale, même une fois la racine éphémère
  // soft-supprimée par `ExpiredStoriesCleanupService` (~7j après expiry).
  it('un repost sourcé depuis une STORY garde sa vie sociale propre — likePost reçoit l’id du repost, jamais celui de la story', async () => {
    const prisma = makeRedirectPrisma({
      [POST_ID]: repostRecord(),
      [ROOT_ID]: rootRecord({ type: 'STORY' }),
    });
    const app = await buildApp(prisma);

    const res = await app.inject({ method: 'POST', url: `/posts/${POST_ID}/like`, payload: {} });

    expect(res.statusCode).toBe(200);
    expect(mockLikePost).toHaveBeenCalledWith(POST_ID, USER_ID, expect.any(String));
    await app.close();
  });

  it('reste likeable une fois la racine STORY soft-supprimée — le repost n’est jamais socialement mort', async () => {
    const prisma = makeRedirectPrisma({
      [POST_ID]: repostRecord(),
      [ROOT_ID]: rootRecord({ type: 'STORY', deletedAt: new Date() }),
    });
    const app = await buildApp(prisma);

    const res = await app.inject({ method: 'POST', url: `/posts/${POST_ID}/like`, payload: {} });

    expect(res.statusCode).toBe(200);
    expect(mockLikePost).toHaveBeenCalledWith(POST_ID, USER_ID, expect.any(String));
    await app.close();
  });
});

describe('DELETE /posts/:postId/like — repost simple redirige vers la racine', () => {
  it('retire le like posé sur la RACINE — unlikePost reçoit l’id de la racine', async () => {
    const prisma = makeRedirectPrisma({ [POST_ID]: repostRecord(), [ROOT_ID]: rootRecord() });
    const app = await buildApp(prisma);

    const res = await app.inject({ method: 'DELETE', url: `/posts/${POST_ID}/like` });

    expect(res.statusCode).toBe(200);
    // Le 3e argument est l'emoji DÉSIGNÉ (2026-08-25) : `undefined` ici parce
    // que la requête n'en nomme aucun — le service retire alors la plus
    // récente. Il est nommé plutôt qu'élidé pour que la garde reste une garde :
    // un défaut fabriqué par la route ('❤️') la ferait rougir.
    expect(mockUnlikePost).toHaveBeenCalledWith(ROOT_ID, USER_ID, undefined);
    await app.close();
  });

  it('unlike via un repost retire le like posé via un AUTRE repost du même original', async () => {
    const prisma = makeRedirectPrisma({
      [POST_ID]: repostRecord({ id: POST_ID }),
      [OTHER_REPOST_ID]: repostRecord({ id: OTHER_REPOST_ID }),
      [ROOT_ID]: rootRecord(),
    });
    const app = await buildApp(prisma);

    // Liked via POST_ID's repost, unliked via a DIFFERENT repost of the same root.
    await app.inject({ method: 'DELETE', url: `/posts/${OTHER_REPOST_ID}/like` });

    expect(mockUnlikePost).toHaveBeenCalledWith(ROOT_ID, USER_ID, undefined);
    await app.close();
  });
});
