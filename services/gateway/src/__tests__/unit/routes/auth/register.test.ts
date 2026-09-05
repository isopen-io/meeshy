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

/**
 * Les REFUS de formulaire — #5216.
 *
 * Ces témoins remplacent trois `describe` qui simulaient un `reject(new
 * Error('Username déjà utilisé'))` et attendaient un 400. **La production ne
 * produisait pas ce rejet** : `AuthService.register` rattrapait tout et rendait
 * `null`, si bien que les branches de la route qui lisaient ce TEXTE étaient
 * inatteignables. Trois témoins verts attestaient un comportement absent.
 *
 * Ce qui se mesure désormais est le contrat réel : un code, un statut, un champ
 * à surligner — et, pour un pseudo, des remplaçants libres.
 */
describe('POST /register — refus typés (#5216)', () => {
  const refus = (code: string, status: number, field: string, extra: Record<string, unknown> = {}) =>
    Object.assign(new Error(`refus ${code}`), { code, status, field, ...extra });

  const inscrire = async (app: FastifyInstance) => app.inject({
    method: 'POST', url: '/register',
    payload: { username: 'alice', password: 'secret1234', email: 'alice@test.com', firstName: 'Alice', lastName: 'Smith' },
  });

  it('un pseudo pris rend 409, NOMME son champ et propose des remplaçants', async () => {
    const authService = makeAuthService();
    authService.register = jest.fn<any>().mockRejectedValue(
      refus('USERNAME_TAKEN', 409, 'username', { suggestions: ['alice1', 'alice7', 'thealice'] }),
    );
    const { app } = await buildApp({ authService });

    const res = await inscrire(app);

    expect(res.statusCode).toBe(409);
    const body = res.json();
    expect(body.code).toBe('USERNAME_TAKEN');
    // `field` et `suggestions` sont étalés à la RACINE par `sendError`, et
    // fast-json-stringify les retire de la réponse s'ils ne sont pas DÉCLARÉS
    // au schéma 409. C'est cette moitié-là que le témoin garde.
    expect(body.field).toBe('username');
    expect(body.suggestions).toEqual(['alice1', 'alice7', 'thealice']);
    await app.close();
  });

  it('une adresse prise rend 409 sans suggestion — on ne propose pas d’e-mail de rechange', async () => {
    const authService = makeAuthService();
    authService.register = jest.fn<any>().mockRejectedValue(refus('EMAIL_TAKEN', 409, 'email'));
    const { app } = await buildApp({ authService });

    const res = await inscrire(app);

    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ code: 'EMAIL_TAKEN', field: 'email' });
    expect(res.json().suggestions).toBeUndefined();
    await app.close();
  });

  it('un numéro illisible rend 400 et NOMME son champ', async () => {
    const authService = makeAuthService();
    authService.register = jest.fn<any>().mockRejectedValue(refus('PHONE_INVALID', 400, 'phoneNumber'));
    const { app } = await buildApp({ authService });

    const res = await inscrire(app);

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ code: 'PHONE_INVALID', field: 'phoneNumber' });
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


/**
 * Le REMBOURSEMENT de tentative (#5216).
 *
 * `POST /register` tolère trois tentatives par cinq minutes, et le `preHandler`
 * compte AVANT de savoir ce qu'il compte : une faute de frappe consommait le
 * même quota qu'une création de compte, et trois corrections fermaient la porte
 * cinq minutes à quelqu'un qui n'avait rien créé.
 *
 * La règle — et les deux moitiés comptent autant :
 *
 * - un **400** rend la tentative : la saisie est à corriger, rien n'a été
 *   touché, rien n'a été appris sur autrui ;
 * - un **409** la GARDE : il apprend qu'un pseudo ou une adresse EXISTE, et un
 *   oracle remboursable est un oracle gratuit, donc énumérable à volonté.
 */
describe('POST /register — un 400 rend la tentative, un 409 la garde', () => {
  const refus = (code: string, status: number, field: string) =>
    Object.assign(new Error(`refus ${code}`), { code, status, field });

  const remboursements = () =>
    limiteursMontes.reduce((total, l) => total + l.refund.mock.calls.length, 0);

  const inscrireEtCompter = async (register: jest.Mock) => {
    limiteursMontes.length = 0;
    const authService = makeAuthService();
    authService.register = register;
    const { app } = await buildApp({ authService });

    await app.inject({
      method: 'POST', url: '/register',
      payload: { username: 'alice', password: 'secret1234', email: 'alice@test.com', firstName: 'Alice', lastName: 'Smith' },
    });

    const total = remboursements();
    await app.close();
    return total;
  };

  it('un 400 PHONE_INVALID rembourse les DEUX limiteurs de la route', async () => {
    const total = await inscrireEtCompter(
      jest.fn<any>().mockRejectedValue(refus('PHONE_INVALID', 400, 'phoneNumber')),
    );

    expect(total).toBe(2);
  });

  it('un 409 USERNAME_TAKEN ne rembourse RIEN — l’oracle se paie', async () => {
    const total = await inscrireEtCompter(
      jest.fn<any>().mockRejectedValue(refus('USERNAME_TAKEN', 409, 'username')),
    );

    expect(total).toBe(0);
  });

  it('un 200 ne rembourse RIEN — une inscription réussie compte', async () => {
    const total = await inscrireEtCompter(jest.fn<any>().mockResolvedValue({ user: mockUser }));

    expect(total).toBe(0);
  });

  it('un 500 ne rembourse RIEN — on ne récompense pas ce qui a fait tomber le service', async () => {
    const total = await inscrireEtCompter(jest.fn<any>().mockRejectedValue(new Error('mongo down')));

    expect(total).toBe(0);
  });

  it('un refus de VALIDATION rembourse — c’est une saisie à corriger', async () => {
    limiteursMontes.length = 0;
    (validateSchema as jest.Mock).mockImplementationOnce(() => {
      throw new MeeshyError(ErrorCode.VALIDATION_ERROR, 'Données invalides', {
        errors: [{ path: 'displayName', message: 'Nom affiché requis (ou prénom ET nom)' }],
        context: 'register',
      });
    });
    const { app } = await buildApp();

    // La charge passe Ajv (le schéma de requête est RÉEL ici) : le 400 mesuré
    // vient donc bien de la couche Zod du handler, pas du compilateur en amont.
    const res = await app.inject({
      method: 'POST', url: '/register',
      payload: { displayName: 'Alice Smith', email: 'alice@test.com', password: 'secret1234' },
    });

    expect(res.statusCode).toBe(400);
    // `field` est étalé à la RACINE et DÉCLARÉ au schéma 400 : sans la
    // déclaration, fast-json-stringify le retire et le client ne sait pas quel
    // champ surligner.
    expect(res.json().field).toBe('displayName');
    expect(remboursements()).toBe(2);
    await app.close();
  });

  it('un jeton de transfert invalide rembourse — la saisie est à corriger', async () => {
    limiteursMontes.length = 0;
    const phoneTransferService = makePhoneTransferService();
    phoneTransferService.getTransferDataByToken = jest.fn<any>().mockResolvedValue({ valid: false });
    const { app } = await buildApp({ phoneTransferService });

    const res = await app.inject({
      method: 'POST', url: '/register',
      payload: { username: 'alice', password: 'secret1234', email: 'alice@test.com', firstName: 'Alice', lastName: 'Smith', phoneTransferToken: 'bad' },
    });

    expect(res.statusCode).toBe(400);
    expect(remboursements()).toBe(2);
    await app.close();
  });
});
