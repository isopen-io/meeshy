/**
 * `GET /admin/posts/stats` — le compte « en ligne » (audit 2026-10-04).
 *
 * `total` compte les publications non supprimées, stories et statuts EXPIRÉS
 * compris : une story de la veille y figure encore, alors que plus personne ne
 * la voit. `live` compte ce qui est réellement visible : non supprimé ET
 * (sans échéance OU échéance future). Une échéance ABSENTE (le cas de tout
 * post ordinaire, leçon 318) est « sans échéance ».
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

import { adminPostRoutes } from '../posts';

type AnyRecord = Record<string, unknown>;

const count = jest.fn(async (_args: AnyRecord) => 7);
const mockPrisma = {
  post: {
    count,
    groupBy: jest.fn(async () => []),
    findMany: jest.fn(async () => []),
  },
  user: { findMany: jest.fn(async () => []) },
} as never;

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate('prisma', mockPrisma);
  app.decorate('authenticate', async (request: { authContext?: unknown }) => {
    request.authContext = { isAuthenticated: true, registeredUser: { id: '507f1f77bcf86cd799439032', role: 'ADMIN' } };
  });
  app.register(adminPostRoutes);
  await app.ready();
  return app;
}

describe('GET /admin/posts/stats — live', () => {
  it('sert live : non supprimé, et sans échéance ou à échéance future', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/posts/stats' });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.live).toBe(7);

    const appel = count.mock.calls.map((c) => c[0] as { where: AnyRecord }).find((a) => 'AND' in a.where);
    expect(appel).toBeDefined();
    expect(appel!.where.deletedAt).toEqual({ isSet: false });
    const ou = ((appel!.where.AND as AnyRecord[])[0] as { OR: AnyRecord[] }).OR;
    expect(ou).toEqual(expect.arrayContaining([
      { expiresAt: null },
      { expiresAt: { isSet: false } },
      { expiresAt: { gt: expect.any(Date) } },
    ]));
    await app.close();
  });
});
