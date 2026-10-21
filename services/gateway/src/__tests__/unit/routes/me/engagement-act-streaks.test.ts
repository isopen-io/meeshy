/**
 * `GET /me/engagement` — les séries PAR ACTE (#10389), à côté de la série
 * globale, qui ne change pas.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';
import { isEngagementProgressPayload } from '@meeshy/shared/types/engagement';
import { meEngagementRoutes } from '../../../../routes/me/engagement';

jest.mock('../../../../utils/logger', () => ({ logError: jest.fn() }));
jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }) },
}));

const USER = '64b000000000000000000001';

type StreakRows = () => Promise<unknown[]>;

function makePrisma(actStreaks: StreakRows) {
  return {
    user: { findUnique: jest.fn(async () => ({ currentStreakDays: 3, longestStreakDays: 5, engagementScore: 120 })) },
    engagementCounter: { findMany: jest.fn(async () => []) },
    engagementMilestone: { findMany: jest.fn(async () => []) },
    engagementActStreak: { findMany: jest.fn(actStreaks) },
    meeshLedger: {
      aggregate: jest.fn(async (args: { _sum?: unknown }) =>
        args._sum ? { _sum: { delta: 0 } } : { _min: { createdAt: null }, _max: { createdAt: null } },
      ),
      count: jest.fn(async () => 0),
    },
  };
}

async function buildApp(actStreaks: StreakRows): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', makePrisma(actStreaks) as unknown as FastifyInstance['prisma']);
  app.decorate('authenticate', async (req: FastifyRequest) => {
    Object.assign(req, { auth: { userId: USER, isAuthenticated: true } });
  });
  await app.register(meEngagementRoutes, { prefix: '/api/v1/me', gameBlock: async () => null });
  await app.ready();
  return app;
}

const get = (app: FastifyInstance) => app.inject({ method: 'GET', url: '/api/v1/me/engagement' });

describe('GET /me/engagement — les séries par acte', () => {
  it('sert chaque série d’acte, dans l’ordre des actes, à côté de la série globale inchangée', async () => {
    const app = await buildApp(async () => [
      { act: 'reaction_reel', currentDays: 2, longestDays: 4, lastDay: '2026-10-12' },
      { act: 'story', currentDays: 7, longestDays: 7, lastDay: '2026-10-12' },
      { act: 'inconnu', currentDays: 1, longestDays: 1, lastDay: '2026-10-12' },
    ]);

    const { data } = (await get(app)).json();

    expect(data.streak).toEqual({ currentStreakDays: 3, longestStreakDays: 5 });
    expect(data.actStreaks).toEqual([
      { act: 'story', currentDays: 7, longestDays: 7, lastDay: '2026-10-12' },
      { act: 'reaction_reel', currentDays: 2, longestDays: 4, lastDay: '2026-10-12' },
    ]);
    expect(isEngagementProgressPayload(data)).toBe(true);
    await app.close();
  });

  it('une lecture des séries qui échoue ne ferme pas l’écran : la charge part sans actStreaks', async () => {
    const app = await buildApp(async () => {
      throw new Error('panne');
    });

    const res = await get(app);

    expect(res.statusCode).toBe(200);
    expect('actStreaks' in res.json().data).toBe(false);
    expect(res.json().data.streak).toEqual({ currentStreakDays: 3, longestStreakDays: 5 });
    await app.close();
  });
});
