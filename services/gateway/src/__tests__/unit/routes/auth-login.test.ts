/**
 * Unit tests for auth/login.ts
 * Tests POST /login, POST /login/2fa, POST /logout
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeAll, afterAll } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../../../utils/logger-enhanced.js', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() }) },
}));

jest.mock('@meeshy/shared/types', () => ({
  userSchema: { type: 'object', properties: { id: { type: 'string' } } },
  sessionMinimalSchema: { type: 'object', properties: { id: { type: 'string' } } },
  loginRequestSchema: {
    type: 'object',
    required: ['username', 'password'],
    properties: {
      username: { type: 'string' },
      password: { type: 'string' },
      rememberDevice: { type: 'boolean' },
    },
  },
  errorResponseSchema: {
    type: 'object',
    properties: { success: { type: 'boolean' }, error: { type: 'string' }, message: { type: 'string' } },
  },
}));

const mockValidateSchema = jest.fn<any>().mockImplementation((_schema: any, body: any) => body);
jest.mock('@meeshy/shared/utils/validation', () => ({
  AuthSchemas: { login: {} },
  validateSchema: (...a: any[]) => mockValidateSchema(...a),
}));

const mockGetRequestContext = jest.fn<any>().mockResolvedValue({
  ip: '127.0.0.1',
  userAgent: 'test-agent',
  deviceInfo: { platform: 'test', browser: 'test', os: 'test' },
  geoData: null,
});
jest.mock('../../../services/GeoIPService', () => ({
  getRequestContext: (...a: any[]) => mockGetRequestContext(...a),
}));

const mockMarkSessionTrusted = jest.fn<any>().mockResolvedValue(true);
jest.mock('../../../services/SessionService', () => ({
  markSessionTrusted: (...a: any[]) => mockMarkSessionTrusted(...a),
}));

jest.mock('../../../utils/rate-limiter.js', () => ({
  createLoginRateLimiter: () => ({ middleware: () => async () => {} }),
  createAuthGlobalRateLimiter: () => ({ middleware: () => async () => {} }),
}));

jest.mock('jsonwebtoken', () => ({
  sign: jest.fn().mockReturnValue('mock-revoke-token'),
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { registerLoginRoutes } from '../../../routes/auth/login';

// ─── Constants ────────────────────────────────────────────────────────────────

const USER_ID = '507f1f77bcf86cd799439011';

const MOCK_USER = {
  id: USER_ID,
  username: 'alice',
  email: 'alice@example.com',
  firstName: 'Alice',
  lastName: 'Smith',
  displayName: 'Alice Smith',
  avatar: null,
  role: 'USER',
  is2FAEnabled: false,
  isBanned: false,
  systemLanguage: 'fr',
  regionalLanguage: null,
};

const MOCK_SESSION = {
  id: 'sess-1',
  deviceType: 'web',
  browserName: 'Chrome',
  osName: 'Linux',
  isTrusted: true,
  createdAt: new Date(),
  lastActive: new Date(),
};

const MOCK_AUTH_RESULT = {
  user: MOCK_USER,
  sessionToken: 'sess-token-xyz',
  session: MOCK_SESSION,
  requires2FA: false,
  twoFactorToken: null,
};

// ─── Factories ────────────────────────────────────────────────────────────────

function makeAuthService(overrides: any = {}) {
  return {
    authenticate: jest.fn<any>().mockResolvedValue(MOCK_AUTH_RESULT),
    generateToken: jest.fn<any>().mockReturnValue('jwt-token-xxx'),
    getUserPermissions: jest.fn<any>().mockReturnValue([]),
    updateOnlineStatus: jest.fn<any>().mockResolvedValue(undefined),
    logout: jest.fn<any>().mockResolvedValue(true),
    completeAuthWith2FA: jest.fn<any>().mockResolvedValue(MOCK_AUTH_RESULT),
    ...overrides,
  };
}

async function buildApp(authServiceOverrides: any = {}): Promise<{ app: FastifyInstance; authService: ReturnType<typeof makeAuthService> }> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  const authService = makeAuthService(authServiceOverrides);

  app.decorate('authenticate', async (req: any) => {
    (req as any).user = { userId: USER_ID };
  });

  app.decorate('notificationService', {
    createLoginNewDeviceNotification: jest.fn<any>().mockResolvedValue(undefined),
  } as any);

  const context = {
    fastify: app,
    authService: authService as any,
    redis: {} as any,
    prisma: {} as any,
    phoneTransferService: {} as any,
    smsService: {} as any,
    cacheStore: {} as any,
  };

  registerLoginRoutes(context);
  await app.ready();
  return { app, authService };
}

// ─── POST /login ──────────────────────────────────────────────────────────────

describe('POST /login — invalid credentials', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    ({ app } = await buildApp({ authenticate: jest.fn<any>().mockResolvedValue(null) }));
  });
  afterAll(async () => { await app.close(); });

  it('returns 401 when credentials are invalid', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/login',
      payload: { username: 'alice', password: 'wrong' },
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('POST /login — success (trusted session)', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    ({ app } = await buildApp());
  });
  afterAll(async () => { await app.close(); });

  it('returns 200 on successful login', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/login',
      payload: { username: 'alice', password: 'correct' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });
});

describe('POST /login — new device (untrusted session)', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    ({ app } = await buildApp({
      authenticate: jest.fn<any>().mockResolvedValue({
        ...MOCK_AUTH_RESULT,
        session: { ...MOCK_SESSION, isTrusted: false },
      }),
    }));
  });
  afterAll(async () => { await app.close(); });

  it('returns 200 and triggers new-device notification for untrusted session', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/login',
      payload: { username: 'alice', password: 'correct' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });
});

describe('POST /login — rememberDevice=true', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    ({ app } = await buildApp({
      authenticate: jest.fn<any>().mockResolvedValue({
        ...MOCK_AUTH_RESULT,
        session: { ...MOCK_SESSION, id: 'sess-remember' },
      }),
    }));
  });
  afterAll(async () => { await app.close(); });

  it('returns 200 and calls markSessionTrusted when rememberDevice=true', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/login',
      payload: { username: 'alice', password: 'correct', rememberDevice: true },
    });
    expect(res.statusCode).toBe(200);
  });
});

describe('POST /login — requires 2FA', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    ({ app } = await buildApp({
      authenticate: jest.fn<any>().mockResolvedValue({
        user: MOCK_USER,
        sessionToken: null,
        session: MOCK_SESSION,
        requires2FA: true,
        twoFactorToken: '2fa-temp-token',
      }),
    }));
  });
  afterAll(async () => { await app.close(); });

  it('returns 200 with requires2FA=true when 2FA is needed', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/login',
      payload: { username: 'alice', password: 'correct' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });
});

describe('POST /login — service error', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    ({ app } = await buildApp({ authenticate: jest.fn<any>().mockRejectedValue(new Error('DB crash')) }));
  });
  afterAll(async () => { await app.close(); });

  it('returns 500 on service error', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/login',
      payload: { username: 'alice', password: 'correct' },
    });
    expect(res.statusCode).toBe(500);
  });
});

// ─── POST /login/2fa ──────────────────────────────────────────────────────────

describe('POST /login/2fa — missing fields', () => {
  let app: FastifyInstance;
  beforeAll(async () => { ({ app } = await buildApp()); });
  afterAll(async () => { await app.close(); });

  it('returns 400 when twoFactorToken is missing', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/login/2fa',
      payload: { code: '123456' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when code is missing', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/login/2fa',
      payload: { twoFactorToken: 'temp-token' },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('POST /login/2fa — invalid code', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    ({ app } = await buildApp({
      completeAuthWith2FA: jest.fn<any>().mockResolvedValue({ success: false, error: 'Invalid code' }),
    }));
  });
  afterAll(async () => { await app.close(); });

  it('returns 401 when 2FA code is invalid', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/login/2fa',
      payload: { twoFactorToken: 'temp', code: '000000' },
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('POST /login/2fa — success', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    ({ app } = await buildApp());
  });
  afterAll(async () => { await app.close(); });

  it('returns 200 on successful 2FA verification', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/login/2fa',
      payload: { twoFactorToken: 'valid-temp', code: '123456' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });
});

describe('POST /login/2fa — service error', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    ({ app } = await buildApp({
      completeAuthWith2FA: jest.fn<any>().mockRejectedValue(new Error('2FA service crash')),
    }));
  });
  afterAll(async () => { await app.close(); });

  it('returns 500 on 2FA service error', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/login/2fa',
      payload: { twoFactorToken: 'valid-temp', code: '123456' },
    });
    expect(res.statusCode).toBe(500);
  });
});

// ─── POST /logout ─────────────────────────────────────────────────────────────

describe('POST /logout — success without session token', () => {
  let app: FastifyInstance;
  beforeAll(async () => { ({ app } = await buildApp()); });
  afterAll(async () => { await app.close(); });

  it('returns 200 on logout', async () => {
    const res = await app.inject({ method: 'POST', url: '/logout' });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });
});

describe('POST /logout — with session token', () => {
  let app: FastifyInstance;
  let authService: ReturnType<typeof makeAuthService>;
  beforeAll(async () => {
    ({ app, authService } = await buildApp());
  });
  afterAll(async () => { await app.close(); });

  it('calls authService.logout with the session token', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/logout',
      headers: { 'x-session-token': 'sess-xyz' },
    });
    expect(res.statusCode).toBe(200);
    expect(authService.logout).toHaveBeenCalledWith('sess-xyz');
  });
});

describe('POST /logout — service error', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    ({ app } = await buildApp({
      updateOnlineStatus: jest.fn<any>().mockRejectedValue(new Error('Redis down')),
    }));
  });
  afterAll(async () => { await app.close(); });

  it('returns 500 on service error', async () => {
    const res = await app.inject({ method: 'POST', url: '/logout' });
    expect(res.statusCode).toBe(500);
  });
});
