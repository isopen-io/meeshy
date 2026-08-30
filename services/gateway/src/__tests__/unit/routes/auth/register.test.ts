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
import { validateSchema } from '@meeshy/shared/utils/validation';
import { MeeshyError } from '@meeshy/shared/utils/errors';
import { ErrorCode } from '@meeshy/shared/types/errors';

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

describe('POST /register — le compte frais naît AVEC une session (#4264)', () => {
  // CHANGEMENT DE COMPORTEMENT ASSUMÉ. `AuthService.register` n'appelait
  // JAMAIS `createSession` : un compte tout neuf repartait avec un JWT
  // rattaché à RIEN. Depuis #4213 ce n'était plus seulement incohérent,
  // c'était CASSÉ — sa garde refuse `POST /refresh` quand le compte n'a
  // aucune session valide, ce qui est exactement l'état d'un compte qui vient
  // d'être créé. Le premier renouvellement, 24 h plus tard, rendait 401
  // « Session révoquée » à quelqu'un qui n'avait rien révoqué.
  //
  // Nommer la session dans le jeton IMPOSAIT d'en créer une ; on y gagne que
  // le premier appareil devient révocable comme tous les autres.

  it('crée une session avec le contexte de la requête', async () => {
    const { app } = await buildApp();
    await app.inject({
      method: 'POST', url: '/register',
      payload: { username: 'alice', password: 'secret1234', email: 'alice@test.com', firstName: 'Alice', lastName: 'Smith' },
    });

    expect(mockCreateSession).toHaveBeenCalledWith({
      userId: expect.any(String),
      token: 'session-token-inscription',
      requestContext: expect.objectContaining({ ip: '127.0.0.1' }),
    });
    await app.close();
  });

  it('rattache le jeton à cette session — le cinquième site d\'émission n\'est pas oublié', async () => {
    const { app, authService } = await buildApp();
    await app.inject({
      method: 'POST', url: '/register',
      payload: { username: 'alice', password: 'secret1234', email: 'alice@test.com', firstName: 'Alice', lastName: 'Smith' },
    });

    expect(authService.generateToken).toHaveBeenCalledWith(expect.anything(), 'session-inscription');
    await app.close();
  });

  it('SERT le jeton de session au client — un champ non déclaré au schéma part vide', async () => {
    // Le piège maison : la branche du conflit de numéro a déjà payé une
    // omission de schéma, `data` partant vide et le client retombant sur un
    // « Registration failed » générique. Un `sessionToken` non déclaré serait
    // retiré à la sérialisation et le client ne pourrait jamais glisser sa
    // fenêtre de session.
    const { app } = await buildApp();
    const res = await app.inject({
      method: 'POST', url: '/register',
      payload: { username: 'alice', password: 'secret1234', email: 'alice@test.com', firstName: 'Alice', lastName: 'Smith' },
    });

    expect(res.json().data.sessionToken).toBe('session-token-inscription');
    await app.close();
  });
});

describe('POST /register — Zod validation failure', () => {
  // La validation Zod (AuthSchemas.register) tombait dans le catch générique :
  // 500 « Erreur lors de la création du compte » sans jamais dire quel champ
  // échoue — ni au client iOS, ni dans les logs. Elle doit produire un 400
  // VALIDATION_ERROR portant les violations par champ.
  it('returns 400 with per-field violations when the payload is rejected', async () => {
    (validateSchema as jest.Mock).mockImplementationOnce(() => {
      throw new MeeshyError(ErrorCode.VALIDATION_ERROR, 'Données invalides', {
        errors: [{ path: 'systemLanguage', message: 'Unsupported language code' }],
        context: 'register',
      });
    });

    const { app } = await buildApp();
    const res = await app.inject({
      method: 'POST', url: '/register',
      payload: { username: 'alice', password: 'secret1234', email: 'alice@test.com', firstName: 'Alice', lastName: 'Smith' },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.success).toBe(false);
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(body.violations).toEqual([{ path: 'systemLanguage', message: 'Unsupported language code' }]);
    expect(body.error).toContain('systemLanguage');
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
  /**
   * Ce témoin s'intitulait « returns 200 with phoneOwnershipConflict data » et
   * n'assertait que le code de statut — or la charge utile en question ne
   * sortait PAS. Le schéma 200 ne déclarait que `{user, token, expiresIn}` :
   * les trois clés du conflit étaient retirées à la sérialisation, `data`
   * partait VIDE, et `use-registration-submit.ts` — qui branche sur
   * `data.data.phoneOwnershipConflict` — retombait sur « Registration failed ».
   * La bascule vers `PhoneExistsModal` (et donc tout le transfert de numéro)
   * était morte.
   */
  const conflictResult = {
    phoneOwnershipConflict: true,
    phoneOwnerInfo: {
      maskedDisplayName: 'A***',
      maskedUsername: 'al***',
      maskedEmail: 'al***@test.com',
      avatar: null,
      phoneNumber: '+33612345678',
      phoneCountryCode: 'FR',
    },
  };

  const inject = async (app: FastifyInstance) => app.inject({
    method: 'POST', url: '/register',
    payload: { username: 'alice', password: 'secret1234', email: 'alice@test.com', firstName: 'Alice', lastName: 'Smith' },
  });

  it('sert le drapeau et le propriétaire masqué — sans eux le client ne peut pas ouvrir la modale', async () => {
    const authService = makeAuthService();
    authService.register = jest.fn<any>().mockResolvedValue(conflictResult);
    const { app } = await buildApp({ authService });

    const res = await inject(app);

    expect(res.statusCode).toBe(200);
    const { data } = res.json();
    expect(data.phoneOwnershipConflict).toBe(true);
    expect(data.phoneOwnerInfo.maskedDisplayName).toBe('A***');
    expect(data.phoneOwnerInfo.phoneNumber).toBe('+33612345678');
    expect(data.pendingRegistration.username).toBe('alice');
    await app.close();
  });

  /**
   * Le mot de passe EN CLAIR figurait dans la charge utile du handler. Il ne
   * sortait pas — le schéma le retirait avec tout le reste. Le déclarer sans y
   * penser aurait donc OUVERT un aller-retour du secret. Le client ne s'en sert
   * pas : les deux reprises (`handleContinueWithoutPhone`,
   * `handlePhoneTransferred`) réémettent depuis `...formData`, son propre état.
   */
  it('ne renvoie JAMAIS le mot de passe en clair', async () => {
    const authService = makeAuthService();
    authService.register = jest.fn<any>().mockResolvedValue(conflictResult);
    const { app } = await buildApp({ authService });

    const res = await inject(app);

    expect(res.json().data.pendingRegistration.password).toBeUndefined();
    expect(res.payload).not.toContain('secret1234');
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
