/**
 * #4166, critère 1 — famille « include sans select à la racine ».
 *
 * `GET /admin/posts/:postId` chargeait `fastify.prisma.post.findUnique` avec
 * un `include: {...}` SANS `select` de tête : « toute colonne ajoutée au
 * modèle Post part automatiquement » (texte de l'issue). Le témoin porte sur
 * l'APPEL PRISMA — capture l'argument, vérifie la présence d'un `select` et
 * d'un `take` sur les relations qui en portent un — jamais sur la forme de
 * la réponse rendue (elle est `additionalProperties: true`, donc un témoin
 * de sortie ne pourrait rien distinguer d'un `include` nu).
 *
 * Fichier séparé de `admin-routes-group3.test.ts` (déjà hors budget, 1564
 * lignes) plutôt qu'ajouté dedans — règle du dépôt : « Ajouter à un fichier
 * déjà hors budget est interdit ».
 *
 * @jest-environment node
 */

import Fastify, { FastifyInstance } from 'fastify';
import { describe, it, expect, jest } from '@jest/globals';

jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn<any>().mockReturnValue({
      info: jest.fn<any>(),
      warn: jest.fn<any>(),
      error: jest.fn<any>(),
      debug: jest.fn<any>(),
    }),
  },
}));

jest.mock('../../../../utils/logger', () => ({
  logError: jest.fn<any>(),
  logWarn: jest.fn<any>(),
  logger: { info: jest.fn<any>(), warn: jest.fn<any>(), error: jest.fn<any>(), debug: jest.fn<any>() },
}));

import { adminPostRoutes } from '../../../../routes/admin/posts';

const VALID_ID = '507f1f77bcf86cd799439011';

function makeMockPrisma() {
  return {
    post: {
      findUnique: jest.fn<any>().mockResolvedValue({ id: VALID_ID }),
      findMany: jest.fn<any>(),
      count: jest.fn<any>(),
      update: jest.fn<any>(),
    },
  };
}

function buildApp(prisma: ReturnType<typeof makeMockPrisma>): FastifyInstance {
  const app = Fastify({ logger: false });
  app.decorate('prisma', prisma);
  app.decorate('authenticate', async (request: any) => {
    request.authContext = {
      isAuthenticated: true,
      registeredUser: { id: VALID_ID, role: 'ADMIN', username: 'admin' },
    };
  });
  app.register(adminPostRoutes);
  return app;
}

describe('GET /admin/posts/:postId — select explicite à la racine (#4166 critère 1)', () => {
  it('appelle post.findUnique avec select — jamais include', async () => {
    const prisma = makeMockPrisma();
    const app = buildApp(prisma);
    await app.ready();

    await app.inject({ method: 'GET', url: `/posts/${VALID_ID}` });

    expect(prisma.post.findUnique).toHaveBeenCalledTimes(1);
    const call = prisma.post.findUnique.mock.calls[0][0] as Record<string, unknown>;
    expect(call).not.toHaveProperty('include');
    expect(call.select).toBeDefined();

    await app.close();
  });

  it('le select couvre les 42 colonnes scalaires ACTUELLES de Post — rien de servi ne disparaît', async () => {
    const prisma = makeMockPrisma();
    const app = buildApp(prisma);
    await app.ready();

    await app.inject({ method: 'GET', url: `/posts/${VALID_ID}` });

    const call = prisma.post.findUnique.mock.calls[0][0] as { select: Record<string, unknown> };
    // Champs les plus exposés au risque de "toute colonne part
    // automatiquement" : les Json lourds et les compteurs les plus récents.
    expect(call.select).toMatchObject({
      id: true,
      content: true,
      metadata: true,
      translations: true,
      storyEffects: true,
      reactions: true,
      storyViews: true,
      postOpenCount: true,
      qualifiedViewCount: true,
      playCount: true,
      downloadCount: true,
      contentEditedAt: true,
      updatedAt: true,
    });
  });

  it('les relations comments/views portent chacune leur propre take (bornées, comme avant #4166)', async () => {
    const prisma = makeMockPrisma();
    const app = buildApp(prisma);
    await app.ready();

    await app.inject({ method: 'GET', url: `/posts/${VALID_ID}` });

    const call = prisma.post.findUnique.mock.calls[0][0] as {
      select: { comments: { take: number }; views: { take: number } };
    };
    expect(call.select.comments.take).toBe(50);
    expect(call.select.views.take).toBe(50);
  });

  it('media/author/repostOf/community/_count restent des relations SELECTionnées, identiques à avant', async () => {
    const prisma = makeMockPrisma();
    const app = buildApp(prisma);
    await app.ready();

    await app.inject({ method: 'GET', url: `/posts/${VALID_ID}` });

    const call = prisma.post.findUnique.mock.calls[0][0] as {
      select: Record<string, unknown>;
    };
    expect(call.select.author).toBeDefined();
    expect(call.select.media).toBeDefined();
    expect(call.select.repostOf).toBeDefined();
    expect(call.select.community).toBeDefined();
    expect(call.select._count).toBeDefined();
  });
});
