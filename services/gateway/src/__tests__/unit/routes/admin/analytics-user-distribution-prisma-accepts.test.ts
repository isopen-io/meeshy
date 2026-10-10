/**
 * `GET /admin/analytics/user-distribution` — chacun des quatre `count` doit
 * être ACCEPTÉ par le client Prisma GÉNÉRÉ.
 *
 * Le compte « Inactifs » posait `OR: [{ lastActiveAt: { lt } }, { lastActiveAt:
 * null }]`. `User.lastActiveAt` est REQUIS (`DateTime @default(now())`) : son
 * filtre généré ne déclare ni `null` ni `isSet` (leçon 622), le validateur
 * refusait la requête et la route rendait 500. Les doubles de la suite (stub de
 * `moduleNameMapper`, `count` mocké) ne voyaient rien.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';
import Fastify from 'fastify';
import path from 'path';

jest.mock('../../../../utils/logger', () => ({ logError: jest.fn() }));
jest.mock('../../../../services/CacheStore', () => ({
  getCacheStore: () => ({ get: async () => null, set: async () => undefined }),
}));
jest.mock('../../../../validation/helpers.js', () => ({ validateQuery: () => async () => {} }));
jest.mock('../../../../validation/admin-schemas.js', () => ({
  AnalyticsMessageTypesQuerySchema: {}, AnalyticsLanguageDistQuerySchema: {}, AnalyticsKpisQuerySchema: {},
}));

import { analyticsRoutes } from '../../../../routes/admin/analytics';

const CLIENT_GENERE = path.join(__dirname, '../../../../../../../packages/shared/prisma/client');
const URL_MORTE = 'mongodb://127.0.0.1:1/guard-distribution?serverSelectionTimeoutMS=50&connectTimeoutMS=50';

type ClientPrisma = { user: { count: (a: unknown) => Promise<unknown> }; $disconnect: () => Promise<void> };

async function refusDuValidateur(where: unknown): Promise<string | null> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { PrismaClient } = require(CLIENT_GENERE) as { PrismaClient: new (o: unknown) => ClientPrisma };
  const prisma = new PrismaClient({ datasources: { db: { url: URL_MORTE } } });
  try {
    await prisma.user.count({ where });
    return null;
  } catch (erreur) {
    return (erreur as Error).constructor.name === 'PrismaClientValidationError' ? (erreur as Error).message : null;
  } finally {
    await prisma.$disconnect().catch(() => undefined);
  }
}

describe('GET /user-distribution — le client Prisma généré accepte chaque compte', () => {
  it('les quatre `where` passent le validateur', async () => {
    const count = jest.fn<(a: { where: unknown }) => Promise<number>>().mockResolvedValue(1);
    const app = Fastify({ logger: false });
    app.decorate('authenticate', async (req: any) => {
      req.authContext = { isAuthenticated: true, userId: 'u', registeredUser: { id: 'u', role: 'ADMIN' } };
    });
    app.decorate('prisma', { user: { count } } as never);
    await app.register(analyticsRoutes);
    await app.ready();
    const res = await app.inject({ method: 'GET', url: '/user-distribution' });
    expect(res.statusCode).toBe(200);
    expect(count).toHaveBeenCalledTimes(4);
    for (const [arg] of count.mock.calls) {
      expect(await refusDuValidateur(arg.where)).toBeNull();
    }
    await app.close();
  }, 30000);
});
