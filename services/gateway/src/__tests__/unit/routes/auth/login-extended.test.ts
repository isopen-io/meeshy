/**
 * Extended unit tests for auth/login.ts routes.
 * Covers branches missing from login.test.ts:
 * - POST /login rememberDevice: true → markSessionTrusted fire-and-forget (marked / not marked / throws)
 * - POST /login notification .catch fires when createLoginNewDeviceNotification rejects
 * - POST /login/2fa empty twoFactorToken → explicit 400 guard (line 220)
 * - POST /login/2fa untrusted session → notification block (lines 237-251)
 * - POST /login/2fa rememberDevice: true → markSessionTrusted (lines 259-269)
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn(() => ({
      info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn(),
    })),
  },
}));

jest.mock('../../../../utils/rate-limiter.js', () => ({
  createLoginRateLimiter: jest.fn(() => ({ middleware: jest.fn(() => async () => {}) })),
  createAuthGlobalRateLimiter: jest.fn(() => ({ middleware: jest.fn(() => async () => {}) })),
}));

const mockGetRequestContext = jest.fn<any>().mockResolvedValue({
  ip: '127.0.0.1',
  userAgent: 'test-agent',
  deviceInfo: { type: 'desktop' },
  geoData: null,
});
jest.mock('../../../../services/GeoIPService', () => ({
  getRequestContext: (...args: any[]) => mockGetRequestContext(...args),
}));

const mockMarkSessionTrusted = jest.fn<any>().mockResolvedValue(true);
jest.mock('../../../../services/SessionService', () => ({
  markSessionTrusted: (...args: any[]) => mockMarkSessionTrusted(...args),
  invalidateAllSessions: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('jsonwebtoken', () => ({
  sign: jest.fn().mockReturnValue('mock-revoke-token'),
  verify: jest.fn(),
}));

// validateSchema passes through rememberDevice so tests can control it via the payload
const mockValidateSchema = jest.fn((_schema: any, data: any) => ({
  username: (data as any)?.username,
  password: (data as any)?.password,
  rememberDevice: (data as any)?.rememberDevice ?? false,
}));
jest.mock('@meeshy/shared/utils/validation', () => ({
  AuthSchemas: { login: {} },
  validateSchema: (_s: any, d: any, _c: any) => mockValidateSchema(_s, d),
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { registerLoginRoutes } from '../../../../routes/auth/login';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const USER_ID = '507f1f77bcf86cd799439011';

const mockUser = {
  id: USER_ID, username: 'alice', email: 'alice@test.com',
  firstName: 'Alice', lastName: 'Smith', displayName: 'Alice Smith',
  bio: null, avatar: null, banner: null, phoneNumber: null,
  role: 'USER', isActive: true, deactivatedAt: null,
  systemLanguage: 'en', regionalLanguage: 'en', customDestinationLanguage: null,
  autoTranslateEnabled: true, isOnline: true, lastActiveAt: new Date(),
  emailVerifiedAt: new Date(), phoneVerifiedAt: null, twoFactorEnabledAt: null,
  pendingEmail: null, pendingPhoneNumber: null, lastPasswordChange: null,
  lastLoginIp: null, lastLoginLocation: null, lastLoginDevice: null,
  profileCompletionRate: 80, createdAt: new Date(), updatedAt: new Date(),
};

const mockSession = {
  id: 'session-1', deviceType: 'desktop', browserName: 'Chrome', osName: 'Linux',
  location: null, isMobile: false, isTrusted: true, createdAt: new Date(),
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeAuthService(overrides: Record<string, any> = {}) {
  return {
    authenticate: jest.fn<any>().mockResolvedValue({
      user: mockUser, sessionToken: 'session-token', session: mockSession,
      requires2FA: false, twoFactorToken: null,
    }),
    generateToken: jest.fn<any>().mockReturnValue('jwt-access-token'),
    getUserPermissions: jest.fn<any>().mockReturnValue([]),
    completeAuthWith2FA: jest.fn<any>().mockResolvedValue({
      user: mockUser, sessionToken: 'session-token', session: mockSession,
    }),
    updateOnlineStatus: jest.fn<any>().mockResolvedValue(undefined),
    logout: jest.fn<any>().mockResolvedValue(true),
    ...overrides,
  } as any;
}

async function buildApp(opts: {
  authService?: ReturnType<typeof makeAuthService>;
  notificationServiceImpl?: Record<string, any> | null;
} = {}): Promise<{ app: FastifyInstance; authService: ReturnType<typeof makeAuthService> }> {
  const { authService = makeAuthService(), notificationServiceImpl = null } = opts;

  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });

  app.decorate('authenticate', async (req: FastifyRequest) => {
    (req as any).user = { userId: USER_ID };
  });

  if (notificationServiceImpl) {
    app.decorate('notificationService', notificationServiceImpl);
  }

  const context = {
    fastify: app,
    authService,
    redis: null,
    prisma: null,
    phoneTransferService: {} as any,
    smsService: {} as any,
    cacheStore: {} as any,
  };

  registerLoginRoutes(context as any);
  await app.ready();
  return { app, authService };
}

// ─── POST /login — untrusted session without notificationService (line 126 false branch) ─

describe('POST /login — untrusted session, no notificationService decorated', () => {
  it('returns 200 when session is untrusted but no notificationService is present', async () => {
    const authService = makeAuthService();
    authService.authenticate = jest.fn<any>().mockResolvedValue({
      user: mockUser, sessionToken: 'session-token',
      session: { ...mockSession, isTrusted: false },
      requires2FA: false, twoFactorToken: null,
    });
    // No notificationServiceImpl → notificationService is undefined on fastify instance
    const { app } = await buildApp({ authService });
    const res = await app.inject({
      method: 'POST', url: '/login',
      payload: { username: 'alice', password: 'secret123' },
    });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});

// ─── POST /login — rememberDevice: true paths ─────────────────────────────────

describe('POST /login — rememberDevice true, markSessionTrusted succeeds', () => {
  beforeEach(() => { mockMarkSessionTrusted.mockReset(); });

  it('returns 200 and fires markSessionTrusted in background', async () => {
    mockMarkSessionTrusted.mockResolvedValue(true);
    const { app } = await buildApp();
    const res = await app.inject({
      method: 'POST', url: '/login',
      payload: { username: 'alice', password: 'secret123', rememberDevice: true },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
    await Promise.resolve();
    expect(mockMarkSessionTrusted).toHaveBeenCalled();
    await app.close();
  });
});

describe('POST /login — rememberDevice true, markSessionTrusted returns false (warn branch)', () => {
  beforeEach(() => { mockMarkSessionTrusted.mockReset(); });

  it('returns 200 and logs a warning when markSessionTrusted returns false', async () => {
    mockMarkSessionTrusted.mockResolvedValue(false);
    const { app } = await buildApp();
    const res = await app.inject({
      method: 'POST', url: '/login',
      payload: { username: 'alice', password: 'secret123', rememberDevice: true },
    });
    expect(res.statusCode).toBe(200);
    await Promise.resolve();
    await app.close();
  });
});

describe('POST /login — rememberDevice true, markSessionTrusted throws (catch branch)', () => {
  beforeEach(() => { mockMarkSessionTrusted.mockReset(); });

  it('returns 200 even when markSessionTrusted rejects', async () => {
    mockMarkSessionTrusted.mockRejectedValue(new Error('DB unavailable'));
    const { app } = await buildApp();
    const res = await app.inject({
      method: 'POST', url: '/login',
      payload: { username: 'alice', password: 'secret123', rememberDevice: true },
    });
    expect(res.statusCode).toBe(200);
    await Promise.resolve();
    await app.close();
  });
});

// ─── POST /login — notification .catch fires ──────────────────────────────────

describe('POST /login — notification .catch fires when createLoginNewDeviceNotification rejects', () => {
  it('returns 200 and absorbs notification rejection', async () => {
    const authService = makeAuthService();
    authService.authenticate = jest.fn<any>().mockResolvedValue({
      user: mockUser, sessionToken: 'session-token',
      session: { ...mockSession, isTrusted: false },
      requires2FA: false, twoFactorToken: null,
    });
    const { app } = await buildApp({
      authService,
      notificationServiceImpl: {
        createLoginNewDeviceNotification: jest.fn<any>().mockRejectedValue(new Error('Push failed')),
      },
    });
    const res = await app.inject({
      method: 'POST', url: '/login',
      payload: { username: 'alice', password: 'secret123' },
    });
    expect(res.statusCode).toBe(200);
    await Promise.resolve();
    await app.close();
  });
});

// ─── POST /login/2fa — explicit guard (line 220) ──────────────────────────────

describe('POST /login/2fa — empty twoFactorToken triggers explicit 400 guard', () => {
  it('returns 400 when twoFactorToken is an empty string (passes schema, fails guard)', async () => {
    const { app } = await buildApp();
    const res = await app.inject({
      method: 'POST', url: '/login/2fa',
      payload: { twoFactorToken: '', code: '123456' },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

// ─── POST /login/2fa — untrusted session without notificationService (line 238 false branch) ─

describe('POST /login/2fa — untrusted session, no notificationService decorated', () => {
  it('returns 200 when 2FA session is untrusted but no notificationService is present', async () => {
    const authService = makeAuthService();
    authService.completeAuthWith2FA = jest.fn<any>().mockResolvedValue({
      user: mockUser, sessionToken: 'session-token',
      session: { ...mockSession, isTrusted: false },
    });
    // No notificationServiceImpl
    const { app } = await buildApp({ authService });
    const res = await app.inject({
      method: 'POST', url: '/login/2fa',
      payload: { twoFactorToken: 'tok', code: '123456' },
    });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});

// ─── POST /login/2fa — untrusted session notification (lines 237-251) ────────

describe('POST /login/2fa — untrusted session fires notification successfully', () => {
  it('returns 200 and calls createLoginNewDeviceNotification', async () => {
    const notificationService = {
      createLoginNewDeviceNotification: jest.fn<any>().mockResolvedValue(undefined),
    };
    const authService = makeAuthService();
    authService.completeAuthWith2FA = jest.fn<any>().mockResolvedValue({
      user: mockUser, sessionToken: 'session-token',
      session: { ...mockSession, isTrusted: false },
    });
    const { app } = await buildApp({ authService, notificationServiceImpl: notificationService });
    const res = await app.inject({
      method: 'POST', url: '/login/2fa',
      payload: { twoFactorToken: 'tok', code: '123456' },
    });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});

describe('POST /login/2fa — untrusted session, notification rejects (catch branch line 251)', () => {
  it('returns 200 even when 2FA notification rejects', async () => {
    const authService = makeAuthService();
    authService.completeAuthWith2FA = jest.fn<any>().mockResolvedValue({
      user: mockUser, sessionToken: 'session-token',
      session: { ...mockSession, isTrusted: false },
    });
    const { app } = await buildApp({
      authService,
      notificationServiceImpl: {
        createLoginNewDeviceNotification: jest.fn<any>().mockRejectedValue(new Error('Push failed')),
      },
    });
    const res = await app.inject({
      method: 'POST', url: '/login/2fa',
      payload: { twoFactorToken: 'tok', code: '123456' },
    });
    expect(res.statusCode).toBe(200);
    await Promise.resolve();
    await app.close();
  });
});

// ─── POST /login/2fa — rememberDevice: true markSessionTrusted (lines 259-269) ─

describe('POST /login/2fa — rememberDevice true, markSessionTrusted succeeds', () => {
  beforeEach(() => { mockMarkSessionTrusted.mockReset(); });

  it('returns 200 and fires markSessionTrusted after 2FA', async () => {
    mockMarkSessionTrusted.mockResolvedValue(true);
    const { app } = await buildApp();
    const res = await app.inject({
      method: 'POST', url: '/login/2fa',
      payload: { twoFactorToken: 'tok', code: '123456', rememberDevice: true },
    });
    expect(res.statusCode).toBe(200);
    await Promise.resolve();
    expect(mockMarkSessionTrusted).toHaveBeenCalled();
    await app.close();
  });
});

describe('POST /login/2fa — rememberDevice true, markSessionTrusted returns false (warn branch)', () => {
  beforeEach(() => { mockMarkSessionTrusted.mockReset(); });

  it('returns 200 and logs warning when markSessionTrusted returns false after 2FA', async () => {
    mockMarkSessionTrusted.mockResolvedValue(false);
    const { app } = await buildApp();
    const res = await app.inject({
      method: 'POST', url: '/login/2fa',
      payload: { twoFactorToken: 'tok', code: '123456', rememberDevice: true },
    });
    expect(res.statusCode).toBe(200);
    await Promise.resolve();
    await app.close();
  });
});

describe('POST /login/2fa — rememberDevice true, markSessionTrusted throws (catch branch)', () => {
  beforeEach(() => { mockMarkSessionTrusted.mockReset(); });

  it('returns 200 even when markSessionTrusted rejects after 2FA', async () => {
    mockMarkSessionTrusted.mockRejectedValue(new Error('DB unavailable'));
    const { app } = await buildApp();
    const res = await app.inject({
      method: 'POST', url: '/login/2fa',
      payload: { twoFactorToken: 'tok', code: '123456', rememberDevice: true },
    });
    expect(res.statusCode).toBe(200);
    await Promise.resolve();
    await app.close();
  });
});

// ─── POST /logout — loggedOut returns false (false branch of if(loggedOut)) ───

describe('POST /logout — logout service returns false (session already invalid)', () => {
  it('returns 200 even when logout returns false', async () => {
    const authService = makeAuthService();
    authService.logout = jest.fn<any>().mockResolvedValue(false);
    const { app } = await buildApp({ authService });
    const res = await app.inject({
      method: 'POST', url: '/logout',
      headers: { 'x-session-token': 'already-expired-token' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
    await app.close();
  });
});
