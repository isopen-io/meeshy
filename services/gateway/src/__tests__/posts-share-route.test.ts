/**
 * Route tests — POST /posts/:postId/share (LOT 6 tracked share).
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
jest.mock('../utils/withMutationLog', () => ({
  // Le module réel est ÉTALÉ d'abord : `MutationResultGone` est une CLASSE
  // dont les routes font `instanceof`, et `withMutationOutcome` est le
  // chemin réel du repost. Une usine qui ne rendait que `withMutationLog`
  // les laissait à `undefined` — `instanceof undefined` lève un TypeError
  // qui se déguise en 500 sur des chemins d'erreur sans rapport.
  ...(jest.requireActual('../utils/withMutationLog') as object), withMutationLog: jest.fn().mockImplementation(({ op }: any) => op()) }));
jest.mock('../services/MentionService', () => ({ resolveMentionedUsers: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([]) }));

const POST_ID = '507f1f77bcf86cd799439011';

const auth = (req: any, _reply: unknown, done: () => void) => {
  req.authContext = { isAuthenticated: true, registeredUser: { id: 'u1', username: 'u' } };
  done();
};
const noAuth = (_req: any, _reply: unknown, done: () => void) => done();

async function buildApp(authed: boolean): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  // #4146 — le partage verifie l'audience du post avant de frapper le lien
  // trace : `loadPostAcl` lit `post.findFirst`. Le double rend un post PUBLIC,
  // donc les trois cas mesures ici restent ceux d'avant la garde ; le refus
  // hors audience a son temoin dans
  // `unit/routes/posts/interactions-consumption-audience.test.ts`.
  const prisma = {
    post: {
      findFirst: (args: { where: { id: string } }) => Promise.resolve({
        id: args.where.id,
        authorId: 'author-1',
        visibility: 'PUBLIC',
        visibilityUserIds: [] as string[],
        expiresAt: null,
      }),
    },
  } as unknown as PrismaClient;
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
