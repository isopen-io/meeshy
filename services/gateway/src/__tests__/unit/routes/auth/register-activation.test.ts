/**
 * `POST /register` — sans numéro, le compte attend la preuve de l'adresse ;
 * avec un numéro, il est actif tout de suite (#8055).
 *
 * Règle porteur 2026-09-26. Sans numéro : même réponse que la connexion d'une
 * adresse inconnue (#8033) — `{ status: "verification-required",
 * accountCreated: true, email }`, AUCUNE session, AUCUN jeton ; le code et le
 * lien sont partis avec l'e-mail de vérification de l'inscription, et c'est
 * `POST /auth/verify-email` qui ouvrira la session. Le mot de passe choisi est
 * enregistré (la personne l'a tapé sur SA page d'inscription).
 *
 * Ces témoins passent par `app.inject` sur la VRAIE déclaration de réponse de
 * la route : un champ non déclaré au schéma 200 serait retiré à la
 * sérialisation, et le client ne verrait qu'un `data` vide.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn(() => ({
      info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn(),
    })),
  },
}));

// Le double d'un limiteur porte les TROIS méthodes que la route emploie, pas
// seulement `middleware` : depuis #5216 un 400 REND la tentative comptée
// (`keyFor` + `refund`). Un double partiel n'aurait pas fait rougir un témoin de
// remboursement — il aurait fait tomber la route en 500 sur `refund is not a
// function`, très loin du contrat mesuré (§ « un double PARTIEL perd en silence
// ce que le module gagne »).
const doubleDeLimiteur = () => ({
  middleware: jest.fn(() => async () => {}),
  refund: jest.fn(async (_key: string) => {}),
  keyFor: jest.fn(() => 'ip:test'),
});

/** Les DEUX limiteurs de la route, retenus pour que les témoins de remboursement les lisent. */
const limiteursMontes: Array<ReturnType<typeof doubleDeLimiteur>> = [];

jest.mock('../../../../utils/rate-limiter.js', () => ({
  createRegisterRateLimiter: jest.fn(() => {
    const l = doubleDeLimiteur();
    limiteursMontes.push(l);
    return l;
  }),
  createAuthGlobalRateLimiter: jest.fn(() => {
    const l = doubleDeLimiteur();
    limiteursMontes.push(l);
    return l;
  }),
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

// #4264 — l'inscription crée désormais une SESSION, comme la connexion : sans
// elle, le JWT d'un compte frais ne nommait rien, et depuis #4213 son premier
// `POST /auth/refresh` rendait 401 « Session révoquée » à quelqu'un qui n'avait
// rien révoqué (`count({ userId, isValid: true })` valait zéro).
const mockCreateSession = jest.fn<any>().mockResolvedValue({ id: 'session-inscription' });
jest.mock('../../../../services/SessionService', () => ({
  createSession: (...args: any[]) => mockCreateSession(...args),
  generateSessionToken: jest.fn(() => 'session-token-inscription'),
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


const INSCRIPTION = { username: 'alice', password: 'Xk9$mQ2vLp8#nR4wZ', email: 'alice@test.com', firstName: 'Alice', lastName: 'Smith' };

const inscrire = (app: FastifyInstance, payload: Record<string, unknown> = INSCRIPTION) =>
  app.inject({ method: 'POST', url: '/register', payload });

beforeEach(() => {
  mockCreateSession.mockClear();
});

describe('inscription SANS numéro — le compte attend son code', () => {
  it('rend « vérification requise », accountCreated true, et l’adresse — les trois champs survivent à la sérialisation', async () => {
    const { app } = await buildApp();
    const res = await inscrire(app);

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      success: true,
      data: { status: 'verification-required', accountCreated: true, email: 'alice@test.com' },
    });
    await app.close();
  });

  it("n'ouvre AUCUNE session et n'émet aucun jeton", async () => {
    const { app, authService } = await buildApp();
    await inscrire(app);

    expect(mockCreateSession).not.toHaveBeenCalled();
    expect(authService.generateToken).not.toHaveBeenCalled();
    await app.close();
  });

  it("enregistre le mot de passe choisi : il part à la création du compte", async () => {
    const { app, authService } = await buildApp();
    await inscrire(app);

    expect(authService.register).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'alice@test.com', password: 'Xk9$mQ2vLp8#nR4wZ' }),
      expect.anything(),
      expect.anything(),
    );
    await app.close();
  });
});

describe('inscription AVEC numéro — actif tout de suite', () => {
  it('ouvre la session et sert le jeton, comme avant', async () => {
    const authService = makeAuthService({
      register: jest.fn<any>().mockResolvedValue({ user: { ...mockUser, phoneNumber: '+33612345678' } }),
    });
    const { app } = await buildApp({ authService });
    const res = await inscrire(app, { ...INSCRIPTION, phoneNumber: '0612345678', phoneCountryCode: 'FR' });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.token).toBe('jwt-token');
    expect(res.json().data.sessionToken).toBe('session-token-inscription');
    expect(res.json().data.status).toBeUndefined();
    expect(mockCreateSession).toHaveBeenCalledTimes(1);
    await app.close();
  });

  it('un numéro TRANSFÉRÉ (jeton de transfert valide) vaut numéro : session ouverte', async () => {
    const phoneTransferService = makePhoneTransferService({
      getTransferDataByToken: jest.fn<any>().mockResolvedValue({ valid: true }),
    });
    const { app } = await buildApp({ phoneTransferService });
    const res = await inscrire(app, { ...INSCRIPTION, phoneTransferToken: 'valid-token' });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.token).toBe('jwt-token');
    expect(mockCreateSession).toHaveBeenCalledTimes(1);
    await app.close();
  });
});
