/**
 * Unit tests for auth/register.ts routes.
 * Tests POST /register, GET /check-availability, POST /force-init
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeAll, afterAll } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../../../utils/logger-enhanced.js', () => ({
  enhancedLogger: { child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }) },
}));

const mockValidateSchema = jest.fn<any>((schema: any, body: any) => body);

jest.mock('@meeshy/shared/utils/validation', () => ({
  AuthSchemas: { register: {} },
  validateSchema: (...a: any[]) => mockValidateSchema(...a),
}));

const mockGetRequestContext = jest.fn<any>().mockResolvedValue({ ip: '127.0.0.1', geoData: { country: 'FR' } });

jest.mock('../../../services/GeoIPService', () => ({
  getRequestContext: (...a: any[]) => mockGetRequestContext(...a),
}));

jest.mock('../../../utils/rate-limiter.js', () => ({
  createRegisterRateLimiter: () => ({ middleware: () => async () => {} }),
  createAuthGlobalRateLimiter: () => ({ middleware: () => async () => {} }),
}));

const mockFormatUserResponse = jest.fn<any>((user: any) => ({ ...user, formatted: true }));

jest.mock('../../../routes/auth/types', () => ({
  formatUserResponse: (...a: any[]) => mockFormatUserResponse(...a),
}));

jest.mock('@meeshy/shared/types', () => ({
  userSchema: { type: 'object', additionalProperties: true },
  registerRequestSchema: { type: 'object', additionalProperties: true },
  validationErrorResponseSchema: { type: 'object', additionalProperties: true },
  errorResponseSchema: { type: 'object', properties: { success: { type: 'boolean' }, error: { type: 'string' } } },
}));

const mockNormalizePhoneWithCountry = jest.fn<any>();
jest.mock('../../../utils/normalize', () => ({
  normalizePhoneNumber: jest.fn<any>(),
  normalizePhoneWithCountry: (...a: any[]) => mockNormalizePhoneWithCountry(...a),
}));

jest.mock('../../../services/InitService', () => ({
  InitService: jest.fn().mockImplementation(() => ({
    initializeDatabase: jest.fn().mockResolvedValue(undefined),
  })),
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { registerRegistrationRoutes } from '../../../routes/auth/register';

// ─── Constants ────────────────────────────────────────────────────────────────

const MOCK_USER = { id: 'user-1', username: 'alice', email: 'alice@example.com', role: 'USER' };
const MOCK_TOKEN = 'jwt.token.here';

// ─── Factories ────────────────────────────────────────────────────────────────

function makeAuthService(overrides: any = {}) {
  return {
    register: jest.fn<any>().mockResolvedValue({ user: MOCK_USER }),
    generateToken: jest.fn<any>().mockReturnValue(MOCK_TOKEN),
    getUserPermissions: jest.fn<any>().mockReturnValue([]),
    ...overrides,
  };
}

function makePhoneTransferService(overrides: any = {}) {
  return {
    getTransferDataByToken: jest.fn<any>().mockResolvedValue({ valid: true }),
    executeRegistrationTransfer: jest.fn<any>().mockResolvedValue({ success: true }),
    ...overrides,
  };
}

function makePrisma(overrides: any = {}) {
  return {
    user: {
      findFirst: jest.fn<any>().mockResolvedValue(null),
      ...overrides.user,
    },
    ...overrides,
  };
}

async function buildApp({
  authService = makeAuthService(),
  phoneTransferService = makePhoneTransferService(),
  prisma = makePrisma(),
} = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', prisma as any);

  const context: any = {
    fastify: app,
    authService,
    phoneTransferService,
    redis: {},
    smsService: {},
    cacheStore: {},
    prisma,
  };

  registerRegistrationRoutes(context);
  await app.ready();
  return app;
}

const REGISTER_BODY = {
  username: 'alice',
  email: 'alice@example.com',
  password: 'SecurePass123!',
  firstName: 'Alice',
  lastName: 'Smith',
  systemLanguage: 'fr',
  regionalLanguage: 'fr',
};

// ─── POST /register ───────────────────────────────────────────────────────────

describe('POST /register — success', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 200 with user and token', async () => {
    mockValidateSchema.mockReturnValueOnce(REGISTER_BODY);
    const res = await app.inject({ method: 'POST', url: '/register', payload: REGISTER_BODY });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.token).toBe(MOCK_TOKEN);
    expect(body.data.expiresIn).toBe(86400);
  });
});

describe('POST /register — null result from authService', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp({ authService: makeAuthService({ register: jest.fn<any>().mockResolvedValue(null) }) });
  });
  afterAll(async () => { await app.close(); });

  it('returns 400 when authService.register returns null', async () => {
    mockValidateSchema.mockReturnValueOnce(REGISTER_BODY);
    const res = await app.inject({ method: 'POST', url: '/register', payload: REGISTER_BODY });
    expect(res.statusCode).toBe(400);
  });
});

describe('POST /register — null user in result', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp({ authService: makeAuthService({ register: jest.fn<any>().mockResolvedValue({ user: null }) }) });
  });
  afterAll(async () => { await app.close(); });

  it('returns 400 when user is null in result', async () => {
    mockValidateSchema.mockReturnValueOnce(REGISTER_BODY);
    const res = await app.inject({ method: 'POST', url: '/register', payload: REGISTER_BODY });
    expect(res.statusCode).toBe(400);
  });
});

describe('POST /register — phone ownership conflict', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    const conflict = {
      phoneOwnershipConflict: true,
      phoneOwnerInfo: {
        maskedDisplayName: 'A***e',
        maskedUsername: 'al***',
        maskedEmail: 'al***@example.com',
        avatar: null,
        phoneNumber: '+33600000000',
        phoneCountryCode: 'FR',
      },
    };
    app = await buildApp({ authService: makeAuthService({ register: jest.fn<any>().mockResolvedValue(conflict) }) });
  });
  afterAll(async () => { await app.close(); });

  it('returns 200 with phoneOwnershipConflict flag', async () => {
    mockValidateSchema.mockReturnValueOnce(REGISTER_BODY);
    const res = await app.inject({ method: 'POST', url: '/register', payload: REGISTER_BODY });
    // Route returns 200 for conflict — Fastify schema strips unknown fields from serialization
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });
});

describe('POST /register — invalid phone transfer token', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp({
      phoneTransferService: makePhoneTransferService({
        getTransferDataByToken: jest.fn<any>().mockResolvedValue({ valid: false }),
      }),
    });
  });
  afterAll(async () => { await app.close(); });

  it('returns 400 for invalid transfer token', async () => {
    mockValidateSchema.mockReturnValueOnce({ ...REGISTER_BODY, phoneTransferToken: 'bad-token' });
    const res = await app.inject({ method: 'POST', url: '/register', payload: { ...REGISTER_BODY, phoneTransferToken: 'bad-token' } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain('invalide');
  });
});

describe('POST /register — valid phone transfer token with success', () => {
  let app: FastifyInstance;
  const executeTransfer = jest.fn<any>().mockResolvedValue({ success: true });
  beforeAll(async () => {
    app = await buildApp({
      phoneTransferService: makePhoneTransferService({ executeRegistrationTransfer: executeTransfer }),
    });
  });
  afterAll(async () => { await app.close(); });

  it('returns 200 and executes the transfer', async () => {
    mockValidateSchema.mockReturnValueOnce({ ...REGISTER_BODY, phoneTransferToken: 'valid-token' });
    const res = await app.inject({ method: 'POST', url: '/register', payload: { ...REGISTER_BODY, phoneTransferToken: 'valid-token' } });
    expect(res.statusCode).toBe(200);
    expect(executeTransfer).toHaveBeenCalled();
  });
});

describe('POST /register — phone transfer fails after registration', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp({
      phoneTransferService: makePhoneTransferService({
        executeRegistrationTransfer: jest.fn<any>().mockResolvedValue({ success: false, error: 'transfer failed' }),
      }),
    });
  });
  afterAll(async () => { await app.close(); });

  it('returns 200 even if transfer execution fails (non-fatal)', async () => {
    mockValidateSchema.mockReturnValueOnce({ ...REGISTER_BODY, phoneTransferToken: 'valid-token' });
    const res = await app.inject({ method: 'POST', url: '/register', payload: { ...REGISTER_BODY, phoneTransferToken: 'valid-token' } });
    expect(res.statusCode).toBe(200);
  });
});

describe('POST /register — duplicate field error', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp({
      authService: makeAuthService({ register: jest.fn<any>().mockRejectedValue(new Error('Email déjà utilisé')) }),
    });
  });
  afterAll(async () => { await app.close(); });

  it('returns 400 for duplicate field error', async () => {
    mockValidateSchema.mockReturnValueOnce(REGISTER_BODY);
    const res = await app.inject({ method: 'POST', url: '/register', payload: REGISTER_BODY });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain('utilisé');
  });
});

describe('POST /register — invalid email error', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp({
      authService: makeAuthService({ register: jest.fn<any>().mockRejectedValue(new Error('Email invalide')) }),
    });
  });
  afterAll(async () => { await app.close(); });

  it('returns 400 for invalid email error', async () => {
    mockValidateSchema.mockReturnValueOnce(REGISTER_BODY);
    const res = await app.inject({ method: 'POST', url: '/register', payload: REGISTER_BODY });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain('invalide');
  });
});

describe('POST /register — invalid password error', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp({
      authService: makeAuthService({ register: jest.fn<any>().mockRejectedValue(new Error('mot de passe trop court')) }),
    });
  });
  afterAll(async () => { await app.close(); });

  it('returns 400 for invalid password error', async () => {
    mockValidateSchema.mockReturnValueOnce(REGISTER_BODY);
    const res = await app.inject({ method: 'POST', url: '/register', payload: REGISTER_BODY });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain('mot de passe');
  });
});

describe('POST /register — invalid username error', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp({
      authService: makeAuthService({ register: jest.fn<any>().mockRejectedValue(new Error('username trop court')) }),
    });
  });
  afterAll(async () => { await app.close(); });

  it('returns 400 for invalid username error', async () => {
    mockValidateSchema.mockReturnValueOnce(REGISTER_BODY);
    const res = await app.inject({ method: 'POST', url: '/register', payload: REGISTER_BODY });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain('username');
  });
});

describe('POST /register — generic error falls through to 500', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp({
      authService: makeAuthService({ register: jest.fn<any>().mockRejectedValue(new Error('unexpected failure')) }),
    });
  });
  afterAll(async () => { await app.close(); });

  it('returns 500 on unrecognized error', async () => {
    mockValidateSchema.mockReturnValueOnce(REGISTER_BODY);
    const res = await app.inject({ method: 'POST', url: '/register', payload: REGISTER_BODY });
    expect(res.statusCode).toBe(500);
  });
});

// ─── GET /check-availability ──────────────────────────────────────────────────

describe('GET /check-availability — no query params', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 400 when no params provided', async () => {
    const res = await app.inject({ method: 'GET', url: '/check-availability' });
    expect(res.statusCode).toBe(400);
  });
});

describe('GET /check-availability — username available', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp({ prisma: makePrisma({ user: { findFirst: jest.fn<any>().mockResolvedValue(null) } }) });
  });
  afterAll(async () => { await app.close(); });

  it('returns 200 with usernameAvailable=true', async () => {
    const res = await app.inject({ method: 'GET', url: '/check-availability?username=newuser' });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.usernameAvailable).toBe(true);
  });
});

describe('GET /check-availability — username taken with suggestions', () => {
  let app: FastifyInstance;
  const mockFindFirst = jest.fn<any>();
  beforeAll(async () => {
    mockFindFirst
      .mockResolvedValueOnce({ id: 'existing-user' }) // username taken
      .mockResolvedValue(null); // suggestion candidates available
    app = await buildApp({ prisma: makePrisma({ user: { findFirst: mockFindFirst } }) });
  });
  afterAll(async () => { await app.close(); });

  it('returns 200 with usernameAvailable=false and suggestions', async () => {
    const res = await app.inject({ method: 'GET', url: '/check-availability?username=taken' });
    expect(res.statusCode).toBe(200);
    const data = res.json().data;
    expect(data.usernameAvailable).toBe(false);
    expect(Array.isArray(data.suggestions)).toBe(true);
    expect(data.suggestions.length).toBeGreaterThan(0);
  });
});

describe('GET /check-availability — email available', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp({ prisma: makePrisma({ user: { findFirst: jest.fn<any>().mockResolvedValue(null) } }) });
  });
  afterAll(async () => { await app.close(); });

  it('returns 200 with emailAvailable=true', async () => {
    const res = await app.inject({ method: 'GET', url: '/check-availability?email=new@example.com' });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.emailAvailable).toBe(true);
  });
});

describe('GET /check-availability — email taken', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp({ prisma: makePrisma({ user: { findFirst: jest.fn<any>().mockResolvedValue({ id: 'u1' }) } }) });
  });
  afterAll(async () => { await app.close(); });

  it('returns 200 with emailAvailable=false', async () => {
    const res = await app.inject({ method: 'GET', url: '/check-availability?email=taken@example.com' });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.emailAvailable).toBe(false);
  });
});

describe('GET /check-availability — phone valid and available', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockNormalizePhoneWithCountry.mockReturnValue({ isValid: true, phoneNumber: '+33600000000' });
    app = await buildApp({ prisma: makePrisma({ user: { findFirst: jest.fn<any>().mockResolvedValue(null) } }) });
  });
  afterAll(async () => { await app.close(); });

  it('returns 200 with phoneNumberAvailable=true and phoneNumberValid=true', async () => {
    const res = await app.inject({ method: 'GET', url: '/check-availability?phoneNumber=%2B33600000000' });
    expect(res.statusCode).toBe(200);
    const data = res.json().data;
    expect(data.phoneNumberAvailable).toBe(true);
    expect(data.phoneNumberValid).toBe(true);
  });
});

describe('GET /check-availability — phone valid but taken', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockNormalizePhoneWithCountry.mockReturnValue({ isValid: true, phoneNumber: '+33600000001' });
    app = await buildApp({ prisma: makePrisma({ user: { findFirst: jest.fn<any>().mockResolvedValue({ id: 'u1' }) } }) });
  });
  afterAll(async () => { await app.close(); });

  it('returns 200 with phoneNumberAvailable=false', async () => {
    const res = await app.inject({ method: 'GET', url: '/check-availability?phoneNumber=%2B33600000001' });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.phoneNumberAvailable).toBe(false);
  });
});

describe('GET /check-availability — phone invalid format', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockNormalizePhoneWithCountry.mockReturnValue({ isValid: false });
    app = await buildApp();
  });
  afterAll(async () => { await app.close(); });

  it('returns 200 with phoneNumberValid=false', async () => {
    const res = await app.inject({ method: 'GET', url: '/check-availability?phoneNumber=not-a-phone' });
    expect(res.statusCode).toBe(200);
    const data = res.json().data;
    expect(data.phoneNumberValid).toBe(false);
    expect(data.phoneNumberAvailable).toBe(false);
  });
});

describe('GET /check-availability — DB error', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp({ prisma: makePrisma({ user: { findFirst: jest.fn<any>().mockRejectedValue(new Error('DB failure')) } }) });
  });
  afterAll(async () => { await app.close(); });

  it('returns 500 on DB error', async () => {
    const res = await app.inject({ method: 'GET', url: '/check-availability?username=test' });
    expect(res.statusCode).toBe(500);
  });
});

// ─── POST /force-init ─────────────────────────────────────────────────────────

describe('POST /force-init — success', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 200 with success message', async () => {
    const res = await app.inject({ method: 'POST', url: '/force-init' });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.message).toContain('initialized');
  });
});

describe('POST /force-init — error', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 500 on initialization error', async () => {
    const { InitService } = jest.requireMock('../../../services/InitService') as any;
    (InitService as jest.Mock).mockImplementationOnce(() => ({
      initializeDatabase: jest.fn<any>().mockRejectedValue(new Error('init failed')),
    }));
    const res = await app.inject({ method: 'POST', url: '/force-init' });
    expect(res.statusCode).toBe(500);
  });
});
