/**
 * DELETE /admin/posts/:postId — un retrait décidé depuis la console doit se voir
 * en temps réel, comme celui décidé depuis l'app.
 *
 * Cette route écrit `deletedAt` SANS passer par `PostService.deletePost`. Le
 * commentaire qui vit dans la route dit déjà ce que ce raccourci a coûté une
 * fois (les usages de sons, jamais libérés). Le même raccourci laissait tomber
 * la diffusion : `post:deleted` / `story:deleted` / `status:deleted` ne
 * partaient JAMAIS depuis l'admin.
 *
 * Rien ne rejoue ces événements et aucun client ne refetch spontanément : un
 * post retiré par un modérateur restait affiché dans le fil de tous ses
 * lecteurs — auteur compris — jusqu'à un rafraîchissement manuel. Le retrait
 * était committé en base et invisible partout.
 *
 * `socialEvents` n'est décoré qu'une fois le serveur Socket.IO monté
 * (`server.ts`) : une instance sans lui doit continuer à supprimer sans broncher.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

import { adminPostRoutes } from '../posts';

const POST_ID = '507f1f77bcf86cd799439011';
const AUTHOR_ID = '507f1f77bcf86cd799439031';
const ADMIN_ID = '507f1f77bcf86cd799439032';

const postFindUnique = jest.fn<any>();
const postUpdate = jest.fn<any>();
const soundUsageDeleteMany = jest.fn<any>().mockResolvedValue({ count: 0 });
const soundUpdate = jest.fn<any>().mockResolvedValue({});
const soundUsageFindMany = jest.fn<any>().mockResolvedValue([]);

const mockPrisma = {
  post: { findUnique: postFindUnique, update: postUpdate },
  soundUsage: { deleteMany: soundUsageDeleteMany, findMany: soundUsageFindMany },
  sound: { update: soundUpdate },
} as any;

type SocialEventsMock = {
  broadcastPostDeleted: jest.Mock<any>;
  broadcastStoryDeleted: jest.Mock<any>;
  broadcastStatusDeleted: jest.Mock<any>;
};

function makeSocialEvents(): SocialEventsMock {
  return {
    broadcastPostDeleted: jest.fn<any>().mockResolvedValue(undefined),
    broadcastStoryDeleted: jest.fn<any>().mockResolvedValue(undefined),
    broadcastStatusDeleted: jest.fn<any>().mockResolvedValue(undefined),
  };
}

async function buildApp(socialEvents?: SocialEventsMock): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate('prisma', mockPrisma);
  app.decorate('authenticate', async (request: any) => {
    request.authContext = {
      isAuthenticated: true,
      registeredUser: { id: ADMIN_ID, role: 'ADMIN' },
    };
  });
  if (socialEvents) app.decorate('socialEvents', socialEvents as any);
  app.register(adminPostRoutes);
  await app.ready();
  return app;
}

/** Le document tel que le lit la route avant d'écrire `deletedAt`. */
function livePost(type: 'POST' | 'STORY' | 'STATUS', visibility = 'FRIENDS') {
  return {
    id: POST_ID,
    authorId: AUTHOR_ID,
    type,
    visibility,
    visibilityUserIds: [],
    deletedAt: null,
  };
}

const deleteInject = (app: FastifyInstance) =>
  app.inject({
    method: 'DELETE',
    url: `/posts/${POST_ID}`,
    headers: { 'content-type': 'application/json' },
    payload: { reason: 'Spam' },
  });

describe('DELETE /admin/posts/:postId — diffusion du retrait', () => {
  beforeEach(() => {
    postFindUnique.mockReset();
    postUpdate.mockReset().mockResolvedValue({ id: POST_ID });
  });

  it("annonce le retrait d'un POST au graphe de son AUTEUR, pas à celui de l'admin", async () => {
    postFindUnique.mockResolvedValue(livePost('POST'));
    const socialEvents = makeSocialEvents();
    const app = await buildApp(socialEvents);

    const res = await deleteInject(app);

    expect(res.statusCode).toBe(200);
    expect(socialEvents.broadcastPostDeleted).toHaveBeenCalledWith(POST_ID, AUTHOR_ID);
    await app.close();
  });

  it("annonce le retrait d'une STORY sur son propre événement", async () => {
    postFindUnique.mockResolvedValue(livePost('STORY'));
    const socialEvents = makeSocialEvents();
    const app = await buildApp(socialEvents);

    const res = await deleteInject(app);

    expect(res.statusCode).toBe(200);
    expect(socialEvents.broadcastStoryDeleted).toHaveBeenCalledWith(POST_ID, AUTHOR_ID);
    expect(socialEvents.broadcastPostDeleted).not.toHaveBeenCalled();
    await app.close();
  });

  it("annonce le retrait d'un STATUS avec l'audience du post, sans quoi la diffusion l'élargirait", async () => {
    postFindUnique.mockResolvedValue({ ...livePost('STATUS', 'ONLY'), visibilityUserIds: [AUTHOR_ID] });
    const socialEvents = makeSocialEvents();
    const app = await buildApp(socialEvents);

    const res = await deleteInject(app);

    expect(res.statusCode).toBe(200);
    expect(socialEvents.broadcastStatusDeleted).toHaveBeenCalledWith(POST_ID, AUTHOR_ID, 'ONLY', [AUTHOR_ID]);
    await app.close();
  });

  it('supprime sans broncher quand aucun serveur temps réel n\'est monté', async () => {
    postFindUnique.mockResolvedValue(livePost('POST'));
    const app = await buildApp();

    const res = await deleteInject(app);

    expect(res.statusCode).toBe(200);
    expect(postUpdate).toHaveBeenCalled();
    await app.close();
  });
});
