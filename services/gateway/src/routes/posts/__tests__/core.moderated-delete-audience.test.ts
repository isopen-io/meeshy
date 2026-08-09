/**
 * DELETE /posts/:postId — l'audience du retrait se déplie depuis l'AUTEUR,
 * jamais depuis celui qui appuie sur le bouton.
 *
 * `deletePost` autorise « l'auteur, OU un modérateur et plus » (PostService,
 * ligne `canModerate`). Les trois diffusions de retrait passent ensuite un
 * `authorId` à `SocialEventsHandler`, qui s'en sert pour DÉPLIER LE GRAPHE
 * SOCIAL de cette personne (`getFriendIds` / `getVisibilityFilteredRecipients`)
 * et pour ajouter sa feed room aux destinataires.
 *
 * Passer l'acteur à cette place quand il n'est pas l'auteur diffuse le retrait
 * aux amis DU MODÉRATEUR — qui n'ont pas le post — et à personne d'autre :
 * l'auteur ne l'apprend pas, ses amis non plus, et le post reste affiché dans
 * leurs fils jusqu'à un rafraîchissement manuel. Rien ne le rejoue.
 *
 * Le chemin des commentaires (`comments.ts`, DELETE .../comments/:commentId)
 * relit déjà `post.authorId` en base pour cette raison exacte.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';

const mockDeletePost = jest.fn<any>();

jest.mock('../../../services/PostService', () => ({
  PostService: jest.fn().mockImplementation(() => ({
    createPost: jest.fn(),
    getPostById: jest.fn(),
    updatePost: jest.fn(),
    deletePost: (...args: any[]) => mockDeletePost(...args),
  })),
}));

jest.mock('../../../services/posts/PostTranslationService', () => ({
  PostTranslationService: { shared: { translatePost: jest.fn(), translateOnDemand: jest.fn() } },
}));

jest.mock('../../../services/MentionService', () => ({
  resolveMentionedUsers: jest.fn<any>().mockResolvedValue([]),
  MentionService: jest.fn().mockImplementation(() => ({
    extractMentions: jest.fn<any>().mockReturnValue([]),
    resolveUsernames: jest.fn<any>().mockResolvedValue(new Map()),
    createPostMentions: jest.fn<any>().mockResolvedValue(undefined),
  })),
}));

jest.mock('../../../services/HashtagService', () => ({
  HashtagService: jest.fn().mockImplementation(() => ({
    extractHashtags: jest.fn<any>().mockReturnValue([]),
    createPostHashtags: jest.fn<any>().mockResolvedValue(undefined),
    reconcileRemovedHashtags: jest.fn<any>().mockResolvedValue(undefined),
  })),
}));

jest.mock('../../../middleware/rate-limiter', () => ({
  createPostRouteRateLimitConfig: jest.fn<any>().mockReturnValue({}),
}));

jest.mock('../../../utils/withMutationLog', () => ({
  withMutationLog: jest.fn<any>().mockImplementation(({ op }: any) => op()),
}));

jest.mock('../../../utils/sanitize.js', () => ({
  SecuritySanitizer: { sanitizeText: jest.fn((t: string) => t) },
}));

import { registerCoreRoutes } from '../core';

const POST_ID = '507f1f77bcf86cd799439011';
const AUTHOR_ID = '507f1f77bcf86cd799439031';
const MODERATOR_ID = '507f1f77bcf86cd799439032';

type SocialEventsMock = {
  broadcastPostDeleted: jest.Mock<any>;
  broadcastStoryDeleted: jest.Mock<any>;
  broadcastStatusDeleted: jest.Mock<any>;
};

async function buildApp(actorId: string): Promise<{ app: FastifyInstance; socialEvents: SocialEventsMock }> {
  const app = Fastify({ logger: false });

  const socialEvents: SocialEventsMock = {
    broadcastPostDeleted: jest.fn<any>().mockResolvedValue(undefined),
    broadcastStoryDeleted: jest.fn<any>().mockResolvedValue(undefined),
    broadcastStatusDeleted: jest.fn<any>().mockResolvedValue(undefined),
  };
  app.decorate('socialEvents', socialEvents as any);
  app.decorate('notificationService', {
    createPostMentionNotificationsBatch: jest.fn<any>().mockResolvedValue(undefined),
    createFriendContentNotificationsBatch: jest.fn<any>().mockResolvedValue(undefined),
  } as any);

  const requiredAuth = async (req: FastifyRequest) => {
    (req as any).authContext = {
      isAuthenticated: true,
      registeredUser: { id: actorId, role: actorId === AUTHOR_ID ? 'USER' : 'MODERATOR' },
    };
  };

  registerCoreRoutes(app, {} as any, requiredAuth);
  await app.ready();
  return { app, socialEvents };
}

/** Ce que Prisma rend après le soft-delete : le document complet, `authorId` compris. */
function deletedPost(type: 'POST' | 'STORY' | 'STATUS') {
  return { id: POST_ID, authorId: AUTHOR_ID, type, visibility: 'FRIENDS', visibilityUserIds: [] };
}

describe('DELETE /posts/:postId — audience du retrait modéré', () => {
  beforeEach(() => {
    mockDeletePost.mockReset();
  });

  it("diffuse le retrait d'un POST depuis le graphe de l'AUTEUR quand un modérateur le supprime", async () => {
    mockDeletePost.mockResolvedValue(deletedPost('POST'));
    const { app, socialEvents } = await buildApp(MODERATOR_ID);

    const res = await app.inject({ method: 'DELETE', url: `/posts/${POST_ID}` });

    expect(res.statusCode).toBe(200);
    expect(socialEvents.broadcastPostDeleted).toHaveBeenCalledWith(POST_ID, AUTHOR_ID);
    await app.close();
  });

  it("diffuse le retrait d'une STORY depuis le graphe de l'AUTEUR quand un modérateur la supprime", async () => {
    mockDeletePost.mockResolvedValue(deletedPost('STORY'));
    const { app, socialEvents } = await buildApp(MODERATOR_ID);

    const res = await app.inject({ method: 'DELETE', url: `/posts/${POST_ID}` });

    expect(res.statusCode).toBe(200);
    expect(socialEvents.broadcastStoryDeleted).toHaveBeenCalledWith(POST_ID, AUTHOR_ID);
    await app.close();
  });

  it("diffuse le retrait d'un STATUS depuis le graphe de l'AUTEUR quand un modérateur le supprime", async () => {
    mockDeletePost.mockResolvedValue(deletedPost('STATUS'));
    const { app, socialEvents } = await buildApp(MODERATOR_ID);

    const res = await app.inject({ method: 'DELETE', url: `/posts/${POST_ID}` });

    expect(res.statusCode).toBe(200);
    expect(socialEvents.broadcastStatusDeleted).toHaveBeenCalledWith(POST_ID, AUTHOR_ID, 'FRIENDS', []);
    await app.close();
  });

  it("garde le même identifiant quand l'auteur supprime lui-même — acteur et auteur coïncident", async () => {
    mockDeletePost.mockResolvedValue(deletedPost('POST'));
    const { app, socialEvents } = await buildApp(AUTHOR_ID);

    const res = await app.inject({ method: 'DELETE', url: `/posts/${POST_ID}` });

    expect(res.statusCode).toBe(200);
    expect(socialEvents.broadcastPostDeleted).toHaveBeenCalledWith(POST_ID, AUTHOR_ID);
    await app.close();
  });
});
