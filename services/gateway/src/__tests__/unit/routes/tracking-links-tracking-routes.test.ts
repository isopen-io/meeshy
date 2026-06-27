/**
 * tracking-links-tracking-routes.test.ts
 *
 * Unit tests for src/routes/tracking-links/tracking.ts
 * Covers: GET /l/:token, POST /tracking-links/:token/click,
 *         POST /tracking-links/:token/redirect-status,
 *         GET /tracking-links/:token/stats,
 *         GET /tracking-links/stats,
 *         GET /tracking-links/:token/clicks,
 *         GET /tracking-links/admin/all,
 *         GET /tracking-links/admin/:token/clicks
 */

import Fastify, { FastifyInstance } from 'fastify';
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

// ---------------------------------------------------------------------------
// Module mocks (before imports)
// ---------------------------------------------------------------------------

jest.mock('@meeshy/shared/types/api-schemas', () => ({
  trackingLinkSchema: { type: 'object', additionalProperties: true },
  errorResponseSchema: { type: 'object', additionalProperties: true },
  validationErrorResponseSchema: { type: 'object', additionalProperties: true },
}));

jest.mock('../../../utils/logger', () => ({
  logError: jest.fn(),
}));

jest.mock('../../../middleware/auth', () => ({
  createUnifiedAuthMiddleware: jest.fn(() => async () => {}),
  isRegisteredUser: jest.fn((ctx: any) => ctx?.type === 'registered'),
  UnifiedAuthRequest: {},
}));

jest.mock('../../../middleware/admin-permissions.middleware', () => ({
  requireAnalyticsPermission: jest.fn(async () => {}),
}));

const mockRecordClick           = jest.fn<any>();
const mockGetByToken            = jest.fn<any>();
const mockUpdateRedirectStatus  = jest.fn<any>();
const mockGetStats              = jest.fn<any>();
const mockGetClicks             = jest.fn<any>();
const mockGetAllLinks           = jest.fn<any>();

jest.mock('../../../routes/tracking-links/types', () => {
  const z = require('zod');
  return {
    createTrackingLinkSchema: z.object({ originalUrl: z.string() }),
    enrichTrackingLink: (link: any) => ({
      ...link,
      fullUrl: `https://test.meeshy.com/l/${link?.token ?? 'tok'}`,
    }),
    recordClickSchema: z.object({}).passthrough(),
    getStatsSchema: z.object({
      startDate: z.string().optional(),
      endDate: z.string().optional(),
    }),
    detectBrowser: jest.fn(() => 'Chrome'),
    detectOS: jest.fn(() => 'Windows'),
    detectDevice: jest.fn(() => 'desktop'),
  };
});

jest.mock('../../../services/TrackingLinkService', () => ({
  TrackingLinkService: jest.fn().mockImplementation(() => ({
    getTrackingLinkByToken:   (...args: any[]) => mockGetByToken(...args),
    recordClick:              (...args: any[]) => mockRecordClick(...args),
    updateRedirectStatus:     (...args: any[]) => mockUpdateRedirectStatus(...args),
    getTrackingLinkStats:     (...args: any[]) => mockGetStats(...args),
    getTrackingLinkClicks:    (...args: any[]) => mockGetClicks(...args),
    getAllTrackingLinks:       (...args: any[]) => mockGetAllLinks(...args),
  })),
}));

// ---------------------------------------------------------------------------
// Import route under test (after mocks)
// ---------------------------------------------------------------------------

import { registerTrackingRoutes } from '../../../routes/tracking-links/tracking';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const USER_ID = '507f1f77bcf86cd799439011';
const TOKEN   = 'abc123';

// ---------------------------------------------------------------------------
// Mock Prisma
// ---------------------------------------------------------------------------

const mockTrackingLink = {
  count:     jest.fn<any>(),
  aggregate: jest.fn<any>(),
  findFirst: jest.fn<any>(),
};

const mockPrisma: any = {
  trackingLink: mockTrackingLink,
};

// ---------------------------------------------------------------------------
// App builder
// ---------------------------------------------------------------------------

function buildApp(authContext?: any): FastifyInstance {
  const authModule = require('../../../middleware/auth');
  (authModule.createUnifiedAuthMiddleware as jest.Mock).mockImplementation(() =>
    async (req: any) => {
      req.authContext = authContext ?? {
        type: 'registered',
        registeredUser: { id: USER_ID, role: 'USER' },
        userId: USER_ID,
        hasFullAccess: true,
      };
    }
  );

  const app = Fastify({
    logger: false,
    ajv: { customOptions: { strict: 'log' as const, keywords: ['example'] } },
  });
  app.decorate('prisma', mockPrisma);
  app.decorate('authenticate', async (_req: any, _reply: any) => {});
  app.register(registerTrackingRoutes);
  return app;
}

function makeTrackingLink(overrides: any = {}) {
  return {
    id: 'tl-1',
    token: TOKEN,
    originalUrl: 'https://example.com',
    isActive: true,
    expiresAt: null,
    currentClicks: 0,
    createdBy: USER_ID,
    createdAt: new Date('2024-01-15'),
    updatedAt: new Date('2024-01-15'),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// GET /l/:token  (redirect)
// ---------------------------------------------------------------------------

describe('GET /l/:token', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    app = buildApp({ type: 'registered', registeredUser: { id: USER_ID }, userId: USER_ID, hasFullAccess: true });
  });

  afterEach(async () => { await app.close(); });

  it('redirects 302 to originalUrl on success', async () => {
    await app.ready();
    mockGetByToken.mockResolvedValue(makeTrackingLink());
    mockRecordClick.mockResolvedValue(undefined);

    const res = await app.inject({ method: 'GET', url: `/l/${TOKEN}` });

    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('https://example.com');
    expect(mockRecordClick).toHaveBeenCalledWith(
      expect.objectContaining({ token: TOKEN })
    );
  });

  it('returns 404 when token not found', async () => {
    await app.ready();
    mockGetByToken.mockResolvedValue(null);

    const res = await app.inject({ method: 'GET', url: `/l/${TOKEN}` });

    expect(res.statusCode).toBe(404);
  });

  it('returns 410 when link is inactive', async () => {
    await app.ready();
    mockGetByToken.mockResolvedValue(makeTrackingLink({ isActive: false }));

    const res = await app.inject({ method: 'GET', url: `/l/${TOKEN}` });

    expect(res.statusCode).toBe(410);
  });

  it('returns 410 when link has expired', async () => {
    await app.ready();
    mockGetByToken.mockResolvedValue(makeTrackingLink({ expiresAt: new Date('2020-01-01') }));

    const res = await app.inject({ method: 'GET', url: `/l/${TOKEN}` });

    expect(res.statusCode).toBe(410);
  });

  it('returns 500 on service error', async () => {
    await app.ready();
    mockGetByToken.mockRejectedValue(new Error('DB error'));

    const res = await app.inject({ method: 'GET', url: `/l/${TOKEN}` });

    expect(res.statusCode).toBe(500);
  });

  it('includes user id in recordClick when registered', async () => {
    await app.ready();
    mockGetByToken.mockResolvedValue(makeTrackingLink());
    mockRecordClick.mockResolvedValue(undefined);

    await app.inject({ method: 'GET', url: `/l/${TOKEN}` });

    expect(mockRecordClick).toHaveBeenCalledWith(
      expect.objectContaining({ userId: USER_ID })
    );
  });
});

// ---------------------------------------------------------------------------
// POST /tracking-links/:token/click
// ---------------------------------------------------------------------------

describe('POST /tracking-links/:token/click', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    app = buildApp();
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 with click details on success', async () => {
    await app.ready();
    const link = makeTrackingLink();
    mockRecordClick.mockResolvedValue({
      click: { id: 'click-1' },
      trackingLink: link,
    });

    const res = await app.inject({
      method: 'POST',
      url: `/tracking-links/${TOKEN}/click`,
      payload: {},
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.clickId).toBe('click-1');
    expect(body.data.originalUrl).toBe('https://example.com');
  });

  it('returns 404 when service throws "Tracking link not found"', async () => {
    await app.ready();
    mockRecordClick.mockRejectedValue(new Error('Tracking link not found'));

    const res = await app.inject({
      method: 'POST',
      url: `/tracking-links/${TOKEN}/click`,
      payload: {},
    });

    expect(res.statusCode).toBe(404);
  });

  it('returns 410 when service throws "Tracking link is inactive"', async () => {
    await app.ready();
    mockRecordClick.mockRejectedValue(new Error('Tracking link is inactive'));

    const res = await app.inject({
      method: 'POST',
      url: `/tracking-links/${TOKEN}/click`,
      payload: {},
    });

    expect(res.statusCode).toBe(410);
  });

  it('returns 410 when service throws "Tracking link has expired"', async () => {
    await app.ready();
    mockRecordClick.mockRejectedValue(new Error('Tracking link has expired'));

    const res = await app.inject({
      method: 'POST',
      url: `/tracking-links/${TOKEN}/click`,
      payload: {},
    });

    expect(res.statusCode).toBe(410);
  });

  it('returns 500 on generic service error', async () => {
    await app.ready();
    mockRecordClick.mockRejectedValue(new Error('DB error'));

    const res = await app.inject({
      method: 'POST',
      url: `/tracking-links/${TOKEN}/click`,
      payload: {},
    });

    expect(res.statusCode).toBe(500);
  });

  it('passes optional body fields to recordClick', async () => {
    await app.ready();
    const link = makeTrackingLink();
    mockRecordClick.mockResolvedValue({ click: { id: 'c-2' }, trackingLink: link });

    await app.inject({
      method: 'POST',
      url: `/tracking-links/${TOKEN}/click`,
      payload: { country: 'FR', city: 'Paris', referrer: 'https://t.co' },
    });

    expect(mockRecordClick).toHaveBeenCalledWith(
      expect.objectContaining({ country: 'FR', city: 'Paris', referrer: 'https://t.co' })
    );
  });
});

// ---------------------------------------------------------------------------
// POST /tracking-links/:token/redirect-status
// ---------------------------------------------------------------------------

describe('POST /tracking-links/:token/redirect-status', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    app = buildApp();
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 when status updated successfully', async () => {
    await app.ready();
    mockGetByToken.mockResolvedValue(makeTrackingLink());
    mockUpdateRedirectStatus.mockResolvedValue(undefined);

    const res = await app.inject({
      method: 'POST',
      url: `/tracking-links/${TOKEN}/redirect-status`,
      payload: { clickId: 'click-1', status: 'confirmed' },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
  });

  it('returns 400 when clickId is missing', async () => {
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: `/tracking-links/${TOKEN}/redirect-status`,
      payload: { status: 'confirmed' },
    });

    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when status is invalid', async () => {
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: `/tracking-links/${TOKEN}/redirect-status`,
      payload: { clickId: 'click-1', status: 'invalid' },
    });

    expect(res.statusCode).toBe(400);
  });

  it('returns 404 when token not found', async () => {
    await app.ready();
    mockGetByToken.mockResolvedValue(null);

    const res = await app.inject({
      method: 'POST',
      url: `/tracking-links/${TOKEN}/redirect-status`,
      payload: { clickId: 'click-1', status: 'confirmed' },
    });

    expect(res.statusCode).toBe(404);
  });

  it('returns 404 on service error (catch fallback)', async () => {
    await app.ready();
    mockGetByToken.mockRejectedValue(new Error('Service error'));

    const res = await app.inject({
      method: 'POST',
      url: `/tracking-links/${TOKEN}/redirect-status`,
      payload: { clickId: 'click-1', status: 'confirmed' },
    });

    expect(res.statusCode).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// GET /tracking-links/:token/stats
// ---------------------------------------------------------------------------

describe('GET /tracking-links/:token/stats', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    app = buildApp();
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 with stats for creator', async () => {
    await app.ready();
    mockGetByToken.mockResolvedValue(makeTrackingLink({ createdBy: USER_ID }));
    mockGetStats.mockResolvedValue({
      totalClicks: 42,
      uniqueClicks: 30,
      clicksByCountry: { FR: 20, US: 22 },
    });

    const res = await app.inject({
      method: 'GET',
      url: `/tracking-links/${TOKEN}/stats`,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.totalClicks).toBe(42);
  });

  it('returns 200 when link has no createdBy (public link)', async () => {
    await app.ready();
    mockGetByToken.mockResolvedValue(makeTrackingLink({ createdBy: null }));
    mockGetStats.mockResolvedValue({ totalClicks: 5, uniqueClicks: 3 });

    const res = await app.inject({
      method: 'GET',
      url: `/tracking-links/${TOKEN}/stats`,
    });

    expect(res.statusCode).toBe(200);
  });

  it('returns 403 when not the creator', async () => {
    await app.ready();
    mockGetByToken.mockResolvedValue(makeTrackingLink({ createdBy: 'other-user' }));

    const res = await app.inject({
      method: 'GET',
      url: `/tracking-links/${TOKEN}/stats`,
    });

    expect(res.statusCode).toBe(403);
  });

  it('returns 404 when token not found', async () => {
    await app.ready();
    mockGetByToken.mockResolvedValue(null);

    const res = await app.inject({
      method: 'GET',
      url: `/tracking-links/${TOKEN}/stats`,
    });

    expect(res.statusCode).toBe(404);
  });

  it('returns 500 on service error', async () => {
    await app.ready();
    mockGetByToken.mockRejectedValue(new Error('DB error'));

    const res = await app.inject({
      method: 'GET',
      url: `/tracking-links/${TOKEN}/stats`,
    });

    expect(res.statusCode).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// GET /tracking-links/stats  (user aggregated)
// ---------------------------------------------------------------------------

describe('GET /tracking-links/stats', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    app = buildApp();
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 with aggregated user stats', async () => {
    await app.ready();
    mockTrackingLink.count
      .mockResolvedValueOnce(10)  // totalLinks
      .mockResolvedValueOnce(7);  // activeLinks
    mockTrackingLink.aggregate
      .mockResolvedValueOnce({ _sum: { totalClicks: 150 } })
      .mockResolvedValueOnce({ _sum: { uniqueClicks: 80 } });

    const res = await app.inject({
      method: 'GET',
      url: '/tracking-links/stats',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.totalLinks).toBe(10);
    expect(body.data.activeLinks).toBe(7);
    expect(body.data.totalClicks).toBe(150);
    expect(body.data.uniqueClicks).toBe(80);
  });

  it('returns 0 counts when aggregate sums are null', async () => {
    await app.ready();
    mockTrackingLink.count.mockResolvedValue(0);
    mockTrackingLink.aggregate.mockResolvedValue({ _sum: { totalClicks: null, uniqueClicks: null } });

    const res = await app.inject({
      method: 'GET',
      url: '/tracking-links/stats',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.totalClicks).toBe(0);
    expect(body.data.uniqueClicks).toBe(0);
  });

  it('returns 403 when user is not registered', async () => {
    const anonApp = buildApp({ type: 'anonymous', anonymousUser: {}, userId: 'anon-1', hasFullAccess: false });
    await anonApp.ready();

    const res = await anonApp.inject({
      method: 'GET',
      url: '/tracking-links/stats',
    });
    await anonApp.close();

    expect(res.statusCode).toBe(403);
  });

  it('returns 500 on DB error', async () => {
    await app.ready();
    mockTrackingLink.count.mockRejectedValue(new Error('DB error'));

    const res = await app.inject({
      method: 'GET',
      url: '/tracking-links/stats',
    });

    expect(res.statusCode).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// GET /tracking-links/:token/clicks
// ---------------------------------------------------------------------------

describe('GET /tracking-links/:token/clicks', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    app = buildApp();
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 with paginated click data for owner', async () => {
    await app.ready();
    const link = makeTrackingLink({ createdBy: USER_ID });
    mockTrackingLink.findFirst.mockResolvedValue(link);
    mockGetClicks.mockResolvedValue({
      clicks: [{ id: 'c-1', createdAt: new Date() }],
      total: 1,
    });

    const res = await app.inject({
      method: 'GET',
      url: `/tracking-links/${TOKEN}/clicks`,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.clicks).toHaveLength(1);
    expect(body.pagination.total).toBe(1);
  });

  it('returns 404 when link not owned by user', async () => {
    await app.ready();
    mockTrackingLink.findFirst.mockResolvedValue(null);

    const res = await app.inject({
      method: 'GET',
      url: `/tracking-links/${TOKEN}/clicks`,
    });

    expect(res.statusCode).toBe(404);
  });

  it('returns 403 when user is not registered', async () => {
    const anonApp = buildApp({ type: 'anonymous', anonymousUser: {}, userId: 'anon-1', hasFullAccess: false });
    await anonApp.ready();

    const res = await anonApp.inject({
      method: 'GET',
      url: `/tracking-links/${TOKEN}/clicks`,
    });
    await anonApp.close();

    expect(res.statusCode).toBe(403);
  });

  it('returns 500 on DB error', async () => {
    await app.ready();
    mockTrackingLink.findFirst.mockRejectedValue(new Error('DB error'));

    const res = await app.inject({
      method: 'GET',
      url: `/tracking-links/${TOKEN}/clicks`,
    });

    expect(res.statusCode).toBe(500);
  });

  it('passes limit and offset to service', async () => {
    await app.ready();
    mockTrackingLink.findFirst.mockResolvedValue(makeTrackingLink({ createdBy: USER_ID }));
    mockGetClicks.mockResolvedValue({ clicks: [], total: 0 });

    await app.inject({
      method: 'GET',
      url: `/tracking-links/${TOKEN}/clicks?limit=10&offset=20`,
    });

    expect(mockGetClicks).toHaveBeenCalledWith('tl-1', 10, 20);
  });
});

// ---------------------------------------------------------------------------
// GET /tracking-links/admin/all
// ---------------------------------------------------------------------------

describe('GET /tracking-links/admin/all', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    app = buildApp();
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 with all tracking links', async () => {
    await app.ready();
    mockGetAllLinks.mockResolvedValue({
      trackingLinks: [makeTrackingLink()],
      total: 1,
    });

    const res = await app.inject({
      method: 'GET',
      url: '/tracking-links/admin/all',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.trackingLinks).toHaveLength(1);
    expect(body.total).toBe(1);
  });

  it('returns 200 with empty list', async () => {
    await app.ready();
    mockGetAllLinks.mockResolvedValue({ trackingLinks: [], total: 0 });

    const res = await app.inject({
      method: 'GET',
      url: '/tracking-links/admin/all',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.trackingLinks).toHaveLength(0);
  });

  it('passes search param to service', async () => {
    await app.ready();
    mockGetAllLinks.mockResolvedValue({ trackingLinks: [], total: 0 });

    await app.inject({
      method: 'GET',
      url: '/tracking-links/admin/all?search=example&limit=5&offset=10',
    });

    expect(mockGetAllLinks).toHaveBeenCalledWith(
      expect.objectContaining({ search: 'example', limit: 5, offset: 10 })
    );
  });

  it('returns 500 on service error', async () => {
    await app.ready();
    mockGetAllLinks.mockRejectedValue(new Error('DB error'));

    const res = await app.inject({
      method: 'GET',
      url: '/tracking-links/admin/all',
    });

    expect(res.statusCode).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// GET /tracking-links/admin/:token/clicks
// ---------------------------------------------------------------------------

describe('GET /tracking-links/admin/:token/clicks', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    app = buildApp();
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 with click list for token', async () => {
    await app.ready();
    mockGetByToken.mockResolvedValue(makeTrackingLink());
    mockGetClicks.mockResolvedValue({
      clicks: [{ id: 'c-1' }, { id: 'c-2' }],
      total: 2,
    });

    const res = await app.inject({
      method: 'GET',
      url: `/tracking-links/admin/${TOKEN}/clicks`,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.clicks).toHaveLength(2);
    expect(body.total).toBe(2);
  });

  it('returns 404 when token not found', async () => {
    await app.ready();
    mockGetByToken.mockResolvedValue(null);

    const res = await app.inject({
      method: 'GET',
      url: `/tracking-links/admin/${TOKEN}/clicks`,
    });

    expect(res.statusCode).toBe(404);
  });

  it('returns 500 on service error', async () => {
    await app.ready();
    mockGetByToken.mockRejectedValue(new Error('DB error'));

    const res = await app.inject({
      method: 'GET',
      url: `/tracking-links/admin/${TOKEN}/clicks`,
    });

    expect(res.statusCode).toBe(500);
  });
});
