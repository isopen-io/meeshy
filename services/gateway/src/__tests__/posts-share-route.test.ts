/**
 * Route tests — POST/GET /posts/:postId/share (LOT 6 tracked share).
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

const sharePost = jest.fn<(...a: unknown[]) => Promise<{ shareCount: number } | null>>()
  .mockResolvedValue({ shareCount: 3 });
const shareWithTrackingLink = jest.fn<(...a: unknown[]) => Promise<unknown>>()
  .mockResolvedValue({ shared: true, shareCount: 4, token: 'tok123', shortUrl: 'https://meeshy.me/l/tok123', reused: false });
const getPostShareLink = jest.fn<(...a: unknown[]) => Promise<unknown>>()
  .mockResolvedValue({ token: 'tok123', shortUrl: 'https://meeshy.me/l/tok123', totalClicks: 8, uniqueClicks: 5, lastClickedAt: new Date('2026-06-14T10:00:00.000Z') });

jest.mock('../services/PostService', () => ({
  PostService: jest.fn().mockImplementation(() => ({ sharePost, shareWithTrackingLink, getPostShareLink })),
}));
jest.mock('../services/MediaService', () => ({ MediaService: jest.fn().mockImplementation(() => ({})) }));
jest.mock('../middleware/rate-limiter', () => ({ createPostRouteRateLimitConfig: jest.fn().mockReturnValue({}) }));
jest.mock('../utils/withMutationLog', () => ({ withMutationLog: jest.fn().mockImplementation(({ op }: any) => op()) }));
jest.mock('../services/MentionService', () => ({ resolveMentionedUsers: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([]) }));

const POST_ID = '507f1f77bcf86cd799439011';

const auth = (req: any, _reply: unknown, done: () => void) => {
  req.authContext = { isAuthenticated: true, registeredUser: { id: 'u1', username: 'u' } };
  done();
};
const noAuth = (_req: any, _reply: unknown, done: () => void) => done();

async function buildApp(authed: boolean): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  const prisma = {} as unknown as PrismaClient;
  const mw = authed ? auth : noAuth;
  const { registerInteractionRoutes } = await import('../routes/posts/interactions');
  app.register(async (instance) => {
    instance.addHook('preValidation', mw as any);
    registerInteractionRoutes(instance, prisma, mw);
  });
  await app.ready();
  return app;
}

describe('POST /posts/:postId/share', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(true); });
  afterAll(async () => { await app.close(); });

  it('plain share (no link) increments via sharePost', async () => {
    const res = await app.inject({ method: 'POST', url: `/posts/${POST_ID}/share`, payload: {} });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toMatchObject({ shared: true, shareCount: 3 });
    expect(res.json().data.token).toBeUndefined();
    expect(sharePost).toHaveBeenCalled();
  });

  it('tracked share (generateLink) returns token + shortUrl via shareWithTrackingLink', async () => {
    const res = await app.inject({ method: 'POST', url: `/posts/${POST_ID}/share`, payload: { generateLink: true } });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toMatchObject({
      shared: true, shareCount: 4, token: 'tok123', shortUrl: 'https://meeshy.me/l/tok123',
    });
    expect(shareWithTrackingLink).toHaveBeenCalled();
  });

  it('returns 404 when the tracked share targets a missing post', async () => {
    shareWithTrackingLink.mockResolvedValueOnce(null);
    const res = await app.inject({ method: 'POST', url: `/posts/${POST_ID}/share`, payload: { generateLink: true } });
    expect(res.statusCode).toBe(404);
  });
});

describe('GET /posts/:postId/share', () => {
  let app: FastifyInstance;
  let unauthApp: FastifyInstance;
  beforeAll(async () => { app = await buildApp(true); unauthApp = await buildApp(false); });
  afterAll(async () => { await app.close(); await unauthApp.close(); });

  it('returns the caller share-link analytics', async () => {
    const res = await app.inject({ method: 'GET', url: `/posts/${POST_ID}/share` });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toMatchObject({ token: 'tok123', totalClicks: 8, uniqueClicks: 5 });
  });

  it('returns null data when the caller has no share link', async () => {
    getPostShareLink.mockResolvedValueOnce(null);
    const res = await app.inject({ method: 'GET', url: `/posts/${POST_ID}/share` });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toBeNull();
  });

  it('rejects unauthenticated requests with 401', async () => {
    const res = await unauthApp.inject({ method: 'GET', url: `/posts/${POST_ID}/share` });
    expect(res.statusCode).toBe(401);
  });
});
