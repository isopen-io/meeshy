/**
 * auth-login-routes.test.ts
 *
 * Unit tests for src/routes/auth/login.ts
 * Covers: POST /login, POST /login/2fa, POST /logout
 *
 * Auth service, rate limiters, GeoIP, session management all mocked.
 */

import Fastify, { FastifyInstance } from 'fastify';
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

// ---------------------------------------------------------------------------
// Module mocks (before imports)
// ---------------------------------------------------------------------------

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn(() => ({
      info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
    })),
  },
}));

jest.mock('@meeshy/shared/types', () => ({
  userSchema:            { type: 'object', additionalProperties: true },
  sessionMinimalSchema:  { type: 'object', additionalProperties: true },
  loginRequestSchema:    { type: 'object' },
  errorResponseSchema:   { type: 'object', additionalProperties: true },
}));

// validateSchema just passes through the body to avoid Zod dependency
jest.mock('@meeshy/shared/utils/validation', () => ({
  AuthSchemas: { login: 'login-schema' },
  validateSchema: jest.fn((_schema: any, body: any) => body),
}));

const mockGetRequestContext = jest.fn<any>().mockResolvedValue({
  ip: '127.0.0.1',
  userAgent: 'Jest/1.0',
  deviceInfo: { type: 'desktop' },
  geoData: { location: 'Paris, FR' },
});
jest.mock('../../../services/GeoIPService', () => ({
  getRequestContext: (...args: any[]) => mockGetRequestContext(...args),
}));

const mockMarkSessionTrusted = jest.fn<any>().mockResolvedValue(true);
jest.mock('../../../services/SessionService', () => ({
  markSessionTrusted: (...args: any[]) => mockMarkSessionTrusted(...args),
}));

// Rate limiter middleware is a no-op
const noopMiddleware = async () => {};
jest.mock('../../../utils/rate-limiter', () => ({
  createLoginRateLimiter:      jest.fn(() => ({ middleware: () => noopMiddleware })),
  createAuthGlobalRateLimiter: jest.fn(() => ({ middleware: () => noopMiddleware })),
}));

jest.mock('jsonwebtoken', () => ({
  default: { sign: jest.fn<any>().mockReturnValue('jwt-token') },
  sign: jest.fn<any>().mockReturnValue('jwt-token'),
}));

// ---------------------------------------------------------------------------
// Import route under test (after mocks)
// ---------------------------------------------------------------------------

import { registerLoginRoutes } from '../../../routes/auth/login';

// ---------------------------------------------------------------------------
// Constants & factories
// ---------------------------------------------------------------------------

const USER_ID = '507f1f77bcf86cd799439011';

function makeUser(overrides: any = {}) {
  return {
    id: USER_ID,
    username: 'alice',
    email: 'alice@example.com',
    firstName: 'Alice',
    lastName: 'Smith',
    displayName: 'Alice Smith',
    bio: null,
    avatar: null,
    banner: null,
    phoneNumber: null,
    role: 'USER',
    isActive: true,
    deactivatedAt: null,
    systemLanguage: 'fr',
    regionalLanguage: 'fr',
    customDestinationLanguage: null,
    autoTranslateEnabled: true,
    isOnline: true,
    lastActiveAt: null,
    emailVerifiedAt: null,
    phoneVerifiedAt: null,
    twoFactorEnabledAt: null,
    pendingEmail: null,
    pendingPhone: null,
    lastPasswordChange: null,
    lastLoginIp: null,
    lastLoginLocation: null,
    lastLoginDevice: null,
    profileCompletionRate: 0.5,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  };
}

function makeSession(overrides: any = {}) {
  return {
    id: 'session-1',
    isTrusted: false,
    deviceType: 'desktop',
    browserName: 'Chrome',
    osName: 'macOS',
    location: 'Paris, FR',
    isMobile: false,
    createdAt: new Date('2026-01-01'),
    ...overrides,
  };
}

function makeAuthResult(overrides: any = {}) {
  return {
    user: makeUser(),
    sessionToken: 'sess-abc',
    session: makeSession(),
    requires2FA: false,
    twoFactorToken: undefined,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Mock AuthService
// ---------------------------------------------------------------------------

const mockAuthenticate       = jest.fn<any>();
const mockGenerateToken      = jest.fn<any>().mockReturnValue('jwt-token-123');
const mockGetUserPermissions = jest.fn<any>().mockReturnValue({ canSendMessages: true });
const mockCompleteAuthWith2FA = jest.fn<any>();
const mockUpdateOnlineStatus = jest.fn<any>().mockResolvedValue(undefined);
const mockLogout             = jest.fn<any>().mockResolvedValue(true);

const mockAuthService = {
  authenticate:        mockAuthenticate,
  generateToken:       mockGenerateToken,
  getUserPermissions:  mockGetUserPermissions,
  completeAuthWith2FA: mockCompleteAuthWith2FA,
  updateOnlineStatus:  mockUpdateOnlineStatus,
  logout:              mockLogout,
};

// ---------------------------------------------------------------------------
// App builder
// ---------------------------------------------------------------------------

function buildApp(): FastifyInstance {
  const app = Fastify({ logger: false });

  // Decorate required items
  app.decorate('prisma', {});
  app.decorate('notificationService', null);
  app.decorate('redis', {});
  // authenticate decorator (used by /logout preValidation)
  app.decorate('authenticate', async (req: any) => {
    req.user = { userId: USER_ID };
  });

  // Register routes via the module-level function
  registerLoginRoutes({
    fastify: app,
    authService: mockAuthService as any,
    phoneTransferService: null as any,
    smsService: null as any,
    cacheStore: null as any,
    redis: null,
    prisma: {},
  });

  return app;
}

// ---------------------------------------------------------------------------
// POST /login
// ---------------------------------------------------------------------------

describe('POST /login', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    app = buildApp();
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 with token on successful login', async () => {
    await app.ready();
    mockAuthenticate.mockResolvedValue(makeAuthResult());

    const res = await app.inject({
      method: 'POST',
      url: '/login',
      payload: { username: 'alice', password: 'secret' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.token).toBe('jwt-token-123');
    expect(body.data.sessionToken).toBe('sess-abc');
  });

  it('returns 401 when credentials are invalid', async () => {
    await app.ready();
    mockAuthenticate.mockResolvedValue(null);

    const res = await app.inject({
      method: 'POST',
      url: '/login',
      payload: { username: 'alice', password: 'wrong' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns partial 2FA response when 2FA is required', async () => {
    await app.ready();
    mockAuthenticate.mockResolvedValue(makeAuthResult({
      requires2FA: true,
      twoFactorToken: '2fa-temp-token',
    }));

    const res = await app.inject({
      method: 'POST',
      url: '/login',
      payload: { username: 'alice', password: 'secret' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.requires2FA).toBe(true);
    expect(body.data.twoFactorToken).toBe('2fa-temp-token');
  });

  it('marks session trusted when rememberDevice is true', async () => {
    await app.ready();
    mockAuthenticate.mockResolvedValue(makeAuthResult({ session: makeSession({ id: 'sess-id' }) }));

    await app.inject({
      method: 'POST',
      url: '/login',
      payload: { username: 'alice', password: 'secret', rememberDevice: true },
    });

    // markSessionTrusted is called asynchronously — allow microtasks to settle
    await new Promise(r => setImmediate(r));
    expect(mockMarkSessionTrusted).toHaveBeenCalledWith('sess-id', expect.objectContaining({ userId: USER_ID }));
  });

  it('returns 200 with longer expiresIn when rememberDevice is true', async () => {
    await app.ready();
    mockAuthenticate.mockResolvedValue(makeAuthResult());

    const res = await app.inject({
      method: 'POST',
      url: '/login',
      payload: { username: 'alice', password: 'secret', rememberDevice: true },
    });
    const body = JSON.parse(res.body);
    expect(body.data.expiresIn).toBe(365 * 24 * 60 * 60);
  });

  it('returns 200 with standard expiresIn when no rememberDevice', async () => {
    await app.ready();
    mockAuthenticate.mockResolvedValue(makeAuthResult());

    const res = await app.inject({
      method: 'POST',
      url: '/login',
      payload: { username: 'alice', password: 'secret' },
    });
    const body = JSON.parse(res.body);
    expect(body.data.expiresIn).toBe(24 * 60 * 60);
  });

  it('returns 500 when auth service throws', async () => {
    await app.ready();
    mockAuthenticate.mockRejectedValue(new Error('DB error'));

    const res = await app.inject({
      method: 'POST',
      url: '/login',
      payload: { username: 'alice', password: 'secret' },
    });
    expect(res.statusCode).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// POST /login/2fa
// ---------------------------------------------------------------------------

describe('POST /login/2fa', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    app = buildApp();
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 with full session on successful 2FA', async () => {
    await app.ready();
    mockCompleteAuthWith2FA.mockResolvedValue(makeAuthResult());

    const res = await app.inject({
      method: 'POST',
      url: '/login/2fa',
      payload: { twoFactorToken: '2fa-token', code: '123456' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.token).toBe('jwt-token-123');
  });

  it('returns 401 when 2FA verification fails', async () => {
    await app.ready();
    mockCompleteAuthWith2FA.mockResolvedValue({ success: false, error: 'Invalid code' });

    const res = await app.inject({
      method: 'POST',
      url: '/login/2fa',
      payload: { twoFactorToken: '2fa-token', code: '000000' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 400 when twoFactorToken is missing', async () => {
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/login/2fa',
      payload: { code: '123456' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when code is missing', async () => {
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/login/2fa',
      payload: { twoFactorToken: '2fa-token' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 500 when 2FA service throws', async () => {
    await app.ready();
    mockCompleteAuthWith2FA.mockRejectedValue(new Error('Service error'));

    const res = await app.inject({
      method: 'POST',
      url: '/login/2fa',
      payload: { twoFactorToken: '2fa-token', code: '123456' },
    });
    expect(res.statusCode).toBe(500);
  });

  it('marks session trusted when rememberDevice is true after 2FA', async () => {
    await app.ready();
    mockCompleteAuthWith2FA.mockResolvedValue(makeAuthResult({ session: makeSession({ id: 'sess-2fa' }) }));

    await app.inject({
      method: 'POST',
      url: '/login/2fa',
      payload: { twoFactorToken: '2fa-token', code: '123456', rememberDevice: true },
    });

    await new Promise(r => setImmediate(r));
    expect(mockMarkSessionTrusted).toHaveBeenCalledWith('sess-2fa', expect.objectContaining({ source: '2fa_verification' }));
  });
});

// ---------------------------------------------------------------------------
// POST /logout
// ---------------------------------------------------------------------------

describe('POST /logout', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    app = buildApp();
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 on successful logout with session token', async () => {
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/logout',
      headers: { 'x-session-token': 'sess-abc' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(mockUpdateOnlineStatus).toHaveBeenCalledWith(USER_ID, false);
    expect(mockLogout).toHaveBeenCalledWith('sess-abc');
  });

  it('returns 200 even without x-session-token header', async () => {
    await app.ready();

    const res = await app.inject({ method: 'POST', url: '/logout' });
    expect(res.statusCode).toBe(200);
    expect(mockUpdateOnlineStatus).toHaveBeenCalledWith(USER_ID, false);
    expect(mockLogout).not.toHaveBeenCalled();
  });

  it('returns 500 when updateOnlineStatus throws', async () => {
    await app.ready();
    mockUpdateOnlineStatus.mockRejectedValue(new Error('DB error'));

    const res = await app.inject({ method: 'POST', url: '/logout' });
    expect(res.statusCode).toBe(500);
  });
});
