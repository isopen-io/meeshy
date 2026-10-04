/**
 * Un clic sur un lien de suivi porte son PAYS, sans jamais consulter un tiers.
 *
 * `recordClick` accepte `country` / `city` ; la redirection `GET /l/:token` ne
 * les passait jamais. Seule source admise : l'en-tête `cf-ipcountry` posé par
 * le CDN, s'il est un code ISO réel (`XX`/`T1` exclus). L'IP d'un visiteur
 * n'est envoyée à aucun service de géolocalisation : la ville reste nulle.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: jest.fn(() => ({ info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() })) },
}));
jest.mock('../../../../utils/logger', () => ({ logError: jest.fn() }));
jest.mock('../../../../middleware/admin-permissions.middleware', () => ({ requireAnalyticsPermission: jest.fn() }));
jest.mock('../../../../middleware/auth', () => ({
  createUnifiedAuthMiddleware: jest.fn().mockReturnValue(async (req: { authContext?: unknown }) => {
    req.authContext = { isAuthenticated: false, type: 'anonymous', anonymousUser: null, registeredUser: null };
  }),
  isRegisteredUser: jest.fn().mockReturnValue(false),
  UnifiedAuthRequest: {},
}));

const recordClick = jest.fn<(a: Record<string, unknown>) => Promise<unknown>>().mockResolvedValue({});
jest.mock('../../../../services/TrackingLinkService', () => ({
  TrackingLinkService: jest.fn().mockImplementation(() => ({
    getTrackingLinkByToken: async () => ({ isActive: true, originalUrl: 'https://example.com/p', expiresAt: null }),
    recordClick: (a: Record<string, unknown>) => recordClick(a),
  })),
  resolveFrontendBaseUrl: () => 'https://meeshy.me',
}));

const lookupGeoIp = jest.fn<(ip: string, o?: { timeoutMs?: number }) => Promise<unknown>>();
jest.mock('../../../../services/GeoIPService', () => ({
  lookupGeoIp: (ip: string, o?: { timeoutMs?: number }) => lookupGeoIp(ip, o),
}));

import { registerTrackingRoutes } from '../../../../routes/tracking-links/tracking';

async function build(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', {} as never);
  app.decorate('authenticate', async () => {});
  await registerTrackingRoutes(app);
  await app.ready();
  return app;
}

beforeEach(() => {
  recordClick.mockClear();
  lookupGeoIp.mockReset();
});

describe('GET /l/:token — pays du clic, sans tiers', () => {
  it("n'envoie jamais l'IP du visiteur à un service de géolocalisation", async () => {
    lookupGeoIp.mockResolvedValue({ country: 'SN', city: 'Dakar' });
    const app = await build();
    const res = await app.inject({ method: 'GET', url: '/l/abc123', headers: { 'x-forwarded-for': '41.82.1.2' } });
    expect(res.statusCode).toBe(302);
    expect(lookupGeoIp).not.toHaveBeenCalled();
    const appel = recordClick.mock.calls[0][0];
    expect(appel.country).toBeUndefined();
    expect(appel.city).toBeUndefined();
    await app.close();
  });

  it("porte le pays de l'en-tête cf-ipcountry quand il est un code réel, sans ville", async () => {
    const app = await build();
    await app.inject({ method: 'GET', url: '/l/abc123', headers: { 'cf-ipcountry': 'cm', 'x-forwarded-for': '41.82.1.2' } });
    const appel = recordClick.mock.calls[0][0];
    expect(appel.country).toBe('CM');
    expect(appel.city).toBeUndefined();
    expect(lookupGeoIp).not.toHaveBeenCalled();
    await app.close();
  });

  it.each(['XX', 'T1', 'FRA', ''])("ignore la valeur cf-ipcountry %p qui n'est pas un pays", async (code) => {
    const app = await build();
    await app.inject({ method: 'GET', url: '/l/abc123', headers: { 'cf-ipcountry': code } });
    expect(recordClick.mock.calls[0][0].country).toBeUndefined();
    await app.close();
  });
});
