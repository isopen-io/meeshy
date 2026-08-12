/**
 * Unit tests for tracking-links routes (tracking.ts, creation.ts)
 * Tests GET /l/:token, POST /tracking-links/:token/click, POST /tracking-links.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn(() => ({
      info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn(),
    })),
  },
}));

jest.mock('../../../../utils/logger', () => ({
  logError: jest.fn(),
}));

jest.mock('../../../../utils/sanitize', () => ({
  SecuritySanitizer: {
    sanitizeText: jest.fn((text: string) => text),
  },
}));

jest.mock('../../../../middleware/admin-permissions.middleware', () => ({
  requireAnalyticsPermission: jest.fn(),
}));

// createUnifiedAuthMiddleware returns a no-op that sets an anonymous authContext
const mockAuthContext = { isAuthenticated: false, type: 'anonymous', anonymousUser: null, registeredUser: null };
jest.mock('../../../../middleware/auth', () => ({
  createUnifiedAuthMiddleware: jest.fn().mockReturnValue(
    async (req: any) => { req.authContext = mockAuthContext; }
  ),
  isRegisteredUser: jest.fn().mockReturnValue(false),
  UnifiedAuthRequest: {},
}));

// Mock TrackingLinkService
const mockGetByToken = jest.fn<any>();
const mockRecordClick = jest.fn<any>().mockResolvedValue({});
const mockFindExisting = jest.fn<any>().mockResolvedValue(null);
const mockCreate = jest.fn<any>();
const mockGetStats = jest.fn<any>();
const mockIsTokenAvailable = jest.fn<any>().mockResolvedValue(true);

jest.mock('../../../../services/TrackingLinkService', () => ({
  TrackingLinkService: jest.fn().mockImplementation(() => ({
    getTrackingLinkByToken: mockGetByToken,
    recordClick: mockRecordClick,
    findExistingTrackingLink: mockFindExisting,
    createTrackingLink: mockCreate,
    getTrackingLinkStats: mockGetStats,
    isTokenAvailable: mockIsTokenAvailable,
    buildTrackingUrl: (token: string) => `https://meeshy.me/l/${token}`,
  })),
  resolveFrontendBaseUrl: jest.fn().mockReturnValue('https://meeshy.me'),
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { registerTrackingRoutes } from '../../../../routes/tracking-links/tracking';
import { registerCreationRoutes } from '../../../../routes/tracking-links/creation';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makePrisma() {
  return {
    trackingLink: { findUnique: jest.fn<any>(), findFirst: jest.fn<any>() },
    user: { findUnique: jest.fn<any>() },
  } as any;
}

async function buildApp(): Promise<{ app: FastifyInstance; prisma: ReturnType<typeof makePrisma> }> {
  const prisma = makePrisma();
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', prisma);
  app.decorate('authenticate', async () => {});

  await registerTrackingRoutes(app);
  await registerCreationRoutes(app);
  await app.ready();
  return { app, prisma };
}

// ─── GET /l/:token ─────────────────────────────────────────────────────────────

describe('GET /l/:token — not found', () => {
  it('returns 404 when token does not match any link', async () => {
    mockGetByToken.mockResolvedValue(null);
    const { app } = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/l/abc123' });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

describe('GET /l/:token — inactive link', () => {
  it('returns 410 when link is not active', async () => {
    mockGetByToken.mockResolvedValue({ isActive: false, originalUrl: 'https://example.com', expiresAt: null });
    const { app } = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/l/abc123' });
    expect(res.statusCode).toBe(410);
    await app.close();
  });
});

describe('GET /l/:token — expired link', () => {
  it('returns 410 when link has expired', async () => {
    mockGetByToken.mockResolvedValue({ isActive: true, originalUrl: 'https://example.com', expiresAt: new Date('2020-01-01') });
    const { app } = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/l/abc123' });
    expect(res.statusCode).toBe(410);
    await app.close();
  });
});

describe('GET /l/:token — success redirect', () => {
  it('records click and redirects to original URL', async () => {
    const originalUrl = 'https://example.com/page';
    mockGetByToken.mockResolvedValue({ isActive: true, originalUrl, expiresAt: null });
    mockRecordClick.mockResolvedValue({});
    const { app } = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/l/abc123' });
    expect(res.statusCode).toBe(302);
    expect(res.headers['location']).toBe(originalUrl);
    await app.close();
  });
});

describe('GET /l/:token — DB error', () => {
  it('returns 500 on unexpected error', async () => {
    mockGetByToken.mockRejectedValue(new Error('db crash'));
    const { app } = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/l/abc123' });
    expect(res.statusCode).toBe(500);
    await app.close();
  });
});

// ─── POST /tracking-links ──────────────────────────────────────────────────────

describe('POST /tracking-links — missing required field', () => {
  it('returns 400 when originalUrl is not provided', async () => {
    const { app } = await buildApp();
    const res = await app.inject({ method: 'POST', url: '/tracking-links', payload: {} });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

describe('POST /tracking-links — existing link returned', () => {
  it('returns 200 with existing link when duplicate URL is detected', async () => {
    const existingLink = { id: 'link-1', token: 'abc123', originalUrl: 'https://example.com', isActive: true };
    mockFindExisting.mockResolvedValue(existingLink);
    const { app } = await buildApp();
    const res = await app.inject({
      method: 'POST', url: '/tracking-links',
      payload: { originalUrl: 'https://example.com' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
    await app.close();
  });
});

describe('POST /tracking-links — success creates new link', () => {
  it('returns 201 with new tracking link', async () => {
    mockFindExisting.mockResolvedValue(null);
    mockCreate.mockResolvedValue({ id: 'link-2', token: 'xyz789', originalUrl: 'https://new.com', isActive: true });
    const { app } = await buildApp();
    const res = await app.inject({
      method: 'POST', url: '/tracking-links',
      payload: { originalUrl: 'https://new.com' },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().success).toBe(true);
    await app.close();
  });
});

describe('POST /tracking-links — DB error', () => {
  it('returns 500 on unexpected error', async () => {
    mockFindExisting.mockRejectedValue(new Error('db crash'));
    const { app } = await buildApp();
    const res = await app.inject({
      method: 'POST', url: '/tracking-links',
      payload: { originalUrl: 'https://example.com' },
    });
    expect(res.statusCode).toBe(500);
    await app.close();
  });
});
