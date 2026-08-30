/**
 * Preuve HTTP, sur le schéma RÉEL (#4168) — pas un mock.
 *
 * `tracking-extended.test.ts` et `tracking.test.ts` mockent
 * `@meeshy/shared/types/api-schemas` en `{ trackingLinkSchema: { type:
 * 'object', additionalProperties: true }, … }` : un choix légitime pour
 * isoler la route de son voisinage, mais qui aurait rendu ce lot invisible à
 * leurs propres témoins — `securite.md` le nomme en toutes lettres : « un
 * test mockant le schéma en additionalProperties: true ne pouvait donc pas
 * attraper ceci ». Ce fichier ne mocke donc PAS `api-schemas` : le module
 * réel est chargé, `fastify.get(...).schema.response[200]` est le VRAI
 * schéma compilé par `fast-json-stringify`, exactement celui qui tourne en
 * production. Seuls le service (pour contrôler la ligne « brute » servie par
 * Prisma) et l'auth (pour choisir le rôle) sont mockés.
 *
 * Chaque test choisit d'abord la ligne de clic la plus dangereuse possible —
 * un objet portant TOUTES les colonnes de `TrackingLinkClick`
 * (schema.prisma), `ipAddress`/`deviceFingerprint`/`userAgent` compris,
 * exactement ce qu'un `findMany()` sans `select` renvoie réellement
 * (`TrackingLinkService.getTrackingLinkClicks`) — puis vérifie les DEUX
 * moitiés de la preuve (critère (d) de l'issue) : les champs voulus
 * SURVIVENT, et `ipAddress` + le reste de l'empreinte de visiteur sont
 * RETIRÉS.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeAll, afterAll } from '@jest/globals';
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

const USER_ID = '507f1f77bcf86cd799439011';
const TOKEN = 'abc123';

const mockRegisteredAuthContext = {
  type: 'registered' as const,
  isAuthenticated: true,
  userId: USER_ID,
  hasFullAccess: true,
  isAnonymous: false,
  registeredUser: { id: USER_ID, username: 'alice', role: 'USER' },
};

jest.mock('../../../../middleware/auth', () => ({
  createUnifiedAuthMiddleware: jest.fn().mockReturnValue(
    async (req: any) => { req.authContext = mockRegisteredAuthContext; }
  ),
  isRegisteredUser: jest.fn().mockReturnValue(true),
  UnifiedAuthRequest: {},
}));

// Déclarés AVANT `jest.mock` : la factory ci-dessous tourne au premier
// `require('.../TrackingLinkService')`, déclenché par l'import de
// `tracking.ts` plus bas — donc AVANT que les `const RAW_LINK`/`RAW_CLICK`
// de ce fichier n'existent. Y référencer une constante définie plus loin
// lèverait une TDZ ReferenceError ; référencer un `jest.fn()` déclaré ICI,
// dont la valeur de résolution est posée plus tard (dans `buildApp`), évite
// le piège.
const mockGetTrackingLinkClicks = jest.fn();
const mockGetAllTrackingLinks = jest.fn();
const mockGetTrackingLinkByToken = jest.fn();

jest.mock('../../../../services/TrackingLinkService', () => ({
  TrackingLinkService: jest.fn().mockImplementation(() => ({
    getTrackingLinkClicks: (...a: any[]) => mockGetTrackingLinkClicks(...a),
    getAllTrackingLinks: (...a: any[]) => mockGetAllTrackingLinks(...a),
    getTrackingLinkByToken: (...a: any[]) => mockGetTrackingLinkByToken(...a),
    getTrackingLinkStats: jest.fn(),
    recordClick: jest.fn(),
    updateRedirectStatus: jest.fn(),
    findExistingTrackingLink: jest.fn(),
    createTrackingLink: jest.fn(),
    isTokenAvailable: jest.fn().mockResolvedValue(true),
    buildTrackingUrl: (token: string) => `https://meeshy.me/l/${token}`,
  })),
  resolveFrontendBaseUrl: jest.fn().mockReturnValue('https://meeshy.me'),
}));

// ─── Import après les mocks — SANS mocker `@meeshy/shared/types/api-schemas` ─
import { registerTrackingRoutes } from '../../../../routes/tracking-links/tracking';

const LINK_ID = 'link-id-001';
const RAW_LINK = {
  id: LINK_ID,
  token: TOKEN,
  name: 'Campagne été',
  campaign: null,
  source: null,
  medium: null,
  originalUrl: 'https://example.com/promo',
  shortUrl: 'https://meeshy.me/l/abc123',
  createdBy: USER_ID,
  conversationId: null,
  messageId: null,
  totalClicks: 1,
  uniqueClicks: 1,
  isActive: true,
  expiresAt: null,
  createdAt: new Date('2026-08-01T00:00:00Z'),
  updatedAt: new Date('2026-08-01T00:00:00Z'),
  lastClickedAt: new Date('2026-08-20T00:00:00Z'),
};

/**
 * Une ligne `trackingLinkClick` (schema.prisma) COMPLÈTE — toutes les
 * colonnes qu'un `findMany()` sans `select` renvoie réellement, PII de
 * visiteur comprise. C'est exactement ce que
 * `TrackingLinkService.getTrackingLinkClicks` sert au handler.
 */
const RAW_CLICK = {
  id: 'click-1',
  trackingLinkId: LINK_ID,
  participantId: 'participant-9',
  ipAddress: '203.0.113.42',
  country: 'FR',
  city: 'Paris',
  region: 'Île-de-France',
  userAgent: 'Mozilla/5.0 (secret rig fingerprint)',
  browser: 'Chrome',
  os: 'macOS',
  device: 'desktop',
  language: 'fr',
  languages: 'fr,en-US,en',
  referrer: 'https://google.com/search?q=meeshy',
  deviceFingerprint: 'fp-9f8e7d6c5b4a',
  screenResolution: '1920x1080',
  viewportSize: '1440x900',
  pixelRatio: 2,
  colorDepth: 24,
  timezone: 'Europe/Paris',
  connectionType: 'wifi',
  connectionSpeed: 42.5,
  touchSupport: false,
  platform: 'MacIntel',
  cookiesEnabled: true,
  hardwareConcurrency: 8,
  deviceMemory: 16,
  socialSource: 'whatsapp',
  utmClickSource: 'newsletter',
  utmClickMedium: 'email',
  utmClickCampaign: 'ete2026',
  utmClickTerm: null,
  utmClickContent: null,
  redirectStatus: 'confirmed',
  clickedAt: new Date('2026-08-20T10:00:00Z'),
};

/** Toute clé qu'un visiteur n'a pas consentie à exposer à un tiers. */
const VISITOR_IDENTIFYING_KEYS = [
  'ipAddress', 'userAgent', 'deviceFingerprint', 'participantId',
  'region', 'language', 'languages', 'timezone', 'screenResolution',
  'viewportSize', 'pixelRatio', 'colorDepth', 'connectionType',
  'connectionSpeed', 'touchSupport', 'platform', 'cookiesEnabled',
  'hardwareConcurrency', 'deviceMemory', 'utmClickSource', 'utmClickMedium',
  'utmClickCampaign', 'utmClickTerm', 'utmClickContent', 'trackingLinkId',
] as const;

/** Les champs que les quatre plateformes (iOS SDK, Android, web admin) lisent réellement. */
const EXPECTED_SURVIVING_CLICK_KEYS = [
  'id', 'country', 'city', 'device', 'browser', 'os', 'referrer',
  'socialSource', 'redirectStatus', 'clickedAt',
] as const;

async function buildApp(): Promise<FastifyInstance> {
  mockGetTrackingLinkByToken.mockResolvedValue(RAW_LINK);
  const app = Fastify({ logger: false });
  app.decorate('prisma', {
    trackingLink: { findFirst: jest.fn().mockResolvedValue(RAW_LINK) },
  } as any);
  app.decorate('authenticate', async (req: any) => { req.authContext = mockRegisteredAuthContext; });
  await registerTrackingRoutes(app);
  await app.ready();
  return app;
}

describe('GET /tracking-links/:token/clicks — le schéma RÉEL retire la PII de visiteur', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    mockGetTrackingLinkClicks.mockResolvedValue({ clicks: [RAW_CLICK], total: 1 });
    app = await buildApp();
  });
  afterAll(async () => { await app.close(); });

  it('sert les champs que les quatre plateformes lisent', async () => {
    const res = await app.inject({ method: 'GET', url: `/tracking-links/${TOKEN}/clicks` });
    expect(res.statusCode).toBe(200);

    const click = res.json().data.clicks[0];
    for (const key of EXPECTED_SURVIVING_CLICK_KEYS) {
      expect(click).toHaveProperty(key);
    }
    expect(click.country).toBe('FR');
    expect(click.redirectStatus).toBe('confirmed');
  });

  it("ne sert AUCUN champ identifiant le visiteur — ni ipAddress, ni son cortège de fingerprinting", async () => {
    const res = await app.inject({ method: 'GET', url: `/tracking-links/${TOKEN}/clicks` });
    const click = res.json().data.clicks[0];

    for (const key of VISITOR_IDENTIFYING_KEYS) {
      expect(click).not.toHaveProperty(key);
    }
  });

  it('sert le lien fermé lui aussi (trackingLinkSchema réel, pas de fuite additionnelle)', async () => {
    const res = await app.inject({ method: 'GET', url: `/tracking-links/${TOKEN}/clicks` });
    const { link } = res.json().data;

    expect(link.token).toBe(TOKEN);
    expect(link.originalUrl).toBe(RAW_LINK.originalUrl);
    expect(link).not.toHaveProperty('__proto__internal');
  });
});

describe('GET /tracking-links/admin/:token/clicks — même fermeture, même enveloppe corrigée', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    mockGetTrackingLinkClicks.mockResolvedValue({ clicks: [RAW_CLICK], total: 1 });
    app = await buildApp();
  });
  afterAll(async () => { await app.close(); });

  it("sert `clicks`/`total` sous `data` — l'enveloppe était fausse et servait `{success:true}` seul", async () => {
    const res = await app.inject({ method: 'GET', url: `/tracking-links/admin/${TOKEN}/clicks` });
    expect(res.statusCode).toBe(200);

    const body = res.json();
    expect(body).not.toHaveProperty('clicks'); // plus à la racine
    expect(body.data.clicks).toHaveLength(1);
    expect(body.data.total).toBe(1);
  });

  it('la jumelle admin ne sert pas plus de PII que la route propriétaire — même absence mesurée', async () => {
    const res = await app.inject({ method: 'GET', url: `/tracking-links/admin/${TOKEN}/clicks` });
    const click = res.json().data.clicks[0];

    for (const key of VISITOR_IDENTIFYING_KEYS) {
      expect(click).not.toHaveProperty(key);
    }
    for (const key of EXPECTED_SURVIVING_CLICK_KEYS) {
      expect(click).toHaveProperty(key);
    }
  });
});

describe('GET /tracking-links/admin/all — enveloppe corrigée, créateur préservé', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    mockGetAllTrackingLinks.mockResolvedValue({
      trackingLinks: [{
        ...RAW_LINK,
        creator: { id: USER_ID, username: 'alice', displayName: 'Alice', avatar: 'https://cdn/a.png' },
      }],
      total: 1,
    });
    app = await buildApp();
  });
  afterAll(async () => { await app.close(); });

  it('sert `trackingLinks`/`total` sous `data`, avec le créateur (lu par la page admin web)', async () => {
    const res = await app.inject({ method: 'GET', url: '/tracking-links/admin/all' });
    expect(res.statusCode).toBe(200);

    const body = res.json();
    expect(body).not.toHaveProperty('trackingLinks'); // plus à la racine
    expect(body.data.total).toBe(1);
    expect(body.data.trackingLinks[0].creator.displayName).toBe('Alice');
    expect(body.data.trackingLinks[0].token).toBe(TOKEN);
  });
});
