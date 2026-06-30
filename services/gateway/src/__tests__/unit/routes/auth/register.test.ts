/**
 * Unit tests for auth register routes (register.ts)
 * Tests POST /register, GET /check-availability.
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

jest.mock('../../../../utils/rate-limiter.js', () => ({
  createRegisterRateLimiter: jest.fn(() => ({ middleware: jest.fn(() => async () => {}) })),
  createAuthGlobalRateLimiter: jest.fn(() => ({ middleware: jest.fn(() => async () => {}) })),
}));

const mockGetRequestContext = jest.fn<any>().mockResolvedValue({
  ip: '127.0.0.1',
  userAgent: 'test-agent',
  deviceInfo: { type: 'desktop' },
  geoData: { country: 'FR' },
});
jest.mock('../../../../services/GeoIPService', () => ({
  getRequestContext: (...args: any[]) => mockGetRequestContext(...args),
}));

jest.mock('@meeshy/shared/utils/validation', () => ({
  AuthSchemas: { register: {} },
  validateSchema: jest.fn((_schema: any, data: any) => ({
    username: (data as any)?.username,
    password: (data as any)?.password,
    email: (data as any)?.email,
    firstName: (data as any)?.firstName || null,
    lastName: (data as any)?.lastName || null,
    systemLanguage: (data as any)?.systemLanguage || 'fr',
    regionalLanguage: (data as any)?.regionalLanguage || 'fr',
    phoneTransferToken: (data as any)?.phoneTransferToken,
  })),
}));

jest.mock('../../../../utils/normalize', () => ({
  normalizePhoneNumber: jest.fn((p: string) => p),
  normalizePhoneWithCountry: jest.fn((phone: string) => ({
    phoneNumber: `+33${phone.replace(/\D/g, '').slice(-9)}`,
    isValid: true,
  })),
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { registerRegistrationRoutes } from '../../../../routes/auth/register';

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
  systemLanguage: 'fr',
  regionalLanguage: 'fr',
  customDestinationLanguage: null,
  autoTranslateEnabled: true,
  isOnline: false,
  lastActiveAt: null,
  emailVerifiedAt: null,
  phoneVerifiedAt: null,
  twoFactorEnabledAt: null,
  pendingEmail: null,
  pendingPhoneNumber: null,
  lastPasswordChange: null,
  lastLoginIp: null,
  lastLoginLocation: null,
  lastLoginDevice: null,
  profileCompletionRate: 60,
  createdAt: new Date(),
  updatedAt: new Date(),
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeAuthService(overrides: Record<string, any> = {}) {
  return {
    register: jest.fn<any>().mockResolvedValue({ user: mockUser }),
    generateToken: jest.fn<any>().mockReturnValue('jwt-token'),
    getUserPermissions: jest.fn<any>().mockReturnValue([]),
    ...overrides,
  } as any;
}

function makePhoneTransferService(overrides: Record<string, any> = {}) {
  return {
    getTransferDataByToken: jest.fn<any>().mockResolvedValue({ valid: false }),
    executeRegistrationTransfer: jest.fn<any>().mockResolvedValue({ success: true }),
    ...overrides,
  } as any;
}

function makePrisma(overrides: Record<string, any> = {}) {
  return {
    user: {
      findFirst: jest.fn<any>().mockResolvedValue(null),
    },
    ...overrides,
  } as any;
}

async function buildApp(opts: {
  authService?: ReturnType<typeof makeAuthService>;
  phoneTransferService?: ReturnType<typeof makePhoneTransferService>;
  prisma?: ReturnType<typeof makePrisma>;
} = {}): Promise<{
  app: FastifyInstance;
  authService: ReturnType<typeof makeAuthService>;
  prisma: ReturnType<typeof makePrisma>;
}> {
  const {
    authService = makeAuthService(),
    phoneTransferService = makePhoneTransferService(),
    prisma = makePrisma(),
  } = opts;

  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', prisma);

  const context = {
    fastify: app,
    authService,
    phoneTransferService,
    redis: null,
    prisma,
    smsService: {} as any,
    cacheStore: {} as any,
  };

  registerRegistrationRoutes(context as any);
  await app.ready();
  return { app, authService, prisma };
}

// ─── POST /register ───────────────────────────────────────────────────────────

describe('POST /register — success', () => {
  it('returns 200 with user and token', async () => {
    const { app, authService } = await buildApp();
    const res = await app.inject({
      method: 'POST', url: '/register',
      payload: { username: 'alice', password: 'secret1234', email: 'alice@test.com', firstName: 'Alice', lastName: 'Smith' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.token).toBe('jwt-token');
    expect(authService.register).toHaveBeenCalled();
    await app.close();
  });
});

describe('POST /register — register returns null', () => {
  it('returns 400 when authService.register returns null', async () => {
    const authService = makeAuthService();
    authService.register = jest.fn<any>().mockResolvedValue(null);
    const { app } = await buildApp({ authService });
    const res = await app.inject({
      method: 'POST', url: '/register',
      payload: { username: 'alice', password: 'secret1234', email: 'alice@test.com', firstName: 'Alice', lastName: 'Smith' },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

describe('POST /register — register returns result with no user', () => {
  it('returns 400 when result has no user', async () => {
    const authService = makeAuthService();
    authService.register = jest.fn<any>().mockResolvedValue({ user: null });
    const { app } = await buildApp({ authService });
    const res = await app.inject({
      method: 'POST', url: '/register',
      payload: { username: 'alice', password: 'secret1234', email: 'alice@test.com', firstName: 'Alice', lastName: 'Smith' },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

describe('POST /register — phone ownership conflict', () => {
  it('returns 200 with phoneOwnershipConflict data', async () => {
    const authService = makeAuthService();
    authService.register = jest.fn<any>().mockResolvedValue({
      phoneOwnershipConflict: true,
      phoneOwnerInfo: {
        maskedDisplayName: 'A***',
        maskedUsername: 'al***',
        maskedEmail: 'al***@test.com',
        avatar: null,
        phoneNumber: '+33612345678',
        phoneCountryCode: 'FR',
      },
    });
    const { app } = await buildApp({ authService });
    const res = await app.inject({
      method: 'POST', url: '/register',
      payload: { username: 'alice', password: 'secret1234', email: 'alice@test.com', firstName: 'Alice', lastName: 'Smith' },
    });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});

describe('POST /register — duplicate field error', () => {
  it('returns 400 when username already taken', async () => {
    const authService = makeAuthService();
    authService.register = jest.fn<any>().mockRejectedValue(new Error('Username déjà utilisé'));
    const { app } = await buildApp({ authService });
    const res = await app.inject({
      method: 'POST', url: '/register',
      payload: { username: 'alice', password: 'secret1234', email: 'alice@test.com', firstName: 'Alice', lastName: 'Smith' },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

describe('POST /register — invalid email error', () => {
  it('returns 400 for invalid email format', async () => {
    const authService = makeAuthService();
    authService.register = jest.fn<any>().mockRejectedValue(new Error('Email invalide'));
    const { app } = await buildApp({ authService });
    const res = await app.inject({
      method: 'POST', url: '/register',
      payload: { username: 'alice', password: 'secret123', email: 'bad' },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

describe('POST /register — password error', () => {
  it('returns 400 for weak password', async () => {
    const authService = makeAuthService();
    authService.register = jest.fn<any>().mockRejectedValue(new Error('mot de passe trop court'));
    const { app } = await buildApp({ authService });
    const res = await app.inject({
      method: 'POST', url: '/register',
      payload: { username: 'alice', password: 'short', email: 'alice@test.com' },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

describe('POST /register — generic service error', () => {
  it('returns 500 for unknown error', async () => {
    const authService = makeAuthService();
    authService.register = jest.fn<any>().mockRejectedValue(new Error('DB connection lost'));
    const { app } = await buildApp({ authService });
    const res = await app.inject({
      method: 'POST', url: '/register',
      payload: { username: 'alice', password: 'secret1234', email: 'alice@test.com', firstName: 'Alice', lastName: 'Smith' },
    });
    expect(res.statusCode).toBe(500);
    await app.close();
  });
});

describe('POST /register — invalid phone transfer token', () => {
  it('returns 400 when phoneTransferToken is invalid', async () => {
    const phoneTransferService = makePhoneTransferService();
    phoneTransferService.getTransferDataByToken = jest.fn<any>().mockResolvedValue({ valid: false });
    const { app } = await buildApp({ phoneTransferService });
    const res = await app.inject({
      method: 'POST', url: '/register',
      payload: { username: 'alice', password: 'secret123', email: 'alice@test.com', phoneTransferToken: 'bad-token' },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

describe('POST /register — valid phone transfer token', () => {
  it('returns 200 and executes transfer', async () => {
    const phoneTransferService = makePhoneTransferService();
    phoneTransferService.getTransferDataByToken = jest.fn<any>().mockResolvedValue({ valid: true });
    phoneTransferService.executeRegistrationTransfer = jest.fn<any>().mockResolvedValue({ success: true });
    const { app } = await buildApp({ phoneTransferService });
    const res = await app.inject({
      method: 'POST', url: '/register',
      payload: { username: 'alice', password: 'secret1234', email: 'alice@test.com', firstName: 'Alice', lastName: 'Smith', phoneTransferToken: 'valid-token' },
    });
    expect(res.statusCode).toBe(200);
    expect(phoneTransferService.executeRegistrationTransfer).toHaveBeenCalled();
    await app.close();
  });
});

// ─── GET /check-availability ──────────────────────────────────────────────────

describe('GET /check-availability — missing params', () => {
  it('returns 400 when no params provided', async () => {
    const { app } = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/check-availability' });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

describe('GET /check-availability — username available', () => {
  it('returns 200 with usernameAvailable: true when username is free', async () => {
    const prisma = makePrisma();
    prisma.user.findFirst = jest.fn<any>().mockResolvedValue(null);
    const { app } = await buildApp({ prisma });
    const res = await app.inject({ method: 'GET', url: '/check-availability?username=newuser' });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.usernameAvailable).toBe(true);
    await app.close();
  });
});

describe('GET /check-availability — username taken', () => {
  it('returns 200 with usernameAvailable: false when username is taken', async () => {
    const prisma = makePrisma();
    prisma.user.findFirst = jest.fn<any>().mockResolvedValue({ id: 'other-user' });
    const { app } = await buildApp({ prisma });
    const res = await app.inject({ method: 'GET', url: '/check-availability?username=taken' });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.usernameAvailable).toBe(false);
    await app.close();
  });
});

describe('GET /check-availability — email available', () => {
  it('returns 200 with emailAvailable: true when email is free', async () => {
    const prisma = makePrisma();
    prisma.user.findFirst = jest.fn<any>().mockResolvedValue(null);
    const { app } = await buildApp({ prisma });
    const res = await app.inject({ method: 'GET', url: '/check-availability?email=new@test.com' });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.emailAvailable).toBe(true);
    await app.close();
  });
});

describe('GET /check-availability — phone available', () => {
  it('returns 200 with phoneNumberAvailable: true when phone is free', async () => {
    const prisma = makePrisma();
    prisma.user.findFirst = jest.fn<any>().mockResolvedValue(null);
    const { app } = await buildApp({ prisma });
    const res = await app.inject({ method: 'GET', url: '/check-availability?phoneNumber=0612345678' });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.phoneNumberAvailable).toBe(true);
    await app.close();
  });
});
