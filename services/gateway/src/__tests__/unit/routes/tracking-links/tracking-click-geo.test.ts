/**
 * Un clic sur un lien de suivi porte son PAYS et sa VILLE (audit 2026-10-04).
 *
 * `recordClick` accepte `country` / `city` ; la redirection `GET /l/:token` ne
 * les passait jamais, et les statistiques par pays restaient vides. Deux
 * sources, dans cet ordre, et aucune invention :
 * 1. l'en-tête `cf-ipcountry` posé par le CDN, s'il est un code ISO réel ;
 * 2. la géolocalisation IP déjà présente dans le dépôt (`lookupGeoIp`),
 *    bornée par un délai court — une redirection n'attend pas un tiers.
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

describe('GET /l/:token — pays et ville du clic', () => {
  it('passe pays et ville de la géolocalisation IP, sous un délai court', async () => {
    lookupGeoIp.mockResolvedValue({ country: 'SN', city: 'Dakar' });
    const app = await build();
    const res = await app.inject({ method: 'GET', url: '/l/abc123', headers: { 'x-forwarded-for': '41.82.1.2' } });
    expect(res.statusCode).toBe(302);
    expect(recordClick.mock.calls[0][0]).toMatchObject({ country: 'SN', city: 'Dakar' });
    expect(lookupGeoIp.mock.calls[0][0]).toBe('41.82.1.2');
    expect(lookupGeoIp.mock.calls[0][1]?.timeoutMs).toBeLessThanOrEqual(500);
    await app.close();
  });

  it("préfère le pays de l'en-tête cf-ipcountry quand il est un code réel", async () => {
    lookupGeoIp.mockResolvedValue({ country: 'FR', city: 'Paris' });
    const app = await build();
    await app.inject({ method: 'GET', url: '/l/abc123', headers: { 'cf-ipcountry': 'CM' } });
    expect(recordClick.mock.calls[0][0]).toMatchObject({ country: 'CM', city: 'Paris' });
    await app.close();
  });

  it("n'invente rien : sans en-tête ni géolocalisation, ni pays ni ville", async () => {
    lookupGeoIp.mockResolvedValue(null);
    const app = await build();
    await app.inject({ method: 'GET', url: '/l/abc123', headers: { 'cf-ipcountry': 'XX' } });
    const appel = recordClick.mock.calls[0][0];
    expect(appel.country).toBeUndefined();
    expect(appel.city).toBeUndefined();
    await app.close();
  });

  it('une géolocalisation qui échoue ne casse pas la redirection', async () => {
    lookupGeoIp.mockRejectedValue(new Error('réseau'));
    const app = await build();
    const res = await app.inject({ method: 'GET', url: '/l/abc123' });
    expect(res.statusCode).toBe(302);
    await app.close();
  });
});
