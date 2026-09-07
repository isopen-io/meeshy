/**
 * Extended unit tests for auth magic-link routes (magic-link.ts).
 * Extrait de magic-link.test.ts (#3621, #4531) pour rester sous le budget de
 * 1000 lignes des suites du gateway : le fichier d'origine n'avait que trois
 * lignes de marge et un témoin de plus l'aurait fait dépasser.
 *
 * Couvre POST /refresh — fenêtre de transition d'un jeton hérité, sans `sid`
 * (#4264, critère 3), y compris le critère de fin littéral de #3621
 * (« un JWT de 6 mois est refusé »).
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
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
  ...(jest.requireActual('@meeshy/shared/types/api-schemas') as object),
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
const SID_COURANTE = 'sess-courante';

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

/** Sert un jeton dont la charge est exactement celle passée — signature réputée valide. */
async function servirJeton(charge: Record<string, unknown>) {
  const jwt = await import('jsonwebtoken');
  (jwt.verify as jest.Mock<any>).mockReturnValueOnce(charge);
  (jwt.decode as jest.Mock<any>).mockReturnValueOnce(charge);
}

// ─── POST /refresh — fenêtre de transition d'un jeton hérité (#4264, critère 3) ─

/**
 * Fige l'horloge SANS toucher aux timers : `doNotFake` laisse `setTimeout` &
 * consorts réels, dont Fastify dépend. Un témoin de butoir daté comparé à
 * l'horloge RÉELLE serait une bombe — vert aujourd'hui, rouge le jour où la
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
    // La transition explicite du critère 3 : refuser d'emblée déconnecterait
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

  it('un JWT hérité vieux de six mois est refusé, même ENCORE DANS la fenêtre — critère de fin #3621', async () => {
    // `legacyTokenRefusal` prouve déjà ce refus à son propre niveau
    // (session-jwt.test.ts, « refuse un jeton plus vieux que l'âge maximal »).
    // Ce témoin le prouve à l'étage que #3621 visait — la ROUTE — pour que le
    // critère de fin de l'issue (« un JWT de 6 mois est refusé (test) ») soit
    // couvert de bout en bout, pas seulement au niveau de la fonction pure.
    const dedans = new Date(LEGACY_SID_WINDOW_CLOSES_AT.getTime() - 24 * 3600 * 1000);
    const sixMoisAvant = new Date(dedans.getTime() - 180 * 24 * 3600 * 1000);
    const prisma = makePrisma();
    const app = await buildApp({ prisma });
    await servirJeton(jetonHerite(sixMoisAvant.getTime()));
    figerHorloge(dedans);

    const res = await app.inject({ method: 'POST', url: '/refresh', payload: { token: 'jwt-vieux-de-six-mois' } });

    expect(res.statusCode).toBe(401);
    expect(res.json().data?.token).toBeUndefined();
    // Refusé sur l'ÂGE du jeton, pas sur la fenêtre : l'horloge figée est
    // encore dedans — ce qui distingue ce témoin de celui de la fenêtre fermée.
    expect(prisma.userSession.count).not.toHaveBeenCalled();
    await app.close();
  });

  it('est REFUSÉ une fois la fenêtre fermée — le repli n\'est pas permanent', async () => {
    // Sans ce butoir, `{ ignoreExpiration: true }` rendait un jeton hérité
    // rafraîchissable INDÉFINIMENT : la garde du critère 2 n'aurait jamais
    // atteint personne, puisqu'il suffit de ne pas porter `sid` pour l'éviter.
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
    // `sessionToken` repart avec un jeton NOMMÉ et ne voit rien — c'est ce qui
    // vide la fenêtre avant qu'elle ne se ferme.
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
