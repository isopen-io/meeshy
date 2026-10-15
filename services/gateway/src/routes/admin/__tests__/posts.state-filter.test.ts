/**
 * `GET /admin/posts?state=` (#10392) — la liste de la plateforme se filtre par
 * état lu (publiée, hors ligne, privée, expirée, supprimée) et sert, sur chaque
 * ligne, l'état et la date du retrait.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

import { adminPostRoutes } from '../posts';

type AnyRecord = Record<string, unknown>;

const findMany = jest.fn(async (_args: AnyRecord): Promise<unknown[]> => []);
const count = jest.fn(async (_args: AnyRecord) => 0);
const mockPrisma = { post: { count, findMany, groupBy: jest.fn(async () => []) }, user: { findMany: jest.fn(async () => []) } } as never;

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate('prisma', mockPrisma);
  app.decorate('authenticate', async (request: { authContext?: unknown }) => {
    request.authContext = { isAuthenticated: true, registeredUser: { id: '507f1f77bcf86cd799439032', role: 'MODERATOR' } };
  });
  app.register(adminPostRoutes);
  await app.ready();
  return app;
}

const whereOf = (): AnyRecord => (findMany.mock.calls[0]?.[0] as { where: AnyRecord }).where;
const HIDDEN = new Date('2026-10-11T10:00:00.000Z');

beforeEach(() => jest.clearAllMocks());

describe('GET /admin/posts?state=', () => {
  it('« hors ligne » : non supprimée et retrait posé', async () => {
    const app = await buildApp();
    await app.inject({ method: 'GET', url: '/posts?state=offline' });
    expect(whereOf()).toMatchObject({ deletedAt: { isSet: false }, moderationHiddenAt: { not: null } });
    await app.close();
  });

  it('« publiée » : ni retrait, ni PRIVATE, ni échéance passée', async () => {
    const app = await buildApp();
    await app.inject({ method: 'GET', url: '/posts?state=published' });
    const where = whereOf();
    expect(where.deletedAt).toEqual({ isSet: false });
    expect(where.visibility).toEqual({ not: 'PRIVATE' });
    expect(JSON.stringify(where.AND)).toContain('"moderationHiddenAt":{"isSet":false}');
    expect(JSON.stringify(where.AND)).toContain('"expiresAt":{"gt"');
    await app.close();
  });

  it('« privée » : PRIVATE sans retrait ; « expirée » : échéance passée sans retrait', async () => {
    const app = await buildApp();
    await app.inject({ method: 'GET', url: '/posts?state=private' });
    expect(whereOf()).toMatchObject({ visibility: 'PRIVATE' });
    findMany.mockClear();
    await app.inject({ method: 'GET', url: '/posts?state=expired' });
    expect(whereOf()).toMatchObject({ expiresAt: { lte: expect.any(Date) } });
    await app.close();
  });

  it('« supprimée » : deletedAt posé, quel que soit isDeleted', async () => {
    const app = await buildApp();
    await app.inject({ method: 'GET', url: '/posts?state=deleted&isDeleted=false' });
    expect(whereOf().deletedAt).toEqual({ not: null });
    await app.close();
  });

  it('refuse un état inconnu', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/posts?state=nope' });
    expect(res.statusCode).toBe(400);
    expect(findMany).not.toHaveBeenCalled();
    await app.close();
  });

  it("sert l'état, la date du retrait et l'audience retenue sur chaque ligne", async () => {
    findMany.mockResolvedValueOnce([
      {
        id: '507f1f77bcf86cd799439011',
        type: 'POST',
        visibility: 'PRIVATE',
        content: 'Bonjour',
        deletedAt: null,
        expiresAt: null,
        moderationHiddenAt: HIDDEN,
        moderationPriorVisibility: 'PUBLIC',
        createdAt: HIDDEN,
        media: [],
      },
    ]);
    count.mockResolvedValueOnce(1);
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/posts' });
    expect(res.statusCode).toBe(200);
    expect((findMany.mock.calls[0]?.[0] as { select: AnyRecord }).select).toMatchObject({ moderationHiddenAt: true, moderationPriorVisibility: true });
    expect(res.json().data[0]).toMatchObject({ state: 'offline', moderationHiddenAt: HIDDEN.toISOString(), moderationPriorVisibility: 'PUBLIC' });
    await app.close();
  });
});
