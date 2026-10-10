/**
 * #9606 — la session courante se lit sur le claim `sid` du JWT.
 *
 * `GET /sessions` et `DELETE /sessions` reconnaissaient la session courante
 * par l'en-tête `x-session-token`, qu'aucun client inscrit n'envoie en REST
 * (iOS `APIClient.swift`, web `lib/api/http.ts`). Conséquences : la liste ne
 * marquait AUCUNE session comme courante, et « révoquer les autres sessions »
 * appelait `invalidateAllSessions(userId, undefined)` — l'appareil depuis
 * lequel on faisait le ménage se déconnectait lui-même.
 *
 * Ces témoins exercent la chaîne RÉELLE : le vrai middleware unifié
 * (`createUnifiedAuthMiddleware`, qui vérifie le JWT et lit `sid`), le vrai
 * `AuthService`, le vrai `SessionService`, contre un double de `userSession`
 * qui APPLIQUE les `where` (`user-session-store.ts`). Ils assertent sur
 * l'EFFET — quelle ligne reste valide, quelle requête suivante passe — jamais
 * sur un statut seul.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import jwt from 'jsonwebtoken';
import Fastify, { type FastifyInstance } from 'fastify';
import { createUnifiedAuthMiddleware } from '../../../../middleware/auth';
import { AuthService } from '../../../../services/AuthService';
import { registerMagicLinkRoutes } from '../../../../routes/auth/magic-link';
import { endCurrentSession, getUserSessions, invalidateAllSessions, logout } from '../../../../services/SessionService';
import { SessionActivitySampler } from '../../../../services/auth/session-activity';
import { hashSessionToken } from '../../../../utils/session-token';
import { createUserSessionStore, makeSession, type UserSessionStore } from './user-session-store';
import { registerLoginRoutes } from '../../../../routes/auth/login';

jest.mock('../../../../services/CacheStore', () => {
  const store = new Map<string, string>();
  const mockStore = {
    get: jest.fn(async (key: string) => store.get(key) ?? null),
    set: jest.fn(async (key: string, value: string) => { store.set(key, value); }),
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
  return { getCacheStore: jest.fn(() => mockStore), __mockStoreMap: store };
});

const JWT_SECRET = 'test-secret-current-session-9606';
const USER_ID = '507f1f77bcf86cd799439011';
const SID_TELEPHONE = '507f1f77bcf86cd799439031';
const SID_ORDINATEUR = '507f1f77bcf86cd799439032';
const SID_TABLETTE = '507f1f77bcf86cd799439033';
const TOKEN = {
  [SID_TELEPHONE]: 'raw-session-token-telephone',
  [SID_ORDINATEUR]: 'raw-session-token-ordinateur',
  [SID_TABLETTE]: 'raw-session-token-tablette',
} as const;

const user = {
  id: USER_ID,
  username: 'alice',
  email: 'alice@example.com',
  firstName: 'Alice',
  lastName: 'Martin',
  displayName: 'Alice',
  bio: null,
  avatar: null,
  banner: null,
  phoneNumber: null,
  role: 'USER',
  systemLanguage: 'fr',
  regionalLanguage: 'fr',
  customDestinationLanguage: null,
  isOnline: true,
  lastActiveAt: new Date(),
  isActive: true,
  emailVerifiedAt: new Date(),
  emailReleasedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  deviceLocale: null,
  profileCompletionRate: null,
};

function threeSessions(): UserSessionStore {
  return createUserSessionStore(
    [SID_TELEPHONE, SID_ORDINATEUR, SID_TABLETTE].map((id) =>
      makeSession({ id, userId: USER_ID, sessionToken: hashSessionToken(TOKEN[id as keyof typeof TOKEN]) })
    )
  );
}

function signFor(sid: string | undefined): string {
  const payload: Record<string, unknown> = { userId: USER_ID, username: 'alice', role: 'USER' };
  if (sid) payload.sid = sid;
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' });
}

async function buildApp(sessions: UserSessionStore): Promise<FastifyInstance> {
  const prisma = {
    user: { findUnique: jest.fn(async () => user), update: jest.fn(async () => user) },
    userSession: sessions,
  };
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', prisma as never);
  app.decorate(
    'authenticate',
    createUnifiedAuthMiddleware(prisma as never, {
      requireAuth: true,
      allowAnonymous: false,
      sessionActivity: new SessionActivitySampler(),
    })
  );
  const context = {
    fastify: app,
    authService: new AuthService(prisma as never, JWT_SECRET),
    prisma,
    redis: null,
    phoneTransferService: {},
    smsService: {},
    cacheStore: {},
  };
  registerMagicLinkRoutes(context as never);
  registerLoginRoutes(context as never);
  await app.ready();
  return app;
}

const bearer = (sid: string | undefined, extra: Record<string, string> = {}) => ({
  authorization: `Bearer ${signFor(sid)}`,
  ...extra,
});

describe('#9606 — la session courante se reconnaît par le `sid` du JWT', () => {
  beforeEach(() => {
    process.env.JWT_SECRET = JWT_SECRET;
    const { __mockStoreMap } = require('../../../../services/CacheStore');
    __mockStoreMap.clear();
  });

  it('GET /sessions marque la session nommée par le JWT, et elle seule, sans aucun en-tête', async () => {
    const app = await buildApp(threeSessions());
    const res = await app.inject({ method: 'GET', url: '/sessions', headers: bearer(SID_ORDINATEUR) });

    expect(res.statusCode).toBe(200);
    const listed = res.json().data.sessions as Array<{ id: string; isCurrentSession: boolean }>;
    expect(listed.filter((s) => s.isCurrentSession).map((s) => s.id)).toEqual([SID_ORDINATEUR]);
    await app.close();
  });

  it("DELETE /sessions révoque les AUTRES et laisse la courante valide — l'appareil qui fait le ménage reste connecté", async () => {
    const sessions = threeSessions();
    const app = await buildApp(sessions);

    const res = await app.inject({ method: 'DELETE', url: '/sessions', headers: bearer(SID_TELEPHONE) });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.revokedCount).toBe(2);
    expect(sessions.byId(SID_TELEPHONE).isValid).toBe(true);
    expect(sessions.byId(SID_ORDINATEUR).isValid).toBe(false);
    expect(sessions.byId(SID_TABLETTE).isValid).toBe(false);

    const suivante = await app.inject({ method: 'GET', url: '/sessions', headers: bearer(SID_TELEPHONE) });
    expect(suivante.statusCode).toBe(200);
    const coupee = await app.inject({ method: 'GET', url: '/sessions', headers: bearer(SID_ORDINATEUR) });
    expect(coupee.statusCode).toBe(401);
    await app.close();
  });

  it("l'en-tête `x-session-token` reste accepté : il désigne la courante quand il est seul à la nommer", async () => {
    const sessions = threeSessions();
    const authService = new AuthService({ userSession: sessions } as never, JWT_SECRET);

    const parChaine = await authService.getUserActiveSessions(USER_ID, TOKEN[SID_TABLETTE]);
    expect(parChaine.filter((s) => s.isCurrentSession).map((s) => s.id)).toEqual([SID_TABLETTE]);
    const parObjet = await getUserSessions(USER_ID, { sessionToken: TOKEN[SID_TABLETTE] });
    expect(parObjet.filter((s) => s.isCurrentSession).map((s) => s.id)).toEqual([SID_TABLETTE]);

    const count = await invalidateAllSessions(USER_ID, { sessionToken: TOKEN[SID_TABLETTE] }, 'user_revoked_all');
    expect(count).toBe(2);
    expect(sessions.byId(SID_TABLETTE).isValid).toBe(true);
  });

  it('JWT et en-tête nommant deux sessions du compte : aucune des deux n’est coupée — le porteur détient les deux', async () => {
    const sessions = threeSessions();
    const app = await buildApp(sessions);

    const res = await app.inject({
      method: 'DELETE',
      url: '/sessions',
      headers: bearer(SID_TELEPHONE, { 'x-session-token': TOKEN[SID_TABLETTE] }),
    });

    expect(res.statusCode).toBe(200);
    expect(sessions.byId(SID_TELEPHONE).isValid).toBe(true);
    expect(sessions.byId(SID_TABLETTE).isValid).toBe(true);
    expect(sessions.byId(SID_ORDINATEUR).isValid).toBe(false);
    await app.close();
  });

  it("un ancien jeton SANS `sid` n'atteint pas la route — refusé à la porte, rien n'est révoqué", async () => {
    const sessions = threeSessions();
    const app = await buildApp(sessions);

    const res = await app.inject({ method: 'DELETE', url: '/sessions', headers: bearer(undefined) });

    expect(res.statusCode).toBe(401);
    expect(sessions.rows.every((s) => s.isValid)).toBe(true);
    await app.close();
  });

  it('POST /logout ferme la session nommée par le JWT, sans en-tête — la jumelle du même défaut', async () => {
    const sessions = threeSessions();
    const app = await buildApp(sessions);

    const res = await app.inject({ method: 'POST', url: '/logout', headers: bearer(SID_ORDINATEUR) });

    expect(res.statusCode).toBe(200);
    expect(sessions.byId(SID_ORDINATEUR).isValid).toBe(false);
    expect(sessions.byId(SID_ORDINATEUR).invalidatedReason).toBe('logout');
    expect(sessions.byId(SID_TELEPHONE).isValid).toBe(true);
    expect(sessions.byId(SID_TABLETTE).isValid).toBe(true);
    await app.close();
  });

  it("POST /logout ne ferme jamais la session d'un AUTRE compte, même nommée par l'en-tête (audit P2)", async () => {
    const sessions = threeSessions();
    const AUTRE_COMPTE = '507f1f77bcf86cd7994390ff';
    sessions.rows.push(makeSession({ id: '507f1f77bcf86cd799439099', userId: AUTRE_COMPTE, sessionToken: hashSessionToken('jeton-d-autrui') }));
    const app = await buildApp(sessions);

    const res = await app.inject({
      method: 'POST',
      url: '/logout',
      headers: bearer(SID_TELEPHONE, { 'x-session-token': 'jeton-d-autrui' }),
    });

    expect(res.statusCode).toBe(200);
    expect(sessions.byId('507f1f77bcf86cd799439099').isValid).toBe(true);
    expect(sessions.byId(SID_TELEPHONE).isValid).toBe(false);
    await app.close();
  });

  it("endCurrentSession est borné au compte : un `sid` d'un autre compte ne ferme rien (audit A3, M3)", async () => {
    const sessions = threeSessions();
    new AuthService({ userSession: sessions } as never, JWT_SECRET);

    const fermees = await endCurrentSession('507f1f77bcf86cd7994390ff', { sessionId: SID_TABLETTE });

    expect(fermees).toBe(0);
    expect(sessions.byId(SID_TABLETTE).isValid).toBe(true);
  });

  it('logout() par jeton brut reste disponible (compatibilité de l’en-tête)', async () => {
    const sessions = threeSessions();
    new AuthService({ userSession: sessions } as never, JWT_SECRET);
    expect(await logout(TOKEN[SID_TABLETTE])).toBe(true);
    expect(sessions.byId(SID_TABLETTE).isValid).toBe(false);
  });
});
