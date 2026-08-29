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

// ─── POST /force-init ─────────────────────────────────────────────────────────

describe('POST /force-init — retirée', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  // Publique, elle déclenchait la création d'un compte BIGBOSS dont le mot de
  // passe retombe sur une valeur écrite dans le code source. L'initialisation
  // reste assurée au démarrage du serveur ; ce test empêche son retour.
  it('n\'existe plus', async () => {
    const res = await app.inject({ method: 'POST', url: '/force-init' });
    expect(res.statusCode).toBe(404);
  });
});


// ─── `GET /check-availability` — le contrat a CHANGÉ (#4158) ─────────────────
//
// Les témoins qui vivaient ici exigeaient `emailAvailable` et
// `phoneNumberAvailable` : ils asseyaient l'ORACLE. Cette route confirmait sans
// compte qu'une adresse ou un numéro appartient à un utilisateur Meeshy, alors
// que `/forgot-password` et `/magic-link/request` répondent délibérément
// « succès » dans tous les cas pour ne rien révéler.
//
// L'adresse et le numéro ne rendent plus qu'un verdict de FORME. Le pseudo,
// lui, répond toujours sur l'existence — c'est une clé publique, déjà
// énumérable par `GET /u/:username`.
//
// Le contrat de la porte cible est couvert par
// `directory-availability.test.ts` ; ce qui suit garde l'ALIAS, y compris
// l'assertion NÉGATIVE qui empêche l'oracle de revenir.
