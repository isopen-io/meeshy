/**
 * Route tests — POST /posts/:postId/downloads
 *
 * Contrat HTTP du batch de téléchargement. La logique métier (ACL, dédup,
 * filtrage, compteurs) est testée au niveau service dans
 * posts-media-download-service.test.ts ; ici on ne vérifie que le câblage :
 * validation d'entrée, codes de statut, et la traduction `null` → 404.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

const recordMediaDownloads = jest.fn<(...a: unknown[]) => Promise<unknown>>();

jest.mock('../services/PostService', () => ({
  PostService: jest.fn().mockImplementation(() => ({ recordMediaDownloads })),
}));

jest.mock('../services/MediaService', () => ({
  MediaService: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../services/TrackingLinkService', () => ({
  TrackingLinkService: jest.fn().mockImplementation(() => ({})),
  resolveFrontendBaseUrl: jest.fn<() => string>().mockReturnValue('https://meeshy.me'),
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
const MEDIA_A = '507f1f77bcf86cd799439021';

const buildAuthMiddleware = (userId?: string) =>
  (req: any, _reply: unknown, done: () => void) => {
    if (userId) {
      req.authContext = {
        isAuthenticated: true,
        registeredUser: { id: userId, username: 'tester', role: 'USER' },
      };
    }
    done();
  };

async function buildApp(authenticated: boolean): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  // #4150 — la route DÉLÈGUE au point d'ingestion, qui réduit les ids par
  // AUDIENCE avant toute écriture. Ce double n'était qu'un `{}` : la route
  // n'avait alors aucune ACL à consulter, ce qui est exactement le défaut que
  // ce lot ferme. Il rend un post PUBLIC par id demandé — l'audience elle-même
  // a ses témoins dédiés (`unit/routes/social/events.test.ts`).
  const prisma = {
    post: {
      findMany: jest.fn<any>().mockImplementation(({ where }: any) =>
        Promise.resolve(where?.repostOfId !== undefined
          ? []
          : ((where?.id?.in ?? []) as string[]).map((id) => ({
              id, authorId: 'author-1', visibility: 'PUBLIC',
              visibilityUserIds: [] as string[], expiresAt: null,
            })))),
      updateMany: jest.fn<any>().mockResolvedValue({ count: 1 }),
    },
    postImpression: { createMany: jest.fn<any>().mockResolvedValue({ count: 1 }) },
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

describe('POST /posts/:postId/downloads', () => {
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
    recordMediaDownloads.mockReset().mockResolvedValue({ recorded: 1 });
  });

  it('enregistre le batch et renvoie le compte écrit', async () => {
    const res = await authApp.inject({
      method: 'POST',
      url: `/posts/${POST_ID}/downloads`,
      payload: { mediaIds: [MEDIA_A], surface: 'detail' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.recorded).toBe(1);
    expect(recordMediaDownloads).toHaveBeenCalledWith(POST_ID, 'u1', {
      mediaIds: [MEDIA_A],
      surface: 'detail',
    });
  });

  it("applique la surface 'detail' par défaut", async () => {
    const res = await authApp.inject({
      method: 'POST',
      url: `/posts/${POST_ID}/downloads`,
      payload: { mediaIds: [MEDIA_A] },
    });

    expect(res.statusCode).toBe(200);
    expect(recordMediaDownloads).toHaveBeenCalledWith(POST_ID, 'u1', {
      mediaIds: [MEDIA_A],
      surface: 'detail',
    });
  });

  it('traduit un poste introuvable ou invisible en 404', async () => {
    recordMediaDownloads.mockResolvedValue(null);
    const res = await authApp.inject({
      method: 'POST',
      url: `/posts/${POST_ID}/downloads`,
      payload: { mediaIds: [MEDIA_A] },
    });

    expect(res.statusCode).toBe(404);
    // `sendError` produit une enveloppe PLATE : { success, error, message, code }.
    // Le `code` est à la racine, pas sous `error` — ce dernier est la string
    // lisible. Ne pas « corriger » en error.code : ce serait suivre la doc du
    // CLAUDE.md gateway, qui diverge de l'implémentation réelle du helper.
    expect(res.json().code).toBe('POST_NOT_FOUND');
  });

  it('rejette un mediaIds vide avec 400', async () => {
    const res = await authApp.inject({
      method: 'POST',
      url: `/posts/${POST_ID}/downloads`,
      payload: { mediaIds: [] },
    });

    expect(res.statusCode).toBe(400);
    expect(recordMediaDownloads).not.toHaveBeenCalled();
  });

  it('rejette plus de 50 mediaIds avec 400', async () => {
    const res = await authApp.inject({
      method: 'POST',
      url: `/posts/${POST_ID}/downloads`,
      payload: { mediaIds: Array.from({ length: 51 }, () => MEDIA_A) },
    });

    expect(res.statusCode).toBe(400);
    expect(recordMediaDownloads).not.toHaveBeenCalled();
  });

  it('rejette une surface inconnue avec 400', async () => {
    const res = await authApp.inject({
      method: 'POST',
      url: `/posts/${POST_ID}/downloads`,
      payload: { mediaIds: [MEDIA_A], surface: 'bogus' },
    });

    expect(res.statusCode).toBe(400);
    expect(recordMediaDownloads).not.toHaveBeenCalled();
  });

  it('rejette une requête non authentifiée avec 401', async () => {
    const res = await unauthApp.inject({
      method: 'POST',
      url: `/posts/${POST_ID}/downloads`,
      payload: { mediaIds: [MEDIA_A] },
    });

    expect(res.statusCode).toBe(401);
    expect(recordMediaDownloads).not.toHaveBeenCalled();
  });
});
