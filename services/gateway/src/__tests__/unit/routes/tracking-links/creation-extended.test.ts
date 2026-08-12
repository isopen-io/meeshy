/**
 * Extended unit tests for tracking-links routes.
 * Covers: GET/:token, GET/:token/resolve, GET/user/me, GET/conversation/:id,
 *         PATCH/:token/deactivate, POST/:token/click, GET/:token/stats, GET/stats.
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

jest.mock('../../../../utils/sanitize', () => ({
  SecuritySanitizer: { sanitizeText: jest.fn((s: string) => s) },
}));

jest.mock('../../../../middleware/admin-permissions.middleware', () => ({
  requireAnalyticsPermission: jest.fn(),
}));

jest.mock('@meeshy/shared/types/api-schemas', () => ({
  trackingLinkSchema: { type: 'object', additionalProperties: true },
  errorResponseSchema: { type: 'object', properties: {} },
  validationErrorResponseSchema: { type: 'object', properties: {} },
}));

// Mutable auth state so individual tests can control isRegisteredUser
let mockIsRegistered = false;
const USER_ID = 'user-abc123';
const mockRegisteredAuthContext = {
  type: 'registered' as const,
  isAuthenticated: true,
  userId: USER_ID,
  hasFullAccess: true,
  registeredUser: { id: USER_ID, username: 'alice', role: 'USER' },
};
const mockAnonAuthContext = {
  type: 'anonymous' as const,
  isAuthenticated: false,
  userId: 'anon-session',
  hasFullAccess: false,
  anonymousUser: null,
  registeredUser: null,
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

// TrackingLinkService mocks
const mockGetByToken = jest.fn();
const mockRecordClick = jest.fn();
const mockFindExisting = jest.fn().mockResolvedValue(null);
const mockCreate = jest.fn();
const mockGetStats = jest.fn();
const mockIsTokenAvailable = jest.fn().mockResolvedValue(true);
const mockResolveTarget = jest.fn();
const mockGetConversationLinks = jest.fn();
const mockDeactivate = jest.fn();
const mockDeleteLink = jest.fn();

jest.mock('../../../../services/TrackingLinkService', () => ({
  TrackingLinkService: jest.fn().mockImplementation(() => ({
    getTrackingLinkByToken: (...a: any[]) => mockGetByToken(...a),
    recordClick: (...a: any[]) => mockRecordClick(...a),
    findExistingTrackingLink: (...a: any[]) => mockFindExisting(...a),
    createTrackingLink: (...a: any[]) => mockCreate(...a),
    getTrackingLinkStats: (...a: any[]) => mockGetStats(...a),
    isTokenAvailable: (...a: any[]) => mockIsTokenAvailable(...a),
    resolveTarget: (...a: any[]) => mockResolveTarget(...a),
    getConversationTrackingLinks: (...a: any[]) => mockGetConversationLinks(...a),
    deactivateTrackingLink: (...a: any[]) => mockDeactivate(...a),
    deleteTrackingLink: (...a: any[]) => mockDeleteLink(...a),
    buildTrackingUrl: (token: string) => `https://meeshy.me/l/${token}`,
  })),
  resolveFrontendBaseUrl: jest.fn().mockReturnValue('https://meeshy.me'),
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { registerTrackingRoutes } from '../../../../routes/tracking-links/tracking';
import { registerCreationRoutes } from '../../../../routes/tracking-links/creation';

// ─── Constants ────────────────────────────────────────────────────────────────

const TOKEN = 'abc123';
const CONV_ID = '507f1f77bcf86cd799439011';

const mockLink = {
  id: 'link-1',
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
      findUnique: jest.fn().mockResolvedValue(mockLink),
      findFirst: jest.fn().mockResolvedValue(mockLink),
      findMany: jest.fn().mockResolvedValue([mockLink]),
      count: jest.fn().mockResolvedValue(1),
      aggregate: jest.fn().mockResolvedValue({ _sum: { totalClicks: 5, uniqueClicks: 3 } }),
    },
    participant: {
      findFirst: jest.fn().mockResolvedValue({ id: 'part-1' }),
    },
  });
  app.decorate('authenticate', async () => {});
  await registerTrackingRoutes(app);
  await registerCreationRoutes(app);
  await app.ready();
  return app;
}

// ─── GET /tracking-links/:token ───────────────────────────────────────────────

describe('GET /tracking-links/:token', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockIsRegistered = false;
    app = await buildApp();
  });
  afterAll(async () => { await app.close(); });

  it('returns 404 when link not found', async () => {
    mockGetByToken.mockResolvedValueOnce(null);
    const res = await app.inject({ method: 'GET', url: '/tracking-links/' + TOKEN });
    expect(res.statusCode).toBe(404);
  });

  it('returns 403 when not the creator (anon)', async () => {
    mockGetByToken.mockResolvedValueOnce({ ...mockLink, createdBy: 'other-user' });
    const res = await app.inject({ method: 'GET', url: '/tracking-links/' + TOKEN });
    expect(res.statusCode).toBe(403);
  });

  it('returns 200 when link has no createdBy (public link)', async () => {
    mockGetByToken.mockResolvedValueOnce({ ...mockLink, createdBy: null });
    const res = await app.inject({ method: 'GET', url: '/tracking-links/' + TOKEN });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });
});

describe('GET /tracking-links/:token (as registered creator)', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockIsRegistered = true;
    app = await buildApp();
  });
  afterAll(async () => {
    mockIsRegistered = false;
    await app.close();
  });

  it('returns 200 when registered user is creator', async () => {
    mockGetByToken.mockResolvedValueOnce({ ...mockLink, createdBy: USER_ID });
    const res = await app.inject({ method: 'GET', url: '/tracking-links/' + TOKEN });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });

  it('returns 403 when registered user is not creator', async () => {
    mockGetByToken.mockResolvedValueOnce({ ...mockLink, createdBy: 'other-user' });
    const res = await app.inject({ method: 'GET', url: '/tracking-links/' + TOKEN });
    expect(res.statusCode).toBe(403);
  });
});

// ─── GET /tracking-links/:token/resolve ───────────────────────────────────────

describe('GET /tracking-links/:token/resolve', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockIsRegistered = false;
    app = await buildApp();
  });
  afterAll(async () => { await app.close(); });

  it('returns 404 when token resolves to nothing', async () => {
    mockResolveTarget.mockResolvedValueOnce(null);
    const res = await app.inject({ method: 'GET', url: '/tracking-links/' + TOKEN + '/resolve' });
    expect(res.statusCode).toBe(404);
  });

  it('returns 200 with resolved target', async () => {
    mockResolveTarget.mockResolvedValueOnce({
      kind: 'tracking',
      targetType: 'external',
      targetId: null,
      originalUrl: 'https://example.com',
      isActive: true,
      expiresAt: null,
    });
    const res = await app.inject({ method: 'GET', url: '/tracking-links/' + TOKEN + '/resolve' });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });

  it('returns 500 on unexpected error', async () => {
    mockResolveTarget.mockRejectedValueOnce(new Error('db crash'));
    const res = await app.inject({ method: 'GET', url: '/tracking-links/' + TOKEN + '/resolve' });
    expect(res.statusCode).toBe(500);
  });
});

// ─── GET /tracking-links/user/me ──────────────────────────────────────────────

describe('GET /tracking-links/user/me (not registered)', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockIsRegistered = false;
    app = await buildApp();
  });
  afterAll(async () => { await app.close(); });

  it('returns 403 when user is not registered', async () => {
    const res = await app.inject({ method: 'GET', url: '/tracking-links/user/me' });
    expect(res.statusCode).toBe(403);
  });
});

describe('GET /tracking-links/user/me (registered)', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockIsRegistered = true;
    app = await buildApp();
  });
  afterAll(async () => {
    mockIsRegistered = false;
    await app.close();
  });

  it('returns 200 with paginated user links', async () => {
    const res = await app.inject({ method: 'GET', url: '/tracking-links/user/me' });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });
});

// ─── GET /tracking-links/conversation/:conversationId ─────────────────────────

describe('GET /tracking-links/conversation/:conversationId (not registered)', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockIsRegistered = false;
    app = await buildApp();
  });
  afterAll(async () => { await app.close(); });

  it('returns 403 when user is not registered', async () => {
    const res = await app.inject({ method: 'GET', url: '/tracking-links/conversation/' + CONV_ID });
    expect(res.statusCode).toBe(403);
  });
});

describe('GET /tracking-links/conversation/:conversationId (registered)', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockIsRegistered = true;
    app = await buildApp();
  });
  afterAll(async () => {
    mockIsRegistered = false;
    await app.close();
  });

  it('returns 403 when user is not a participant', async () => {
    (app as any).prisma.participant.findFirst.mockResolvedValueOnce(null);
    const res = await app.inject({ method: 'GET', url: '/tracking-links/conversation/' + CONV_ID });
    expect(res.statusCode).toBe(403);
  });

  it('returns 200 with conversation links', async () => {
    mockGetConversationLinks.mockResolvedValueOnce([mockLink]);
    const res = await app.inject({ method: 'GET', url: '/tracking-links/conversation/' + CONV_ID });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });
});

// ─── PATCH /tracking-links/:token/deactivate ──────────────────────────────────

describe('PATCH /tracking-links/:token/deactivate (not registered)', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockIsRegistered = false;
    app = await buildApp();
  });
  afterAll(async () => { await app.close(); });

  it('returns 403 when user is not registered', async () => {
    const res = await app.inject({ method: 'PATCH', url: '/tracking-links/' + TOKEN + '/deactivate' });
    expect(res.statusCode).toBe(403);
  });
});

describe('PATCH /tracking-links/:token/deactivate (registered)', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockIsRegistered = true;
    app = await buildApp();
  });
  afterAll(async () => {
    mockIsRegistered = false;
    await app.close();
  });

  it('returns 404 when link not found', async () => {
    mockGetByToken.mockResolvedValueOnce(null);
    const res = await app.inject({ method: 'PATCH', url: '/tracking-links/' + TOKEN + '/deactivate' });
    expect(res.statusCode).toBe(404);
  });

  it('returns 403 when user is not the creator', async () => {
    mockGetByToken.mockResolvedValueOnce({ ...mockLink, createdBy: 'other-user' });
    const res = await app.inject({ method: 'PATCH', url: '/tracking-links/' + TOKEN + '/deactivate' });
    expect(res.statusCode).toBe(403);
  });

  it('returns 200 on successful deactivation', async () => {
    mockGetByToken.mockResolvedValueOnce({ ...mockLink, createdBy: USER_ID });
    mockDeactivate.mockResolvedValueOnce({ ...mockLink, isActive: false });
    const res = await app.inject({ method: 'PATCH', url: '/tracking-links/' + TOKEN + '/deactivate' });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });
});

// ─── POST /tracking-links/:token/click ───────────────────────────────────────

describe('POST /tracking-links/:token/click', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockIsRegistered = false;
    app = await buildApp();
  });
  afterAll(async () => { await app.close(); });

  it('returns 200 on successful click recording', async () => {
    mockRecordClick.mockResolvedValueOnce({
      trackingLink: { ...mockLink },
      click: { id: 'click-1' },
    });
    const res = await app.inject({ method: 'POST', url: '/tracking-links/' + TOKEN + '/click', payload: {} });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });

  it('returns 404 when link not found', async () => {
    mockRecordClick.mockRejectedValueOnce(new Error('Tracking link not found'));
    const res = await app.inject({ method: 'POST', url: '/tracking-links/' + TOKEN + '/click', payload: {} });
    expect(res.statusCode).toBe(404);
  });

  it('returns 410 when link is inactive', async () => {
    mockRecordClick.mockRejectedValueOnce(new Error('Tracking link is inactive'));
    const res = await app.inject({ method: 'POST', url: '/tracking-links/' + TOKEN + '/click', payload: {} });
    expect(res.statusCode).toBe(410);
  });

  it('returns 410 when link has expired', async () => {
    mockRecordClick.mockRejectedValueOnce(new Error('Tracking link has expired'));
    const res = await app.inject({ method: 'POST', url: '/tracking-links/' + TOKEN + '/click', payload: {} });
    expect(res.statusCode).toBe(410);
  });

  it('returns 500 on unexpected error', async () => {
    mockRecordClick.mockRejectedValueOnce(new Error('db crash'));
    const res = await app.inject({ method: 'POST', url: '/tracking-links/' + TOKEN + '/click', payload: {} });
    expect(res.statusCode).toBe(500);
  });
});

// ─── GET /tracking-links/:token/stats ────────────────────────────────────────

describe('GET /tracking-links/:token/stats (not registered)', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockIsRegistered = false;
    app = await buildApp();
  });
  afterAll(async () => { await app.close(); });

  it('returns 403 when user is not registered', async () => {
    const res = await app.inject({ method: 'GET', url: '/tracking-links/' + TOKEN + '/stats' });
    expect(res.statusCode).toBe(403);
  });
});

describe('GET /tracking-links/:token/stats (registered)', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockIsRegistered = true;
    app = await buildApp();
  });
  afterAll(async () => {
    mockIsRegistered = false;
    await app.close();
  });

  it('returns 404 when link not found', async () => {
    mockGetByToken.mockResolvedValueOnce(null);
    const res = await app.inject({ method: 'GET', url: '/tracking-links/' + TOKEN + '/stats' });
    expect(res.statusCode).toBe(404);
  });

  it('returns 403 when user is not the creator', async () => {
    mockGetByToken.mockResolvedValueOnce({ ...mockLink, createdBy: 'other-user' });
    const res = await app.inject({ method: 'GET', url: '/tracking-links/' + TOKEN + '/stats' });
    expect(res.statusCode).toBe(403);
  });

  it('returns 200 with stats when user is creator', async () => {
    mockGetByToken.mockResolvedValueOnce({ ...mockLink, createdBy: USER_ID });
    mockGetStats.mockResolvedValueOnce({ totalClicks: 10, uniqueClicks: 5, clicksByCountry: {} });
    const res = await app.inject({ method: 'GET', url: '/tracking-links/' + TOKEN + '/stats' });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });
});

// ─── GET /tracking-links/stats ────────────────────────────────────────────────

describe('GET /tracking-links/stats (not registered)', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockIsRegistered = false;
    app = await buildApp();
  });
  afterAll(async () => { await app.close(); });

  it('returns 403 when user is not registered', async () => {
    const res = await app.inject({ method: 'GET', url: '/tracking-links/stats' });
    expect(res.statusCode).toBe(403);
  });
});

describe('GET /tracking-links/stats (registered)', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockIsRegistered = true;
    app = await buildApp();
  });
  afterAll(async () => {
    mockIsRegistered = false;
    await app.close();
  });

  it('returns 200 with aggregated stats', async () => {
    const res = await app.inject({ method: 'GET', url: '/tracking-links/stats' });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });

  it('returns 500 on unexpected error', async () => {
    (app as any).prisma.trackingLink.count.mockRejectedValueOnce(new Error('db crash'));
    const res = await app.inject({ method: 'GET', url: '/tracking-links/stats' });
    expect(res.statusCode).toBe(500);
  });
});
