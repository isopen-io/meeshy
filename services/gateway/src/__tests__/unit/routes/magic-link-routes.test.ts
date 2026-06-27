/**
 * magic-link-routes.test.ts
 *
 * Unit tests for src/routes/magic-link.ts
 * Covers:
 *   POST /magic-link/request      — request a magic link email
 *   GET  /magic-link/validate     — validate token via query param
 *   POST /magic-link/validate     — validate token via body (with rememberDevice)
 */

import Fastify, { FastifyInstance } from 'fastify';
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

// ---------------------------------------------------------------------------
// Module mocks — MUST come before any import of the route under test
// ---------------------------------------------------------------------------

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn(() => ({
      info:  jest.fn(),
      warn:  jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    })),
  },
}));

// MagicLinkService — the main business-logic dependency
const mockRequestMagicLink  = jest.fn<any>();
const mockValidateMagicLink = jest.fn<any>();

jest.mock('../../../services/MagicLinkService', () => ({
  MagicLinkService: jest.fn().mockImplementation(() => ({
    requestMagicLink:  mockRequestMagicLink,
    validateMagicLink: mockValidateMagicLink,
  })),
}));

// CacheStore singleton
jest.mock('../../../services/CacheStore', () => ({
  getCacheStore: jest.fn(() => ({})),
}));

// EmailService — instantiated inside the route but not called directly by tests
jest.mock('../../../services/EmailService', () => ({
  EmailService: jest.fn().mockImplementation(() => ({})),
}));

// GeoIPService + getRequestContext
const mockGetRequestContext = jest.fn<any>().mockResolvedValue({
  ip:         '127.0.0.1',
  userAgent:  'Jest/1.0',
  deviceInfo: { type: 'desktop' },
  geoData:    { location: 'Paris, FR' },
});

jest.mock('../../../services/GeoIPService', () => ({
  GeoIPService:      jest.fn().mockImplementation(() => ({})),
  getRequestContext: (...args: any[]) => mockGetRequestContext(...args),
}));

// SessionService
const mockInitSessionService = jest.fn<any>();
const mockMarkSessionTrusted = jest.fn<any>().mockResolvedValue(true);

jest.mock('../../../services/SessionService', () => ({
  initSessionService: (...args: any[]) => mockInitSessionService(...args),
  markSessionTrusted: (...args: any[]) => mockMarkSessionTrusted(...args),
}));

// ---------------------------------------------------------------------------
// Import route under test (after all mocks)
// ---------------------------------------------------------------------------

import { magicLinkRoutes } from '../../../routes/magic-link';

// ---------------------------------------------------------------------------
// Shared test fixtures
// ---------------------------------------------------------------------------

const USER_ID = '507f1f77bcf86cd799439011';

function makeUser(overrides: any = {}) {
  return {
    id:          USER_ID,
    username:    'alice',
    email:       'alice@example.com',
    displayName: 'Alice',
    role:        'USER',
    ...overrides,
  };
}

function makeSession(overrides: any = {}) {
  return {
    id:        'session-abc',
    isTrusted: false,
    deviceType: 'desktop',
    ...overrides,
  };
}

function makeValidateSuccess(overrides: any = {}) {
  return {
    success:      true,
    user:         makeUser(),
    token:        'jwt-token-xyz',
    sessionToken: 'sess-token-xyz',
    session:      makeSession(),
    rememberDevice: false,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// App builder
// ---------------------------------------------------------------------------

function buildApp(): FastifyInstance {
  const app = Fastify({
    logger: false,
    ajv: {
      customOptions: {
        strict: 'log' as const,
        keywords: ['example'],
      },
    },
  });
  app.decorate('prisma', {} as any);
  app.register(magicLinkRoutes);
  return app;
}

// ---------------------------------------------------------------------------
// POST /magic-link/request
// ---------------------------------------------------------------------------

describe('POST /magic-link/request', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    app = buildApp();
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 with success when magic link is sent', async () => {
    await app.ready();
    mockRequestMagicLink.mockResolvedValue({
      success:          true,
      message:          'If an account exists, a login link has been sent.',
      expiresInSeconds: 600,
    });

    const res = await app.inject({
      method:  'POST',
      url:     '/magic-link/request',
      payload: { email: 'alice@example.com' },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.message).toMatch(/login link/i);
    expect(mockRequestMagicLink).toHaveBeenCalledWith(expect.objectContaining({
      email:         'alice@example.com',
      rememberDevice: false,
    }));
  });

  it('passes rememberDevice to the service when provided', async () => {
    await app.ready();
    mockRequestMagicLink.mockResolvedValue({
      success:          true,
      message:          'Link sent.',
      expiresInSeconds: 600,
    });

    await app.inject({
      method:  'POST',
      url:     '/magic-link/request',
      payload: { email: 'alice@example.com', rememberDevice: true },
    });

    expect(mockRequestMagicLink).toHaveBeenCalledWith(expect.objectContaining({
      rememberDevice: true,
    }));
  });

  it('returns 400 when email is missing', async () => {
    await app.ready();

    const res = await app.inject({
      method:  'POST',
      url:     '/magic-link/request',
      payload: {},
    });

    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when email format is invalid', async () => {
    await app.ready();

    const res = await app.inject({
      method:  'POST',
      url:     '/magic-link/request',
      payload: { email: 'not-an-email' },
    });

    expect(res.statusCode).toBe(400);
  });

  it('returns 500 when service throws', async () => {
    await app.ready();
    mockRequestMagicLink.mockRejectedValue(new Error('Redis unavailable'));

    const res = await app.inject({
      method:  'POST',
      url:     '/magic-link/request',
      payload: { email: 'alice@example.com' },
    });

    expect(res.statusCode).toBe(500);
  });

  it('forwards service result directly when service returns success=false (rate limit)', async () => {
    await app.ready();
    mockRequestMagicLink.mockResolvedValue({
      success: false,
      message: 'Too many requests. Please try again in about an hour.',
      error:   'RATE_LIMITED',
    });

    const res = await app.inject({
      method:  'POST',
      url:     '/magic-link/request',
      payload: { email: 'alice@example.com' },
    });

    // The route calls reply.send(result) directly, so status remains 200.
    // The 200 response schema only serializes success/message/expiresInSeconds —
    // `error` is stripped by fast-json-stringify (not in the schema).
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(false);
    expect(body.message).toMatch(/too many/i);
  });
});

// ---------------------------------------------------------------------------
// GET /magic-link/validate
// ---------------------------------------------------------------------------

describe('GET /magic-link/validate', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    app = buildApp();
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 with user data on valid token', async () => {
    await app.ready();
    mockValidateMagicLink.mockResolvedValue(makeValidateSuccess());

    const res = await app.inject({
      method: 'GET',
      url:    '/magic-link/validate?token=valid-token-abc',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.token).toBe('jwt-token-xyz');
    expect(body.data.sessionToken).toBe('sess-token-xyz');
    // user is serialized as { type: 'object' } in the schema — just assert presence
    expect(body.data.user).toBeDefined();
    expect(body.data.expiresIn).toBe(86400);
  });

  it('returns 400 when token query param is missing', async () => {
    await app.ready();

    const res = await app.inject({
      method: 'GET',
      url:    '/magic-link/validate',
    });

    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when token is invalid or expired', async () => {
    await app.ready();
    mockValidateMagicLink.mockResolvedValue({
      success: false,
      error:   'Token is invalid or expired',
    });

    const res = await app.inject({
      method: 'GET',
      url:    '/magic-link/validate?token=bad-token',
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(false);
  });

  it('returns 500 when service throws', async () => {
    await app.ready();
    mockValidateMagicLink.mockRejectedValue(new Error('DB connection lost'));

    const res = await app.inject({
      method: 'GET',
      url:    '/magic-link/validate?token=any-token',
    });

    expect(res.statusCode).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// POST /magic-link/validate
// ---------------------------------------------------------------------------

describe('POST /magic-link/validate', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    app = buildApp();
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 with user data on valid token', async () => {
    await app.ready();
    mockValidateMagicLink.mockResolvedValue(makeValidateSuccess());

    const res = await app.inject({
      method:  'POST',
      url:     '/magic-link/validate',
      payload: { token: 'valid-token-abc' },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.token).toBe('jwt-token-xyz');
    // user is serialized as { type: 'object' } in the schema — just assert presence
    expect(body.data.user).toBeDefined();
    expect(body.data.expiresIn).toBe(24 * 60 * 60); // 24h when no rememberDevice
  });

  it('returns 200 with 365-day expiry when rememberDevice is server-side true', async () => {
    await app.ready();
    mockValidateMagicLink.mockResolvedValue(makeValidateSuccess({
      rememberDevice: true,
      session:        makeSession({ id: 'trusted-session-id' }),
    }));

    const res = await app.inject({
      method:  'POST',
      url:     '/magic-link/validate',
      payload: { token: 'valid-token-remember' },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.expiresIn).toBe(365 * 24 * 60 * 60);
    // Session should be marked as trusted
    await new Promise(r => setImmediate(r));
    expect(mockMarkSessionTrusted).toHaveBeenCalledWith(
      'trusted-session-id',
      expect.objectContaining({ source: 'magic_link' })
    );
  });

  it('calls markSessionTrusted with userId and source when rememberDevice is true', async () => {
    await app.ready();
    mockValidateMagicLink.mockResolvedValue(makeValidateSuccess({
      rememberDevice: true,
      session:        makeSession({ id: 'session-trusted' }),
    }));

    const res = await app.inject({
      method:  'POST',
      url:     '/magic-link/validate',
      payload: { token: 'valid-token-remember' },
    });

    expect(res.statusCode).toBe(200);
    await new Promise(r => setImmediate(r));
    expect(mockMarkSessionTrusted).toHaveBeenCalledWith(
      'session-trusted',
      expect.objectContaining({ source: 'magic_link', userId: USER_ID })
    );
  });

  it('returns 400 when token body field is missing', async () => {
    await app.ready();

    const res = await app.inject({
      method:  'POST',
      url:     '/magic-link/validate',
      payload: {},
    });

    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when service indicates token invalid', async () => {
    await app.ready();
    mockValidateMagicLink.mockResolvedValue({
      success: false,
      error:   'Token already used',
    });

    const res = await app.inject({
      method:  'POST',
      url:     '/magic-link/validate',
      payload: { token: 'used-token' },
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(false);
  });

  it('returns 500 when service throws', async () => {
    await app.ready();
    mockValidateMagicLink.mockRejectedValue(new Error('Redis error'));

    const res = await app.inject({
      method:  'POST',
      url:     '/magic-link/validate',
      payload: { token: 'any-token' },
    });

    expect(res.statusCode).toBe(500);
  });

  it('does not call markSessionTrusted when rememberDevice is false', async () => {
    await app.ready();
    mockValidateMagicLink.mockResolvedValue(makeValidateSuccess({ rememberDevice: false }));

    await app.inject({
      method:  'POST',
      url:     '/magic-link/validate',
      payload: { token: 'valid-token' },
    });

    await new Promise(r => setImmediate(r));
    expect(mockMarkSessionTrusted).not.toHaveBeenCalled();
  });
});
