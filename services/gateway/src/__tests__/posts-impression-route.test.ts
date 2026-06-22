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
  withMutationLog: jest.fn().mockImplementation(({ op }: any) => op()),
}));

jest.mock('../services/MentionService', () => ({
  resolveMentionedUsers: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([]),
}));

const POST_ID = '507f1f77bcf86cd799439011';

const impressionCreate = jest.fn<(...args: unknown[]) => Promise<unknown>>().mockResolvedValue({});
const postUpdate = jest.fn<(...args: unknown[]) => Promise<unknown>>().mockResolvedValue({});

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
    post: { update: postUpdate },
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
    });
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
    });
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
