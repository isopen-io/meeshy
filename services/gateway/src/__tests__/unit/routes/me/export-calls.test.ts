/**
 * LA SECTION `calls` DE L'EXPORT (#11277) — la télémétrie et la note de chacun
 * de MES appels, à travers le VRAI sérialiseur de la route : un schéma qui ne
 * déclarerait pas `analytics` ou `feedback` les effacerait sans bruit.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';

jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() }) },
}));

import { dataExportRoutes } from '../../../../routes/me/export';

const USER = '507f1f77bcf86cd799439011';
const AT = new Date('2026-10-20T10:00:00.000Z');

const telemetry = {
  callSessionId: '507f1f77bcf86cd799439031',
  role: 'participant',
  joinedAt: AT,
  leftAt: AT,
  analytics: { platform: 'android', deviceModel: 'Pixel 9', mos: 3.7, qualityDistribution: { excellent: 0.5, good: 0.5, fair: 0, poor: 0 } },
  feedback: { rating: 4, issues: [], comment: 'nette' },
};

async function build(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', {
    participant: { findMany: jest.fn<any>().mockResolvedValue([{ id: 'p1' }]) },
    callParticipant: {
      findMany: jest.fn<any>().mockResolvedValue([telemetry]),
      count: jest.fn<any>().mockResolvedValue(1),
    },
  } as never);
  app.decorate('authenticate', async (req: FastifyRequest) => {
    (req as any).authContext = { isAuthenticated: true, userId: USER, registeredUser: { id: USER } };
  });
  await app.register(dataExportRoutes);
  await app.ready();
  return app;
}

describe('GET /export?types=calls', () => {
  it('traverse le sérialiseur : appareil, plateforme, mesures et note sortent entiers', async () => {
    const app = await build();

    const response = await app.inject({ method: 'GET', url: '/export?types=calls' });
    const data = response.json().data;

    expect(response.statusCode).toBe(200);
    expect(data.callsCount).toBe(1);
    expect(data.callsHasMore).toBe(false);
    expect(data.calls).toEqual([
      {
        callId: '507f1f77bcf86cd799439031',
        role: 'participant',
        joinedAt: AT.toISOString(),
        leftAt: AT.toISOString(),
        analytics: telemetry.analytics,
        feedback: telemetry.feedback,
      },
    ]);
  });

  it('sort aussi en CSV, la télémétrie en JSON dans sa cellule', async () => {
    const app = await build();

    const response = await app.inject({ method: 'GET', url: '/export?types=calls&format=csv' });
    const csv = response.json().data.csv.calls as string;

    expect(csv.split('\n')[0]).toBe('callId,role,joinedAt,leftAt,analytics,feedback');
    expect(csv).toContain('Pixel 9');
    expect(csv).toContain('nette');
  });
});
