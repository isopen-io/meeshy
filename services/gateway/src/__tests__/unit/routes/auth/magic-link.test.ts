/**
 * Unit tests for auth magic-link routes (magic-link.ts)
 * Tests GET /me, POST /refresh, POST /verify-email, POST /resend-verification,
 * POST /send-phone-code, POST /verify-phone, GET /sessions,
 * DELETE /sessions/:sessionId, DELETE /sessions, POST /validate-session.
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

jest.mock('jsonwebtoken', () => ({
  verify: jest.fn().mockReturnValue({ userId: '507f1f77bcf86cd799439011', username: 'alice', role: 'USER' }),
  decode: jest.fn().mockReturnValue({ userId: '507f1f77bcf86cd799439011', username: 'alice', role: 'USER' }),
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

// ─── Constants ────────────────────────────────────────────────────────────────

const USER_ID = '507f1f77bcf86cd799439011';

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

function makePrisma(overrides: Record<string, any> = {}) {
  return {
    userSession: {
      findFirst: jest.fn<any>().mockResolvedValue(null),
      update: jest.fn<any>().mockResolvedValue({}),
    },
    ...overrides,
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
    const prisma = makePrisma({
      userSession: {
        findFirst: jest.fn<any>().mockResolvedValue(null),
        update: jest.fn<any>().mockResolvedValue({}),
      },
    });
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
    const update = jest.fn<any>().mockResolvedValue({});
    const prisma = makePrisma({
      userSession: {
        findFirst: jest.fn<any>().mockResolvedValue(null),
        update,
      },
    });
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
    const prisma = makePrisma({
      userSession: {
        findFirst: jest.fn<any>().mockResolvedValue(null),
        update: jest.fn<any>().mockResolvedValue({}),
      },
    });
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

// ─── POST /validate-session ───────────────────────────────────────────────────

describe('POST /validate-session — invalid session', () => {
  it('returns 200 with valid: false when session not found', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/validate-session',
      payload: { sessionToken: 'unknown-token' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    await app.close();
  });
});

describe('POST /validate-session — valid session', () => {
  it('returns 200 with valid: true when session is found', async () => {
    const authService = makeAuthService({
      validateSessionToken: jest.fn<any>().mockResolvedValue({
        id: 'sess-1',
        userId: USER_ID,
        deviceType: 'desktop',
        browserName: 'Chrome',
        osName: 'Linux',
        location: null,
        isMobile: false,
        createdAt: new Date(),
        lastActivityAt: new Date(),
        isTrusted: true,
      }),
    });
    const app = await buildApp({ authService });
    const res = await app.inject({
      method: 'POST',
      url: '/validate-session',
      payload: { sessionToken: 'valid-token' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    await app.close();
  });
});
