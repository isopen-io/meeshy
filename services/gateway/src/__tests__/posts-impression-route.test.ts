/**
 * Route tests — POST /posts/:postId/impression
 *
 * Une impression est comptée à CHAQUE appel (jamais dédupliquée) : le modèle
 * PostImpression n'a pas de contrainte unique (postId, userId), donc ouvrir le
 * Détail d'un post N fois → impressionCount += N. La source 'detail' (ajoutée
 * pour le comptage immédiat à l'ouverture du Détail) doit être acceptée.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

jest.mock('../services/PostService', () => ({
  PostService: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../services/MediaService', () => ({
  MediaService: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../services/TrackingLinkService', () => ({
  TrackingLinkService: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../middleware/rate-limiter', () => ({
  createPostRouteRateLimitConfig: jest.fn<() => Record<string, unknown>>().mockReturnValue({}),
}));

jest.mock('../utils/withMutationLog', () => ({
  // Le module réel est ÉTALÉ d'abord : `MutationResultGone` est une CLASSE
  // dont les routes font `instanceof`, et `withMutationOutcome` est le
  // chemin réel du repost. Une usine qui ne rendait que `withMutationLog`
  // les laissait à `undefined` — `instanceof undefined` lève un TypeError
  // qui se déguise en 500 sur des chemins d'erreur sans rapport.
  ...(jest.requireActual('../utils/withMutationLog') as object),
  withMutationLog: jest.fn().mockImplementation(({ op }: any) => op()),
}));

jest.mock('../services/MentionService', () => ({
  resolveMentionedUsers: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([]),
}));

const POST_ID = '507f1f77bcf86cd799439011';

const impressionCreateMany = jest.fn<(...args: unknown[]) => Promise<unknown>>().mockResolvedValue({ count: 1 });
const postUpdateMany = jest.fn<(...args: unknown[]) => Promise<unknown>>().mockResolvedValue({ count: 1 });
// Espion inutilisé côté implémentation : `findUnique` ne doit PLUS être appelé
// sur ce chemin chaud — garder ce spy prouve l'ABSENCE d'une lecture par post
// plutôt que de simplement l'omettre.
const postFindUnique = jest.fn<(...args: unknown[]) => Promise<unknown>>();

/**
 * #4150 — cette route est désormais un ALIAS de `POST /social/events`, et sa
 * forme de requête a convergé vers celle du LOT.
 *
 * Ce que ce fichier mesurait — une impression par appel, jamais dédupliquée,
 * `detail` comptant en plus une ouverture — est INCHANGÉ. Ce qui change est la
 * FORME des requêtes, et le changement n'est pas cosmétique :
 *
 *  - `create` → `createMany` : le point d'ingestion écrit N occurrences d'un
 *    coup, et N vaut 1 ici. Une ligne, les mêmes champs.
 *  - `update` (+ `select`) → `findMany` puis `updateMany` : l'ancienne route
 *    repliait la résolution des racines de repost dans le `select` de son
 *    `update`, ce qui coûtait ZÉRO lecture — une optimisation qui n'existe QUE
 *    pour un id unique. `updateMany` ne rend aucune ligne, donc le lot résout
 *    ses racines par une lecture BORNÉE PAR LOT.
 *
 * L'invariant de coût est donc réénoncé, pas abandonné : **la résolution des
 * racines est UNE requête pour tout le lot, jamais une par post.** C'est cette
 * propriété-là qui protège le chemin chaud à l'échelle ; « zéro requête pour un
 * post » était un artefact de cardinalité 1, et le prix d'une lecture bornée
 * est ce que coûte la fin de la réimplémentation parallèle (critère 6).
 */
const postFindMany = jest.fn<(...args: any[]) => Promise<unknown>>()
  .mockImplementation(({ where, select }: any) => {
    // Passe de résolution des racines de repost — aucun repost dans ce fichier.
    if (where?.repostOfId !== undefined) return Promise.resolve([]);
    // Passe d'AUDIENCE : le double rend un post PUBLIC par id demandé, donc
    // tout ce que ce fichier mesure reste ce qu'il mesurait ; le refus hors
    // audience a son témoin dans
    // `unit/routes/posts/interactions-consumption-audience.test.ts`.
    void select;
    return Promise.resolve(((where?.id?.in ?? []) as string[]).map((id) => ({
      id, authorId: 'author-1', visibility: 'PUBLIC', visibilityUserIds: [] as string[], expiresAt: null,
    })));
  });

/** Les appels de `post.findMany` qui résolvent les RACINES de repost. */
const passesRacines = () =>
  postFindMany.mock.calls.filter(([args]: any[]) => args?.where?.repostOfId !== undefined);

const buildAuthMiddleware = (userId?: string) =>
  (req: any, _reply: unknown, done: () => void) => {
    if (userId) {
      req.authContext = { isAuthenticated: true, registeredUser: { id: userId, username: 'tester' } };
    }
    done();
  };

async function buildApp(authenticated: boolean): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  const prisma = {
    postImpression: { createMany: impressionCreateMany },
    // #4146 puis #4150 — la route consulte l'audience du post AVANT de compter
    // une impression, désormais par la passe de LOT (`post.findMany`).
    post: {
      updateMany: postUpdateMany,
      findUnique: postFindUnique,
      findMany: postFindMany,
    },
  } as unknown as PrismaClient;
  const requiredAuth = buildAuthMiddleware(authenticated ? 'u1' : undefined);
  const { registerInteractionRoutes } = await import('../routes/posts/interactions');
  app.register(async (instance) => {
    instance.addHook('preValidation', requiredAuth as any);
    registerInteractionRoutes(instance, prisma, requiredAuth);
  });
  await app.ready();
  return app;
}

describe('POST /posts/:postId/impression', () => {
  let authApp: FastifyInstance;
  let unauthApp: FastifyInstance;

  beforeAll(async () => {
    authApp = await buildApp(true);
    unauthApp = await buildApp(false);
  });

  afterAll(async () => {
    await authApp.close();
    await unauthApp.close();
  });

  beforeEach(() => {
    impressionCreateMany.mockClear();
    postUpdateMany.mockClear();
    postFindUnique.mockClear();
    postFindMany.mockClear();
  });

  it('source "detail" = +1 impression AND +1 total view (postOpenCount), immediately', async () => {
    const res = await authApp.inject({
      method: 'POST',
      url: `/posts/${POST_ID}/impression`,
      payload: { source: 'detail' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.recorded).toBe(true);
    expect(impressionCreateMany).toHaveBeenCalledWith({
      data: [{ postId: POST_ID, userId: 'u1', source: 'detail' }],
    });
    expect(postUpdateMany).toHaveBeenCalledWith({
      where: { id: { in: [POST_ID] } },
      data: { impressionCount: { increment: 1 } },
    });
    expect(postUpdateMany).toHaveBeenCalledWith({
      where: { id: { in: [POST_ID] } },
      data: { postOpenCount: { increment: 1 } },
    });
    // L'invariant de coût réénoncé : aucune lecture PAR POST, et une seule
    // résolution de racines pour tout le lot.
    expect(postFindUnique).not.toHaveBeenCalled();
    expect(passesRacines()).toHaveLength(1);
  });

  it('source "feed" increments ONLY impressionCount (no total view on a feed appearance)', async () => {
    const res = await authApp.inject({
      method: 'POST',
      url: `/posts/${POST_ID}/impression`,
      payload: { source: 'feed' },
    });
    expect(res.statusCode).toBe(200);
    expect(postUpdateMany).toHaveBeenCalledWith({
      where: { id: { in: [POST_ID] } },
      data: { impressionCount: { increment: 1 } },
    });
    // Une apparition de fil ne compte AUCUNE ouverture — un seul `updateMany`.
    expect(postUpdateMany).toHaveBeenCalledTimes(1);
    expect(postFindUnique).not.toHaveBeenCalled();
    expect(passesRacines()).toHaveLength(1);
  });

  it('counts EVERY open with no dedup (N opens → N impressions)', async () => {
    for (let i = 0; i < 3; i++) {
      const res = await authApp.inject({
        method: 'POST',
        url: `/posts/${POST_ID}/impression`,
        payload: { source: 'detail' },
      });
      expect(res.statusCode).toBe(200);
    }
    expect(impressionCreateMany).toHaveBeenCalledTimes(3);
    expect(postUpdateMany).toHaveBeenCalledTimes(6); // 3 appels × (impression + ouverture)
    expect(postFindUnique).not.toHaveBeenCalled();
    // Trois appels ⇒ trois lots ⇒ trois résolutions : une PAR LOT, jamais par post.
    expect(passesRacines()).toHaveLength(3);
  });

  it('rejects an unknown source with 400', async () => {
    const res = await unauthApp.inject({
      method: 'POST',
      url: `/posts/${POST_ID}/impression`,
      payload: { source: 'bogus' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects an unauthenticated request with 401', async () => {
    const res = await unauthApp.inject({
      method: 'POST',
      url: `/posts/${POST_ID}/impression`,
      payload: { source: 'detail' },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().success).toBe(false);
  });
});
