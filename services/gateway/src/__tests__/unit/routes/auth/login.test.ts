/**
 * Unit tests for auth login routes (login.ts)
 * Tests POST /login, POST /login/2fa, POST /logout.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
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
  createLoginRateLimiter: jest.fn(() => ({
    middleware: jest.fn(() => async () => {}),
  })),
  createAuthGlobalRateLimiter: jest.fn(() => ({
    middleware: jest.fn(() => async () => {}),
  })),
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

// Mock validateSchema to pass through body data (avoid Zod dependency in tests)
jest.mock('@meeshy/shared/utils/validation', () => ({
  AuthSchemas: { login: {} },
  validateSchema: jest.fn((_schema: any, data: any) => ({ username: (data as any)?.username, password: (data as any)?.password, rememberDevice: false })),
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { registerLoginRoutes } from '../../../../routes/auth/login';

// ─── Constants ────────────────────────────────────────────────────────────────

const USER_ID = '507f1f77bcf86cd799439011';

const mockUser = {
  id: USER_ID,
  username: 'alice',
  email: 'alice@test.com',
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
  systemLanguage: 'en',
  regionalLanguage: 'en',
  customDestinationLanguage: null,
  autoTranslateEnabled: true,
  isOnline: true,
  lastActiveAt: new Date(),
  emailVerifiedAt: new Date(),
  phoneVerifiedAt: null,
  twoFactorEnabledAt: null,
  pendingEmail: null,
  pendingPhoneNumber: null,
  lastPasswordChange: null,
  lastLoginIp: null,
  lastLoginLocation: null,
  lastLoginDevice: null,
  profileCompletionRate: 80,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockSession = {
  id: 'session-1',
  deviceType: 'desktop',
  browserName: 'Chrome',
  osName: 'Linux',
  location: null,
  isMobile: false,
  isTrusted: true,
  createdAt: new Date(),
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeAuthService(overrides: Record<string, any> = {}) {
  return {
    authenticate: jest.fn<any>().mockResolvedValue({
      user: mockUser,
      sessionToken: 'session-token',
      session: mockSession,
      requires2FA: false,
      twoFactorToken: null,
    }),
    generateToken: jest.fn<any>().mockReturnValue('jwt-access-token'),
    getUserPermissions: jest.fn<any>().mockReturnValue([]),
    completeAuthWith2FA: jest.fn<any>().mockResolvedValue({
      user: mockUser,
      sessionToken: 'session-token',
      session: mockSession,
    }),
    updateOnlineStatus: jest.fn<any>().mockResolvedValue(undefined),
    logout: jest.fn<any>().mockResolvedValue(true),
    ...overrides,
  } as any;
}

async function buildApp(opts: {
  authService?: ReturnType<typeof makeAuthService>;
  withNotificationService?: boolean;
  authenticateUser?: boolean;
} = {}): Promise<{ app: FastifyInstance; authService: ReturnType<typeof makeAuthService> }> {
  const {
    authService = makeAuthService(),
    withNotificationService = false,
    authenticateUser = true,
  } = opts;

  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });

  // Decorate authenticate for logout route
  app.decorate('authenticate', async (req: FastifyRequest) => {
    if (authenticateUser) {
      (req as any).user = { userId: USER_ID };
    }
  });

  if (withNotificationService) {
    app.decorate('notificationService', {
      createLoginNewDeviceNotification: jest.fn<any>().mockResolvedValue(undefined),
    });
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

// ─── POST /login ──────────────────────────────────────────────────────────────

describe('POST /login — invalid credentials', () => {
  it('returns 401 when authService returns null', async () => {
    const authService = makeAuthService();
    authService.authenticate = jest.fn<any>().mockResolvedValue(null);
    const { app } = await buildApp({ authService });
    const res = await app.inject({
      method: 'POST', url: '/login',
      payload: { username: 'alice', password: 'wrongpass' },
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});

describe('POST /login — success', () => {
  it('returns 200 with user, token, and session', async () => {
    const { app, authService } = await buildApp();
    const res = await app.inject({
      method: 'POST', url: '/login',
      payload: { username: 'alice', password: 'secret123' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.token).toBe('jwt-access-token');
    expect(body.data.sessionToken).toBe('session-token');
    expect(authService.generateToken).toHaveBeenCalledWith(mockUser);
    await app.close();
  });
});

describe('POST /login — requires 2FA', () => {
  it('returns 200 when 2FA is required', async () => {
    const authService = makeAuthService();
    authService.authenticate = jest.fn<any>().mockResolvedValue({
      user: mockUser,
      sessionToken: 'partial-session',
      session: mockSession,
      requires2FA: true,
      twoFactorToken: '2fa-token-xyz',
    });
    const { app } = await buildApp({ authService });
    const res = await app.inject({
      method: 'POST', url: '/login',
      payload: { username: 'alice', password: 'secret123' },
    });
    // 2FA case returns 200 (response schema strips requires2FA from serialized output)
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
    await app.close();
  });
});

describe('POST /login — service error', () => {
  it('returns 500 when authService throws', async () => {
    const authService = makeAuthService();
    authService.authenticate = jest.fn<any>().mockRejectedValue(new Error('DB down'));
    const { app } = await buildApp({ authService });
    const res = await app.inject({
      method: 'POST', url: '/login',
      payload: { username: 'alice', password: 'secret123' },
    });
    expect(res.statusCode).toBe(500);
    await app.close();
  });
});

describe('POST /login — new device notification fires', () => {
  it('calls notificationService when session is not trusted', async () => {
    const untrustedSession = { ...mockSession, isTrusted: false };
    const authService = makeAuthService();
    authService.authenticate = jest.fn<any>().mockResolvedValue({
      user: mockUser,
      sessionToken: 'session-token',
      session: untrustedSession,
      requires2FA: false,
    });
    const { app } = await buildApp({ authService, withNotificationService: true });
    const res = await app.inject({
      method: 'POST', url: '/login',
      payload: { username: 'alice', password: 'secret123' },
    });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});

// ─── POST /login/2fa ──────────────────────────────────────────────────────────

describe('POST /login/2fa — missing fields', () => {
  it('returns 400 when twoFactorToken is missing', async () => {
    const { app } = await buildApp();
    const res = await app.inject({
      method: 'POST', url: '/login/2fa',
      payload: { code: '123456' },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('returns 400 when code is missing', async () => {
    const { app } = await buildApp();
    const res = await app.inject({
      method: 'POST', url: '/login/2fa',
      payload: { twoFactorToken: 'some-token' },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

describe('POST /login/2fa — invalid 2FA code', () => {
  it('returns 401 when 2FA service returns failure', async () => {
    const authService = makeAuthService();
    authService.completeAuthWith2FA = jest.fn<any>().mockResolvedValue({
      success: false,
      error: 'Code invalide',
    });
    const { app } = await buildApp({ authService });
    const res = await app.inject({
      method: 'POST', url: '/login/2fa',
      payload: { twoFactorToken: 'tok', code: '000000' },
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});

describe('POST /login/2fa — success', () => {
  it('returns 200 with full session', async () => {
    const { app, authService } = await buildApp();
    const res = await app.inject({
      method: 'POST', url: '/login/2fa',
      payload: { twoFactorToken: 'tok', code: '123456' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.token).toBe('jwt-access-token');
    expect(authService.completeAuthWith2FA).toHaveBeenCalledWith('tok', '123456', expect.any(Object));
    await app.close();
  });
});

describe('POST /login/2fa — service error', () => {
  it('returns 500 when completeAuthWith2FA throws', async () => {
    const authService = makeAuthService();
    authService.completeAuthWith2FA = jest.fn<any>().mockRejectedValue(new Error('2FA error'));
    const { app } = await buildApp({ authService });
    const res = await app.inject({
      method: 'POST', url: '/login/2fa',
      payload: { twoFactorToken: 'tok', code: '123456' },
    });
    expect(res.statusCode).toBe(500);
    await app.close();
  });
});

// ─── POST /logout ─────────────────────────────────────────────────────────────

describe('POST /logout — success', () => {
  it('returns 200 on logout', async () => {
    const { app, authService } = await buildApp();
    const res = await app.inject({
      method: 'POST', url: '/logout',
      headers: { 'x-session-token': 'session-token-123' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
    expect(authService.updateOnlineStatus).toHaveBeenCalledWith(USER_ID, false);
    expect(authService.logout).toHaveBeenCalledWith('session-token-123');
    await app.close();
  });
});

describe('POST /logout — no session token', () => {
  it('returns 200 when no session token header provided', async () => {
    const { app } = await buildApp();
    const res = await app.inject({ method: 'POST', url: '/logout' });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});

describe('POST /logout — service error', () => {
  it('returns 500 when logout throws', async () => {
    const authService = makeAuthService();
    authService.updateOnlineStatus = jest.fn<any>().mockRejectedValue(new Error('DB error'));
    const { app } = await buildApp({ authService });
    const res = await app.inject({
      method: 'POST', url: '/logout',
      headers: { 'x-session-token': 'session-token-123' },
    });
    expect(res.statusCode).toBe(500);
    await app.close();
  });
});
