/**
 * `GET /admin/analytics/playback` sert le temps-à-première-image et le rebuffer
 * (#11280) en p50/p95 par surface × tier × jour — k-anonymes, sans aucun
 * identifiant, et seulement à qui accède à l'administration.
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

const VIEWER_ID = '507f1f77bcf86cd799439011';
const accountId = (n: number): string => n.toString(16).padStart(24, '0');

const stored = (n: number, props: Record<string, unknown> = {}) => ({
  day: 20261020,
  surface: 'reels',
  userId: { $oid: accountId(n + 1) },
  props: { startupMs: 300 + n * 10, rebufferMs: 0, playedMs: 9000, rebufferCount: 0, deviceTier: 'low', ...props },
});

async function appWith(params: { readonly role: string; readonly rows: readonly unknown[] }): Promise<{ app: FastifyInstance; runCommandRaw: jest.Mock<any> }> {
  const runCommandRaw = jest.fn<any>().mockResolvedValue({ cursor: { firstBatch: params.rows }, ok: 1 });
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('authenticate', async (req: any) => {
    req.authContext = { isAuthenticated: true, userId: VIEWER_ID, registeredUser: { id: VIEWER_ID, role: params.role } };
  });
  app.decorate('prisma', { $runCommandRaw: runCommandRaw } as any);
  await app.register(analyticsRoutes);
  await app.ready();
  return { app, runCommandRaw };
}

describe('GET /playback — la qualité de lecture par surface × tier × jour (#11280)', () => {
  it('sert les quantiles des cellules d’au moins 20 comptes, et le nombre de cellules retenues', async () => {
    const rows = [
      ...Array.from({ length: 20 }, (_, i) => stored(i)),
      ...Array.from({ length: 3 }, (_, i) => stored(i, { deviceTier: 'high' })),
    ];
    const { app, runCommandRaw } = await appWith({ role: 'ADMIN', rows });

    const res = await app.inject({ method: 'GET', url: '/playback?days=7' });
    const data = res.json().data;

    expect(res.statusCode).toBe(200);
    expect(runCommandRaw).toHaveBeenCalledTimes(1);
    expect(data).toMatchObject({ windowDays: 7, sampled: false, minDevices: 20, suppressedCells: 1 });
    expect(data.cells).toEqual([expect.objectContaining({
      day: '2026-10-20', surface: 'reels', deviceTier: 'low', sessions: 20, devices: 20,
      timeToFirstFrameMs: { p50: 390, p95: 480 },
    })]);
  });

  it('sert aussi les Web Vitals et les longues images de la cellule (W11, #11317)', async () => {
    const rows = Array.from({ length: 20 }, (_, i) => stored(i, { lcpMs: 1000 + i * 100, cls: 0.01, inpMs: 100, longFrames: 1, longFramesBlockingMs: 60, longFrameWorstMs: 60 }));
    const { app } = await appWith({ role: 'ADMIN', rows });

    const [cell] = (await app.inject({ method: 'GET', url: '/playback?days=7' })).json().data.cells;

    expect(cell).toMatchObject({ lcpMs: { p50: 1900, p95: 2800 }, cls: { p50: 0.01, p95: 0.01 }, inpMs: { p50: 100, p95: 100 }, longFrames: { p50: 1, p95: 1 } });
  });

  it('ne sert aucun identifiant de compte', async () => {
    const { app } = await appWith({ role: 'ADMIN', rows: Array.from({ length: 25 }, (_, i) => stored(i)) });

    const body = (await app.inject({ method: 'GET', url: '/playback' })).body;

    expect(body).not.toContain(accountId(1));
  });

  it('borne la fenêtre à 30 jours, la durée de conservation du brut', async () => {
    const { app } = await appWith({ role: 'ADMIN', rows: [] });

    const data = (await app.inject({ method: 'GET', url: '/playback?days=365' })).json().data;

    expect(data.windowDays).toBe(30);
    expect(data.cells).toEqual([]);
  });

  it('refuse un compte sans accès à l’administration, sans lire la base (fail-closed)', async () => {
    const { app, runCommandRaw } = await appWith({ role: 'USER', rows: [stored(0)] });

    const res = await app.inject({ method: 'GET', url: '/playback' });

    expect(res.statusCode).toBe(403);
    expect(runCommandRaw).not.toHaveBeenCalled();
  });
});
