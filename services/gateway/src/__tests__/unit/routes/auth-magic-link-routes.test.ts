/**
 * auth-magic-link-routes.test.ts
 *
 * Unit tests for src/routes/auth/magic-link.ts
 * Covers: GET /me, POST /refresh, POST /verify-email, POST /resend-verification,
 *         POST /send-phone-code, POST /verify-phone, GET /sessions,
 *         DELETE /sessions/:sessionId, DELETE /sessions, POST /validate-session
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
  userSchema:                    { type: 'object', additionalProperties: true },
  sessionSchema:                 { type: 'object', additionalProperties: true },
  errorResponseSchema:           { type: 'object', additionalProperties: true },
  sessionsListResponseSchema:    { type: 'object', additionalProperties: true },
  refreshTokenRequestSchema:     { type: 'object' },
  verifyEmailRequestSchema:      { type: 'object' },
  resendVerificationRequestSchema: { type: 'object' },
  sendPhoneCodeRequestSchema:    { type: 'object' },
  verifyPhoneRequestSchema:      { type: 'object' },
  validateSessionRequestSchema:  { type: 'object' },
}));

jest.mock('@meeshy/shared/utils/validation', () => ({
  AuthSchemas:   {
    refreshToken: 'refresh-schema',
    verifyEmail: 'verify-email-schema',
    resendVerification: 'resend-schema',
    sendPhoneCode: 'send-phone-schema',
    verifyPhone: 'verify-phone-schema',
  },
  SessionSchemas: { validateToken: 'validate-session-schema' },
  validateSchema: jest.fn((_schema: any, body: any) => body),
}));

jest.mock('jsonwebtoken', () => ({
  default: {
    verify: jest.fn(),
    decode: jest.fn(),
    sign:   jest.fn().mockReturnValue('jwt-token'),
  },
  verify: jest.fn(),
  decode: jest.fn(),
  sign:   jest.fn().mockReturnValue('jwt-token'),
}));

jest.mock('crypto', () => ({
  ...jest.requireActual('crypto') as object,
  createHash: jest.fn(() => ({
    update: jest.fn().mockReturnThis(),
    digest: jest.fn().mockReturnValue('hashed-session-token'),
  })),
}));

jest.mock('../../../middleware/auth', () => ({
  createUnifiedAuthMiddleware: jest.fn((_prisma: any, _opts: any) =>
    async (req: any) => {
      req.authContext = req._injectedAuthContext;
    }
  ),
  UnifiedAuthRequest: {},
}));

// ---------------------------------------------------------------------------
// Import route under test (after mocks)
// ---------------------------------------------------------------------------

import { registerMagicLinkRoutes } from '../../../routes/auth/magic-link';
import jwt from 'jsonwebtoken';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const USER_ID = '507f1f77bcf86cd799439011';

// ---------------------------------------------------------------------------
// Mock AuthService
// ---------------------------------------------------------------------------

const mockGetUserById            = jest.fn<any>();
const mockGenerateToken          = jest.fn<any>().mockReturnValue('new-jwt-token');
const mockGetUserPermissions     = jest.fn<any>().mockReturnValue({ canSendMessages: true });
const mockVerifyEmail            = jest.fn<any>();
const mockResendVerificationEmail = jest.fn<any>();
const mockSendPhoneVerificationCode = jest.fn<any>();
const mockVerifyPhone            = jest.fn<any>();
const mockGetUserActiveSessions  = jest.fn<any>();
const mockRevokeSession          = jest.fn<any>();
const mockRevokeAllSessionsExceptCurrent = jest.fn<any>();
const mockValidateSessionToken   = jest.fn<any>();

const mockAuthService = {
  jwtSecret: 'test-secret',
  getUserById:              mockGetUserById,
  generateToken:            mockGenerateToken,
  getUserPermissions:       mockGetUserPermissions,
  verifyEmail:              mockVerifyEmail,
  resendVerificationEmail:  mockResendVerificationEmail,
  sendPhoneVerificationCode: mockSendPhoneVerificationCode,
  verifyPhone:              mockVerifyPhone,
  getUserActiveSessions:    mockGetUserActiveSessions,
  revokeSession:            mockRevokeSession,
  revokeAllSessionsExceptCurrent: mockRevokeAllSessionsExceptCurrent,
  validateSessionToken:     mockValidateSessionToken,
};

// ---------------------------------------------------------------------------
// Mock Prisma
// ---------------------------------------------------------------------------

const mockUserSession = {
  findFirst: jest.fn<any>().mockResolvedValue(null),
  update:    jest.fn<any>().mockResolvedValue({}),
};

const mockPrisma: any = {
  userSession: mockUserSession,
};

// ---------------------------------------------------------------------------
// App builder
// ---------------------------------------------------------------------------

function buildApp(authContextOverride?: any): FastifyInstance {
  const app = Fastify({ logger: false });
  app.decorate('prisma', mockPrisma);
  app.decorate('authenticate', async (req: any) => {
    req.user = { userId: USER_ID };
  });

  const { createUnifiedAuthMiddleware } = require('../../../middleware/auth');
  (createUnifiedAuthMiddleware as jest.Mock).mockImplementation(() =>
    async (req: any) => {
      req.authContext = authContextOverride ?? {
        isAuthenticated: true,
        type: 'user',
        userId: USER_ID,
        registeredUser: makeUser(),
        anonymousUser: null,
        displayName: 'Alice Smith',
      };
    }
  );

  registerMagicLinkRoutes({
    fastify: app,
    authService: mockAuthService as any,
    phoneTransferService: null as any,
    smsService: null as any,
    cacheStore: null as any,
    redis: null,
    prisma: mockPrisma,
  });

  return app;
}

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
    userId: USER_ID,
    deviceType: 'desktop',
    deviceVendor: null,
    deviceModel: null,
    osName: 'macOS',
    osVersion: '14',
    browserName: 'Chrome',
    browserVersion: '120',
    isMobile: false,
    ipAddress: '127.0.0.1',
    country: 'FR',
    city: 'Paris',
    location: 'Paris, FR',
    createdAt: new Date('2026-01-01'),
    lastActivityAt: new Date('2026-01-01'),
    isCurrentSession: true,
    isTrusted: true,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// GET /me
// ---------------------------------------------------------------------------

describe('GET /me', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    app = buildApp();
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 with user profile for registered user', async () => {
    await app.ready();

    const res = await app.inject({ method: 'GET', url: '/me' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.user).toBeDefined();
  });

  it('returns 200 with anonymous user profile', async () => {
    const anonApp = buildApp({
      isAuthenticated: true,
      type: 'anonymous',
      userId: 'anon-123',
      registeredUser: null,
      anonymousUser: {
        username: 'guest_ab123',
        firstName: 'Guest',
        lastName: 'User',
        language: 'fr',
        permissions: { canSendMessages: true },
      },
      displayName: 'Guest User',
    });

    await anonApp.ready();
    const res = await anonApp.inject({ method: 'GET', url: '/me' });
    await anonApp.close();

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.user.role).toBe('ANONYMOUS');
  });

  it('returns 404 when user context has no user data', async () => {
    const noUserApp = buildApp({
      isAuthenticated: true,
      type: 'unknown',
      userId: USER_ID,
      registeredUser: null,
      anonymousUser: null,
    });

    await noUserApp.ready();
    const res = await noUserApp.inject({ method: 'GET', url: '/me' });
    await noUserApp.close();

    expect(res.statusCode).toBe(404);
  });

  it('returns 401 when not authenticated', async () => {
    const unauthApp = buildApp({
      isAuthenticated: false,
      type: 'user',
      userId: null,
      registeredUser: null,
      anonymousUser: null,
    });

    await unauthApp.ready();
    const res = await unauthApp.inject({ method: 'GET', url: '/me' });
    await unauthApp.close();

    expect(res.statusCode).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// POST /refresh
// ---------------------------------------------------------------------------

describe('POST /refresh', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    app = buildApp();
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 with new token on valid JWT', async () => {
    await app.ready();
    (jwt.verify as jest.Mock).mockReturnValue({ userId: USER_ID, username: 'alice', role: 'USER' });
    mockGetUserById.mockResolvedValue(makeUser());

    const res = await app.inject({
      method: 'POST',
      url: '/refresh',
      payload: { token: 'old-jwt-token' },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.token).toBe('new-jwt-token');
  });

  it('returns 401 when JWT has no userId', async () => {
    await app.ready();
    (jwt.verify as jest.Mock).mockReturnValue({ username: 'alice' });
    (jwt.decode as jest.Mock).mockReturnValue({ username: 'alice' });

    const res = await app.inject({
      method: 'POST',
      url: '/refresh',
      payload: { token: 'bad-token' },
    });

    expect(res.statusCode).toBe(401);
  });

  it('returns 404 when user not found in DB', async () => {
    await app.ready();
    (jwt.verify as jest.Mock).mockReturnValue({ userId: USER_ID, username: 'alice' });
    mockGetUserById.mockResolvedValue(null);

    const res = await app.inject({
      method: 'POST',
      url: '/refresh',
      payload: { token: 'some-token' },
    });

    expect(res.statusCode).toBe(404);
  });

  it('returns 200 with new token when JWT expired but sessionToken is valid', async () => {
    await app.ready();
    (jwt.verify as jest.Mock).mockImplementation(() => { throw new Error('jwt expired'); });
    (jwt.decode as jest.Mock).mockReturnValue({ userId: USER_ID, username: 'alice' });
    mockUserSession.findFirst.mockResolvedValue({ id: 'sess-1', userId: USER_ID, expiresAt: new Date(Date.now() + 100000) });
    mockGetUserById.mockResolvedValue(makeUser());

    const res = await app.inject({
      method: 'POST',
      url: '/refresh',
      payload: { token: 'expired-jwt', sessionToken: 'valid-session-token' },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.token).toBe('new-jwt-token');
  });
});

// ---------------------------------------------------------------------------
// POST /verify-email
// ---------------------------------------------------------------------------

describe('POST /verify-email', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    app = buildApp();
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 when email verified with token', async () => {
    await app.ready();
    mockVerifyEmail.mockResolvedValue({
      success: true,
      alreadyVerified: false,
      verifiedAt: new Date('2026-01-01'),
    });

    const res = await app.inject({
      method: 'POST',
      url: '/verify-email',
      payload: { token: 'verify-token', email: 'alice@example.com' },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.alreadyVerified).toBe(false);
  });

  it('returns 200 when email already verified', async () => {
    await app.ready();
    mockVerifyEmail.mockResolvedValue({
      success: true,
      alreadyVerified: true,
      verifiedAt: new Date('2025-12-01'),
    });

    const res = await app.inject({
      method: 'POST',
      url: '/verify-email',
      payload: { token: 'some-token', email: 'alice@example.com' },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.alreadyVerified).toBe(true);
  });

  it('returns 400 when verification fails', async () => {
    await app.ready();
    mockVerifyEmail.mockResolvedValue({ success: false, error: 'Token invalid or expired' });

    const res = await app.inject({
      method: 'POST',
      url: '/verify-email',
      payload: { token: 'bad-token', email: 'alice@example.com' },
    });

    expect(res.statusCode).toBe(400);
  });

  it('returns 500 on service error', async () => {
    await app.ready();
    mockVerifyEmail.mockRejectedValue(new Error('DB error'));

    const res = await app.inject({
      method: 'POST',
      url: '/verify-email',
      payload: { token: 'some-token', email: 'alice@example.com' },
    });

    expect(res.statusCode).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// POST /resend-verification
// ---------------------------------------------------------------------------

describe('POST /resend-verification', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    app = buildApp();
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 with success message', async () => {
    await app.ready();
    mockResendVerificationEmail.mockResolvedValue({ success: true });

    const res = await app.inject({
      method: 'POST',
      url: '/resend-verification',
      payload: { email: 'alice@example.com' },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.message).toContain('email de vérification');
  });

  it('returns 400 when email already verified', async () => {
    await app.ready();
    mockResendVerificationEmail.mockResolvedValue({ success: false, error: 'Email déjà vérifiée' });

    const res = await app.inject({
      method: 'POST',
      url: '/resend-verification',
      payload: { email: 'alice@example.com' },
    });

    expect(res.statusCode).toBe(400);
  });

  it('returns 500 on service error', async () => {
    await app.ready();
    mockResendVerificationEmail.mockRejectedValue(new Error('Mail server error'));

    const res = await app.inject({
      method: 'POST',
      url: '/resend-verification',
      payload: { email: 'alice@example.com' },
    });

    expect(res.statusCode).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// POST /send-phone-code
// ---------------------------------------------------------------------------

describe('POST /send-phone-code', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    app = buildApp();
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 when SMS sent', async () => {
    await app.ready();
    mockSendPhoneVerificationCode.mockResolvedValue({ success: true });

    const res = await app.inject({
      method: 'POST',
      url: '/send-phone-code',
      payload: { phoneNumber: '+33612345678' },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.message).toContain('SMS');
  });

  it('returns 400 when SMS service rejects', async () => {
    await app.ready();
    mockSendPhoneVerificationCode.mockResolvedValue({ success: false, error: 'Invalid phone number' });

    const res = await app.inject({
      method: 'POST',
      url: '/send-phone-code',
      payload: { phoneNumber: 'bad-number' },
    });

    expect(res.statusCode).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// POST /verify-phone
// ---------------------------------------------------------------------------

describe('POST /verify-phone', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    app = buildApp();
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 when phone verified', async () => {
    await app.ready();
    mockVerifyPhone.mockResolvedValue({ success: true });

    const res = await app.inject({
      method: 'POST',
      url: '/verify-phone',
      payload: { phoneNumber: '+33612345678', code: '123456' },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.message).toContain('succès');
  });

  it('returns 400 when code is wrong', async () => {
    await app.ready();
    mockVerifyPhone.mockResolvedValue({ success: false, error: 'Invalid code' });

    const res = await app.inject({
      method: 'POST',
      url: '/verify-phone',
      payload: { phoneNumber: '+33612345678', code: '000000' },
    });

    expect(res.statusCode).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// GET /sessions
// ---------------------------------------------------------------------------

describe('GET /sessions', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    app = buildApp();
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 with sessions list', async () => {
    await app.ready();
    mockGetUserActiveSessions.mockResolvedValue([makeSession(), makeSession({ id: 'session-2', isCurrentSession: false })]);

    const res = await app.inject({
      method: 'GET',
      url: '/sessions',
      headers: { 'x-session-token': 'current-session-token' },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.sessions).toHaveLength(2);
    expect(body.data.totalCount).toBe(2);
  });

  it('returns 200 with empty sessions list', async () => {
    await app.ready();
    mockGetUserActiveSessions.mockResolvedValue([]);

    const res = await app.inject({ method: 'GET', url: '/sessions' });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.sessions).toHaveLength(0);
    expect(body.data.totalCount).toBe(0);
  });

  it('returns 500 on service error', async () => {
    await app.ready();
    mockGetUserActiveSessions.mockRejectedValue(new Error('DB error'));

    const res = await app.inject({ method: 'GET', url: '/sessions' });
    expect(res.statusCode).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// DELETE /sessions/:sessionId
// ---------------------------------------------------------------------------

describe('DELETE /sessions/:sessionId', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    app = buildApp();
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 when session revoked', async () => {
    await app.ready();
    mockGetUserActiveSessions.mockResolvedValue([makeSession({ id: 'session-to-revoke' })]);
    mockRevokeSession.mockResolvedValue(true);

    const res = await app.inject({
      method: 'DELETE',
      url: '/sessions/session-to-revoke',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.message).toContain('révoquée');
  });

  it('returns 404 when session not found for user', async () => {
    await app.ready();
    mockGetUserActiveSessions.mockResolvedValue([]);

    const res = await app.inject({
      method: 'DELETE',
      url: '/sessions/unknown-session',
    });

    expect(res.statusCode).toBe(404);
  });

  it('returns 404 when revokeSession returns false', async () => {
    await app.ready();
    mockGetUserActiveSessions.mockResolvedValue([makeSession({ id: 'sess-id' })]);
    mockRevokeSession.mockResolvedValue(false);

    const res = await app.inject({
      method: 'DELETE',
      url: '/sessions/sess-id',
    });

    expect(res.statusCode).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// DELETE /sessions
// ---------------------------------------------------------------------------

describe('DELETE /sessions', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    app = buildApp();
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 with revoked count', async () => {
    await app.ready();
    mockRevokeAllSessionsExceptCurrent.mockResolvedValue(3);

    const res = await app.inject({
      method: 'DELETE',
      url: '/sessions',
      headers: { 'x-session-token': 'keep-this-session' },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.revokedCount).toBe(3);
    expect(mockRevokeAllSessionsExceptCurrent).toHaveBeenCalledWith(USER_ID, 'keep-this-session');
  });

  it('returns 500 on service error', async () => {
    await app.ready();
    mockRevokeAllSessionsExceptCurrent.mockRejectedValue(new Error('DB error'));

    const res = await app.inject({ method: 'DELETE', url: '/sessions' });
    expect(res.statusCode).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// POST /validate-session
// ---------------------------------------------------------------------------

describe('POST /validate-session', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    app = buildApp();
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 with valid=true when session exists', async () => {
    await app.ready();
    mockValidateSessionToken.mockResolvedValue(makeSession());

    const res = await app.inject({
      method: 'POST',
      url: '/validate-session',
      payload: { sessionToken: 'valid-session' },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.valid).toBe(true);
    expect(body.data.session).not.toBeNull();
  });

  it('returns 200 with valid=false when session not found', async () => {
    await app.ready();
    mockValidateSessionToken.mockResolvedValue(null);

    const res = await app.inject({
      method: 'POST',
      url: '/validate-session',
      payload: { sessionToken: 'invalid-session' },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.valid).toBe(false);
    expect(body.data.session).toBeNull();
  });

  it('returns 500 on service error', async () => {
    await app.ready();
    mockValidateSessionToken.mockRejectedValue(new Error('DB error'));

    const res = await app.inject({
      method: 'POST',
      url: '/validate-session',
      payload: { sessionToken: 'some-token' },
    });

    expect(res.statusCode).toBe(500);
  });
});
