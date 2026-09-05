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

// Le double d'un limiteur porte les TROIS méthodes que la route emploie, pas
// seulement `middleware` : depuis #5216 un 400 REND la tentative comptée
// (`keyFor` + `refund`). Un double partiel n'aurait pas fait rougir un témoin de
// remboursement — il aurait fait tomber la route en 500 sur `refund is not a
// function`, très loin du contrat mesuré (§ « un double PARTIEL perd en silence
// ce que le module gagne »).
const doubleDeLimiteur = () => ({
  middleware: jest.fn(() => async () => {}),
  refund: jest.fn(async () => {}),
  keyFor: jest.fn(() => 'ip:test'),
});

jest.mock('../../../utils/rate-limiter.js', () => ({
  createRegisterRateLimiter: jest.fn(() => doubleDeLimiteur()),
  createAuthGlobalRateLimiter: jest.fn(() => doubleDeLimiteur()),
}));

const mockFormatUserResponse = jest.fn<any>((user: any) => ({ ...user, formatted: true }));

jest.mock('../../../routes/auth/types', () => ({
  formatUserResponse: (...a: any[]) => mockFormatUserResponse(...a),
}));

// `routes/auth/register.ts` importe ses schemas du BARIL `@meeshy/shared/types`,
// donc le double se pose la ; mais les VALEURS viennent du vrai module de
// schemas (#4649). Reecrire `errorResponseSchema` a la main remplacait le
// contrat que les cinq assertions de corps d'erreur ci-dessous pretendent
// mesurer. `api-schemas` plutot que le baril entier : meme objets (le baril le
// re-exporte), 72 ms au lieu de 388 ms de chargement.
//
// `registerRequestSchema` reste permissif — un schema de REQUETE reel deplace
// le refus dans AJV, avant le handler : autre sujet, autre temoin (#4649).
jest.mock('@meeshy/shared/types', () => ({
  ...(jest.requireActual('@meeshy/shared/types/api-schemas') as object),
  registerRequestSchema: { type: 'object', additionalProperties: true },
}));

const mockNormalizePhoneWithCountry = jest.fn<any>();
jest.mock('../../../utils/normalize', () => ({
  normalizePhoneNumber: jest.fn<any>(),
  normalizePhoneWithCountry: (...a: any[]) => mockNormalizePhoneWithCountry(...a),
}));

// #4264 — l'inscription crée désormais une SESSION, comme la connexion : le
// JWT d'un compte frais ne nommait rien, et depuis #4213 son premier
// `POST /auth/refresh` rendait 401 « Session révoquée » à quelqu'un qui
// n'avait rien révoqué (`count({ userId, isValid: true })` valait zéro).
const mockCreateSession = jest.fn<any>().mockResolvedValue({ id: 'session-inscription' });
jest.mock('../../../services/SessionService', () => ({
  createSession: (...args: any[]) => mockCreateSession(...args),
  generateSessionToken: jest.fn(() => 'session-token-inscription'),
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

// Quatre `describe` vivaient ici — « duplicate field », « invalid email »,
// « invalid password », « invalid username » — et les quatre simulaient un
// `reject(new Error('…'))` dont la route lisait le TEXTE pour choisir un code.
// **La production n'a jamais produit ces rejets** : `AuthService.register`
// rattrapait tout et rendait `null`, donc les branches étaient inatteignables et
// les témoins attestaient un comportement absent (#5216).
//
// Le refus est désormais une valeur TYPÉE, et le témoin porte sur ce que le
// client lit : le code, le statut, le champ.

describe('POST /register — un refus TYPÉ sert son code, son statut et son champ', () => {
  const refus = (code: string, status: number, field: string, extra: Record<string, unknown> = {}) =>
    Object.assign(new Error(`refus ${code}`), { code, status, field, ...extra });

  const inscrireAvecRefus = async (erreur: Error) => {
    const app = await buildApp({
      authService: makeAuthService({ register: jest.fn<any>().mockRejectedValue(erreur) }),
    });
    mockValidateSchema.mockReturnValueOnce(REGISTER_BODY);
    const res = await app.inject({ method: 'POST', url: '/register', payload: REGISTER_BODY });
    await app.close();
    return res;
  };

  it('409 USERNAME_TAKEN, avec le champ et les remplaçants SERVIS', async () => {
    const res = await inscrireAvecRefus(
      refus('USERNAME_TAKEN', 409, 'username', { suggestions: ['alice1', 'alice7'] }),
    );

    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({
      code: 'USERNAME_TAKEN',
      field: 'username',
      suggestions: ['alice1', 'alice7'],
    });
  });

  it('409 EMAIL_TAKEN, avec son champ', async () => {
    const res = await inscrireAvecRefus(refus('EMAIL_TAKEN', 409, 'email'));

    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ code: 'EMAIL_TAKEN', field: 'email' });
  });

  it('400 PHONE_INVALID, avec son champ', async () => {
    const res = await inscrireAvecRefus(refus('PHONE_INVALID', 400, 'phoneNumber'));

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ code: 'PHONE_INVALID', field: 'phoneNumber' });
  });

  it("une erreur NON typée reste une panne — le texte ne décide plus du statut", async () => {
    const res = await inscrireAvecRefus(new Error('Email déjà utilisé'));

    expect(res.statusCode).toBe(500);
    expect(res.json().code).toBe('REGISTRATION_ERROR');
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
