/**
 * #4264 critère 4 — le middleware d'authentification REST vérifie enfin que
 * la session NOMMÉE par le JWT (`sid`) est encore vivante, exactement comme
 * `POST /auth/refresh` le fait depuis les critères 1-3 du même lot
 * (`routes/auth/magic-link.ts`, `services/auth/session-jwt.ts`, déjà livrés
 * et testés — 143/143 témoins verts).
 *
 * Avant ce lot, `grep -n "sid" src/middleware/auth.ts` rendait ZÉRO
 * occurrence : un JWT dont la session avait été révoquée continuait
 * d'ouvrir des requêtes REST jusqu'à son expiration (jusqu'à 24h). La
 * révocation était écrite en base, honorée par `refresh`, ignorée par
 * toutes les autres portes — exactement la forme qu'a déjà rencontrée ce
 * dépôt : une garde qui annonce une restriction qu'elle n'applique pas sur
 * le chemin le plus fréquenté (`services/gateway/CLAUDE.md`
 * § « Une garde d'admission se pose sur CHAQUE chemin »).
 *
 * ## Le témoin qui compte (§ critère 5 de #4264, reproduit ICI pour la REST)
 *
 * DEUX sessions valides, l'une révoquée : un JWT émis par la session
 * révoquée est refusé ; celui de l'AUTRE passe. Un témoin sur la session
 * vivante SEULE ne peut pas tomber — il passerait identiquement avant ce
 * lot. Voir `describe('le témoin qui compte…')` plus bas, au niveau
 * `AuthMiddleware` ET via `app.inject()` sur une vraie requête REST (jamais
 * un double du handler — la garde exercée est la production, pas une copie).
 *
 * ## Sens de l'échec — trois états, jamais deux
 *
 * `UserSession` n'est JAMAIS supprimée physiquement dans ce dépôt (seul
 * `isValid` bascule — `SessionService.invalidateSession`) : une ligne
 * ABSENTE n'est donc PAS une preuve de révocation. `sessionLiveness` rend
 * `'live' | 'gone' | 'unknown'`, et seul `'gone'` (la ligne EXISTE et porte
 * `isValid: false`) refuse ; une ligne introuvable ou une lecture en échec
 * admettent (fail-OPEN sur l'absence de preuve) — sans quoi le premier appel
 * REST suivant un login tout juste fait, lu depuis un secondaire en retard
 * de réplication, déconnecterait un utilisateur qui vient de s'authentifier.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import jwt from 'jsonwebtoken';
import Fastify, { FastifyInstance } from 'fastify';
import { AuthMiddleware, createUnifiedAuthMiddleware } from '../../../middleware/auth';

// Même fabrique en mémoire que middleware/auth.test.ts et auth-extended.test.ts
// — ne pas dépendre de Redis, ne pas polluer entre tests.
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
    __mockStoreMap: store,
  };
});

const JWT_SECRET = 'test-secret-session-revocation-4264';
const USER_ID = '507f1f77bcf86cd799439011';
const LIVE_SESSION_ID = '507f1f77bcf86cd799439021';
const REVOKED_SESSION_ID = '507f1f77bcf86cd799439022';

function createTestUser(overrides: Record<string, unknown> = {}) {
  return {
    id: USER_ID,
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

function createMockPrisma(overrides: Record<string, unknown> = {}) {
  return {
    user: {
      findUnique: overrides.userFindUnique ?? jest.fn().mockResolvedValue(createTestUser()),
    },
    userSession: {
      findFirst: overrides.sessionFindFirst ?? jest.fn().mockResolvedValue(null),
      update: overrides.sessionUpdate ?? jest.fn().mockResolvedValue({}),
    },
    participant: {
      findFirst: overrides.participantFindFirst ?? jest.fn().mockResolvedValue(null),
    },
  } as unknown as ConstructorParameters<typeof AuthMiddleware>[0];
}

/** Signe un JWT #4264 — `sid` optionnel ; `iat`/`exp` explicites pour les
 * témoins de fenêtre de transition, sinon posés par `jsonwebtoken` (réel). */
function signJwt(params: { userId?: string; sid?: string; iat?: number; exp?: number } = {}): string {
  const { userId = USER_ID, sid, iat, exp } = params;
  const payload: Record<string, unknown> = { userId, username: 'testuser', role: 'USER' };
  if (sid) payload.sid = sid;
  if (typeof iat === 'number') payload.iat = iat;
  if (typeof exp === 'number') payload.exp = exp;
  // `exp` explicite dans la charge et l'option `expiresIn` sont exclusifs
  // pour `jsonwebtoken` (il refuse de poser `exp` deux fois).
  return typeof exp === 'number'
    ? jwt.sign(payload, JWT_SECRET)
    : jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' });
}

describe('AuthMiddleware — #4264 critère 4 : session nommée (sid) vivante', () => {
  beforeEach(() => {
    process.env.JWT_SECRET = JWT_SECRET;
    const { __mockStoreMap } = require('../../../services/CacheStore');
    __mockStoreMap.clear();
    jest.clearAllMocks();
  });

  it('admet un JWT dont la session nommée est LIVE (isValid: true), et lit par IDENTITÉ (pas de filtre isValid dans le where)', async () => {
    const sessionFindFirst = jest.fn().mockResolvedValue({ isValid: true });
    const prisma = createMockPrisma({ sessionFindFirst });
    const middleware = new AuthMiddleware(prisma as never);
    const token = signJwt({ sid: LIVE_SESSION_ID });

    const ctx = await middleware.createAuthContext(`Bearer ${token}`);

    expect(ctx.isAuthenticated).toBe(true);
    expect(ctx.userId).toBe(USER_ID);
    // Verrouille le design : le `where` ne filtre JAMAIS `isValid` — c'est ce
    // qui permet de distinguer `gone` (prouvé) de `unknown` (rien trouvé).
    expect(sessionFindFirst).toHaveBeenCalledWith({
      where: { id: LIVE_SESSION_ID, userId: USER_ID },
      select: { isValid: true },
    });
  });

  it('refuse un JWT dont la session nommée est GONE (isValid: false — révoquée)', async () => {
    const sessionFindFirst = jest.fn().mockResolvedValue({ isValid: false });
    const prisma = createMockPrisma({ sessionFindFirst });
    const middleware = new AuthMiddleware(prisma as never);
    const token = signJwt({ sid: REVOKED_SESSION_ID });

    await expect(
      middleware.createAuthContext(`Bearer ${token}`)
    ).rejects.toThrow('Invalid JWT token');
  });

  it("n'interroge jamais l'utilisateur quand la session nommée est révoquée — court-circuit avant le cache auth:user (l'effet, pas seulement le refus)", async () => {
    const sessionFindFirst = jest.fn().mockResolvedValue({ isValid: false });
    const userFindUnique = jest.fn().mockResolvedValue(createTestUser());
    const prisma = createMockPrisma({ sessionFindFirst, userFindUnique });
    const middleware = new AuthMiddleware(prisma as never);
    const token = signJwt({ sid: REVOKED_SESSION_ID });

    await expect(middleware.createAuthContext(`Bearer ${token}`)).rejects.toThrow();

    expect(userFindUnique).not.toHaveBeenCalled();
  });

  it('admet quand la session nommée est introuvable — unknown, jamais confondu avec gone (réplica en retard sur un login tout juste fait)', async () => {
    const sessionFindFirst = jest.fn().mockResolvedValue(null);
    const prisma = createMockPrisma({ sessionFindFirst });
    const middleware = new AuthMiddleware(prisma as never);
    const token = signJwt({ sid: 'session-not-yet-replicated' });

    const ctx = await middleware.createAuthContext(`Bearer ${token}`);

    expect(ctx.isAuthenticated).toBe(true);
  });

  it("admet quand la lecture de session lève — fail-OPEN sur l'ABSENCE de preuve, jamais sur la preuve elle-même", async () => {
    const sessionFindFirst = jest.fn().mockRejectedValue(new Error('Mongo timeout'));
    const prisma = createMockPrisma({ sessionFindFirst });
    const middleware = new AuthMiddleware(prisma as never);
    const token = signJwt({ sid: LIVE_SESSION_ID });

    const ctx = await middleware.createAuthContext(`Bearer ${token}`);

    expect(ctx.isAuthenticated).toBe(true);
  });

  // ─── Le témoin qui compte (critère 5 de #4264, reproduit pour le REST) ───
  describe('le témoin qui compte : DEUX sessions, une révoquée', () => {
    it('la session révoquée est refusée ; la session vivante du MÊME compte passe', async () => {
      const sessionFindFirst = jest.fn().mockImplementation(
        ({ where }: { where: { id: string; userId: string } }) => {
          if (where.id === LIVE_SESSION_ID) return Promise.resolve({ isValid: true });
          if (where.id === REVOKED_SESSION_ID) return Promise.resolve({ isValid: false });
          return Promise.resolve(null);
        }
      );
      const prisma = createMockPrisma({ sessionFindFirst });
      const middleware = new AuthMiddleware(prisma as never);

      const tokenRevoked = signJwt({ sid: REVOKED_SESSION_ID });
      const tokenLive = signJwt({ sid: LIVE_SESSION_ID });

      await expect(
        middleware.createAuthContext(`Bearer ${tokenRevoked}`)
      ).rejects.toThrow('Invalid JWT token');

      const ctx = await middleware.createAuthContext(`Bearer ${tokenLive}`);
      expect(ctx.isAuthenticated).toBe(true);
      expect(ctx.userId).toBe(USER_ID);
    });
  });
});

describe('AuthMiddleware — #4264 critère 4 : fenêtre de transition (jeton sans sid)', () => {
  beforeEach(() => {
    process.env.JWT_SECRET = JWT_SECRET;
    const { __mockStoreMap } = require('../../../services/CacheStore');
    __mockStoreMap.clear();
    jest.clearAllMocks();
  });

  it('admet un jeton sans sid dans la fenêtre de transition — et ne consulte JAMAIS userSession pour ce régime (aucun coût nouveau)', async () => {
    const sessionFindFirst = jest.fn().mockResolvedValue(null);
    const prisma = createMockPrisma({ sessionFindFirst });
    const middleware = new AuthMiddleware(prisma as never);
    const token = signJwt({}); // pas de sid — jsonwebtoken pose iat = maintenant

    const ctx = await middleware.createAuthContext(`Bearer ${token}`);

    expect(ctx.isAuthenticated).toBe(true);
    expect(sessionFindFirst).not.toHaveBeenCalled();
  });

  it("refuse un jeton sans sid dont l'âge dépasse le butoir de #4264 (30 jours) — même règle que refresh, pas réinventée ici", async () => {
    const prisma = createMockPrisma();
    const middleware = new AuthMiddleware(prisma as never);
    const nowSeconds = Math.floor(Date.now() / 1000);
    const thirtyOneDaysAgo = nowSeconds - 31 * 24 * 60 * 60;
    const oneHourFromNow = nowSeconds + 3600;
    // `exp` explicite et FUTUR : le jeton lui-même n'est pas expiré — c'est
    // le butoir `legacyTokenRefusal` (âge du `sid`-less token), pas
    // `jwt.verify`, qui doit refuser ici.
    const token = signJwt({ iat: thirtyOneDaysAgo, exp: oneHourFromNow });

    await expect(
      middleware.createAuthContext(`Bearer ${token}`)
    ).rejects.toThrow('Invalid JWT token');
  });

  it("admet un jeton sans sid dont l'âge reste SOUS le butoir (29 jours)", async () => {
    const prisma = createMockPrisma();
    const middleware = new AuthMiddleware(prisma as never);
    const nowSeconds = Math.floor(Date.now() / 1000);
    const twentyNineDaysAgo = nowSeconds - 29 * 24 * 60 * 60;
    const oneHourFromNow = nowSeconds + 3600;
    const token = signJwt({ iat: twentyNineDaysAgo, exp: oneHourFromNow });

    const ctx = await middleware.createAuthContext(`Bearer ${token}`);

    expect(ctx.isAuthenticated).toBe(true);
  });
});

// ─── Preuve au niveau REST — jamais un double du handler ────────────────────
describe('createUnifiedAuthMiddleware — #4264 critère 4 sur une VRAIE requête REST (app.inject, VRAI middleware)', () => {
  beforeEach(() => {
    process.env.JWT_SECRET = JWT_SECRET;
    const { __mockStoreMap } = require('../../../services/CacheStore');
    __mockStoreMap.clear();
    jest.clearAllMocks();
  });

  async function buildProbe(sessionFindFirst: (args: unknown) => Promise<unknown>): Promise<FastifyInstance> {
    const prisma = createMockPrisma({ sessionFindFirst: jest.fn(sessionFindFirst) });
    const app = Fastify({ logger: false });
    app.get(
      '/probe',
      { preValidation: [createUnifiedAuthMiddleware(prisma as never, { requireAuth: true })] },
      async (_request, reply) => reply.send({ ok: true })
    );
    await app.ready();
    return app;
  }

  it('401 quand le jeton REST nomme une session RÉVOQUÉE ; 200 pour la session vivante du même compte', async () => {
    const app = await buildProbe(({ where }: { where: { id: string } }) =>
      Promise.resolve(
        where.id === LIVE_SESSION_ID ? { isValid: true } :
        where.id === REVOKED_SESSION_ID ? { isValid: false } :
        null
      )
    );

    const revoked = await app.inject({
      method: 'GET',
      url: '/probe',
      headers: { authorization: `Bearer ${signJwt({ sid: REVOKED_SESSION_ID })}` },
    });
    const live = await app.inject({
      method: 'GET',
      url: '/probe',
      headers: { authorization: `Bearer ${signJwt({ sid: LIVE_SESSION_ID })}` },
    });

    await app.close();

    expect(revoked.statusCode).toBe(401);
    expect(live.statusCode).toBe(200);
    expect(live.json()).toEqual({ ok: true });
  });

  it('le refus REST ne fuit pas le motif précis — le client ne lit que le message générique existant (AUTH_FAILED)', async () => {
    const app = await buildProbe(() => Promise.resolve({ isValid: false }));

    const res = await app.inject({
      method: 'GET',
      url: '/probe',
      headers: { authorization: `Bearer ${signJwt({ sid: REVOKED_SESSION_ID })}` },
    });
    await app.close();

    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual(
      expect.objectContaining({ error: 'Invalid JWT token', code: 'AUTH_FAILED' })
    );
  });
});
