/**
 * `GET /admin/analytics/calls` sert la QUALITÉ des appels (#11277) à côté de
 * leur fiabilité : gels, limitation, MOS, relais, codec, plateforme — lus sur
 * la même fenêtre de `CallParticipant.analytics`, sans aucune requête de plus
 * et sans aucun appareil ni identifiant dans la réponse.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

jest.mock('../../../utils/logger', () => ({ logError: jest.fn() }));
jest.mock('../../../services/CacheStore', () => ({
  getCacheStore: () => ({ get: jest.fn<any>().mockResolvedValue(null), set: jest.fn<any>().mockResolvedValue(undefined) }),
}));
jest.mock('../../../validation/helpers.js', () => ({ validateQuery: () => async () => {} }));
jest.mock('../../../validation/admin-schemas.js', () => ({
  AnalyticsMessageTypesQuerySchema: {},
  AnalyticsLanguageDistQuerySchema: {},
  AnalyticsKpisQuerySchema: {},
}));

import { analyticsRoutes } from '../../../routes/admin/analytics';

const ADMIN_ID = '507f1f77bcf86cd799439011';

const row = (analytics: Record<string, unknown>) => ({
  analytics: {
    callId: '507f1f77bcf86cd799439031',
    setupTimeMs: 2000,
    durationSeconds: 90,
    reconnectionCount: 0,
    networkTransitions: 0,
    averageRtt: 60,
    averagePacketLoss: 0.2,
    maxPacketLoss: 1,
    codec: 'opus',
    qualityDistribution: { excellent: 1, good: 0, fair: 0, poor: 0 },
    platform: 'ios',
    deviceModel: 'iPhone16,2',
    isVideo: true,
    endReason: 'completed',
    ...analytics,
  },
  feedback: null,
});

async function appWith(rows: readonly unknown[]): Promise<{ app: FastifyInstance; findMany: jest.Mock<any> }> {
  const findMany = jest.fn<any>().mockResolvedValue(rows);
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('authenticate', async (req: any) => {
    req.authContext = { isAuthenticated: true, userId: ADMIN_ID, registeredUser: { id: ADMIN_ID, role: 'ADMIN' } };
  });
  app.decorate('prisma', { callParticipant: { findMany } } as any);
  await app.register(analyticsRoutes);
  await app.ready();
  return { app, findMany };
}

describe('GET /calls — la qualité des appels (#11277)', () => {
  it('sert gels, MOS, limitation, relais, codecs et plateformes depuis la même lecture', async () => {
    const { app, findMany } = await appWith([
      row({ mos: 4.2, freezeCount: 0, totalFreezesDuration: 0, qualityLimitationReason: 'none', candidateType: 'host' }),
      row({ mos: 3.0, freezeCount: 5, totalFreezesDuration: 4, qualityLimitationReason: 'bandwidth', candidateType: 'relay', relayProtocol: 'tls', codec: 'VP8', platform: 'web' }),
    ]);

    const res = await app.inject({ method: 'GET', url: '/calls' });
    const quality = res.json().data.quality;

    expect(res.statusCode).toBe(200);
    expect(findMany).toHaveBeenCalledTimes(1);
    expect(quality.mos).toEqual({ reportingCalls: 2, avg: 3.6, lowRate: 0.5 });
    expect(quality.freezes).toEqual({ reportingVideoCalls: 2, frozenRate: 0.5, avgFreezeCount: 2.5, avgFreezeDurationSeconds: 2 });
    expect(quality.qualityLimitation).toEqual({ none: 1, cpu: 0, bandwidth: 1, other: 0 });
    expect(quality.relay).toEqual({ reportingCalls: 2, relayedRate: 0.5, byProtocol: { tls: 1 } });
    expect(quality.byCodec).toEqual({ opus: 1, vp8: 1 });
    expect(quality.byPlatform).toEqual({ ios: 1, web: 1 });
  });

  it('ne sert aucun modèle d’appareil ni identifiant d’appel', async () => {
    const { app } = await appWith([row({ mos: 4 })]);

    const body = (await app.inject({ method: 'GET', url: '/calls' })).body;

    expect(body).not.toContain('iPhone16,2');
    expect(body).not.toContain('507f1f77bcf86cd799439031');
  });

  it('sert une qualité VIDE et honnête (null, pas zéro) sur des lignes d’anciens clients', async () => {
    const { app } = await appWith([row({})]);

    const quality = (await app.inject({ method: 'GET', url: '/calls' })).json().data.quality;

    expect(quality.reportingCalls).toBe(0);
    expect(quality.mos.avg).toBeNull();
    expect(quality.relay.relayedRate).toBeNull();
  });
});
