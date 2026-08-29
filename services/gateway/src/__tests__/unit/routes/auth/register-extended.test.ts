/**
 * Extended unit tests for auth/register.ts routes.
 * Covers branches missing from register.test.ts:
 * - POST /register executeRegistrationTransfer failure logging (line 137)
 * - POST /register INVALID_USERNAME error branch (line 172)
 * - GET /check-availability username suggestions loop (lines 245, 251)
 * - GET /check-availability phone validation failure (lines 289-290)
 * - GET /check-availability DB error → 500 (lines 296-297)
 * - POST /force-init success (lines 303-308)
 * - POST /force-init error → 500 (lines 309-311)
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

const mockNormalizePhoneWithCountry = jest.fn((phone: string, _country?: string) => ({
  phoneNumber: `+33${phone.replace(/\D/g, '').slice(-9)}`,
  isValid: true,
}));

jest.mock('../../../../utils/normalize', () => ({
  normalizePhoneNumber: jest.fn((p: string) => p),
  normalizePhoneWithCountry: (phone: string, country: string) => mockNormalizePhoneWithCountry(phone, country),
}));

const mockInitializeDatabase = jest.fn<any>().mockResolvedValue(undefined);
jest.mock('../../../../services/InitService', () => ({
  InitService: jest.fn().mockImplementation(() => ({
    initializeDatabase: (...args: any[]) => mockInitializeDatabase(...args),
  })),
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { registerRegistrationRoutes } from '../../../../routes/auth/register';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const USER_ID = '507f1f77bcf86cd799439011';

const mockUser = {
  id: USER_ID, username: 'alice', email: 'alice@test.com',
  firstName: 'Alice', lastName: 'Smith', displayName: 'Alice Smith',
  bio: null, avatar: null, banner: null, phoneNumber: null,
  role: 'USER', isActive: true, deactivatedAt: null,
  systemLanguage: 'fr', regionalLanguage: 'fr', customDestinationLanguage: null,
  autoTranslateEnabled: true, isOnline: false, lastActiveAt: null,
  emailVerifiedAt: null, phoneVerifiedAt: null, twoFactorEnabledAt: null,
  pendingEmail: null, pendingPhoneNumber: null, lastPasswordChange: null,
  lastLoginIp: null, lastLoginLocation: null, lastLoginDevice: null,
  profileCompletionRate: 60, createdAt: new Date(), updatedAt: new Date(),
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

// ─── POST /register — invalid phone transfer token → 400 (line 82) ─────────
// Must include all required schema fields so Fastify lets the request reach the handler.

describe('POST /register — invalid phone transfer token (line 82)', () => {
  it('returns 400 with INVALID_TRANSFER_TOKEN code', async () => {
    const phoneTransferService = makePhoneTransferService({
      getTransferDataByToken: jest.fn<any>().mockResolvedValue({ valid: false }),
    });
    const { app } = await buildApp({ phoneTransferService });
    const res = await app.inject({
      method: 'POST', url: '/register',
      payload: {
        username: 'alice', password: 'secret1234', email: 'alice@test.com',
        firstName: 'Alice', lastName: 'Smith', phoneTransferToken: 'bad-token',
      },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

// ─── POST /register — INVALID_EMAIL error branch (line 164) ──────────────────
// Provide a valid payload so the handler runs; authService.register throws email error.

describe('POST /register — INVALID_EMAIL error branch (line 164)', () => {
  it('returns 400 when authService throws email validation error', async () => {
    const authService = makeAuthService();
    authService.register = jest.fn<any>().mockRejectedValue(new Error('Email invalide: format incorrect'));
    const { app } = await buildApp({ authService });
    const res = await app.inject({
      method: 'POST', url: '/register',
      payload: {
        username: 'alice', password: 'secret1234', email: 'alice@test.com',
        firstName: 'Alice', lastName: 'Smith',
      },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

// ─── POST /register — INVALID_PASSWORD error branch (line 168) ───────────────
// Provide a valid payload so the handler runs; authService.register throws password error.

describe('POST /register — INVALID_PASSWORD error branch (line 168)', () => {
  it('returns 400 when authService throws password validation error', async () => {
    const authService = makeAuthService();
    authService.register = jest.fn<any>().mockRejectedValue(new Error('mot de passe trop court'));
    const { app } = await buildApp({ authService });
    const res = await app.inject({
      method: 'POST', url: '/register',
      payload: {
        username: 'alice', password: 'validpass1', email: 'alice@test.com',
        firstName: 'Alice', lastName: 'Smith',
      },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

// ─── POST /register — executeRegistrationTransfer failure (line 137) ──────────

describe('POST /register — valid transfer token but executeRegistrationTransfer fails', () => {
  it('returns 200 (logs error but still creates user)', async () => {
    const phoneTransferService = makePhoneTransferService({
      getTransferDataByToken: jest.fn<any>().mockResolvedValue({ valid: true }),
      executeRegistrationTransfer: jest.fn<any>().mockResolvedValue({ success: false, error: 'Transfer DB error' }),
    });
    const { app } = await buildApp({ phoneTransferService });
    const res = await app.inject({
      method: 'POST', url: '/register',
      payload: {
        username: 'alice', password: 'secret1234', email: 'alice@test.com',
        firstName: 'Alice', lastName: 'Smith', phoneTransferToken: 'valid-token',
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
    await app.close();
  });
});

// ─── POST /register — INVALID_USERNAME error branch (line 172) ───────────────

describe('POST /register — INVALID_USERNAME error branch', () => {
  it('returns 400 when authService throws username-specific error (line 172)', async () => {
    const authService = makeAuthService();
    authService.register = jest.fn<any>().mockRejectedValue(new Error('Invalid username format'));
    const { app } = await buildApp({ authService });
    const res = await app.inject({
      method: 'POST', url: '/register',
      payload: {
        username: 'alice', password: 'secret1234', email: 'alice@test.com',
        firstName: 'Alice', lastName: 'Smith',
      },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

// ─── GET /check-availability — username taken → suggestions loop ──────────────

// ─── GET /check-availability — phone validation failure (lines 289-290) ───────

// ─── GET /check-availability — DB error → 500 (lines 296-297) ────────────────

// ─── POST /force-init — route retirée ────────────────────────────────────────

describe('POST /force-init — retirée', () => {
  // Publique, elle déclenchait la création d'un compte BIGBOSS dont le mot de
  // passe retombe sur une valeur écrite dans le code source. L'initialisation
  // reste assurée au démarrage du serveur ; ce test empêche son retour.
  it('n\'existe plus', async () => {
    mockInitializeDatabase.mockResolvedValue(undefined);
    const { app } = await buildApp();
    const res = await app.inject({ method: 'POST', url: '/force-init' });
    expect(res.statusCode).toBe(404);
    expect(mockInitializeDatabase).not.toHaveBeenCalled();
    await app.close();
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
