/**
 * Route tests — POST /posts/engagement/batch
 *
 * Auth requise, validation Zod, délégation à PostService.recordEngagementBatch.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

const recordEngagementBatch = jest.fn<(...args: unknown[]) => Promise<number>>().mockResolvedValue(1);

jest.mock('../services/PostService', () => ({
  PostService: jest.fn().mockImplementation(() => ({ recordEngagementBatch })),
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

const SESSION = {
  sessionId: '11111111-1111-1111-1111-111111111111',
  userId: 'u1',
  postId: '507f1f77bcf86cd799439011',
  contentType: 'POST',
  surface: 'detail',
  startedAt: '2026-06-14T00:00:00.000Z',
  dwellMs: 4000,
  completed: false,
  truncated: false,
  actions: [],
  watchSamples: [],
};

const buildAuthMiddleware = (userId?: string) =>
  (req: any, _reply: unknown, done: () => void) => {
    if (userId) {
      req.authContext = { isAuthenticated: true, registeredUser: { id: userId, username: 'tester' } };
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

describe('POST /posts/engagement/batch', () => {
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

  it('returns recorded count for a valid batch', async () => {
    recordEngagementBatch.mockResolvedValueOnce(1);
    const res = await authApp.inject({
      method: 'POST',
      url: '/posts/engagement/batch',
      payload: { sessions: [SESSION] },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.recorded).toBe(1);
    expect(recordEngagementBatch).toHaveBeenCalled();
    // userId comes from auth context, not the request body
    expect(recordEngagementBatch.mock.calls[0][1]).toBe('u1');
  });

  it('rejects an unauthenticated request with 401', async () => {
    const res = await unauthApp.inject({
      method: 'POST',
      url: '/posts/engagement/batch',
      payload: { sessions: [SESSION] },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().success).toBe(false);
  });

  it('rejects an invalid batch (empty sessions) with 400', async () => {
    const res = await authApp.inject({
      method: 'POST',
      url: '/posts/engagement/batch',
      payload: { sessions: [] },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().success).toBe(false);
  });

  it('rejects a malformed session (bad postId) with 400', async () => {
    const res = await authApp.inject({
      method: 'POST',
      url: '/posts/engagement/batch',
      payload: { sessions: [{ ...SESSION, postId: 'not-an-objectid' }] },
    });
    expect(res.statusCode).toBe(400);
  });
});
