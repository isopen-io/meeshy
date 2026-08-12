/**
 * Tests for remaining uncovered routes in creation.ts:
 * - DELETE /tracking-links/:token
 * - PATCH /tracking-links/:token (update)
 * - GET /tracking-links/check-token/:token
 * - POST /tracking-links short-customToken rejection
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeAll, afterAll } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

// ─── Mocks ────────────────────────────────────────────────────────────────────

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

let mockIsRegistered = false;
const USER_ID = 'user-abc123';
const OTHER_ID = 'user-other999';

const mockRegistered = {
  type: 'registered' as const,
  isAuthenticated: true,
  userId: USER_ID,
  hasFullAccess: true,
  registeredUser: { id: USER_ID, username: 'alice', role: 'USER' },
};
const mockAnon = {
  type: 'anonymous' as const,
  isAuthenticated: false,
  userId: 'anon',
  hasFullAccess: false,
  anonymousUser: null,
  registeredUser: null,
};

jest.mock('../../../../middleware/auth', () => ({
  createUnifiedAuthMiddleware: jest.fn().mockReturnValue(
    async (req: any) => { req.authContext = mockIsRegistered ? mockRegistered : mockAnon; }
  ),
  isRegisteredUser: jest.fn().mockImplementation(() => mockIsRegistered),
  UnifiedAuthRequest: {},
}));

const mockGetByToken = jest.fn();
const mockFindExisting = jest.fn().mockResolvedValue(null);
const mockCreate = jest.fn();
const mockDeleteLink = jest.fn().mockResolvedValue(undefined);
const mockUpdateLink = jest.fn();
const mockIsTokenAvailable = jest.fn().mockResolvedValue(true);

jest.mock('../../../../services/TrackingLinkService', () => ({
  TrackingLinkService: jest.fn().mockImplementation(() => ({
    getTrackingLinkByToken: (...a: any[]) => mockGetByToken(...a),
    findExistingTrackingLink: (...a: any[]) => mockFindExisting(...a),
    createTrackingLink: (...a: any[]) => mockCreate(...a),
    deleteTrackingLink: (...a: any[]) => mockDeleteLink(...a),
    updateTrackingLink: (...a: any[]) => mockUpdateLink(...a),
    isTokenAvailable: (...a: any[]) => mockIsTokenAvailable(...a),
    buildTrackingUrl: (token: string) => `https://meeshy.me/l/${token}`,
    // other methods needed for registration:
    recordClick: jest.fn(),
    resolveTarget: jest.fn(),
    getConversationTrackingLinks: jest.fn(),
    deactivateTrackingLink: jest.fn(),
    getTrackingLinkStats: jest.fn(),
    getAllTrackingLinks: jest.fn(),
    getTrackingLinkClicks: jest.fn(),
    updateRedirectStatus: jest.fn(),
  })),
  resolveFrontendBaseUrl: jest.fn().mockReturnValue('https://meeshy.me'),
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { registerCreationRoutes } from '../../../../routes/tracking-links/creation';

// ─── Constants ────────────────────────────────────────────────────────────────

const TOKEN = 'abcdef';
const mockLink = { id: 'link-1', token: TOKEN, originalUrl: 'https://example.com', isActive: true, expiresAt: null, createdBy: USER_ID };

// ─── App factory ──────────────────────────────────────────────────────────────

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', {
    trackingLink: { findFirst: jest.fn().mockResolvedValue(mockLink), count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]) },
    participant: { findFirst: jest.fn().mockResolvedValue({ id: 'part-1' }) },
  });
  app.decorate('authenticate', async () => {});
  await registerCreationRoutes(app);
  await app.ready();
  return app;
}

// ─── DELETE /tracking-links/:token ───────────────────────────────────────────

describe('DELETE /tracking-links/:token — not registered', () => {
  let app: FastifyInstance;
  beforeAll(async () => { mockIsRegistered = false; app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 403 when user is not registered', async () => {
    const res = await app.inject({ method: 'DELETE', url: `/tracking-links/${TOKEN}` });
    expect(res.statusCode).toBe(403);
  });
});

describe('DELETE /tracking-links/:token — registered', () => {
  let app: FastifyInstance;
  beforeAll(async () => { mockIsRegistered = true; app = await buildApp(); });
  afterAll(async () => { mockIsRegistered = false; await app.close(); });

  it('returns 404 when link not found', async () => {
    mockGetByToken.mockResolvedValueOnce(null);
    const res = await app.inject({ method: 'DELETE', url: `/tracking-links/${TOKEN}` });
    expect(res.statusCode).toBe(404);
  });

  it('returns 403 when user is not the creator', async () => {
    mockGetByToken.mockResolvedValueOnce({ ...mockLink, createdBy: OTHER_ID });
    const res = await app.inject({ method: 'DELETE', url: `/tracking-links/${TOKEN}` });
    expect(res.statusCode).toBe(403);
  });

  it('returns 200 on successful deletion', async () => {
    mockGetByToken.mockResolvedValueOnce({ ...mockLink, createdBy: USER_ID });
    const res = await app.inject({ method: 'DELETE', url: `/tracking-links/${TOKEN}` });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
    expect(mockDeleteLink).toHaveBeenCalledWith(TOKEN);
  });

  it('returns 200 when link has no createdBy (public link)', async () => {
    mockGetByToken.mockResolvedValueOnce({ ...mockLink, createdBy: null });
    const res = await app.inject({ method: 'DELETE', url: `/tracking-links/${TOKEN}` });
    expect(res.statusCode).toBe(200);
  });

  it('returns 500 on unexpected error', async () => {
    mockGetByToken.mockRejectedValueOnce(new Error('db crash'));
    const res = await app.inject({ method: 'DELETE', url: `/tracking-links/${TOKEN}` });
    expect(res.statusCode).toBe(500);
  });
});

// ─── PATCH /tracking-links/:token (update) ───────────────────────────────────

describe('PATCH /tracking-links/:token — not registered', () => {
  let app: FastifyInstance;
  beforeAll(async () => { mockIsRegistered = false; app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 403 when user is not registered', async () => {
    const res = await app.inject({ method: 'PATCH', url: `/tracking-links/${TOKEN}`, payload: { isActive: false } });
    expect(res.statusCode).toBe(403);
  });
});

describe('PATCH /tracking-links/:token — registered', () => {
  let app: FastifyInstance;
  beforeAll(async () => { mockIsRegistered = true; app = await buildApp(); });
  afterAll(async () => { mockIsRegistered = false; await app.close(); });

  it('returns 404 when link not found', async () => {
    mockGetByToken.mockResolvedValueOnce(null);
    const res = await app.inject({ method: 'PATCH', url: `/tracking-links/${TOKEN}`, payload: { isActive: false } });
    expect(res.statusCode).toBe(404);
  });

  it('returns 403 when user is not the creator', async () => {
    mockGetByToken.mockResolvedValueOnce({ ...mockLink, createdBy: OTHER_ID });
    const res = await app.inject({ method: 'PATCH', url: `/tracking-links/${TOKEN}`, payload: { isActive: false } });
    expect(res.statusCode).toBe(403);
  });

  it('returns 400 when newToken has invalid format', async () => {
    mockGetByToken.mockResolvedValueOnce({ ...mockLink, createdBy: USER_ID });
    const res = await app.inject({ method: 'PATCH', url: `/tracking-links/${TOKEN}`, payload: { newToken: '-invalid-' } });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when newToken is short and user is not privileged', async () => {
    mockGetByToken.mockResolvedValueOnce({ ...mockLink, createdBy: USER_ID });
    const res = await app.inject({ method: 'PATCH', url: `/tracking-links/${TOKEN}`, payload: { newToken: 'ab' } });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when originalUrl is invalid', async () => {
    mockGetByToken.mockResolvedValueOnce({ ...mockLink, createdBy: USER_ID });
    const res = await app.inject({ method: 'PATCH', url: `/tracking-links/${TOKEN}`, payload: { originalUrl: 'not-a-url' } });
    expect(res.statusCode).toBe(400);
  });

  it('returns 200 on successful update', async () => {
    mockGetByToken.mockResolvedValueOnce({ ...mockLink, createdBy: USER_ID });
    mockUpdateLink.mockResolvedValueOnce({ ...mockLink, isActive: false });
    const res = await app.inject({ method: 'PATCH', url: `/tracking-links/${TOKEN}`, payload: { isActive: false } });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });

  it('returns 200 when updating originalUrl to valid URL', async () => {
    mockGetByToken.mockResolvedValueOnce({ ...mockLink, createdBy: USER_ID });
    mockUpdateLink.mockResolvedValueOnce({ ...mockLink, originalUrl: 'https://new.example.com' });
    const res = await app.inject({ method: 'PATCH', url: `/tracking-links/${TOKEN}`, payload: { originalUrl: 'https://new.example.com' } });
    expect(res.statusCode).toBe(200);
  });

  it('returns 404 when service says tracking link not found', async () => {
    mockGetByToken.mockResolvedValueOnce({ ...mockLink, createdBy: USER_ID });
    mockUpdateLink.mockRejectedValueOnce(new Error('Tracking link not found'));
    const res = await app.inject({ method: 'PATCH', url: `/tracking-links/${TOKEN}`, payload: { isActive: false } });
    expect(res.statusCode).toBe(404);
  });

  it('returns 409 when new token already exists', async () => {
    mockGetByToken.mockResolvedValueOnce({ ...mockLink, createdBy: USER_ID });
    mockUpdateLink.mockRejectedValueOnce(new Error('Token already exists'));
    const res = await app.inject({ method: 'PATCH', url: `/tracking-links/${TOKEN}`, payload: { newToken: 'newtoken' } });
    expect(res.statusCode).toBe(409);
  });

  it('returns 500 on unexpected error', async () => {
    mockGetByToken.mockRejectedValueOnce(new Error('db crash'));
    const res = await app.inject({ method: 'PATCH', url: `/tracking-links/${TOKEN}`, payload: { isActive: false } });
    expect(res.statusCode).toBe(500);
  });
});

// ─── GET /tracking-links/check-token/:token ──────────────────────────────────

describe('GET /tracking-links/check-token/:token — not registered', () => {
  let app: FastifyInstance;
  beforeAll(async () => { mockIsRegistered = false; app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 403 when user is not registered', async () => {
    const res = await app.inject({ method: 'GET', url: `/tracking-links/check-token/${TOKEN}` });
    expect(res.statusCode).toBe(403);
  });
});

describe('GET /tracking-links/check-token/:token — registered', () => {
  let app: FastifyInstance;
  beforeAll(async () => { mockIsRegistered = true; app = await buildApp(); });
  afterAll(async () => { mockIsRegistered = false; await app.close(); });

  it('returns 200 with available=true when token is free', async () => {
    mockIsTokenAvailable.mockResolvedValueOnce(true);
    const res = await app.inject({ method: 'GET', url: `/tracking-links/check-token/${TOKEN}` });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.available).toBe(true);
    expect(res.json().data.token).toBe(TOKEN);
  });

  it('returns 200 with available=false when token is taken', async () => {
    mockIsTokenAvailable.mockResolvedValueOnce(false);
    const res = await app.inject({ method: 'GET', url: `/tracking-links/check-token/${TOKEN}` });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.available).toBe(false);
  });

  it('returns 500 on unexpected error', async () => {
    mockIsTokenAvailable.mockRejectedValueOnce(new Error('db crash'));
    const res = await app.inject({ method: 'GET', url: `/tracking-links/check-token/${TOKEN}` });
    expect(res.statusCode).toBe(500);
  });
});

// ─── POST /tracking-links — short customToken rejected ───────────────────────

describe('POST /tracking-links — short customToken rejected for non-privileged', () => {
  let app: FastifyInstance;
  beforeAll(async () => { mockIsRegistered = true; app = await buildApp(); });
  afterAll(async () => { mockIsRegistered = false; await app.close(); });

  it('returns 400 when customToken < 5 chars and user is not privileged', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/tracking-links',
      payload: { originalUrl: 'https://example.com', customToken: 'ab' },
    });
    expect(res.statusCode).toBe(400);
  });
});

// ─── POST /tracking-links — Token already exists conflict ─────────────────────

describe('POST /tracking-links — Token already exists conflict', () => {
  let app: FastifyInstance;
  beforeAll(async () => { mockIsRegistered = true; app = await buildApp(); });
  afterAll(async () => { mockIsRegistered = false; await app.close(); });

  it('returns 409 when customToken is already taken', async () => {
    mockCreate.mockRejectedValueOnce(new Error('Token already exists'));
    const res = await app.inject({
      method: 'POST',
      url: '/tracking-links',
      payload: { originalUrl: 'https://example.com', customToken: 'mytoken' },
    });
    expect(res.statusCode).toBe(409);
  });
});
