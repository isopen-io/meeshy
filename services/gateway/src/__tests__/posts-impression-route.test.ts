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

const impressionCreate = jest.fn<(...args: unknown[]) => Promise<unknown>>().mockResolvedValue({});
const postUpdate = jest.fn<(...args: unknown[]) => Promise<unknown>>().mockResolvedValue({});
// Espion inutilisé côté implémentation : `findUnique` ne doit PLUS être
// appelé sur ce chemin chaud. La résolution repostOfId/originalRepostOfId
// (chantier reposts cohérents, tâche 1) est repliée dans le `select` de
// `update` — garder ce spy prouve l'absence de lecture séparée plutôt que
// de simplement l'omettre (Important #2, revue chantier reposts).
const postFindUnique = jest.fn<(...args: unknown[]) => Promise<unknown>>();

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
    postImpression: { create: impressionCreate },
    // #4146 — la route consulte l'audience du post AVANT de compter une
    // impression : `loadPostAcl` lit `post.findFirst`. Le double rend un post
    // PUBLIC, donc tout ce que ce fichier mesure (comptage par source, absence
    // de dedup, absence de lecture dediee) reste ce qu'il mesurait ; le refus
    // hors audience a son temoin dans
    // `unit/routes/posts/interactions-consumption-audience.test.ts`.
    post: {
      update: postUpdate,
      findUnique: postFindUnique,
      findFirst: (args: { where: { id: string } }) => Promise.resolve({
        id: args.where.id,
        authorId: 'author-1',
        visibility: 'PUBLIC',
        visibilityUserIds: [] as string[],
        expiresAt: null,
      }),
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
    impressionCreate.mockClear();
    postUpdate.mockClear();
    postFindUnique.mockClear();
  });

  it('source "detail" = +1 impression AND +1 total view (postOpenCount), immediately', async () => {
    const res = await authApp.inject({
      method: 'POST',
      url: `/posts/${POST_ID}/impression`,
      payload: { source: 'detail' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.recorded).toBe(true);
    expect(impressionCreate).toHaveBeenCalledWith({
      data: { postId: POST_ID, userId: 'u1', source: 'detail' },
    });
    expect(postUpdate).toHaveBeenCalledWith({
      where: { id: POST_ID },
      data: { impressionCount: { increment: 1 }, postOpenCount: { increment: 1 } },
      select: { repostOfId: true, originalRepostOfId: true },
    });
    // Réduction de requêtes : la résolution repostOfId/originalRepostOfId
    // est repliée dans le `select` de `update` ci-dessus — plus de lecture
    // dédiée avant l'écriture (Important #2, revue chantier reposts).
    expect(postFindUnique).not.toHaveBeenCalled();
  });

  it('source "feed" increments ONLY impressionCount (no total view on a feed appearance)', async () => {
    const res = await authApp.inject({
      method: 'POST',
      url: `/posts/${POST_ID}/impression`,
      payload: { source: 'feed' },
    });
    expect(res.statusCode).toBe(200);
    expect(postUpdate).toHaveBeenCalledWith({
      where: { id: POST_ID },
      data: { impressionCount: { increment: 1 } },
      select: { repostOfId: true, originalRepostOfId: true },
    });
    expect(postFindUnique).not.toHaveBeenCalled();
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
    expect(impressionCreate).toHaveBeenCalledTimes(3);
    expect(postUpdate).toHaveBeenCalledTimes(3);
    expect(postFindUnique).not.toHaveBeenCalled();
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
