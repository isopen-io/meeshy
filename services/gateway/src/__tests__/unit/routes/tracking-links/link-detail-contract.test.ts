/**
 * Le contrat du DÉTAIL d'un lien de suivi (#19412, client #19282), sur les
 * schémas RÉELS — `@meeshy/shared/types/api-schemas` n'est PAS mocké :
 * `fast-json-stringify` retire toute clé non déclarée, c'est donc le schéma
 * compilé qui décide de ce qui part.
 *
 * Ce que le détail lit, et qui n'était pas servi :
 *   - `countryCount` et `clicksByPlace` (la carte des visiteurs) sur `/stats` ;
 *   - `targetType` / `targetId` (« Réel · publié le … », « Vers ma vitrine »)
 *     sur le lien du gestionnaire ;
 *   - le nom et les UTM, modifiables par `PATCH`.
 *
 * Et ce qui ne doit pas partir À CÔTÉ : la porte PUBLIQUE du clic (tout
 * visiteur, sans compte) sert le lien, mais jamais l'identifiant de sa cible.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn(() => ({ info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() })),
  },
}));
jest.mock('../../../../utils/logger', () => ({ logError: jest.fn() }));
jest.mock('../../../../middleware/admin-permissions.middleware', () => ({
  requireAnalyticsPermission: jest.fn().mockImplementation(async () => {}),
}));

const OWNER_ID = '507f1f77bcf86cd799439011';
const TOKEN = 'vitrine1';
const TARGET_ID = '507f1f77bcf86cd799439055';

let mockRegistered = true;
const ownerContext = {
  type: 'registered' as const,
  isAuthenticated: true,
  userId: OWNER_ID,
  hasFullAccess: true,
  isAnonymous: false,
  registeredUser: { id: OWNER_ID, username: 'aissa', role: 'USER' },
};
const anonContext = {
  type: 'anonymous' as const,
  isAuthenticated: false,
  userId: 'anon',
  hasFullAccess: false,
  isAnonymous: true,
  registeredUser: null,
};

jest.mock('../../../../middleware/auth', () => ({
  createUnifiedAuthMiddleware: jest.fn().mockReturnValue(
    async (req: any) => { req.authContext = mockRegistered ? ownerContext : anonContext; }
  ),
  isRegisteredUser: jest.fn().mockImplementation(() => mockRegistered),
  UnifiedAuthRequest: {},
}));

const mockGetByToken = jest.fn<any>();
const mockGetStats = jest.fn<any>();
const mockRecordClick = jest.fn<any>();
const mockUpdate = jest.fn<any>();

jest.mock('../../../../services/TrackingLinkService', () => ({
  TrackingLinkService: jest.fn().mockImplementation(() => ({
    getTrackingLinkByToken: (...a: any[]) => mockGetByToken(...a),
    getTrackingLinkStats: (...a: any[]) => mockGetStats(...a),
    recordClick: (...a: any[]) => mockRecordClick(...a),
    updateTrackingLink: (...a: any[]) => mockUpdate(...a),
    getTrackingLinkClicks: jest.fn(),
    getAllTrackingLinks: jest.fn(),
    updateRedirectStatus: jest.fn(),
    findExistingTrackingLink: jest.fn(),
    createTrackingLink: jest.fn(),
    deleteTrackingLink: jest.fn(),
    isTokenAvailable: jest.fn<any>().mockResolvedValue(true),
    buildTrackingUrl: (token: string) => `https://meeshy.me/l/${token}`,
  })),
  resolveFrontendBaseUrl: jest.fn().mockReturnValue('https://meeshy.me'),
}));

import { registerTrackingRoutes } from '../../../../routes/tracking-links/tracking';
import { registerCreationRoutes } from '../../../../routes/tracking-links/creation';

function makeLink(overrides: Record<string, unknown> = {}) {
  return {
    id: '507f1f77bcf86cd799439041',
    token: TOKEN,
    name: 'Mon profil',
    campaign: null,
    source: null,
    medium: null,
    originalUrl: 'https://meeshy.me/u/aissa',
    shortUrl: `/l/${TOKEN}`,
    createdBy: OWNER_ID,
    conversationId: null,
    messageId: null,
    targetType: 'REEL',
    targetId: TARGET_ID,
    addressId: null,
    totalClicks: 12,
    uniqueClicks: 9,
    isActive: true,
    expiresAt: null,
    createdAt: new Date('2026-11-02T00:00:00Z'),
    updatedAt: new Date('2026-11-02T00:00:00Z'),
    lastClickedAt: null,
    ...overrides,
  };
}

function makeStats(link: Record<string, unknown>) {
  return {
    trackingLink: link,
    totalClicks: 12,
    uniqueClicks: 9,
    confirmedClicks: 10,
    clicksByCountry: { SN: 8, FR: 4 },
    clicksByDevice: {},
    clicksByBrowser: {},
    clicksByOS: {},
    clicksByLanguage: {},
    clicksByHour: {},
    clicksBySocialSource: {},
    clicksByDate: { '2026-11-16': 12 },
    topReferrers: [],
    countryCount: 2,
    clicksByPlace: [
      { country: 'SN', city: 'Dakar', count: 8, ipAddress: '203.0.113.9' },
      { country: 'FR', city: null, count: 4 },
    ],
  };
}

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', {
    trackingLink: { findFirst: jest.fn<any>().mockResolvedValue(makeLink()) },
  } as any);
  app.decorate('authenticate', async () => {});
  await registerTrackingRoutes(app);
  await registerCreationRoutes(app);
  await app.ready();
  return app;
}

beforeEach(() => {
  mockRegistered = true;
  jest.clearAllMocks();
  mockGetByToken.mockResolvedValue(makeLink());
});

describe('GET /tracking-links/:token/stats — les agrégats du détail', () => {
  it('sert countryCount et la carte des visiteurs, agrégat seul', async () => {
    const link = makeLink();
    mockGetStats.mockResolvedValue(makeStats(link));
    const app = await buildApp();

    const res = await app.inject({ method: 'GET', url: `/tracking-links/${TOKEN}/stats` });
    await app.close();

    expect(res.statusCode).toBe(200);
    const data = res.json().data;
    expect(data.countryCount).toBe(2);
    expect(data.clicksByPlace).toEqual([
      { country: 'SN', city: 'Dakar', count: 8 },
      { country: 'FR', city: null, count: 4 },
    ]);
  });

  it('sert la cible du lien au gestionnaire', async () => {
    mockGetStats.mockResolvedValue(makeStats(makeLink()));
    const app = await buildApp();

    const res = await app.inject({ method: 'GET', url: `/tracking-links/${TOKEN}/stats` });
    await app.close();

    const { trackingLink } = res.json().data;
    expect(trackingLink.targetType).toBe('REEL');
    expect(trackingLink.targetId).toBe(TARGET_ID);
  });

  it("rend 404 pour le lien d'adresse d'autrui, sans rien agréger", async () => {
    mockGetByToken.mockResolvedValue(makeLink({ addressId: '507f1f77bcf86cd799439077', createdBy: '507f1f77bcf86cd799439099' }));
    const app = await buildApp();

    const res = await app.inject({ method: 'GET', url: `/tracking-links/${TOKEN}/stats` });
    await app.close();

    expect(res.statusCode).toBe(404);
    expect(mockGetStats).not.toHaveBeenCalled();
  });
});

describe('POST /tracking-links/:token/click — la porte publique', () => {
  it("sert le type de cible, jamais l'identifiant de la cible", async () => {
    mockRegistered = false;
    mockRecordClick.mockResolvedValue({ trackingLink: makeLink(), click: { id: 'click-1' } });
    const app = await buildApp();

    const res = await app.inject({ method: 'POST', url: `/tracking-links/${TOKEN}/click`, payload: {} });
    await app.close();

    expect(res.statusCode).toBe(200);
    const { trackingLink } = res.json().data;
    expect(trackingLink.token).toBe(TOKEN);
    expect(trackingLink).not.toHaveProperty('targetId');
  });
});

describe("GET /tracking-links/:token — la lecture d'un lien sans propriétaire", () => {
  it("ne sert pas l'identifiant de la cible à un lecteur quelconque", async () => {
    mockRegistered = false;
    mockGetByToken.mockResolvedValue(makeLink({ createdBy: null }));
    const app = await buildApp();

    const res = await app.inject({ method: 'GET', url: `/tracking-links/${TOKEN}` });
    await app.close();

    expect(res.statusCode).toBe(200);
    expect(res.json().data.trackingLink).not.toHaveProperty('targetId');
  });

  it('sert la cible au propriétaire qui lit son propre lien', async () => {
    const app = await buildApp();

    const res = await app.inject({ method: 'GET', url: `/tracking-links/${TOKEN}` });
    await app.close();

    expect(res.json().data.trackingLink.targetId).toBe(TARGET_ID);
  });
});

describe('PATCH /tracking-links/:token — le nom et les UTM', () => {
  it('transmet le nom et les UTM fournis, et sert le lien modifié', async () => {
    mockUpdate.mockResolvedValue(makeLink({ name: 'Vitrine', campaign: 'hiver', source: 'insta', medium: null }));
    const app = await buildApp();

    const res = await app.inject({
      method: 'PATCH',
      url: `/tracking-links/${TOKEN}`,
      payload: { name: 'Vitrine', campaign: 'hiver', source: 'insta', medium: null },
    });
    await app.close();

    expect(res.statusCode).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
      token: TOKEN, name: 'Vitrine', campaign: 'hiver', source: 'insta', medium: null,
    }));
    expect(res.json().data.trackingLink.name).toBe('Vitrine');
  });

  it('refuse un nom de plus de 32 caractères', async () => {
    const app = await buildApp();

    const res = await app.inject({ method: 'PATCH', url: `/tracking-links/${TOKEN}`, payload: { name: 'x'.repeat(33) } });
    await app.close();

    expect(res.statusCode).toBe(400);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('refuse un UTM de plus de 100 caractères', async () => {
    const app = await buildApp();

    const res = await app.inject({ method: 'PATCH', url: `/tracking-links/${TOKEN}`, payload: { campaign: 'c'.repeat(101) } });
    await app.close();

    expect(res.statusCode).toBe(400);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("refuse au non-gestionnaire, sans rien écrire", async () => {
    mockGetByToken.mockResolvedValue(makeLink({ createdBy: '507f1f77bcf86cd799439099' }));
    const app = await buildApp();

    const res = await app.inject({ method: 'PATCH', url: `/tracking-links/${TOKEN}`, payload: { name: 'Pris' } });
    await app.close();

    expect(res.statusCode).toBe(403);
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});
