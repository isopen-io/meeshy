/**
 * #19368 — `GET /users/:userId/stats` compte les publications pour CE lecteur,
 * avec la même loi que `?expand=stats` de la fiche : l'audience des listes
 * (`viewerPostAudience`). Soi garde le total.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

// Le `CacheStore` partagé n'est pas monté ici : chaque témoin relit l'audience (#19368).
jest.mock('../../../../services/CacheStore', () => ({ getCacheStore: () => undefined }));

jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn() }) },
}));
jest.mock('../../../../middleware/rate-limiter', () => ({ createDirectoryRouteRateLimitConfig: () => false }));
jest.mock('../../../../services/posts/feedVisibility', () => ({
  viewerPostAudience: jest.fn(async () => ({ visibility: 'PUBLIC' })),
}));

import { getUserStats } from '../../../../routes/users/preferences';
import { viewerPostAudience } from '../../../../services/posts/feedVisibility';
import { matchesPostWhere } from '../../../helpers/where-matcher-posts';

const PROPRIETAIRE = '507f1f77bcf86cd799439011';
const TIERS = '507f1f77bcf86cd799439022';
const publication = (id: string, type: string, visibility: string) => ({
  id, authorId: PROPRIETAIRE, type, visibility, visibilityUserIds: [], communityId: null, expiresAt: null,
});
const PUBLICATIONS = [
  publication('p1', 'POST', 'PUBLIC'),
  publication('p2', 'POST', 'FRIENDS'),
  publication('p3', 'POST', 'PRIVATE'),
  publication('p4', 'REEL', 'CLOSE'),
  publication('p5', 'STATUS', 'PUBLIC'),
];

async function monter(viewerId: string): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('authenticate', async (req: any) => {
    req.user = { userId: viewerId };
    req.authContext = { isAuthenticated: true, userId: viewerId, registeredUser: { id: viewerId, role: 'USER' } };
  });
  app.decorate('prisma', {
    user: {
      findMany: jest.fn(async () => []),
      findFirst: jest.fn<any>(async (args: any) => (args?.where?.blockedUserIds ? null : { id: PROPRIETAIRE, createdAt: new Date('2026-01-01T00:00:00Z') })),
      findUnique: jest.fn<any>(async () => ({ createdAt: new Date('2026-01-01T00:00:00Z') })),
    },
    message: { count: jest.fn<any>(async () => 0), groupBy: jest.fn<any>(async () => []) },
    participant: { findMany: jest.fn<any>(async () => []), count: jest.fn<any>(async () => 0) },
    friendRequest: { count: jest.fn<any>(async () => 0) },
    post: { count: jest.fn<any>(async (args: any) => PUBLICATIONS.filter((p) => matchesPostWhere(p, args?.where)).length) },
  } as never);
  await app.register(async (i) => { await getUserStats(i); }, { prefix: '/api/v1' });
  await app.ready();
  return app;
}

const lire = async (app: FastifyInstance) =>
  (await app.inject({ method: 'GET', url: `/api/v1/users/${PROPRIETAIRE}/stats` })).json().data as Record<string, unknown>;

describe('GET /users/:userId/stats — les publications que CE lecteur peut voir', () => {
  it("un tiers compte avec SON audience, jamais le total de l'auteur", async () => {
    const app = await monter(TIERS);
    const data = await lire(app);
    expect(viewerPostAudience).toHaveBeenCalledWith(expect.anything(), TIERS, undefined);
    expect({ postsCount: data.postsCount, reelsCount: data.reelsCount, statusesCount: data.statusesCount }).toEqual({
      postsCount: 1,
      reelsCount: 0,
      statusesCount: 1,
    });
    await app.close();
  });

  it('le propriétaire garde le total', async () => {
    const app = await monter(PROPRIETAIRE);
    const data = await lire(app);
    expect({ postsCount: data.postsCount, reelsCount: data.reelsCount, statusesCount: data.statusesCount }).toEqual({
      postsCount: 3,
      reelsCount: 1,
      statusesCount: 1,
    });
    await app.close();
  });
});
