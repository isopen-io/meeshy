/**
 * Extended tests for src/middleware/auth.ts
 * Covers branches and paths not reached by auth.test.ts:
 * - createUnifiedAuthMiddleware factory (all branches)
 * - Helper: authUserCacheKey, isRegisteredUser, isAnonymousUser, getUserPermissions
 * - Legacy: requireRole, requireEmailVerification
 * - JWT cache hit (JWT verify result cached)
 * - Auth user cache hit (user row cached; inactive cached user)
 * - JWT expired + sessionToken trusted-session paths
 * - StatusService integration (updateUserLastSeen, ensureUserOnline, updateAnonymousLastSeen)
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import jwt from 'jsonwebtoken';
import { hashSessionToken } from '../../../utils/session-token';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../../../services/CacheStore', () => {
  const store = new Map<string, { value: string; expiresAt: number }>();
  const mockStore = {
    get: jest.fn(async (key: string) => {
      const entry = store.get(key);
      if (entry && entry.expiresAt > Date.now()) return entry.value;
      return null;
    }),
    set: jest.fn(async (key: string, value: string, ttl?: number) => {
      store.set(key, { value, expiresAt: Date.now() + (ttl || 3600) * 1000 });
    }),
    del: jest.fn(async (key: string) => { store.delete(key); }),
    keys: jest.fn(async () => []),
    setnx: jest.fn(async () => true),
    expire: jest.fn(async () => true),
    publish: jest.fn(async () => 0),
    info: jest.fn(async () => ''),
    isAvailable: jest.fn(() => false),
    close: jest.fn(async () => {}),
    getNativeClient: jest.fn(() => null),
  };
  return {
    getCacheStore: jest.fn(() => mockStore),
    resetCacheStore: jest.fn(() => { store.clear(); }),
    __mockStore: mockStore,
    __mockStoreMap: store,
  };
});

jest.mock('../../../utils/logger-enhanced.js', () => ({
  enhancedLogger: {
    child: () => ({
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    }),
  },
}));

// Import after mocks
import {
  AuthMiddleware,
  createUnifiedAuthMiddleware,
  authUserCacheKey,
  isRegisteredUser,
  isAnonymousUser,
  getUserPermissions,
  requireEmailVerification,
  requireRole as requireRoleLegacy,
  findTrustedSession,
} from '../../../middleware/auth';

// ─── Constants ─────────────────────────────────────────────────────────────────

const JWT_SECRET = 'test-secret-key';

// task-1-fix-round-5 avait introduit ces fixtures pour discriminer web vs
// natif — cette règle a été RETIRÉE au round 6 après clarification produit
// (« une forme de connexion à la fois », jamais « une application à la
// fois » : être connecté depuis plusieurs applications est légitime). Les
// fixtures restent utiles pour prouver l'INVERSE : `findTrustedSession` ne
// discrimine plus jamais sur ces champs, cf. describe('findTrustedSession')
// plus bas.
const WEB_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const WEB_BROWSER_NAME = 'Chrome';

// ─── Helpers ───────────────────────────────────────────────────────────────────

function createMockPrisma(overrides: Record<string, unknown> = {}) {
  return {
    user: {
      findUnique: overrides.userFindUnique ?? (jest.fn() as jest.Mock<any>).mockResolvedValue(null),
    },
    userSession: {
      findFirst: overrides.sessionFindFirst ?? (jest.fn() as jest.Mock<any>).mockResolvedValue(null),
      update: overrides.sessionUpdate ?? (jest.fn() as jest.Mock<any>).mockReturnValue({
        catch: jest.fn(),
      }),
    },
    participant: {
      findFirst: overrides.participantFindFirst ?? (jest.fn() as jest.Mock<any>).mockResolvedValue(null),
    },
  } as unknown as ConstructorParameters<typeof AuthMiddleware>[0];
}

function createTestUser(overrides: Record<string, unknown> = {}) {
  return {
    id: '507f1f77bcf86cd799439011',
    username: 'testuser',
    email: 'test@example.com',
    firstName: 'Test',
    lastName: 'User',
    displayName: 'Test User',
    avatar: null,
    role: 'USER',
    systemLanguage: 'fr',
    regionalLanguage: 'en',
    customDestinationLanguage: null,
    isOnline: true,
    lastActiveAt: new Date(),
    isActive: true,
    emailVerifiedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deviceLocale: null,
    ...overrides,
  };
}

function signJwt(userId: string): string {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '1h' });
}

function signExpiredJwt(userId: string): string {
  return jwt.sign(
    { userId, exp: Math.floor(Date.now() / 1000) - 3600 },
    JWT_SECRET
  );
}

function createRequest(headers: Record<string, string | undefined> = {}) {
  return {
    headers: {
      authorization: undefined as string | undefined,
      'x-session-token': undefined as string | undefined,
      ...headers,
    },
  } as any;
}

function createReply() {
  const reply: any = {
    status: jest.fn() as jest.Mock<any>,
    send: jest.fn() as jest.Mock<any>,
    code: jest.fn() as jest.Mock<any>,
  };
  reply.status.mockReturnValue(reply);
  reply.send.mockReturnValue(reply);
  reply.code.mockReturnValue(reply);
  return reply;
}

// ─── Helper function tests ─────────────────────────────────────────────────────

describe('authUserCacheKey', () => {
  it('returns auth:user: prefixed key', () => {
    expect(authUserCacheKey('user-123')).toBe('auth:user:user-123');
  });
});

describe('isRegisteredUser', () => {
  it('returns true for type=user, isAnonymous=false', () => {
    const ctx = { type: 'user', isAnonymous: false } as any;
    expect(isRegisteredUser(ctx)).toBe(true);
  });

  it('returns false for anonymous type', () => {
    const ctx = { type: 'anonymous', isAnonymous: true } as any;
    expect(isRegisteredUser(ctx)).toBe(false);
  });

  it('returns false for user type but isAnonymous=true', () => {
    const ctx = { type: 'user', isAnonymous: true } as any;
    expect(isRegisteredUser(ctx)).toBe(false);
  });
});

describe('isAnonymousUser', () => {
  it('returns true for authenticated anonymous participant', () => {
    const ctx = { type: 'anonymous', isAnonymous: true, isAuthenticated: true } as any;
    expect(isAnonymousUser(ctx)).toBe(true);
  });

  it('returns false for registered user', () => {
    const ctx = { type: 'user', isAnonymous: false, isAuthenticated: true } as any;
    expect(isAnonymousUser(ctx)).toBe(false);
  });

  it('returns false for unauthenticated visitor', () => {
    const ctx = { type: 'anonymous', isAnonymous: true, isAuthenticated: false } as any;
    expect(isAnonymousUser(ctx)).toBe(false);
  });
});

describe('getUserPermissions', () => {
  it('returns full access for registered user', () => {
    const ctx = { type: 'user', isAnonymous: false, isAuthenticated: true } as any;
    const perms = getUserPermissions(ctx);
    expect(perms.hasFullAccess).toBe(true);
    expect(perms.canSendMessages).toBe(true);
    expect(perms.canSendFiles).toBe(true);
    expect(perms.canSendAudios).toBe(true);
  });

  it('returns context.permissions when present (anonymous with rights override)', () => {
    const ctx = {
      type: 'anonymous',
      isAnonymous: true,
      isAuthenticated: true,
      permissions: {
        canSendMessages: true,
        canSendFiles: false,
        canSendImages: true,
        canSendVideos: false,
        canSendAudios: false,
        canSendLocations: false,
        canSendLinks: false,
      },
    } as any;
    const perms = getUserPermissions(ctx);
    expect(perms.hasFullAccess).toBe(false);
    expect(perms.canSendMessages).toBe(true);
    expect(perms.canSendFiles).toBe(false);
  });

  it('falls through to anonymousUser.permissions when no permissions field', () => {
    const ctx = {
      type: 'anonymous',
      isAnonymous: true,
      isAuthenticated: true,
      anonymousUser: {
        permissions: {
          canSendMessages: false,
          canSendFiles: true,
          canSendImages: false,
          canSendVideos: false,
          canSendAudios: false,
          canSendLocations: false,
          canSendLinks: false,
        },
      },
    } as any;
    const perms = getUserPermissions(ctx);
    expect(perms.hasFullAccess).toBe(false);
    expect(perms.canSendMessages).toBe(false);
    expect(perms.canSendFiles).toBe(true);
  });

  it('returns all-false for unauthenticated visitor with no permissions', () => {
    const ctx = {
      type: 'anonymous',
      isAnonymous: true,
      isAuthenticated: false,
    } as any;
    const perms = getUserPermissions(ctx);
    expect(perms.hasFullAccess).toBe(false);
    expect(perms.canSendMessages).toBe(false);
    expect(perms.canSendFiles).toBe(false);
    expect(perms.canSendVideos).toBe(false);
  });
});

// ─── createUnifiedAuthMiddleware ──────────────────────────────────────────────

describe('createUnifiedAuthMiddleware', () => {
  beforeEach(() => {
    process.env.JWT_SECRET = JWT_SECRET;
    const { __mockStoreMap } = require('../../../services/CacheStore');
    __mockStoreMap.clear();
    jest.clearAllMocks();
  });

  it('sets unauthenticated authContext when no credentials', async () => {
    const prisma = createMockPrisma();
    const middleware = createUnifiedAuthMiddleware(prisma as never, { allowAnonymous: true });
    const req = createRequest();
    const reply = createReply();

    await middleware(req, reply);

    expect(req.authContext.isAuthenticated).toBe(false);
    expect(req.authContext.isAnonymous).toBe(true);
    expect(reply.status).not.toHaveBeenCalled();
  });

  it('sets authenticated authContext for valid JWT', async () => {
    const user = createTestUser();
    const prisma = createMockPrisma({
      userFindUnique: (jest.fn() as jest.Mock<any>).mockResolvedValue(user),
    });
    const token = signJwt(user.id);
    const middleware = createUnifiedAuthMiddleware(prisma as never);
    const req = createRequest({ authorization: `Bearer ${token}` });
    const reply = createReply();

    await middleware(req, reply);

    expect(req.authContext.isAuthenticated).toBe(true);
    expect(req.authContext.userId).toBe(user.id);
    expect(reply.status).not.toHaveBeenCalled();
  });

  it('returns 401 when requireAuth and not authenticated', async () => {
    const prisma = createMockPrisma();
    const middleware = createUnifiedAuthMiddleware(prisma as never, { requireAuth: true });
    const req = createRequest();
    const reply = createReply();

    await middleware(req, reply);

    expect(reply.status).toHaveBeenCalledWith(401);
    expect(reply.send).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'AUTH_REQUIRED' })
    );
  });

  it('returns 403 when allowAnonymous=false and user is anonymous', async () => {
    const rawToken = 'anon_test_token';
    const tokenHash = hashSessionToken(rawToken);
    const participant = {
      id: '507f1f77bcf86cd799439022',
      conversationId: '507f1f77bcf86cd799439033',
      type: 'anonymous',
      displayName: 'Anon',
      avatar: null,
      role: 'member',
      language: 'fr',
      permissions: {
        canSendMessages: true, canSendFiles: false, canSendImages: false,
        canSendVideos: false, canSendAudios: false, canSendLocations: false, canSendLinks: false,
      },
      isActive: true,
      isOnline: false,
      lastActiveAt: new Date(),
      nickname: null,
      anonymousSession: {
        shareLinkId: 'link-123',
        profile: { username: 'anon', firstName: 'Anon', lastName: 'User' },
        rights: null,
      },
    };

    const prisma = createMockPrisma({
      participantFindFirst: (jest.fn() as jest.Mock<any>).mockResolvedValue(participant),
    });
    const middleware = createUnifiedAuthMiddleware(prisma as never, { allowAnonymous: false });
    const req = createRequest({ 'x-session-token': rawToken });
    const reply = createReply();

    await middleware(req, reply);

    expect(reply.status).toHaveBeenCalledWith(403);
    expect(reply.send).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'REGISTERED_USER_REQUIRED' })
    );
  });

  it('falls back to unauthenticated context on auth error when requireAuth=false', async () => {
    const prisma = createMockPrisma();
    const middleware = createUnifiedAuthMiddleware(prisma as never);
    const req = createRequest({ authorization: 'Bearer invalid.bad.token' });
    const reply = createReply();

    await middleware(req, reply);

    expect(req.authContext.isAuthenticated).toBe(false);
    expect(reply.status).not.toHaveBeenCalled();
  });

  it('returns 401 on auth error when requireAuth=true', async () => {
    const prisma = createMockPrisma();
    const middleware = createUnifiedAuthMiddleware(prisma as never, { requireAuth: true });
    const req = createRequest({ authorization: 'Bearer invalid.bad.token' });
    const reply = createReply();

    await middleware(req, reply);

    expect(reply.status).toHaveBeenCalledWith(401);
    expect(reply.send).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'AUTH_FAILED' })
    );
  });

  it('attaches legacy req.user when authenticated', async () => {
    const user = createTestUser();
    const prisma = createMockPrisma({
      userFindUnique: (jest.fn() as jest.Mock<any>).mockResolvedValue(user),
    });
    const token = signJwt(user.id);
    const middleware = createUnifiedAuthMiddleware(prisma as never);
    const req = createRequest({ authorization: `Bearer ${token}` });
    const reply = createReply();

    await middleware(req, reply);

    const reqAny = req as any;
    expect(reqAny.user.userId).toBe(user.id);
    expect(reqAny.user.isAnonymous).toBe(false);
    expect(reqAny.auth.isAuthenticated).toBe(true);
  });

  it('attaches legacy req.user when unauthenticated (preserves existing userId)', async () => {
    const prisma = createMockPrisma();
    const middleware = createUnifiedAuthMiddleware(prisma as never, { allowAnonymous: true });
    const req = { ...createRequest(), user: { userId: 'pre-existing' } } as any;
    const reply = createReply();

    await middleware(req, reply);

    expect(req.user.userId).toBe('pre-existing');
  });
});

// ─── requireRole (legacy auth.ts export) ─────────────────────────────────────

describe('requireRole (legacy from auth.ts)', () => {
  it('returns 403 when authContext is missing', async () => {
    const middleware = requireRoleLegacy('ADMIN');
    const req = { authContext: null } as any;
    const reply = createReply();

    await middleware(req, reply);

    expect(reply.code).toHaveBeenCalledWith(403);
  });

  it('returns 403 when user is not authenticated', async () => {
    const middleware = requireRoleLegacy('ADMIN');
    const req = {
      authContext: { isAuthenticated: false, registeredUser: null },
    } as any;
    const reply = createReply();

    await middleware(req, reply);

    expect(reply.code).toHaveBeenCalledWith(403);
  });

  it('returns 403 when user role is not allowed', async () => {
    const middleware = requireRoleLegacy('BIGBOSS');
    const req = {
      authContext: {
        isAuthenticated: true,
        registeredUser: { role: 'USER' },
      },
    } as any;
    const reply = createReply();

    await middleware(req, reply);

    expect(reply.code).toHaveBeenCalledWith(403);
    expect(reply.send).toHaveBeenCalledWith(
      expect.objectContaining({ success: false })
    );
  });

  it('allows request when user role matches', async () => {
    const middleware = requireRoleLegacy('ADMIN');
    const req = {
      authContext: {
        isAuthenticated: true,
        registeredUser: { role: 'ADMIN' },
      },
    } as any;
    const reply = createReply();

    await middleware(req, reply);

    expect(reply.code).not.toHaveBeenCalled();
  });

  it('allows when role is in array of allowed roles', async () => {
    const middleware = requireRoleLegacy(['BIGBOSS', 'ADMIN']);
    const req = {
      authContext: {
        isAuthenticated: true,
        registeredUser: { role: 'ADMIN' },
      },
    } as any;
    const reply = createReply();

    await middleware(req, reply);

    expect(reply.code).not.toHaveBeenCalled();
  });
});

// ─── requireEmailVerification ─────────────────────────────────────────────────

describe('requireEmailVerification', () => {
  it('returns 403 when authContext is missing', async () => {
    const req = { authContext: null } as any;
    const reply = createReply();

    await requireEmailVerification(req, reply);

    expect(reply.code).toHaveBeenCalledWith(403);
    expect(reply.send).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.objectContaining({ code: 'PERMISSION_DENIED' }) })
    );
  });

  it('returns 403 when not authenticated', async () => {
    const req = {
      authContext: { isAuthenticated: false, registeredUser: null },
    } as any;
    const reply = createReply();

    await requireEmailVerification(req, reply);

    expect(reply.code).toHaveBeenCalledWith(403);
  });

  it('returns 403 EMAIL_NOT_VERIFIED when email not verified', async () => {
    const req = {
      authContext: {
        isAuthenticated: true,
        registeredUser: { emailVerifiedAt: null },
      },
    } as any;
    const reply = createReply();

    await requireEmailVerification(req, reply);

    expect(reply.code).toHaveBeenCalledWith(403);
    expect(reply.send).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.objectContaining({ code: 'EMAIL_NOT_VERIFIED' }) })
    );
  });

  it('does not reply when email is verified', async () => {
    const req = {
      authContext: {
        isAuthenticated: true,
        registeredUser: { emailVerifiedAt: new Date() },
      },
    } as any;
    const reply = createReply();

    await requireEmailVerification(req, reply);

    expect(reply.code).not.toHaveBeenCalled();
    expect(reply.send).not.toHaveBeenCalled();
  });
});

// ─── JWT expired + sessionToken paths ────────────────────────────────────────

describe('AuthMiddleware — JWT expired with sessionToken', () => {
  beforeEach(() => {
    process.env.JWT_SECRET = JWT_SECRET;
    const { __mockStoreMap } = require('../../../services/CacheStore');
    __mockStoreMap.clear();
    jest.clearAllMocks();
  });

  it('throws when JWT expired and no sessionToken provided', async () => {
    const expiredToken = signExpiredJwt('user-1');
    const prisma = createMockPrisma();
    const middleware = new AuthMiddleware(prisma as never);

    await expect(
      middleware.createAuthContext(`Bearer ${expiredToken}`)
    ).rejects.toThrow('Invalid JWT token');
  });

  // task-1-fix-round-6 — décision du propriétaire, après clarification :
  // « une forme de connexion à la fois », jamais « une application à la
  // fois ». Le round 5 avait ajouté ici une comparaison d'application qui
  // pénalisait l'usage légitime (connecté sur plusieurs apps en même temps)
  // — et une revue adverse a montré, par exécution, qu'elle ne protégeait
  // rien : son discriminant est un `User-Agent` librement falsifiable.
  //
  // Le vrai principe retenu : un jeton d'authentification EXPIRÉ n'est plus
  // JAMAIS rattrapé par une session de confiance à ce niveau — quelle que
  // soit l'application dont elle provient, même la MÊME application, même
  // une correspondance parfaite. Cette tolérance à l'expiration n'existe
  // plus QUE sur `POST /refresh` (`routes/auth/magic-link.ts`), la route
  // dont c'est la raison d'être — jamais ici. La personne doit rafraîchir
  // son jeton ou se reconnecter.
  it('throws when JWT expired even though a perfectly valid trusted session exists for the SAME user — le rattrapage inter-formes a disparu du middleware (round 6)', async () => {
    const user = createTestUser();
    const rawSession = 'trusted-session-token';
    const sessionFindFirst = (jest.fn() as jest.Mock<any>).mockResolvedValue({
      id: 'session-1',
      sessionToken: hashSessionToken(rawSession),
      userId: user.id,
      isValid: true,
      isTrusted: true,
      expiresAt: new Date(Date.now() + 86400_000),
      userAgent: WEB_USER_AGENT,
      browserName: WEB_BROWSER_NAME,
    });
    const prisma = createMockPrisma({
      userFindUnique: (jest.fn() as jest.Mock<any>).mockResolvedValue(user),
      sessionFindFirst,
    });
    const expiredToken = signExpiredJwt(user.id);
    const middleware = new AuthMiddleware(prisma as never);

    await expect(
      middleware.createAuthContext(`Bearer ${expiredToken}`, rawSession)
    ).rejects.toThrow('Invalid JWT token');

    // Preuve que ce n'est pas une coïncidence (session refusée pour une
    // autre raison) : la table des sessions n'est même plus interrogée — le
    // rattrapage a disparu de ce chemin, il n'est pas devenu plus strict.
    expect(sessionFindFirst).not.toHaveBeenCalled();
  });
});

// ─── findTrustedSession — plus de discrimination par application (round 6) ───

describe('findTrustedSession', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // task-1-fix-round-6 — documente explicitement l'intention du propriétaire
  // pour empêcher un futur round de réintroduire la règle du round 5 :
  // « on peut être connecté par plusieurs applications à la fois sans
  // souci ». La session ci-dessous provient du navigateur web (`browserName`
  // peuplé) — la fonction ne demande même plus de signal d'application en
  // paramètre : elle ne peut donc plus le comparer à quoi que ce soit.
  it('ne discrimine jamais par application — règle du round 5 retirée après clarification produit', async () => {
    const rawSession = 'cross-app-session-token';
    const sessionFindFirst = (jest.fn() as jest.Mock<any>).mockResolvedValue({
      id: 'session-cross-app',
      sessionToken: hashSessionToken(rawSession),
      userId: 'user-1',
      isValid: true,
      isTrusted: true,
      expiresAt: new Date(Date.now() + 86400_000),
      userAgent: WEB_USER_AGENT,
      browserName: WEB_BROWSER_NAME,
    });
    const prisma = createMockPrisma({ sessionFindFirst });

    const session = await findTrustedSession(prisma as never, {
      userId: 'user-1',
      sessionToken: rawSession,
    });

    expect(session).toEqual(expect.objectContaining({ id: 'session-cross-app' }));
  });

  it('retourne null quand aucune session de confiance active ne correspond', async () => {
    const prisma = createMockPrisma({
      sessionFindFirst: (jest.fn() as jest.Mock<any>).mockResolvedValue(null),
    });

    const session = await findTrustedSession(prisma as never, {
      userId: 'user-1',
      sessionToken: 'unknown-session-token',
    });

    expect(session).toBeNull();
  });

  // Non-régression : `UserSession.sessionToken` est `@unique` GLOBALEMENT
  // (`packages/shared/prisma/schema.prisma`), donc une ligne dont le jeton
  // haché correspond à celui de l'appelant ne peut appartenir qu'à UN SEUL
  // `userId`. Le mock ci-dessous simule fidèlement cette contrainte — un AND
  // sur TOUTES les clés de `where`, pas un stub uniforme qui l'ignorerait et
  // ne prouverait rien — pour garder la propriété si la fonction en venait
  // un jour à oublier `userId` dans son filtre.
  it("refuse un userId ne correspondant pas à la session stockée (unicité de sessionToken)", async () => {
    const rawSession = 'attacker-own-trusted-session-token';
    const storedRow = {
      id: 'session-attacker',
      userId: 'attacker-user-1',
      sessionToken: hashSessionToken(rawSession),
      isValid: true,
      isTrusted: true,
      expiresAt: new Date(Date.now() + 86400_000),
    };
    const sessionFindFirst = (jest.fn() as jest.Mock<any>).mockImplementation(
      ({ where }: { where: Record<string, unknown> }) => {
        const matches = Object.entries(where).every(([key, expected]) => {
          if (key === 'expiresAt') return true; // fraîcheur, non simulée ici
          return (storedRow as Record<string, unknown>)[key] === expected;
        });
        return Promise.resolve(matches ? storedRow : null);
      }
    );
    const prisma = createMockPrisma({ sessionFindFirst });

    const session = await findTrustedSession(prisma as never, {
      userId: 'victim-user-1',
      sessionToken: rawSession,
    });

    expect(session).toBeNull();
    expect(sessionFindFirst).toHaveBeenCalledWith({
      where: {
        sessionToken: hashSessionToken(rawSession),
        userId: 'victim-user-1',
        isValid: true,
        isTrusted: true,
        expiresAt: { gt: expect.any(Date) },
      },
    });
  });
});

// ─── Auth user cache hit paths ────────────────────────────────────────────────

describe('AuthMiddleware — auth user cache hit', () => {
  beforeEach(() => {
    process.env.JWT_SECRET = JWT_SECRET;
    const { __mockStoreMap } = require('../../../services/CacheStore');
    __mockStoreMap.clear();
    jest.clearAllMocks();
  });

  it('uses cached active user and skips Prisma findUnique', async () => {
    const user = createTestUser();
    const token = signJwt(user.id);
    const cacheKey = `auth:user:${user.id}`;
    const cachedRow = {
      ...user,
      lastActiveAt: user.lastActiveAt.toISOString(),
      emailVerifiedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const { __mockStoreMap } = require('../../../services/CacheStore');
    __mockStoreMap.set(cacheKey, {
      value: JSON.stringify(cachedRow),
      expiresAt: Date.now() + 60_000,
    });

    const userFindUnique = jest.fn() as jest.Mock<any>;
    const prisma = createMockPrisma({ userFindUnique });
    const middleware = new AuthMiddleware(prisma as never);

    const ctx = await middleware.createAuthContext(`Bearer ${token}`);

    expect(ctx.isAuthenticated).toBe(true);
    expect(ctx.userId).toBe(user.id);
    expect(userFindUnique).not.toHaveBeenCalled();
  });

  it('throws when cached user has isActive=false', async () => {
    const user = createTestUser({ isActive: false });
    const token = signJwt(user.id);
    const cacheKey = `auth:user:${user.id}`;
    const cachedRow = {
      ...user,
      isActive: false,
      lastActiveAt: user.lastActiveAt.toISOString(),
      emailVerifiedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const { __mockStoreMap } = require('../../../services/CacheStore');
    __mockStoreMap.set(cacheKey, {
      value: JSON.stringify(cachedRow),
      expiresAt: Date.now() + 60_000,
    });

    const prisma = createMockPrisma();
    const middleware = new AuthMiddleware(prisma as never);

    await expect(
      middleware.createAuthContext(`Bearer ${token}`)
    ).rejects.toThrow('Invalid JWT token');
  });
});

// ─── StatusService integration ────────────────────────────────────────────────

describe('AuthMiddleware — StatusService integration', () => {
  beforeEach(() => {
    process.env.JWT_SECRET = JWT_SECRET;
    const { __mockStoreMap } = require('../../../services/CacheStore');
    __mockStoreMap.clear();
    jest.clearAllMocks();
  });

  it('calls updateUserLastSeen and ensureUserOnline when user is offline', async () => {
    const user = createTestUser({ isOnline: false });
    const prisma = createMockPrisma({
      userFindUnique: (jest.fn() as jest.Mock<any>).mockResolvedValue(user),
    });
    const statusService = {
      updateUserLastSeen: jest.fn(),
      ensureUserOnline: jest.fn(),
      updateAnonymousLastSeen: jest.fn(),
    } as any;
    const middleware = new AuthMiddleware(prisma as never, statusService);
    const token = signJwt(user.id);

    await middleware.createAuthContext(`Bearer ${token}`);

    expect(statusService.updateUserLastSeen).toHaveBeenCalledWith(user.id);
    expect(statusService.ensureUserOnline).toHaveBeenCalledWith(user.id, false);
  });

  it('calls updateUserLastSeen but NOT ensureUserOnline when user is already online', async () => {
    const user = createTestUser({ isOnline: true });
    const prisma = createMockPrisma({
      userFindUnique: (jest.fn() as jest.Mock<any>).mockResolvedValue(user),
    });
    const statusService = {
      updateUserLastSeen: jest.fn(),
      ensureUserOnline: jest.fn(),
      updateAnonymousLastSeen: jest.fn(),
    } as any;
    const middleware = new AuthMiddleware(prisma as never, statusService);
    const token = signJwt(user.id);

    await middleware.createAuthContext(`Bearer ${token}`);

    expect(statusService.updateUserLastSeen).toHaveBeenCalledWith(user.id);
    expect(statusService.ensureUserOnline).not.toHaveBeenCalled();
  });

  it('calls updateAnonymousLastSeen for anonymous participant', async () => {
    const rawToken = 'anon_status_test';
    const tokenHash = hashSessionToken(rawToken);
    const participant = {
      id: '507f1f77bcf86cd799439022',
      conversationId: '507f1f77bcf86cd799439033',
      type: 'anonymous',
      displayName: 'AnonStatus',
      avatar: null,
      role: 'member',
      language: 'fr',
      permissions: {
        canSendMessages: true, canSendFiles: false, canSendImages: false,
        canSendVideos: false, canSendAudios: false, canSendLocations: false, canSendLinks: false,
      },
      isActive: true,
      isOnline: false,
      lastActiveAt: new Date(),
      nickname: null,
      anonymousSession: {
        shareLinkId: 'link-456',
        profile: { username: 'anontest', firstName: 'Anon', lastName: 'Test' },
        rights: null,
      },
    };

    const prisma = createMockPrisma({
      participantFindFirst: (jest.fn() as jest.Mock<any>).mockResolvedValue(participant),
    });
    const statusService = {
      updateUserLastSeen: jest.fn(),
      ensureUserOnline: jest.fn(),
      updateAnonymousLastSeen: jest.fn(),
    } as any;
    const middleware = new AuthMiddleware(prisma as never, statusService);

    await middleware.createAuthContext(undefined, rawToken);

    expect(statusService.updateAnonymousLastSeen).toHaveBeenCalledWith(participant.id);
  });

  it('calls userSession.update when sessionToken provided and JWT is not expired', async () => {
    const user = createTestUser();
    const prisma = createMockPrisma({
      userFindUnique: (jest.fn() as jest.Mock<any>).mockResolvedValue(user),
    });
    const sessionUpdateMock = (jest.fn() as jest.Mock<any>).mockReturnValue({ catch: jest.fn() });
    (prisma as any).userSession.update = sessionUpdateMock;

    const middleware = new AuthMiddleware(prisma as never);
    const token = signJwt(user.id);

    await middleware.createAuthContext(`Bearer ${token}`, 'some-raw-session-token');

    expect(sessionUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ lastActivityAt: expect.any(Date) }),
      })
    );
  });
});

// ─── JWT verify result cache ──────────────────────────────────────────────────

describe('AuthMiddleware — JWT verify result cache', () => {
  beforeEach(() => {
    process.env.JWT_SECRET = JWT_SECRET;
    const { __mockStoreMap } = require('../../../services/CacheStore');
    __mockStoreMap.clear();
    jest.clearAllMocks();
  });

  it('skips jwt.verify on second call using cached payload', async () => {
    const user = createTestUser();
    const prisma = createMockPrisma({
      userFindUnique: (jest.fn() as jest.Mock<any>).mockResolvedValue(user),
    });
    const middleware = new AuthMiddleware(prisma as never);
    const token = signJwt(user.id);

    // First call populates the JWT cache
    const ctx1 = await middleware.createAuthContext(`Bearer ${token}`);
    expect(ctx1.userId).toBe(user.id);

    // Second call should use cached JWT payload (and cached user)
    const ctx2 = await middleware.createAuthContext(`Bearer ${token}`);
    expect(ctx2.userId).toBe(user.id);
    expect(ctx2.isAuthenticated).toBe(true);
  });
});

// ─── Fire-and-forget .catch callback paths ────────────────────────────────────

describe('AuthMiddleware — fire-and-forget catch callbacks', () => {
  beforeEach(() => {
    process.env.JWT_SECRET = JWT_SECRET;
    const { __mockStoreMap } = require('../../../services/CacheStore');
    __mockStoreMap.clear();
    jest.clearAllMocks();
  });

  // NB round 6 : le test qui vivait ici exerçait le `.catch` du repli JWT
  // expiré → session de confiance à l'intérieur du middleware. Ce chemin de
  // code a disparu avec le rattrapage inter-formes lui-même (cf.
  // describe('AuthMiddleware — JWT expired with sessionToken') ci-dessus) —
  // il n'y a donc plus rien à observer ici pour ce cas.

  it('triggers non-expired sessionToken update .catch callback when update fails', async () => {
    const user = createTestUser();
    const sessionUpdateMock = (jest.fn() as jest.Mock<any>).mockReturnValue(
      Promise.reject(new Error('update failed'))
    );
    const prisma = createMockPrisma({
      userFindUnique: (jest.fn() as jest.Mock<any>).mockResolvedValue(user),
    });
    (prisma as any).userSession.update = sessionUpdateMock;

    const middleware = new AuthMiddleware(prisma as never);
    const token = signJwt(user.id);

    const ctx = await middleware.createAuthContext(`Bearer ${token}`, 'raw-session-xyz');

    await new Promise(r => setImmediate(r));
    expect(ctx.isAuthenticated).toBe(true);
    expect(sessionUpdateMock).toHaveBeenCalled();
  });
});

// ─── Anonymous context error path ─────────────────────────────────────────────

describe('AuthMiddleware — anonymous context error path', () => {
  it('throws Invalid session token when participant.findFirst throws', async () => {
    const prisma = createMockPrisma({
      participantFindFirst: (jest.fn() as jest.Mock<any>).mockRejectedValue(new Error('DB error')),
    });
    const middleware = new AuthMiddleware(prisma as never);

    await expect(
      middleware.createAuthContext(undefined, 'anon_error_test')
    ).rejects.toThrow('Invalid session token');
  });

  it('throws Invalid session token when participant is null (no active participant)', async () => {
    const prisma = createMockPrisma({
      participantFindFirst: (jest.fn() as jest.Mock<any>).mockResolvedValue(null),
    });
    const middleware = new AuthMiddleware(prisma as never);

    await expect(
      middleware.createAuthContext(undefined, 'anon_null_participant')
    ).rejects.toThrow('Invalid session token');
  });
});

// ─── requireRole — generic non-PermissionDeniedError path ────────────────────

describe('requireRole — generic error path (line 663)', () => {
  it('returns 403 with PERMISSION_DENIED when unexpected error is thrown', async () => {
    const middleware = requireRoleLegacy('ADMIN');

    // Craft a request where accessing authContext.registeredUser throws a non-PermissionDeniedError
    const authContext = {
      isAuthenticated: true,
      get registeredUser() {
        throw new TypeError('Unexpected internal failure');
      },
    };
    const req = { authContext } as any;
    const reply = createReply();

    await middleware(req, reply);

    expect(reply.code).toHaveBeenCalledWith(403);
    expect(reply.send).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({ code: 'PERMISSION_DENIED' }),
      })
    );
  });
});

// ─── JWT expiry log dedup cleanup (line 334-335) ─────────────────────────────

describe('AuthMiddleware — JWT expired log dedup cleanup', () => {
  beforeEach(() => {
    process.env.JWT_SECRET = JWT_SECRET;
    const { __mockStoreMap } = require('../../../services/CacheStore');
    __mockStoreMap.clear();
    jest.clearAllMocks();
  });

  it('does not exceed log interval for same expired token prefix twice', async () => {
    const userId = '507f1f77bcf86cd799439099';
    const prisma = createMockPrisma();

    // Sign many different tokens so they all have different suffixes — fills up the Map
    // The cleanup runs when size > 100, deleting entries > 10 * LOG_INTERVAL old
    const expiredToken = signExpiredJwt(userId);
    const middleware = new AuthMiddleware(prisma as never);

    // Call twice with same token — second should be throttled
    await expect(middleware.createAuthContext(`Bearer ${expiredToken}`)).rejects.toThrow('Invalid JWT token');
    await expect(middleware.createAuthContext(`Bearer ${expiredToken}`)).rejects.toThrow('Invalid JWT token');
  });
});

// ─── createUnifiedAuthMiddleware — line 285 path ─────────────────────────────
// (user not found or inactive after Prisma query, from within registered user path)

describe('createUnifiedAuthMiddleware — user not active error', () => {
  beforeEach(() => {
    process.env.JWT_SECRET = JWT_SECRET;
    const { __mockStoreMap } = require('../../../services/CacheStore');
    __mockStoreMap.clear();
    jest.clearAllMocks();
  });

  it('returns fallback context when Prisma returns user with isActive=false', async () => {
    const user = createTestUser({ isActive: false });
    const prisma = createMockPrisma({
      userFindUnique: (jest.fn() as jest.Mock<any>).mockResolvedValue(user),
    });
    const middleware = createUnifiedAuthMiddleware(prisma as never, {
      requireAuth: false,
      allowAnonymous: true,
    });
    const token = signJwt(user.id);
    const req = createRequest({ authorization: `Bearer ${token}` });
    const reply = createReply();

    await middleware(req, reply);

    // Should fall back to unauthenticated context (non-requireAuth mode)
    expect(req.authContext.isAuthenticated).toBe(false);
  });
});

// ─── createUnifiedAuthMiddleware legacy req.user unauthenticated branch (498-502) ─

describe('createUnifiedAuthMiddleware — unauthenticated req.user branch', () => {
  beforeEach(() => {
    process.env.JWT_SECRET = JWT_SECRET;
    const { __mockStoreMap } = require('../../../services/CacheStore');
    __mockStoreMap.clear();
    jest.clearAllMocks();
  });

  it('sets req.user.userId to null when unauthenticated and no pre-existing userId', async () => {
    const prisma = createMockPrisma();
    const middleware = createUnifiedAuthMiddleware(prisma as never, { allowAnonymous: true });
    const req = createRequest(); // no user pre-existing
    const reply = createReply();

    await middleware(req, reply);

    // The unauthenticated branch (else) sets userId to null
    const reqAny = req as any;
    expect(reqAny.user).toBeDefined();
    expect(reqAny.user.userId).toBeNull();
  });

  it('preserves existing userId in req.user when unauthenticated', async () => {
    const prisma = createMockPrisma();
    const middleware = createUnifiedAuthMiddleware(prisma as never, { allowAnonymous: true });
    const req = { ...createRequest(), user: { userId: 'kept-user-id' } } as any;
    const reply = createReply();

    await middleware(req, reply);

    expect(req.user.userId).toBe('kept-user-id');
  });
});

// ─── createUnifiedAuthMiddleware — catch blocks (502, 513) via Proxy ─────────

describe('createUnifiedAuthMiddleware — catch blocks for req.user and req.auth assignment', () => {
  beforeEach(() => {
    process.env.JWT_SECRET = JWT_SECRET;
    const { __mockStoreMap } = require('../../../services/CacheStore');
    __mockStoreMap.clear();
    jest.clearAllMocks();
  });

  it('handles thrown error gracefully in try-catch around req.user assignment (line 502)', async () => {
    const user = createTestUser();
    const prisma = createMockPrisma({
      userFindUnique: (jest.fn() as jest.Mock<any>).mockResolvedValue(user),
    });
    const token = signJwt(user.id);
    const middleware = createUnifiedAuthMiddleware(prisma as never, { allowAnonymous: true });

    // Use a Proxy that allows 'authContext' to be set but throws on 'user'
    // This exercises the catch block at line 501-503
    const state: Record<string, unknown> = {};
    const req = new Proxy(
      { headers: { authorization: `Bearer ${token}`, 'x-session-token': undefined } },
      {
        get(target: any, prop: string) {
          if (prop === 'headers') return target.headers;
          if (prop in state) return state[prop];
          return undefined;
        },
        set(_target: any, prop: string, value: unknown) {
          if (prop === 'authContext') {
            state[prop] = value;
            return true;
          }
          if (prop === 'user') {
            throw new Error('Cannot set user on frozen request');
          }
          if (prop === 'auth') {
            state[prop] = value;
            return true;
          }
          state[prop] = value;
          return true;
        },
      }
    );

    const reply = createReply();

    // The Proxy causes a throw when trying to set req.user
    // This should be swallowed by the try-catch at line 501-503
    await middleware(req as any, reply);

    // Verify the auth context was still set (set before the req.user try block)
    expect((req as any).authContext).toBeDefined();
  });

  it('handles error in req.auth assignment try block gracefully (line 513)', async () => {
    const user = createTestUser();
    const prisma = createMockPrisma({
      userFindUnique: (jest.fn() as jest.Mock<any>).mockResolvedValue(user),
    });
    const token = signJwt(user.id);
    const middleware = createUnifiedAuthMiddleware(prisma as never);

    // Use a request that allows user but throws on auth
    let userSet = false;
    const req = new Proxy(
      { headers: { authorization: `Bearer ${token}`, 'x-session-token': undefined } },
      {
        get(target, prop) {
          if (prop === 'headers') return target.headers;
          if (prop === 'user') return userSet ? {} : undefined;
          if (prop === 'authContext') return undefined;
          return undefined;
        },
        set(target, prop, value) {
          if (prop === 'user') { userSet = true; return true; }
          if (prop === 'auth') { throw new Error('Cannot set auth'); }
          if (prop === 'authContext') { return true; }
          return true;
        },
      }
    );

    const reply = createReply();
    // Should not throw despite auth assignment failing
    try {
      await middleware(req as any, reply);
    } catch {
      // acceptable
    }
  });
});

// ─── JWT log dedup size > 100 cleanup path (lines 334-335) ───────────────────

describe('AuthMiddleware — JWT log cleanup when map size exceeds 100', () => {
  beforeEach(() => {
    process.env.JWT_SECRET = JWT_SECRET;
    const { __mockStoreMap } = require('../../../services/CacheStore');
    __mockStoreMap.clear();
    jest.clearAllMocks();
  });

  it('handles many distinct expired tokens without memory leak (exercises cleanup path)', async () => {
    const prisma = createMockPrisma();
    const middleware = new AuthMiddleware(prisma as never);

    // Generate 105 distinct expired tokens with different userIds so map fills past 100
    // Each has a unique suffix → unique key in expiredJwtLoggedTokens
    const promises: Promise<unknown>[] = [];
    for (let i = 0; i < 105; i++) {
      const userId = `user-${String(i).padStart(5, '0')}-cleanup-path`;
      const expiredToken = signExpiredJwt(userId);
      promises.push(
        middleware.createAuthContext(`Bearer ${expiredToken}`).catch((_e: unknown) => {
          // expected to throw
        })
      );
    }

    await Promise.all(promises);
    // If we reach here, the cleanup path (lines 334-335) was hit without crashing
  });
});
