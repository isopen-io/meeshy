import Fastify, { FastifyInstance } from 'fastify';
import { describe, it, expect, beforeEach, afterAll, jest } from '@jest/globals';

// ---------------------------------------------------------------------------
// Module mocks — must precede all imports that reference these modules
// ---------------------------------------------------------------------------

jest.mock('../../../utils/logger', () => ({
  logError: jest.fn(),
  logInfo: jest.fn(),
}));

jest.mock('../../../validation/helpers.js', () => ({
  validateQuery: () => async (_req: any, _reply: any) => {},
}));

jest.mock('../../../validation/admin-schemas.js', () => ({
  AdminMessagesStatsQuerySchema: {},
  AdminMessagesEngagementQuerySchema: {},
}));

// ---------------------------------------------------------------------------
// Import under test
// ---------------------------------------------------------------------------

import { messagesRoutes } from '../../../routes/admin/messages';

// ---------------------------------------------------------------------------
// Shared constants
// ---------------------------------------------------------------------------

const USER_ID = '507f1f77bcf86cd799439011';

// ---------------------------------------------------------------------------
// Prisma factory
// ---------------------------------------------------------------------------

function makePrisma(overrides: any = {}): any {
  return {
    message: {
      count: jest.fn<any>().mockResolvedValue(0),
      findMany: jest.fn<any>().mockResolvedValue([]),
      groupBy: jest.fn<any>().mockResolvedValue([]),
      // Depuis #4391, `GET /stats` tire son histogramme quotidien ET sa
      // longueur moyenne d'UN `$facet` MongoDB — plus d'un `findMany` sur toute
      // la fenêtre.
      aggregateRaw: jest.fn<any>().mockResolvedValue([{ daily: [], length: [] }]),
      ...overrides.message,
    },
    participant: {
      findMany: jest.fn<any>().mockResolvedValue([]),
      count: jest.fn<any>().mockResolvedValue(0),
      ...overrides.participant,
    },
    reaction: {
      count: jest.fn<any>().mockResolvedValue(0),
      ...overrides.reaction,
    },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// App builder
// ---------------------------------------------------------------------------

async function buildApp(role = 'ADMIN', prismaOverrides: any = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('authenticate', async (req: any) => {
    (req as any).authContext = {
      isAuthenticated: true,
      userId: USER_ID,
      registeredUser: { id: USER_ID, role },
    };
  });
  app.decorate('prisma', makePrisma(prismaOverrides) as any);
  await app.register(messagesRoutes);
  await app.ready();
  return app;
}

// ---------------------------------------------------------------------------
// GET /stats
// ---------------------------------------------------------------------------

describe('Admin messages routes — GET /stats', () => {
  let app: FastifyInstance;

  afterAll(async () => {
    if (app) await app.close();
  });

  it('returns 403 when role is USER', async () => {
    app = await buildApp('USER');

    const response = await app.inject({ method: 'GET', url: '/stats' });
    expect(response.statusCode).toBe(403);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(false);
  });

  it('returns 200 when role is ADMIN', async () => {
    app = await buildApp('ADMIN');

    const response = await app.inject({ method: 'GET', url: '/stats' });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    await app.close();

    app = null as any;
  });

  it('returns 200 when role is MODERATOR', async () => {
    app = await buildApp('MODERATOR');

    const response = await app.inject({ method: 'GET', url: '/stats' });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
  });

  it('returns 500 when DB throws', async () => {
    app = await buildApp('ADMIN', {
      message: {
        count: jest.fn<any>().mockRejectedValue(new Error('DB error')),
        findMany: jest.fn<any>().mockResolvedValue([]),
        groupBy: jest.fn<any>().mockResolvedValue([]),
      },
    });

    const response = await app.inject({ method: 'GET', url: '/stats' });
    expect(response.statusCode).toBe(500);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// GET /trends
// ---------------------------------------------------------------------------

describe('Admin messages routes — GET /trends', () => {
  let app: FastifyInstance;

  afterAll(async () => {
    if (app) await app.close();
  });

  it('returns 200 when role is ADMIN', async () => {
    app = await buildApp('ADMIN');

    const response = await app.inject({ method: 'GET', url: '/trends' });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
  });

  it('returns 403 when role is ANALYST', async () => {
    app = await buildApp('ANALYST');

    const response = await app.inject({ method: 'GET', url: '/trends' });
    expect(response.statusCode).toBe(403);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(false);
    await app.close();

    app = null as any;
  });

  it('returns 500 when DB throws', async () => {
    app = await buildApp('ADMIN', {
      message: {
        findMany: jest.fn<any>().mockRejectedValue(new Error('DB error')),
        count: jest.fn<any>().mockResolvedValue(0),
        groupBy: jest.fn<any>().mockResolvedValue([]),
      },
    });

    const response = await app.inject({ method: 'GET', url: '/trends' });
    expect(response.statusCode).toBe(500);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// GET /engagement
// ---------------------------------------------------------------------------

describe('Admin messages routes — GET /engagement', () => {
  let app: FastifyInstance;

  afterAll(async () => {
    if (app) await app.close();
  });

  it('returns 200 when role is ADMIN', async () => {
    app = await buildApp('ADMIN');

    const response = await app.inject({ method: 'GET', url: '/engagement' });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
  });

  it('returns 500 when DB throws', async () => {
    app = await buildApp('ADMIN', {
      message: {
        count: jest.fn<any>().mockRejectedValue(new Error('DB error')),
        findMany: jest.fn<any>().mockResolvedValue([]),
        groupBy: jest.fn<any>().mockResolvedValue([]),
      },
      reaction: {
        count: jest.fn<any>().mockRejectedValue(new Error('DB error')),
      },
    });

    const response = await app.inject({ method: 'GET', url: '/engagement' });
    expect(response.statusCode).toBe(500);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// GET /stats — l'agrégation de fenêtre, calculée en base (#4391)
//
// `messagesByPeriod` et `averageLength` venaient d'un `findMany` sur toute la
// fenêtre (une ligne par message, `content` intégral compris) plié en
// JavaScript. Ils viennent désormais d'un `$facet` MongoDB. Ces deux témoins
// couvrent le dépouillement du facet — la part de comportement que le
// remplacement a déplacée.
// ---------------------------------------------------------------------------

describe('Admin messages routes — GET /stats agrège la fenêtre en base', () => {
  const jourISO = (recul: number): string => {
    const d = new Date();
    d.setDate(d.getDate() - recul);
    return d.toISOString().split('T')[0];
  };

  it('reporte les comptes quotidiens du $facet, et zéro pour les jours absents', async () => {
    const app = await buildApp('ADMIN', {
      message: {
        count: jest.fn<any>().mockResolvedValue(0),
        findMany: jest.fn<any>().mockResolvedValue([]),
        groupBy: jest.fn<any>().mockResolvedValue([]),
        aggregateRaw: jest.fn<any>().mockResolvedValue([
          { daily: [{ _id: jourISO(1), count: 12 }], length: [] },
        ]),
      },
    });

    const response = await app.inject({ method: 'GET', url: '/stats' });
    const body = JSON.parse(response.body);
    await app.close();

    const parJour: Array<{ date: string; count: number }> = body.data.messagesByPeriod;
    expect(parJour.find((e) => e.date === jourISO(1))?.count).toBe(12);
    expect(parJour.find((e) => e.date === jourISO(2))?.count).toBe(0);
  });

  it('arrondit la longueur moyenne rendue par le $facet, et sert 0 quand il est vide', async () => {
    const app = await buildApp('ADMIN', {
      message: {
        count: jest.fn<any>().mockResolvedValue(0),
        findMany: jest.fn<any>().mockResolvedValue([]),
        groupBy: jest.fn<any>().mockResolvedValue([]),
        aggregateRaw: jest.fn<any>().mockResolvedValue([
          { daily: [], length: [{ _id: null, avg: 41.6 }] },
        ]),
      },
    });

    const response = await app.inject({ method: 'GET', url: '/stats' });
    const body = JSON.parse(response.body);
    await app.close();

    expect(body.data.averageLength).toBe(42);

    const vide = await buildApp('ADMIN');
    const sansContenu = await vide.inject({ method: 'GET', url: '/stats' });
    await vide.close();
    expect(JSON.parse(sansContenu.body).data.averageLength).toBe(0);
  });

  it('borne le $match du pipeline à la fenêtre demandée', async () => {
    const aggregateRaw = jest.fn<any>().mockResolvedValue([{ daily: [], length: [] }]);
    const app = await buildApp('ADMIN', {
      message: {
        count: jest.fn<any>().mockResolvedValue(0),
        findMany: jest.fn<any>().mockResolvedValue([]),
        groupBy: jest.fn<any>().mockResolvedValue([]),
        aggregateRaw,
      },
    });

    await app.inject({ method: 'GET', url: '/stats?period=7d' });
    await app.close();

    const [{ pipeline }] = aggregateRaw.mock.calls[0] as [{ pipeline: any[] }];
    expect(pipeline[0].$match.createdAt.$gte.$date).toEqual(expect.any(String));
    expect(pipeline[0].$match.deletedAt).toBeNull();
    expect(Object.keys(pipeline[1].$facet)).toEqual(['daily', 'length']);
  });
});
