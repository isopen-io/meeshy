/**
 * Unit tests for auth magic-link routes (magic-link.ts)
 * Tests GET /me, POST /refresh, POST /verify-email, POST /resend-verification,
 * POST /send-phone-code, POST /verify-phone, GET /sessions,
 * DELETE /sessions/:sessionId, DELETE /sessions.
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

// Depuis #4264 un JWT porte `sid` — l'identifiant de la ligne `UserSession`
// qui l'a émis. Le double sert donc par défaut un jeton NOMMÉ : c'est la forme
// nominale d'après le lot. Les témoins de la fenêtre de transition surchargent
// ce retour pour rendre un jeton HÉRITÉ (sans `sid`).
jest.mock('jsonwebtoken', () => ({
  verify: jest.fn().mockReturnValue({
    userId: '507f1f77bcf86cd799439011', username: 'alice', role: 'USER',
    sid: 'sess-courante', iat: Math.floor(Date.now() / 1000),
  }),
  decode: jest.fn().mockReturnValue({
    userId: '507f1f77bcf86cd799439011', username: 'alice', role: 'USER',
    sid: 'sess-courante', iat: Math.floor(Date.now() / 1000),
  }),
}));

jest.mock('@meeshy/shared/utils/validation', () => ({
  AuthSchemas: {
    refreshToken: {},
    verifyEmail: {},
    resendVerification: {},
    sendPhoneCode: {},
    verifyPhone: {},
  },
  SessionSchemas: { validateToken: {} },
  validateSchema: jest.fn((_schema: any, data: any) => data),
}));

jest.mock('@meeshy/shared/types', () => ({
  userSchema: { type: 'object', additionalProperties: true },
  sessionSchema: { type: 'object', additionalProperties: true },
  errorResponseSchema: { type: 'object', properties: {} },
  sessionsListResponseSchema: { type: 'object', properties: { success: { type: 'boolean' }, data: { type: 'object' } } },
  refreshTokenRequestSchema: { type: 'object', properties: { token: { type: 'string' }, sessionToken: { type: 'string' } } },
  verifyEmailRequestSchema: { type: 'object', properties: { token: { type: 'string' }, code: { type: 'string' }, email: { type: 'string' } } },
  resendVerificationRequestSchema: { type: 'object', properties: { email: { type: 'string' } } },
  sendPhoneCodeRequestSchema: { type: 'object', properties: { phoneNumber: { type: 'string' } } },
  verifyPhoneRequestSchema: { type: 'object', properties: { phoneNumber: { type: 'string' }, code: { type: 'string' } } },
  validateSessionRequestSchema: { type: 'object', properties: { sessionToken: { type: 'string' } } },
}));

const mockCreateUnifiedAuthMiddleware = jest.fn();
const mockFindTrustedSession = jest.fn<any>().mockResolvedValue(null);
jest.mock('../../../../middleware/auth', () => ({
  createUnifiedAuthMiddleware: (...args: any[]) => mockCreateUnifiedAuthMiddleware(...args),
  findTrustedSession: (...args: unknown[]) => mockFindTrustedSession(...args),
}));

jest.mock('../../../../routes/auth/types', () => ({
  formatUserResponse: jest.fn((user: any) => ({
    id: user.id,
    username: user.username,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    displayName: user.displayName,
    bio: user.bio,
    avatar: user.avatar,
    banner: user.banner,
    phoneNumber: user.phoneNumber,
    role: user.role,
    isActive: user.isActive,
    systemLanguage: user.systemLanguage,
    regionalLanguage: user.regionalLanguage,
    customDestinationLanguage: user.customDestinationLanguage,
    isOnline: user.isOnline,
    lastActiveAt: user.lastActiveAt,
    emailVerifiedAt: user.emailVerifiedAt,
    profileCompletionRate: user.profileCompletionRate,
  })),
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { registerMagicLinkRoutes } from '../../../../routes/auth/magic-link';
import { LEGACY_SID_WINDOW_CLOSES_AT } from '../../../../services/auth/session-jwt';

// ─── Constants ────────────────────────────────────────────────────────────────

const USER_ID = '507f1f77bcf86cd799439011';

// #4264 — le témoin du critère 5 exige DEUX sessions : avec une seule, la
// garde de compte de #4213 suffit déjà et le témoin ne prouverait rien de neuf.
const SID_COURANTE = 'sess-courante';   // le téléphone qu'on garde en main
const SID_REVOQUEE = 'sess-revoquee';   // l'appareil qu'on vient de couper

const mockUser = {
  id: USER_ID,
  username: 'alice',
  email: 'alice@test.com',
  firstName: 'Alice',
  lastName: 'Smith',
  displayName: 'Alice Smith',
  role: 'USER',
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockSession = {
  id: 'session-1',
  userId: USER_ID,
  deviceType: 'desktop',
  deviceVendor: null,
  deviceModel: null,
  osName: 'Linux',
  osVersion: null,
  browserName: 'Chrome',
  browserVersion: null,
  isMobile: false,
  ipAddress: '127.0.0.1',
  country: null,
  city: null,
  location: null,
  createdAt: new Date(),
  lastActivityAt: new Date(),
  isCurrentSession: false,
  isTrusted: true,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeAuthService(overrides: Record<string, any> = {}) {
  return {
    jwtSecret: 'test-secret',
    getUserPermissions: jest.fn<any>().mockReturnValue([]),
    getUserById: jest.fn<any>().mockResolvedValue(mockUser),
    generateToken: jest.fn<any>().mockReturnValue('new-jwt-token'),
    getUserActiveSessions: jest.fn<any>().mockResolvedValue([mockSession]),
    revokeSession: jest.fn<any>().mockResolvedValue(true),
    revokeAllSessionsExceptCurrent: jest.fn<any>().mockResolvedValue(2),
    validateSessionToken: jest.fn<any>().mockResolvedValue(null),
    verifyEmail: jest.fn<any>().mockResolvedValue({ success: true, alreadyVerified: false, verifiedAt: new Date() }),
    resendVerificationEmail: jest.fn<any>().mockResolvedValue({ success: true }),
    sendPhoneVerificationCode: jest.fn<any>().mockResolvedValue({ success: true }),
    verifyPhone: jest.fn<any>().mockResolvedValue({ success: true }),
    ...overrides,
  };
}

/**
 * Double de `userSession.findFirst` qui répond selon le `where` reçu.
 *
 * Un double qui ignore le `where` ne teste pas la requête — or c'est la
 * requête qui PORTE la garde de #4264 : `{ id: sid, userId, isValid: true }`.
 * Rendre inconditionnellement une session ferait passer un `sid` révoqué, un
 * `sid` d'un autre compte et un `sid` inventé, sur une suite verte.
 */
function makeFindFirst(sessionsValides: Set<string>) {
  return jest.fn<any>().mockImplementation(async (args: any) => {
    const where = args?.where ?? {};
    if (typeof where.id === 'string') {
      const idValide = sessionsValides.has(where.id);
      const bonProprietaire = where.userId === undefined || where.userId === USER_ID;
      const exigeValide = where.isValid !== true || idValide;
      return idValide && bonProprietaire && exigeValide ? { id: where.id } : null;
    }
    return null;
  });
}

function makePrisma(overrides: Record<string, any> = {}) {
  const { sessionsValides = new Set([SID_COURANTE]), ...rest } = overrides as any;
  return {
    userSession: {
      findFirst: makeFindFirst(sessionsValides as Set<string>),
      update: jest.fn<any>().mockResolvedValue({}),
      // Depuis #4213, `/refresh` REFUSE quand l'utilisateur n'a plus AUCUNE
      // session valide : c'est ce qui fait que la révocation atteint enfin
      // cette route. Un JWT authentique mais expiré suffisait auparavant à
      // obtenir un JWT neuf, si bien que couper les sockets ne servait à rien
      // — le porteur d'un jeton volé se reconnectait dans la seconde.
      //
      // Depuis #4264 ce compte ne gouverne PLUS que le régime de transition
      // (jeton hérité, sans `sid`) ; un jeton nommé est jugé par `findFirst`.
      // Le double en déclare une : ces témoins portent sur le RENOUVELLEMENT,
      // pas sur la révocation, qui a les siens.
      count: jest.fn<any>().mockResolvedValue(1),
    },
    ...rest,
  };
}

async function buildApp(opts: {
  authContext?: any;
  authService?: any;
  prisma?: any;
  authenticated?: boolean;
} = {}): Promise<FastifyInstance> {
  const {
    authContext = null,
    authService = makeAuthService(),
    prisma = makePrisma(),
    authenticated = true,
  } = opts;

  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });

  app.decorate('prisma', prisma);

  // Unified auth middleware mock for GET /me
  mockCreateUnifiedAuthMiddleware.mockReturnValue(async (req: FastifyRequest) => {
    if (authContext) {
      (req as any).authContext = authContext;
    } else if (authenticated) {
      (req as any).authContext = {
        isAuthenticated: true,
        type: 'user',
        userId: USER_ID,
        registeredUser: mockUser,
        displayName: 'Alice Smith',
      };
    } else {
      (req as any).authContext = { isAuthenticated: false };
    }
  });

  // fastify.authenticate for session routes
  app.decorate('authenticate', async (req: FastifyRequest) => {
    if (authenticated) {
      (req as any).user = { userId: USER_ID };
    }
  });

  const context = {
    fastify: app,
    authService,
    prisma,
    redis: null,
    phoneTransferService: {} as any,
    smsService: {} as any,
    cacheStore: {} as any,
  };

  registerMagicLinkRoutes(context as any);
  await app.ready();
  return app;
}

// ─── GET /me ──────────────────────────────────────────────────────────────────

describe('GET /me — registered user', () => {
  it('returns 200 with registered user profile', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/me' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    await app.close();
  });
});

describe('GET /me — anonymous user', () => {
  it('returns 200 with anonymous user profile', async () => {
    const app = await buildApp({
      authContext: {
        isAuthenticated: true,
        type: 'anonymous',
        userId: 'anon-session-1',
        anonymousUser: {
          username: 'anon-user',
          firstName: null,
          lastName: null,
          language: 'fr',
          permissions: [],
        },
        displayName: 'Anonymous',
      },
    });
    const res = await app.inject({ method: 'GET', url: '/me' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    await app.close();
  });

  it('serves the shared default for autoTranslateEnabled — an anonymous participant has no preferences row', async () => {
    // Ce site servait `false` en dur pendant que `participant-helpers`
    // servait `true` au MÊME participant dans chaque charge de conversation.
    // L'absence de préférence vaut le DÉFAUT du schéma partagé, pas un
    // troisième verdict local.
    const app = await buildApp({
      authContext: {
        isAuthenticated: true,
        type: 'anonymous',
        userId: 'anon-session-1',
        anonymousUser: {
          username: 'anon-user',
          firstName: null,
          lastName: null,
          language: 'fr',
          permissions: [],
        },
        displayName: 'Anonymous',
      },
    });
    const res = await app.inject({ method: 'GET', url: '/me' });
    expect(res.json().data.user.autoTranslateEnabled).toBe(true);
    await app.close();
  });
});

describe('GET /me — unauthenticated', () => {
  it('returns 401 when not authenticated', async () => {
    const app = await buildApp({
      authContext: { isAuthenticated: false },
    });
    const res = await app.inject({ method: 'GET', url: '/me' });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});

describe('GET /me — unknown auth type', () => {
  it('returns 404 when auth type is neither user nor anonymous', async () => {
    const app = await buildApp({
      authContext: {
        isAuthenticated: true,
        type: 'unknown',
        userId: USER_ID,
        registeredUser: null,
        anonymousUser: null,
      },
    });
    const res = await app.inject({ method: 'GET', url: '/me' });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

describe('GET /me — registered user includes profile fields', () => {
  it('returns 200 with user profile including bio, phoneNumber, banner, profileCompletionRate', async () => {
    const userWithProfileFields = {
      ...mockUser,
      bio: 'This is my bio',
      phoneNumber: '+33612345678',
      banner: 'https://example.com/banner.jpg',
      profileCompletionRate: 75,
      emailVerifiedAt: new Date(),
    };
    const app = await buildApp({
      authContext: {
        isAuthenticated: true,
        type: 'user',
        userId: USER_ID,
        registeredUser: userWithProfileFields as any,
        displayName: 'Alice Smith',
      },
    });
    const res = await app.inject({ method: 'GET', url: '/me' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.user).toBeDefined();
    expect(body.data.user.bio).toBe('This is my bio');
    expect(body.data.user.phoneNumber).toBe('+33612345678');
    expect(body.data.user.banner).toBe('https://example.com/banner.jpg');
    expect(body.data.user.profileCompletionRate).toBe(75);
    await app.close();
  });
});

// ─── POST /refresh ────────────────────────────────────────────────────────────

describe('POST /refresh — valid token', () => {
  it('returns 200 with new JWT token', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/refresh',
      payload: { token: 'valid-jwt-token' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    await app.close();
  });
});

describe('POST /refresh — user not found', () => {
  it('returns 404 when user does not exist', async () => {
    const authService = makeAuthService({ getUserById: jest.fn<any>().mockResolvedValue(null) });
    const app = await buildApp({ authService });
    const res = await app.inject({
      method: 'POST',
      url: '/refresh',
      payload: { token: 'valid-jwt-token' },
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

describe('POST /refresh — invalid token no userId', () => {
  it('returns 401 when decoded token has no userId', async () => {
    const jwt = await import('jsonwebtoken');
    (jwt.verify as jest.Mock<any>).mockReturnValueOnce({});
    (jwt.decode as jest.Mock<any>).mockReturnValueOnce({});

    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/refresh',
      payload: { token: 'invalid-jwt-token' },
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});

describe('POST /refresh — signature forgée', () => {
  // `jwt.decode` désérialise sans rien vérifier. Tant que la garde en aval ne
  // testait que la PRÉSENCE de `userId`, un jeton portant n'importe quelle
  // signature suffisait à obtenir un JWT valide signé par le serveur pour le
  // compte visé, plus le profil complet — usurpation d'identité en une requête,
  // sur une route publique d'un service joignable depuis l'Internet.
  it('refuse un jeton dont la signature ne vérifie pas, sans session de confiance', async () => {
    const jwt = await import('jsonwebtoken');
    (jwt.verify as jest.Mock<any>).mockImplementationOnce(() => {
      throw new Error('invalid signature');
    });
    (jwt.decode as jest.Mock<any>).mockReturnValueOnce({
      userId: USER_ID, username: 'victime', role: 'USER',
    });

    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/refresh',
      payload: { token: 'jeton-forge-avec-signature-bidon' },
    });

    expect(res.statusCode).toBe(401);
    // Et surtout : aucun jeton signé par le serveur n'est renvoyé.
    expect(res.json().data?.token).toBeUndefined();
    await app.close();
  });

  // task-1-fix-round-6 — décision du propriétaire, après clarification :
  // « une forme de connexion à la fois », jamais « une application à la
  // fois ». Le round 5 avait accepté ici une signature invalide couverte par
  // une session de confiance de la MÊME application ; le propriétaire a
  // explicitement écarté ce mélange de DEUX FORMES de justificatif — un
  // jeton d'authentification à signature invalide ne doit JAMAIS être
  // rattrapé par une session, quelle qu'elle soit. Le piège de cette route :
  // elle reste la SEULE à tolérer un jeton EXPIRÉ (c'est sa raison d'être,
  // via `ignoreExpiration` sur une signature authentique) — ce test prouve
  // que ce n'est plus le cas pour une signature invalide.
  it('refuse une signature invalide même si une session de confiance PARFAITEMENT valide existe — plus de rattrapage inter-formes (round 6)', async () => {
    const jwt = await import('jsonwebtoken');
    (jwt.verify as jest.Mock<any>).mockImplementationOnce(() => {
      throw new Error('invalid signature');
    });
    (jwt.decode as jest.Mock<any>).mockReturnValueOnce({
      userId: USER_ID, username: 'alice', role: 'USER',
    });

    // Une session de confiance parfaitement valide existerait — elle ne doit
    // pourtant jamais être consultée : la garde doit refuser AVANT même
    // d'atteindre `findTrustedSession`.
    mockFindTrustedSession.mockResolvedValueOnce({ id: 'sess-1' });

    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/refresh',
      payload: { token: 'jeton-forge-avec-signature-bidon', sessionToken: 'session-de-confiance' },
    });

    expect(res.statusCode).toBe(401);
    // Et surtout : aucun jeton signé par le serveur n'est renvoyé.
    expect(res.json().data?.token).toBeUndefined();
    // Preuve que ce n'est pas une coïncidence : le rattrapage n'est même
    // plus TENTÉ.
    expect(mockFindTrustedSession).not.toHaveBeenCalled();
    await app.close();
  });
});

describe('POST /refresh — with trusted session', () => {
  it('returns 200 and slides session TTL', async () => {
    mockFindTrustedSession.mockResolvedValueOnce({ id: 'sess-1' });
    const prisma = makePrisma();
    const app = await buildApp({ prisma });
    const res = await app.inject({
      method: 'POST',
      url: '/refresh',
      payload: { token: 'valid-jwt-token', sessionToken: 'my-session-token' },
    });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  /// P7-3 — le modèle UserSession n'a PAS de champ `lastActiveAt` (c'est un
  /// champ du modèle User) : le slide écrivait `lastActiveAt` → Prisma levait
  /// PrismaClientValidationError sur CHAQUE refresh (avalée par le .catch →
  /// « Failed to slide session expiresAt on refresh » en prod) → le sliding
  /// window des sessions trusted n'a JAMAIS fonctionné : elles expirent à
  /// leur TTL initial malgré l'activité de l'utilisateur.
  it('slides the session using the SCHEMA field lastActivityAt (not User.lastActiveAt)', async () => {
    mockFindTrustedSession.mockResolvedValueOnce({ id: 'sess-1' });
    const prisma = makePrisma();
    const update = prisma.userSession.update as jest.Mock<any>;
    const app = await buildApp({ prisma });
    await app.inject({
      method: 'POST',
      url: '/refresh',
      payload: { token: 'valid-jwt-token', sessionToken: 'my-session-token' },
    });

    expect(update).toHaveBeenCalledTimes(1);
    const arg = update.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(arg.data.expiresAt).toBeInstanceOf(Date);
    expect(arg.data.lastActivityAt).toBeInstanceOf(Date);
    expect(arg.data.lastActiveAt).toBeUndefined();
    await app.close();
  });

  // task-1-fix-round-6 — documente explicitement l'intention du propriétaire
  // (« on peut être connecté par plusieurs applications à la fois sans
  // souci ») pour empêcher un futur round de réintroduire la règle du round
  // 5 : `findTrustedSession` ne reçoit plus de signal d'application du tout
  // (aucun `requestUserAgent` dans l'appel), et le succès du rafraîchissement
  // ne dépend donc jamais du User-Agent de la requête en cours.
  it("une session de confiance ne discrimine plus par application — connecté depuis plusieurs apps jamais pénalisé (round 6)", async () => {
    mockFindTrustedSession.mockResolvedValueOnce({ id: 'sess-1' });
    const prisma = makePrisma();
    const app = await buildApp({ prisma });
    const res = await app.inject({
      method: 'POST',
      url: '/refresh',
      payload: { token: 'valid-jwt-token', sessionToken: 'my-session-token' },
      // User-Agent délibérément différent de toute app "attendue" — n'a plus
      // aucun effet sur l'issue.
      headers: { 'user-agent': 'Meeshy/1 CFNetwork/1408.0.4 Darwin/22.5.0' },
    });

    expect(res.statusCode).toBe(200);
    expect(mockFindTrustedSession).toHaveBeenCalledWith(
      prisma,
      { userId: USER_ID, sessionToken: 'my-session-token' }
    );
    await app.close();
  });
});

// ─── POST /refresh — la révocation atteint LA session nommée (#4264) ─────────

/** Sert un jeton dont la charge est exactement celle passée — signature réputée valide. */
async function servirJeton(charge: Record<string, unknown>) {
  const jwt = await import('jsonwebtoken');
  (jwt.verify as jest.Mock<any>).mockReturnValueOnce(charge);
  (jwt.decode as jest.Mock<any>).mockReturnValueOnce(charge);
}

const jetonNomme = (sid: string) => ({
  userId: USER_ID, username: 'alice', role: 'USER',
  sid, iat: Math.floor(Date.now() / 1000),
});

describe('POST /refresh — deux sessions, une révoquée (#4264, critère 5)', () => {
  // LE témoin du lot. La subtilité est dans le COMPTE : le double déclare
  // qu'il reste UNE session valide (`count` → 1), donc la garde de #4213 —
  // « au moins une session valide pour ce compte » — laisse passer les deux
  // jetons. Avec une seule session, ce témoin ne prouverait rien de neuf.
  //
  // Ce que le défaut coûtait : révoquer une session tierce se fait TOUJOURS
  // depuis un appareil qu'on garde, donc le compte garde une session valide,
  // donc le jeton volé passait `refresh` — la révocation ne révoquait rien.

  beforeEach(() => { mockFindTrustedSession.mockReset().mockResolvedValue(null); });

  const compteApresRevocation = () => makePrisma({
    sessionsValides: new Set([SID_COURANTE]), // SID_REVOQUEE vient d'être coupée
  });

  it('REFUSE le jeton émis par la session révoquée, alors qu\'une autre session reste valide', async () => {
    const prisma = compteApresRevocation();
    const app = await buildApp({ prisma });
    await servirJeton(jetonNomme(SID_REVOQUEE));

    const res = await app.inject({
      method: 'POST', url: '/refresh', payload: { token: 'jwt-de-l-appareil-coupe' },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json().data?.token).toBeUndefined();
    // Preuve que le refus vient de la SESSION NOMMÉE et non du compte : le
    // compte, lui, a toujours une session valide.
    expect(await prisma.userSession.count()).toBe(1);
    await app.close();
  });

  it('ACCEPTE le jeton de la session restée valide, dans le MÊME état du compte', async () => {
    const app = await buildApp({ prisma: compteApresRevocation() });
    await servirJeton(jetonNomme(SID_COURANTE));

    const res = await app.inject({
      method: 'POST', url: '/refresh', payload: { token: 'jwt-du-telephone-garde' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.token).toBe('new-jwt-token');
    await app.close();
  });

  it('interroge la session par son id ET par son propriétaire — un `sid` d\'un autre compte ne passe pas', async () => {
    // Sans `userId` dans le `where`, un `sid` parfaitement valide APPARTENANT
    // À QUELQU\'UN D\'AUTRE suffirait : la garde vérifierait qu\'une session
    // existe, jamais qu\'elle est celle du porteur. Le double refuse tout
    // `where.userId` étranger, ce qui rend le témoin sensible à son retrait.
    const prisma = makePrisma({ sessionsValides: new Set([SID_COURANTE]) });
    const app = await buildApp({ prisma });
    await servirJeton({ ...jetonNomme(SID_COURANTE), userId: USER_ID });

    await app.inject({ method: 'POST', url: '/refresh', payload: { token: 'jwt' } });

    const where = (prisma.userSession.findFirst as jest.Mock<any>).mock.calls[0][0].where;
    expect(where).toEqual({ id: SID_COURANTE, userId: USER_ID, isValid: true });
    await app.close();
  });

  it('le jeton RENOUVELÉ garde le nom de sa session — `refresh` est le cinquième site d\'émission', async () => {
    // Critère 1, « `refresh` lui-même ». Si le renouvellement rendait un jeton
    // anonyme, une seule rotation suffirait à ressortir du régime nominal et à
    // retomber dans la fenêtre de transition : la garde s\'auto-désarmerait.
    const authService = makeAuthService();
    const app = await buildApp({ authService, prisma: makePrisma() });
    await servirJeton(jetonNomme(SID_COURANTE));

    await app.inject({ method: 'POST', url: '/refresh', payload: { token: 'jwt' } });

    expect(authService.generateToken).toHaveBeenCalledWith(expect.anything(), SID_COURANTE);
    await app.close();
  });
});

// ─── POST /refresh — fenêtre de transition d\'un jeton hérité (#4264, critère 3) ─

/**
 * Fige l\'horloge SANS toucher aux timers : `doNotFake` laisse `setTimeout` &
 * consorts réels, dont Fastify dépend. Un témoin de butoir daté comparé à
 * l\'horloge RÉELLE serait une bombe — vert aujourd\'hui, rouge le jour où la
 * fenêtre se ferme, sur un code inchangé.
 */
function figerHorloge(instant: Date) {
  jest.useFakeTimers({
    doNotFake: [
      'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval',
      'setImmediate', 'clearImmediate', 'nextTick', 'queueMicrotask',
      'performance', 'hrtime',
    ],
    now: instant,
  });
}

const jetonHerite = (iatMs: number) => ({
  userId: USER_ID, username: 'alice', role: 'USER', iat: Math.floor(iatMs / 1000),
});

describe('POST /refresh — jeton hérité, sans `sid`', () => {
  // Un `mockResolvedValueOnce` laissé NON CONSOMMÉ par un témoin précédent
  // (celui de la signature forgée prouve justement que le rattrapage n'est
  // plus TENTÉ) reste en file et coifferait le nôtre. On vide la file.
  beforeEach(() => { mockFindTrustedSession.mockReset().mockResolvedValue(null); });
  afterEach(() => { jest.useRealTimers(); });

  it('reste accepté DANS la fenêtre quand le compte garde une session valide', async () => {
    // La transition explicite du critère 3 : refuser d\'emblée déconnecterait
    // tout le parc installé pour fermer un cas étroit — le compromis que #4213
    // avait déjà écarté.
    const dedans = new Date(LEGACY_SID_WINDOW_CLOSES_AT.getTime() - 24 * 3600 * 1000);
    const app = await buildApp({ prisma: makePrisma() });
    await servirJeton(jetonHerite(dedans.getTime()));
    figerHorloge(dedans);

    const res = await app.inject({ method: 'POST', url: '/refresh', payload: { token: 'jwt-hérité' } });

    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it('retombe sur la règle de compte de #4213 : zéro session valide ⇒ refus', async () => {
    const dedans = new Date(LEGACY_SID_WINDOW_CLOSES_AT.getTime() - 24 * 3600 * 1000);
    const prisma = makePrisma();
    (prisma.userSession.count as jest.Mock<any>).mockResolvedValue(0);
    const app = await buildApp({ prisma });
    await servirJeton(jetonHerite(dedans.getTime()));
    figerHorloge(dedans);

    const res = await app.inject({ method: 'POST', url: '/refresh', payload: { token: 'jwt-hérité' } });

    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('est REFUSÉ une fois la fenêtre fermée — le repli n\'est pas permanent', async () => {
    // Sans ce butoir, `{ ignoreExpiration: true }` rendait un jeton hérité
    // rafraîchissable INDÉFINIMENT : la garde du critère 2 n\'aurait jamais
    // atteint personne, puisqu\'il suffit de ne pas porter `sid` pour l\'éviter.
    const apres = new Date(LEGACY_SID_WINDOW_CLOSES_AT.getTime() + 1000);
    const prisma = makePrisma();
    const app = await buildApp({ prisma });
    await servirJeton(jetonHerite(apres.getTime()));
    figerHorloge(apres);

    const res = await app.inject({ method: 'POST', url: '/refresh', payload: { token: 'jwt-hérité' } });

    expect(res.statusCode).toBe(401);
    expect(res.json().data?.token).toBeUndefined();
    // Et le refus précède la question du compte : on ne compte même plus.
    expect(prisma.userSession.count).not.toHaveBeenCalled();
    await app.close();
  });

  it('SORT de la fenêtre : le jeton renouvelé prend le nom de la session de confiance présentée', async () => {
    // La porte de sortie silencieuse. Un client hérité qui envoie son
    // `sessionToken` repart avec un jeton NOMMÉ et ne voit rien — c\'est ce qui
    // vide la fenêtre avant qu\'elle ne se ferme.
    const dedans = new Date(LEGACY_SID_WINDOW_CLOSES_AT.getTime() - 24 * 3600 * 1000);
    mockFindTrustedSession.mockResolvedValueOnce({ id: SID_COURANTE });
    const authService = makeAuthService();
    const app = await buildApp({ authService, prisma: makePrisma() });
    await servirJeton(jetonHerite(dedans.getTime()));
    figerHorloge(dedans);

    await app.inject({
      method: 'POST', url: '/refresh',
      payload: { token: 'jwt-hérité', sessionToken: 'jeton-de-session' },
    });

    expect(authService.generateToken).toHaveBeenCalledWith(expect.anything(), SID_COURANTE);
    await app.close();
  });
});

// ─── POST /verify-email ───────────────────────────────────────────────────────

describe('POST /verify-email — success with token', () => {
  it('returns 200 on successful email verification', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/verify-email',
      payload: { token: 'verify-token-abc', email: 'alice@test.com' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    await app.close();
  });
});

describe('POST /verify-email — already verified', () => {
  it('returns 200 with alreadyVerified: true', async () => {
    const authService = makeAuthService({
      verifyEmail: jest.fn<any>().mockResolvedValue({
        success: true,
        alreadyVerified: true,
        verifiedAt: new Date(),
      }),
    });
    const app = await buildApp({ authService });
    const res = await app.inject({
      method: 'POST',
      url: '/verify-email',
      payload: { token: 'verify-token-abc', email: 'alice@test.com' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    await app.close();
  });
});

describe('POST /verify-email — failure', () => {
  it('returns 400 when verification fails', async () => {
    const authService = makeAuthService({
      verifyEmail: jest.fn<any>().mockResolvedValue({ success: false, error: 'Token invalide' }),
    });
    const app = await buildApp({ authService });
    const res = await app.inject({
      method: 'POST',
      url: '/verify-email',
      payload: { token: 'bad-token', email: 'alice@test.com' },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

describe('POST /verify-email — via code', () => {
  it('returns 200 when using verification code instead of token', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/verify-email',
      payload: { code: '123456', email: 'alice@test.com' },
    });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});

// ─── POST /resend-verification ────────────────────────────────────────────────

describe('POST /resend-verification — success', () => {
  it('returns 200 regardless of whether account exists', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/resend-verification',
      payload: { email: 'alice@test.com' },
    });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});

describe('POST /resend-verification — already verified', () => {
  it('returns 400 when email is already verified', async () => {
    const authService = makeAuthService({
      resendVerificationEmail: jest.fn<any>().mockResolvedValue({
        success: false,
        error: 'Adresse email déjà vérifiée',
      }),
    });
    const app = await buildApp({ authService });
    const res = await app.inject({
      method: 'POST',
      url: '/resend-verification',
      payload: { email: 'alice@test.com' },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

// ─── POST /send-phone-code ────────────────────────────────────────────────────

describe('POST /send-phone-code — success', () => {
  it('returns 200 when SMS code is sent', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/send-phone-code',
      payload: { phoneNumber: '+33612345678' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    await app.close();
  });
});

describe('POST /send-phone-code — failure', () => {
  it('returns 400 when SMS sending fails', async () => {
    const authService = makeAuthService({
      sendPhoneVerificationCode: jest.fn<any>().mockResolvedValue({ success: false, error: 'Numéro invalide' }),
    });
    const app = await buildApp({ authService });
    const res = await app.inject({
      method: 'POST',
      url: '/send-phone-code',
      payload: { phoneNumber: 'invalid' },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

// ─── POST /verify-phone ───────────────────────────────────────────────────────

describe('POST /verify-phone — success', () => {
  it('returns 200 when phone is verified', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/verify-phone',
      payload: { phoneNumber: '+33612345678', code: '123456' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    await app.close();
  });
});

describe('POST /verify-phone — failure', () => {
  it('returns 400 when code is wrong', async () => {
    const authService = makeAuthService({
      verifyPhone: jest.fn<any>().mockResolvedValue({ success: false, error: 'Code invalide' }),
    });
    const app = await buildApp({ authService });
    const res = await app.inject({
      method: 'POST',
      url: '/verify-phone',
      payload: { phoneNumber: '+33612345678', code: '000000' },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

// ─── GET /sessions ────────────────────────────────────────────────────────────

describe('GET /sessions — success', () => {
  it('returns 200 with list of active sessions', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/sessions' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    await app.close();
  });
});

// ─── DELETE /sessions/:sessionId ──────────────────────────────────────────────

describe('DELETE /sessions/:sessionId — success', () => {
  it('returns 200 when session is revoked', async () => {
    const authService = makeAuthService({
      getUserActiveSessions: jest.fn<any>().mockResolvedValue([{ ...mockSession, id: 'sess-to-revoke' }]),
      revokeSession: jest.fn<any>().mockResolvedValue(true),
    });
    const app = await buildApp({ authService });
    const res = await app.inject({ method: 'DELETE', url: '/sessions/sess-to-revoke' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    await app.close();
  });
});

describe('DELETE /sessions/:sessionId — not found', () => {
  it('returns 404 when session does not belong to user', async () => {
    const authService = makeAuthService({
      getUserActiveSessions: jest.fn<any>().mockResolvedValue([{ ...mockSession, id: 'other-session' }]),
    });
    const app = await buildApp({ authService });
    const res = await app.inject({ method: 'DELETE', url: '/sessions/nonexistent' });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

describe('DELETE /sessions/:sessionId — revoke fails', () => {
  it('returns 404 when revokeSession returns false', async () => {
    const authService = makeAuthService({
      getUserActiveSessions: jest.fn<any>().mockResolvedValue([{ ...mockSession, id: 'sess-1' }]),
      revokeSession: jest.fn<any>().mockResolvedValue(false),
    });
    const app = await buildApp({ authService });
    const res = await app.inject({ method: 'DELETE', url: '/sessions/sess-1' });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

// ─── DELETE /sessions ──────────────────────────────────────────────────────────

describe('DELETE /sessions — revoke all', () => {
  it('returns 200 with revoked count', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'DELETE', url: '/sessions' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    await app.close();
  });
});

// Les deux cas de `POST /validate-session` sont partis avec la route (#4186).
// Son absence est gardée par un témoin NÉGATIF monté sous le préfixe de
// production : `__tests__/unit/routes/identity-twins-retired.test.ts`.
