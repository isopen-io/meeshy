/**
 * auth-register-routes.test.ts
 *
 * Unit tests for src/routes/auth/register.ts
 * Covers: POST /register, GET /check-availability
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
  registerRequestSchema:         { type: 'object' },
  validationErrorResponseSchema: { type: 'object', additionalProperties: true },
  errorResponseSchema:           { type: 'object', additionalProperties: true },
}));

jest.mock('@meeshy/shared/utils/validation', () => ({
  AuthSchemas: { register: 'register-schema' },
  validateSchema: jest.fn((_schema: any, body: any) => body),
}));

const mockGetRequestContext = jest.fn<any>().mockResolvedValue({
  ip: '127.0.0.1',
  userAgent: 'Jest/1.0',
  deviceInfo: { type: 'desktop' },
  geoData: { location: 'Paris, FR', country: 'FR' },
});
jest.mock('../../../services/GeoIPService', () => ({
  getRequestContext: (...args: any[]) => mockGetRequestContext(...args),
}));

const noopMiddleware = async () => {};
jest.mock('../../../utils/rate-limiter', () => ({
  createRegisterRateLimiter:   jest.fn(() => ({ middleware: () => noopMiddleware })),
  createAuthGlobalRateLimiter: jest.fn(() => ({ middleware: () => noopMiddleware })),
}));

jest.mock('../../../utils/normalize', () => ({
  normalizePhoneNumber: jest.fn<any>((p: any) => p),
  normalizePhoneWithCountry: jest.fn<any>().mockReturnValue({
    isValid: true,
    phoneNumber: '+33612345678',
  }),
}));

// ---------------------------------------------------------------------------
// Import route under test (after mocks)
// ---------------------------------------------------------------------------

import { registerRegistrationRoutes } from '../../../routes/auth/register';

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

function makeRegisterResult(overrides: any = {}) {
  return {
    user: makeUser(),
    phoneOwnershipConflict: false,
    phoneOwnerInfo: undefined,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Mock services
// ---------------------------------------------------------------------------

const mockRegister          = jest.fn<any>();
const mockGenerateToken     = jest.fn<any>().mockReturnValue('jwt-token-123');
const mockGetUserPermissions = jest.fn<any>().mockReturnValue({ canSendMessages: true });

const mockAuthService = {
  register:            mockRegister,
  generateToken:       mockGenerateToken,
  getUserPermissions:  mockGetUserPermissions,
};

const mockGetTransferDataByToken      = jest.fn<any>();
const mockExecuteRegistrationTransfer = jest.fn<any>();

const mockPhoneTransferService = {
  getTransferDataByToken:       mockGetTransferDataByToken,
  executeRegistrationTransfer:  mockExecuteRegistrationTransfer,
};

const mockPrismaUser = {
  findFirst: jest.fn<any>(),
};

const mockPrisma: any = { user: mockPrismaUser };

// ---------------------------------------------------------------------------
// App builder
// ---------------------------------------------------------------------------

function buildApp(): FastifyInstance {
  const app = Fastify({ logger: false });
  app.decorate('prisma', mockPrisma);
  app.decorate('notificationService', null);
  app.decorate('redis', {});

  registerRegistrationRoutes({
    fastify: app,
    authService: mockAuthService as any,
    phoneTransferService: mockPhoneTransferService as any,
    smsService: null as any,
    cacheStore: null as any,
    redis: null,
    prisma: mockPrisma,
  });

  return app;
}

// ---------------------------------------------------------------------------
// POST /register
// ---------------------------------------------------------------------------

describe('POST /register', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    app = buildApp();
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 with user and token on successful registration', async () => {
    await app.ready();
    mockRegister.mockResolvedValue(makeRegisterResult());

    const res = await app.inject({
      method: 'POST',
      url: '/register',
      payload: {
        username: 'alice',
        email: 'alice@example.com',
        password: 'SecurePass123!',
        systemLanguage: 'fr',
        regionalLanguage: 'fr',
      },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.token).toBe('jwt-token-123');
    expect(body.data.expiresIn).toBe(24 * 60 * 60);
  });

  it('returns 400 when register returns null', async () => {
    await app.ready();
    mockRegister.mockResolvedValue(null);

    const res = await app.inject({
      method: 'POST',
      url: '/register',
      payload: { username: 'alice', email: 'alice@example.com', password: 'pass' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when register returns result with no user', async () => {
    await app.ready();
    mockRegister.mockResolvedValue({ user: null });

    const res = await app.inject({
      method: 'POST',
      url: '/register',
      payload: { username: 'alice', email: 'alice@example.com', password: 'pass' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 200 with phoneOwnershipConflict when phone is taken', async () => {
    await app.ready();
    mockRegister.mockResolvedValue({
      phoneOwnershipConflict: true,
      phoneOwnerInfo: {
        maskedDisplayName: 'A***',
        maskedUsername: 'a***',
        maskedEmail: 'a***@e***.com',
        avatar: null,
        phoneNumber: '+33612345678',
        phoneCountryCode: 'FR',
      },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/register',
      payload: { username: 'alice', email: 'alice@example.com', password: 'pass', phoneNumber: '+33612345678' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.phoneOwnershipConflict).toBe(true);
    expect(body.data.phoneOwnerInfo.maskedDisplayName).toBe('A***');
  });

  it('returns 400 when service throws "already exists" error', async () => {
    await app.ready();
    mockRegister.mockRejectedValue(new Error('Username already exists'));

    const res = await app.inject({
      method: 'POST',
      url: '/register',
      payload: { username: 'alice', email: 'alice@example.com', password: 'pass' },
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.code).toBe('DUPLICATE_FIELD');
  });

  it('returns 400 when service throws email validation error', async () => {
    await app.ready();
    mockRegister.mockRejectedValue(new Error('Email invalide'));

    const res = await app.inject({
      method: 'POST',
      url: '/register',
      payload: { username: 'alice', email: 'bad-email', password: 'pass' },
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.code).toBe('INVALID_EMAIL');
  });

  it('returns 400 when service throws password error', async () => {
    await app.ready();
    mockRegister.mockRejectedValue(new Error('mot de passe trop court'));

    const res = await app.inject({
      method: 'POST',
      url: '/register',
      payload: { username: 'alice', email: 'alice@example.com', password: 'x' },
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.code).toBe('INVALID_PASSWORD');
  });

  it('returns 400 when service throws username error', async () => {
    await app.ready();
    mockRegister.mockRejectedValue(new Error("nom d'utilisateur invalide"));

    const res = await app.inject({
      method: 'POST',
      url: '/register',
      payload: { username: '!!bad!!', email: 'alice@example.com', password: 'pass' },
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.code).toBe('INVALID_USERNAME');
  });

  it('returns 500 on unexpected registration error', async () => {
    await app.ready();
    mockRegister.mockRejectedValue(new Error('Unexpected DB error'));

    const res = await app.inject({
      method: 'POST',
      url: '/register',
      payload: { username: 'alice', email: 'alice@example.com', password: 'pass' },
    });
    expect(res.statusCode).toBe(500);
  });

  it('validates phone transfer token and executes transfer on success', async () => {
    await app.ready();
    mockGetTransferDataByToken.mockResolvedValue({ valid: true });
    mockRegister.mockResolvedValue(makeRegisterResult());
    mockExecuteRegistrationTransfer.mockResolvedValue({ success: true });

    const res = await app.inject({
      method: 'POST',
      url: '/register',
      payload: {
        username: 'alice',
        email: 'alice@example.com',
        password: 'pass',
        phoneTransferToken: 'transfer-token-123',
      },
    });
    expect(res.statusCode).toBe(200);
    expect(mockGetTransferDataByToken).toHaveBeenCalledWith('transfer-token-123');
    expect(mockExecuteRegistrationTransfer).toHaveBeenCalledWith(
      'transfer-token-123', USER_ID, expect.any(String)
    );
  });

  it('returns 400 when phone transfer token is invalid', async () => {
    await app.ready();
    mockGetTransferDataByToken.mockResolvedValue({ valid: false });

    const res = await app.inject({
      method: 'POST',
      url: '/register',
      payload: {
        username: 'alice',
        email: 'alice@example.com',
        password: 'pass',
        phoneTransferToken: 'bad-token',
      },
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.code).toBe('INVALID_TRANSFER_TOKEN');
  });
});

// ---------------------------------------------------------------------------
// GET /check-availability
// ---------------------------------------------------------------------------

describe('GET /check-availability', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    app = buildApp();
  });

  afterEach(async () => { await app.close(); });

  it('returns 400 when no query params provided', async () => {
    await app.ready();
    const res = await app.inject({ method: 'GET', url: '/check-availability' });
    expect(res.statusCode).toBe(400);
  });

  it('returns usernameAvailable=true when username is not taken', async () => {
    await app.ready();
    mockPrismaUser.findFirst.mockResolvedValue(null);

    const res = await app.inject({ method: 'GET', url: '/check-availability?username=alice' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.usernameAvailable).toBe(true);
  });

  it('returns usernameAvailable=false with suggestions when username is taken', async () => {
    await app.ready();
    // First call returns existing user; subsequent calls return null (suggestions available)
    mockPrismaUser.findFirst
      .mockResolvedValueOnce({ id: 'other', username: 'alice' })
      .mockResolvedValue(null);

    const res = await app.inject({ method: 'GET', url: '/check-availability?username=alice' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.usernameAvailable).toBe(false);
    expect(Array.isArray(body.data.suggestions)).toBe(true);
  });

  it('returns emailAvailable=true when email is not taken', async () => {
    await app.ready();
    mockPrismaUser.findFirst.mockResolvedValue(null);

    const res = await app.inject({
      method: 'GET',
      url: '/check-availability?email=alice%40example.com',
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.emailAvailable).toBe(true);
  });

  it('returns emailAvailable=false when email is taken', async () => {
    await app.ready();
    mockPrismaUser.findFirst.mockResolvedValue({ id: 'other', email: 'alice@example.com' });

    const res = await app.inject({
      method: 'GET',
      url: '/check-availability?email=alice%40example.com',
    });
    const body = JSON.parse(res.body);
    expect(body.data.emailAvailable).toBe(false);
  });

  it('returns phoneNumberAvailable=true for valid available phone', async () => {
    await app.ready();
    mockPrismaUser.findFirst.mockResolvedValue(null);

    const res = await app.inject({
      method: 'GET',
      url: '/check-availability?phoneNumber=%2B33612345678',
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.phoneNumberAvailable).toBe(true);
    expect(body.data.phoneNumberValid).toBe(true);
  });

  it('returns 500 on DB error', async () => {
    await app.ready();
    mockPrismaUser.findFirst.mockRejectedValue(new Error('DB error'));

    const res = await app.inject({ method: 'GET', url: '/check-availability?username=alice' });
    expect(res.statusCode).toBe(500);
  });
});
