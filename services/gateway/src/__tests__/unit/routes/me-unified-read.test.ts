/**
 * Témoins HTTP de bout en bout — la lecture de soi est UNE route (#4178).
 *
 * Monte les DEUX adresses réelles — `GET /api/v1/me` (routes/me/index.ts) et
 * l'alias déprécié `GET /api/v1/auth/me` (routes/auth/magic-link.ts) — sous
 * leurs préfixes de PRODUCTION, avec le VRAI `createUnifiedAuthMiddleware`
 * (non mocké : c'est la garde `allowAnonymous` elle-même qu'on veut exercer,
 * cf. § « le second témoin qui compte ») et le VRAI hook `conditionalGetOnSend`
 * (`server.ts:326`).
 *
 * ─── Le second témoin qui compte (critère 6 de #4178) ─────────────────────
 *
 * Avant ce lot, `GET /auth/me` était monté avec
 * `createUnifiedAuthMiddleware(prisma, { requireAuth: true })` — SANS
 * `allowAnonymous`. Lu contre la garde de `middleware/auth.ts`
 * (`!options.allowAnonymous && authContext.isAnonymous && authContext.type
 * !== 'user'`), un porteur de `X-Session-Token` SEUL (sans JWT) y était
 * REFUSÉ EN 403 avant d'atteindre le handler — la branche anonyme du handler
 * était du code MORT. La suite historique de `auth/magic-link.ts`
 * (`__tests__/unit/routes/auth/magic-link.test.ts`) ne pouvait pas le voir :
 * elle MOCKE `createUnifiedAuthMiddleware` et injecte `authContext`
 * directement, contournant la garde qu'elle prétend exercer. C'est
 * exactement la mise en garde du critère 6 : « au rang JWT, une route
 * régressée vers "authentifié seulement" rendrait le même verdict qu'une
 * route juste » — le témoin qui compte est donc celui-ci, sur le porteur de
 * session, avec la VRAIE garde.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach, afterAll } from '@jest/globals';
import jwt from 'jsonwebtoken';
import Fastify, { FastifyInstance } from 'fastify';

// ─── CacheStore — même fabrique en mémoire que middleware/auth.test.ts,
//     pour ne PAS dépendre d'un Redis réel et ne pas polluer entre tests ────

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

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }) },
}));
jest.mock('../../../utils/logger-enhanced.js', () => ({
  enhancedLogger: { child: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }) },
}));
jest.mock('../../../utils/logger', () => ({ logError: jest.fn() }));
jest.mock('../../../utils/socket-broadcast', () => ({ broadcastToUser: jest.fn() }));
jest.mock('../../../routes/me/delete-account', () => ({ deleteAccountRoutes: jest.fn(async () => {}) }));
jest.mock('../../../routes/me/export', () => ({ dataExportRoutes: jest.fn(async () => {}) }));
jest.mock('../../../services/ConsentValidationService', () => ({
  ConsentValidationService: jest.fn().mockImplementation(() => ({ validatePreferences: jest.fn<any>().mockResolvedValue([]) })),
}));
jest.mock('../../../utils/withMutationLog', () => ({
  ...(jest.requireActual('../../../utils/withMutationLog') as object),
  withMutationLog: jest.fn<any>(({ op }: { op: () => Promise<any> }) => op()),
}));

// ─── Imports après les mocks ─────────────────────────────────────────────────

import meRoutes from '../../../routes/me/index';
import { registerMagicLinkRoutes } from '../../../routes/auth/magic-link';
import { conditionalGetOnSend } from '../../../utils/etag';
import { resetCacheStore } from '../../../services/CacheStore';

const JWT_SECRET = 'test-secret-me-unified-4178';
const USER_ID = '507f1f77bcf86cd799439011';
const PREFIXE_ME = '/api/v1/me';
const PREFIXE_AUTH = '/api/v1/auth';

function registeredUserRow(overrides: Record<string, unknown> = {}) {
  return {
    id: USER_ID,
    username: 'alice',
    email: 'alice@example.com',
    firstName: 'Alice',
    lastName: 'Wonder',
    displayName: 'Alice Wonder',
    bio: null,
    avatar: null,
    banner: null,
    phoneNumber: null,
    role: 'USER',
    isActive: true,
    systemLanguage: 'fr',
    regionalLanguage: 'en',
    customDestinationLanguage: null,
    isOnline: true,
    lastActiveAt: new Date('2026-08-01T00:00:00.000Z'),
    emailVerifiedAt: new Date('2026-01-01T00:00:00.000Z'),
    createdAt: new Date('2025-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-08-01T00:00:00.000Z'),
    deviceLocale: null,
    profileCompletionRate: 80,
    ...overrides,
  };
}

function anonymousParticipantRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'participant-anon-1',
    conversationId: 'conv-1',
    type: 'anonymous',
    displayName: 'Visiteur',
    avatar: null,
    role: 'member',
    language: 'es',
    permissions: {
      canSendMessages: true, canSendFiles: false, canSendImages: false,
      canSendVideos: false, canSendAudios: false, canSendLocations: false, canSendLinks: false,
    },
    isActive: true,
    isOnline: true,
    lastActiveAt: new Date(),
    nickname: null,
    anonymousSession: { profile: { username: 'anon-user', firstName: null, lastName: null }, shareLinkId: 'link-1' },
    ...overrides,
  };
}

function buildPrisma() {
  return {
    user: { findUnique: jest.fn<any>().mockResolvedValue(registeredUserRow()) },
    participant: { findFirst: jest.fn<any>().mockResolvedValue(anonymousParticipantRow()) },
    userSession: {
      findFirst: jest.fn<any>().mockResolvedValue(null),
      update: jest.fn<any>().mockResolvedValue({}),
    },
    signalPreKeyBundle: {
      findUnique: jest.fn<any>().mockResolvedValue({ registrationId: 4242, isActive: true, lastRotatedAt: new Date('2026-03-04T05:06:07.000Z') }),
    },
    // Mounted (but unused by the tests below) so that `meRoutes`'s sibling
    // sub-plugins (preferences/export/delete-account) can register without
    // throwing on a missing model — same shape proven by
    // `identity-twins-retired.test.ts`.
    userPreferences: { findUnique: jest.fn<any>().mockResolvedValue(null) },
    userPreference: { findMany: jest.fn<any>().mockResolvedValue([]) },
    userConversationCategory: { findMany: jest.fn<any>().mockResolvedValue([]), count: jest.fn<any>().mockResolvedValue(0) },
    $transaction: jest.fn<any>().mockResolvedValue([]),
  } as any;
}

function signJwt(userId: string = USER_ID): string {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '1h' });
}

let app: FastifyInstance;
let prisma: ReturnType<typeof buildPrisma>;

async function buildApp(): Promise<{ app: FastifyInstance; prisma: ReturnType<typeof buildPrisma> }> {
  process.env.JWT_SECRET = JWT_SECRET;
  const fastify = Fastify({ logger: false, ajv: { customOptions: { strict: false, keywords: ['example'] } } });
  const p = buildPrisma();
  fastify.decorate('prisma', p);
  // Décorateur JWT-seul historique — requis par les AUTRES routes de
  // `auth/magic-link.ts` (GET/DELETE /sessions) pour s'ENREGISTRER ; aucun
  // test ci-dessous ne l'exerce (GET /me n'en dépend plus, précisément parce
  // qu'il accepte aussi une session anonyme, cf. § « le second témoin »).
  fastify.decorate('authenticate', async () => {});

  // Le hook GLOBAL réel (server.ts:326) — sans lui, aucun test de 304 ne
  // mesurerait quoi que ce soit de réel.
  fastify.addHook('onSend', conditionalGetOnSend);

  await fastify.register(meRoutes, { prefix: PREFIXE_ME });

  await fastify.register(async (instance) => {
    registerMagicLinkRoutes({
      fastify: instance,
      authService: {} as any,
      phoneTransferService: {} as any,
      smsService: {} as any,
      cacheStore: {} as any,
      redis: null,
      prisma: p,
    });
  }, { prefix: PREFIXE_AUTH });

  await fastify.ready();
  return { app: fastify, prisma: p };
}

beforeEach(async () => {
  resetCacheStore();
  ({ app, prisma } = await buildApp());
});

afterAll(async () => {
  if (app) await app.close();
});

// ═════════════════════════════════════════════════════════════════════════
// Critère 1 — S2 : JWT OU session anonyme, LA MÊME route
// ═════════════════════════════════════════════════════════════════════════

describe('GET /api/v1/me — JWT (utilisateur enregistré)', () => {
  it('rend 200 et le profil complet, sans second findUnique (authContext.registeredUser suffit)', async () => {
    const res = await app.inject({ method: 'GET', url: PREFIXE_ME, headers: { authorization: `Bearer ${signJwt()}` } });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.user).toMatchObject({
      id: USER_ID,
      username: 'alice',
      email: 'alice@example.com',
      role: 'USER',
      displayName: 'Alice Wonder',
    });
    // Le gain visé par #4178 : la lecture de soi ne relit pas `User` une
    // deuxième fois — `authContext.registeredUser` (posé par le middleware)
    // suffit. `findUnique` n'est appelé QUE par le middleware lui-même.
    expect(prisma.user.findUnique).toHaveBeenCalledTimes(1);
  });

  it('sert des permissions ADMIN pour un rôle ADMIN — via servedUserPermissions, la loi centrale', async () => {
    prisma.user.findUnique.mockResolvedValueOnce(registeredUserRow({ role: 'ADMIN' }));
    const res = await app.inject({ method: 'GET', url: PREFIXE_ME, headers: { authorization: `Bearer ${signJwt()}` } });
    expect(res.json().data.user.permissions.canAccessAdmin).toBe(true);
  });

  it('ne transporte pas passwordHash même quand la ligne User en base en porte un — défense en profondeur, formatUserResponse ET le schéma (témoin du schéma seul plus bas, get-me.test.ts)', async () => {
    // `passwordHash` : le genre de colonne qu'une ligne `User` réelle porte
    // et qu'un schéma de réponse ne déclare jamais. Ici il arrive par
    // `authContext.registeredUser` lui-même (le middleware pourrait un jour
    // élargir son `select`) — ce témoin HTTP prouve l'observable de bout en
    // bout ; il ne distingue pas laquelle des DEUX gardes agit
    // (`formatUserResponse` ne recopie pas ce champ, PUIS `meUserSchema`
    // (fast-json-stringify) le retirerait de toute façon s'il survivait) —
    // c'est `get-me.test.ts` § « meUserSchema » qui isole la seconde garde
    // SEULE, en contournant `formatUserResponse`.
    prisma.user.findUnique.mockResolvedValueOnce(
      registeredUserRow({ passwordHash: '$2b$10$secretbcrypthash' })
    );
    const res = await app.inject({ method: 'GET', url: PREFIXE_ME, headers: { authorization: `Bearer ${signJwt()}` } });
    const user = res.json().data.user;
    expect(user.passwordHash).toBeUndefined();
    expect('passwordHash' in user).toBe(false);
  });
});

describe('GET /api/v1/me — X-Session-Token (participant anonyme) — LE TÉMOIN QUI COMPTE', () => {
  it('rend 200 avec role: "ANONYMOUS" — la VRAIE garde createUnifiedAuthMiddleware(…, {allowAnonymous:true}) laisse passer', async () => {
    const res = await app.inject({ method: 'GET', url: PREFIXE_ME, headers: { 'x-session-token': 'session-anonyme-1' } });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.user.role).toBe('ANONYMOUS');
    expect(body.data.user.id).toBe('participant-anon-1');
  });
});

describe('GET /api/v1/me — sans porteur', () => {
  it('rend 401', async () => {
    const res = await app.inject({ method: 'GET', url: PREFIXE_ME });
    expect(res.statusCode).toBe(401);
  });
});

// ═════════════════════════════════════════════════════════════════════════
// Critère 2 — ?fields= et ?expand=security
// ═════════════════════════════════════════════════════════════════════════

describe('GET /api/v1/me?fields=', () => {
  it('ne rend que les champs demandés', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `${PREFIXE_ME}?fields=id,username,role`,
      headers: { authorization: `Bearer ${signJwt()}` },
    });
    expect(res.statusCode).toBe(200);
    expect(Object.keys(res.json().data.user).sort()).toEqual(['id', 'role', 'username']);
  });
});

describe('GET /api/v1/me?expand=security', () => {
  it('ajoute { hasSignalKeys, signalRegistrationId, lastKeyRotation } — exactement la forme de GET /me/preferences/encryption', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `${PREFIXE_ME}?expand=security`,
      headers: { authorization: `Bearer ${signJwt()}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.user.security).toEqual({
      hasSignalKeys: true,
      signalRegistrationId: 4242,
      lastKeyRotation: '2026-03-04T05:06:07.000Z',
    });
  });

  it("expand=security s'ajoute MÊME quand ?fields= ne le nomme pas — la source combine les deux (fields=id,username,displayName,avatar,role&expand=security)", async () => {
    const res = await app.inject({
      method: 'GET',
      url: `${PREFIXE_ME}?fields=id,username,displayName,avatar,role&expand=security`,
      headers: { authorization: `Bearer ${signJwt()}` },
    });
    const user = res.json().data.user;
    expect(Object.keys(user).sort()).toEqual(['avatar', 'displayName', 'id', 'role', 'security', 'username']);
    expect(user.security.hasSignalKeys).toBe(true);
  });

  it('un participant anonyme sert security sans DB — jamais de clés Signal (CLAUDE.md « Anonymous users have NO encryption »)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `${PREFIXE_ME}?expand=security`,
      headers: { 'x-session-token': 'session-anonyme-1' },
    });
    expect(res.json().data.user.security).toEqual({ hasSignalKeys: false, signalRegistrationId: null, lastKeyRotation: null });
    expect(prisma.signalPreKeyBundle.findUnique).not.toHaveBeenCalled();
  });
});

// ═════════════════════════════════════════════════════════════════════════
// Critère 6 — le 304 se prouve sur l'ETag RÉELLEMENT rendu par la 1re requête
// ═════════════════════════════════════════════════════════════════════════

describe('GET /api/v1/me — conditionalGetOnSend (ETag/304 réels)', () => {
  it('pose un ETag sur la 1re réponse, et rend 304 sur la 2e avec ce MÊME If-None-Match', async () => {
    const headers = { authorization: `Bearer ${signJwt()}` };
    const first = await app.inject({ method: 'GET', url: PREFIXE_ME, headers });
    expect(first.statusCode).toBe(200);
    const etag = first.headers.etag as string;
    expect(etag).toBeTruthy();

    const second = await app.inject({ method: 'GET', url: PREFIXE_ME, headers: { ...headers, 'if-none-match': etag } });
    expect(second.statusCode).toBe(304);
    expect(second.body).toBe('');
  });

  it("un ETag FABRIQUÉ (pas celui rendu par le serveur) ne déclenche PAS de 304 — le témoin n'est pas toujours vert", async () => {
    const headers = { authorization: `Bearer ${signJwt()}` };
    const res = await app.inject({ method: 'GET', url: PREFIXE_ME, headers: { ...headers, 'if-none-match': '"etag-invente-a-la-main"' } });
    expect(res.statusCode).toBe(200);
  });
});

// ═════════════════════════════════════════════════════════════════════════
// Critère 3 — GET /api/v1/auth/me est un ALIAS : même calcul, en-têtes en plus
// ═════════════════════════════════════════════════════════════════════════

describe('GET /api/v1/auth/me — alias déprécié', () => {
  it('rend le MÊME data.user que GET /api/v1/me pour le même appelant — un seul calcul, deux adresses', async () => {
    const headers = { authorization: `Bearer ${signJwt()}` };
    const target = await app.inject({ method: 'GET', url: PREFIXE_ME, headers });
    const alias = await app.inject({ method: 'GET', url: `${PREFIXE_AUTH}/me`, headers });
    expect(alias.statusCode).toBe(200);
    expect(alias.json().data.user).toEqual(target.json().data.user);
  });

  it('porte Deprecation + Sunset + Link (successor-version → /api/v1/me) — RFC 9745, pas le booléen du brouillon 2019', async () => {
    const res = await app.inject({ method: 'GET', url: `${PREFIXE_AUTH}/me`, headers: { authorization: `Bearer ${signJwt()}` } });
    expect(res.headers.deprecation).toMatch(/^@\d+$/);
    expect(res.headers.sunset).toBeTruthy();
    expect(res.headers.link).toContain('</api/v1/me>; rel="successor-version"');
  });

  it("annonce la dépréciation MÊME sur la branche 401 — l'appelant qui a le plus besoin de migrer ne doit pas être privé de l'info", async () => {
    const res = await app.inject({ method: 'GET', url: `${PREFIXE_AUTH}/me` });
    expect(res.statusCode).toBe(401);
    expect(res.headers.deprecation).toMatch(/^@\d+$/);
  });

  it('sert aussi le porteur de session anonyme — le défaut préexistant (403 avant handler) est corrigé sur les DEUX adresses', async () => {
    const res = await app.inject({ method: 'GET', url: `${PREFIXE_AUTH}/me`, headers: { 'x-session-token': 'session-anonyme-1' } });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.user.role).toBe('ANONYMOUS');
  });

  it("GET /api/v1/me (la cible) NE porte PAS l'en-tête Deprecation — seul l'alias est en sursis", async () => {
    const res = await app.inject({ method: 'GET', url: PREFIXE_ME, headers: { authorization: `Bearer ${signJwt()}` } });
    expect(res.headers.deprecation).toBeUndefined();
  });
});

// ═════════════════════════════════════════════════════════════════════════
// Critère 4 — les deux jumelles retirées restent 404 sous ce montage aussi
// (couverture complémentaire à route-auth-coverage.test.ts, qui lit le
// serveur ASSEMBLÉ ; ici, le montage direct du plugin)
// ═════════════════════════════════════════════════════════════════════════

describe('Adresses retirées — pas de résurrection sous ce montage', () => {
  it('GET /api/v1/me/me (segment doublé, #4141) rend 404', async () => {
    const res = await app.inject({ method: 'GET', url: `${PREFIXE_ME}/me`, headers: { authorization: `Bearer ${signJwt()}` } });
    expect(res.statusCode).toBe(404);
  });
});
