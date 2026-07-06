/**
 * Unit tests for remaining tracking-links routes (tracking.ts)
 * Covers: GET /l/:token, POST /:token/redirect-status,
 *         GET /:token/clicks, GET /admin/all, GET /admin/:token/clicks.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeAll, afterAll } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn(() => ({
      info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn(),
    })),
  },
}));

jest.mock('../../../../utils/logger', () => ({ logError: jest.fn() }));

jest.mock('../../../../middleware/admin-permissions.middleware', () => ({
  requireAnalyticsPermission: jest.fn().mockImplementation(async () => {}),
}));

jest.mock('@meeshy/shared/types/api-schemas', () => ({
  trackingLinkSchema: { type: 'object', additionalProperties: true },
  errorResponseSchema: { type: 'object', properties: {} },
  validationErrorResponseSchema: { type: 'object', properties: {} },
}));

let mockIsRegistered = false;
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
const mockAnonAuthContext = {
  type: 'anonymous' as const,
  isAuthenticated: false,
  userId: 'anon-session',
  hasFullAccess: false,
  isAnonymous: true,
  anonymousUser: { id: 'anon-1' },
  registeredUser: null,
  participantId: 'part-anon',
};

jest.mock('../../../../middleware/auth', () => ({
  createUnifiedAuthMiddleware: jest.fn().mockReturnValue(
    async (req: any) => {
      req.authContext = mockIsRegistered ? mockRegisteredAuthContext : mockAnonAuthContext;
    }
  ),
  isRegisteredUser: jest.fn().mockImplementation(() => mockIsRegistered),
  UnifiedAuthRequest: {},
}));

const mockGetByToken = jest.fn();
const mockRecordClick = jest.fn().mockResolvedValue({ id: 'click-1' });
const mockUpdateRedirectStatus = jest.fn().mockResolvedValue(undefined);
const mockGetTrackingLinkClicks = jest.fn().mockResolvedValue({ clicks: [], total: 0 });
const mockGetAllTrackingLinks = jest.fn().mockResolvedValue({ trackingLinks: [], total: 0 });

jest.mock('../../../../services/TrackingLinkService', () => ({
  TrackingLinkService: jest.fn().mockImplementation(() => ({
    getTrackingLinkByToken: (...a: any[]) => mockGetByToken(...a),
    recordClick: (...a: any[]) => mockRecordClick(...a),
    updateRedirectStatus: (...a: any[]) => mockUpdateRedirectStatus(...a),
    getTrackingLinkClicks: (...a: any[]) => mockGetTrackingLinkClicks(...a),
    getAllTrackingLinks: (...a: any[]) => mockGetAllTrackingLinks(...a),
    findExistingTrackingLink: jest.fn().mockResolvedValue(null),
    createTrackingLink: jest.fn(),
    getTrackingLinkStats: jest.fn(),
    isTokenAvailable: jest.fn().mockResolvedValue(true),
    resolveTarget: jest.fn(),
    getConversationTrackingLinks: jest.fn(),
    deactivateTrackingLink: jest.fn(),
    deleteTrackingLink: jest.fn(),
    buildTrackingUrl: (token: string) => `https://meeshy.me/l/${token}`,
  })),
  resolveFrontendBaseUrl: jest.fn().mockReturnValue('https://meeshy.me'),
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { registerTrackingRoutes } from '../../../../routes/tracking-links/tracking';

// ─── Constants ────────────────────────────────────────────────────────────────

const LINK_ID = 'link-id-001';
const mockActiveLink = {
  id: LINK_ID,
  token: TOKEN,
  originalUrl: 'https://example.com',
  isActive: true,
  expiresAt: null,
  createdBy: USER_ID,
};

// ─── App factory ──────────────────────────────────────────────────────────────

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', {
    trackingLink: {
      findFirst: jest.fn().mockResolvedValue(mockActiveLink),
    },
  });
  app.decorate('authenticate', async (req: any) => {
    req.authContext = mockIsRegistered ? mockRegisteredAuthContext : mockAnonAuthContext;
  });
  await registerTrackingRoutes(app);
  await app.ready();
  return app;
}

// ─── GET /l/:token ────────────────────────────────────────────────────────────

describe('GET /l/:token (not found)', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockIsRegistered = false;
    mockGetByToken.mockResolvedValue(null);
    app = await buildApp();
  });
  afterAll(async () => { await app.close(); });

  it('returns 404 when tracking link does not exist', async () => {
    const res = await app.inject({ method: 'GET', url: `/l/${TOKEN}` });
    expect(res.statusCode).toBe(404);
  });
});

describe('GET /l/:token (inactive)', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockIsRegistered = false;
    mockGetByToken.mockResolvedValue({ ...mockActiveLink, isActive: false });
    app = await buildApp();
  });
  afterAll(async () => { await app.close(); });

  it('returns 410 when link is inactive', async () => {
    const res = await app.inject({ method: 'GET', url: `/l/${TOKEN}` });
    expect(res.statusCode).toBe(410);
  });
});

describe('GET /l/:token (expired)', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockIsRegistered = false;
    mockGetByToken.mockResolvedValue({ ...mockActiveLink, expiresAt: new Date('2020-01-01') });
    app = await buildApp();
  });
  afterAll(async () => { await app.close(); });

  it('returns 410 when link has expired', async () => {
    const res = await app.inject({ method: 'GET', url: `/l/${TOKEN}` });
    expect(res.statusCode).toBe(410);
  });
});

describe('GET /l/:token (success as registered user)', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockIsRegistered = true;
    mockGetByToken.mockResolvedValue(mockActiveLink);
    app = await buildApp();
  });
  afterAll(async () => { await app.close(); });

  it('records click and redirects (302)', async () => {
    const res = await app.inject({ method: 'GET', url: `/l/${TOKEN}` });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('https://example.com');
  });
});

describe('GET /l/:token (success as anonymous user)', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockIsRegistered = false;
    mockGetByToken.mockResolvedValue(mockActiveLink);
    app = await buildApp();
  });
  afterAll(async () => { await app.close(); });

  it('records click and redirects (302) for anonymous user', async () => {
    const res = await app.inject({ method: 'GET', url: `/l/${TOKEN}` });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('https://example.com');
  });
});

describe('GET /l/:token (service error)', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockIsRegistered = false;
    mockGetByToken.mockRejectedValue(new Error('DB error'));
    app = await buildApp();
  });
  afterAll(async () => { await app.close(); });

  it('returns 500 on unexpected error', async () => {
    const res = await app.inject({ method: 'GET', url: `/l/${TOKEN}` });
    expect(res.statusCode).toBe(500);
  });
});

// ─── POST /tracking-links/:token/redirect-status ──────────────────────────────

describe('POST /tracking-links/:token/redirect-status (link not found)', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockIsRegistered = false;
    mockGetByToken.mockResolvedValue(null);
    app = await buildApp();
  });
  afterAll(async () => { await app.close(); });

  it('returns 404 when tracking link not found', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/tracking-links/${TOKEN}/redirect-status`,
      payload: { clickId: 'click-1', status: 'confirmed' },
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('POST /tracking-links/:token/redirect-status (success)', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockIsRegistered = false;
    mockGetByToken.mockResolvedValue(mockActiveLink);
    app = await buildApp();
  });
  afterAll(async () => { await app.close(); });

  it('returns 200 on successful status update', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/tracking-links/${TOKEN}/redirect-status`,
      payload: { clickId: 'click-1', status: 'confirmed' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });

  it('returns 400 when status is invalid', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/tracking-links/${TOKEN}/redirect-status`,
      payload: { clickId: 'click-1', status: 'invalid-status' },
    });
    expect(res.statusCode).toBe(400);
  });
});

// ─── GET /tracking-links/:token/clicks ───────────────────────────────────────

describe('GET /tracking-links/:token/clicks (not registered)', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockIsRegistered = false;
    app = await buildApp();
  });
  afterAll(async () => { await app.close(); });

  it('returns 403 when user is not registered', async () => {
    const res = await app.inject({ method: 'GET', url: `/tracking-links/${TOKEN}/clicks` });
    expect(res.statusCode).toBe(403);
  });
});

describe('GET /tracking-links/:token/clicks (link not found)', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockIsRegistered = true;
    app = await buildApp();
    (app as any).prisma.trackingLink.findFirst.mockResolvedValue(null);
  });
  afterAll(async () => { await app.close(); });

  it('returns 404 when link not found for this user', async () => {
    const res = await app.inject({ method: 'GET', url: `/tracking-links/${TOKEN}/clicks` });
    expect(res.statusCode).toBe(404);
  });
});

describe('GET /tracking-links/:token/clicks (registered, success)', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockIsRegistered = true;
    mockGetTrackingLinkClicks.mockResolvedValue({ clicks: [{ id: 'c1', clickedAt: new Date() }], total: 1 });
    app = await buildApp();
  });
  afterAll(async () => { await app.close(); });

  it('returns 200 with clicks list', async () => {
    const res = await app.inject({ method: 'GET', url: `/tracking-links/${TOKEN}/clicks` });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });
});

// ─── GET /tracking-links/admin/all ───────────────────────────────────────────

describe('GET /tracking-links/admin/all (success)', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockIsRegistered = true;
    mockGetAllTrackingLinks.mockResolvedValue({ trackingLinks: [mockActiveLink], total: 1 });
    app = await buildApp();
  });
  afterAll(async () => { await app.close(); });

  it('returns 200 with all tracking links', async () => {
    const res = await app.inject({ method: 'GET', url: '/tracking-links/admin/all' });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });
});

describe('GET /tracking-links/admin/all (service error)', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockIsRegistered = true;
    mockGetAllTrackingLinks.mockRejectedValue(new Error('DB error'));
    app = await buildApp();
  });
  afterAll(async () => { await app.close(); });

  it('returns 500 on service error', async () => {
    const res = await app.inject({ method: 'GET', url: '/tracking-links/admin/all' });
    expect(res.statusCode).toBe(500);
  });
});

// ─── GET /tracking-links/admin/:token/clicks ─────────────────────────────────

describe('GET /tracking-links/admin/:token/clicks (link not found)', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockIsRegistered = true;
    mockGetByToken.mockResolvedValue(null);
    app = await buildApp();
  });
  afterAll(async () => { await app.close(); });

  it('returns 404 when tracking link not found', async () => {
    const res = await app.inject({ method: 'GET', url: `/tracking-links/admin/${TOKEN}/clicks` });
    expect(res.statusCode).toBe(404);
  });
});

describe('GET /tracking-links/admin/:token/clicks (success)', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockIsRegistered = true;
    mockGetByToken.mockResolvedValue(mockActiveLink);
    mockGetTrackingLinkClicks.mockResolvedValue({ clicks: [{ id: 'c1' }], total: 1 });
    app = await buildApp();
  });
  afterAll(async () => { await app.close(); });

  it('returns 200 with click data', async () => {
    const res = await app.inject({ method: 'GET', url: `/tracking-links/admin/${TOKEN}/clicks` });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });
});
