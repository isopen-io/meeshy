/**
 * #9607 — la dernière activité d'une session avance, au plus une fois par
 * quart d'heure.
 *
 * `lastActivityAt` n'avançait que si `x-session-token` accompagnait la requête
 * (`middleware/auth.ts`) — ce qu'aucun client inscrit n'envoie en REST — ou au
 * rafraîchissement, que le web n'appelle jamais. Sur le web, « dernière
 * activité » valait donc la date de création. Et quand l'en-tête était là, la
 * ligne était RÉÉCRITE à chaque requête.
 *
 * La mise à jour se fait désormais sur le `sid` du JWT, ÉCHANTILLONNÉE : au plus
 * une écriture par session et par quart d'heure, détachée de la requête.
 * Ces témoins assertent sur le nombre d'ÉCRITURES et sur la ligne écrite.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import jwt from 'jsonwebtoken';
import { AuthMiddleware } from '../../../middleware/auth';
import {
  SESSION_ACTIVITY_INTERVAL_MS,
  SessionActivitySampler,
} from '../../../services/auth/session-activity';
import { hashSessionToken } from '../../../utils/session-token';
import {
  createUserSessionStore,
  makeSession,
  type UserSessionStore,
} from '../routes/auth/user-session-store';

jest.mock('../../../services/CacheStore', () => {
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

const JWT_SECRET = 'test-secret-session-activity-9607';
const USER_ID = '507f1f77bcf86cd799439011';
const SID_A = '507f1f77bcf86cd799439041';
const SID_B = '507f1f77bcf86cd799439042';
const T0 = new Date('2026-10-08T08:00:00.000Z');
const MINUTE = 60 * 1000;

const user = {
  id: USER_ID,
  username: 'alice',
  email: 'alice@example.com',
  firstName: 'Alice',
  lastName: 'Martin',
  displayName: 'Alice',
  avatar: null,
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

function storeAt(createdAt: Date): UserSessionStore {
  return createUserSessionStore([
    makeSession({ id: SID_A, userId: USER_ID, sessionToken: hashSessionToken('tok-a'), createdAt, lastActivityAt: createdAt }),
    makeSession({ id: SID_B, userId: USER_ID, sessionToken: hashSessionToken('tok-b'), createdAt, lastActivityAt: createdAt }),
  ]);
}

function clock(start: Date) {
  let current = start.getTime();
  return {
    now: () => current,
    advance: (ms: number) => { current += ms; },
  };
}

function middlewareFor(sessions: UserSessionStore, sampler: SessionActivitySampler) {
  const prisma = { user: { findUnique: jest.fn(async () => user) }, userSession: sessions };
  return new AuthMiddleware(prisma as never, undefined, { sessionActivity: sampler });
}

const bearer = (sid: string) => `Bearer ${jwt.sign({ userId: USER_ID, username: 'alice', role: 'USER', sid }, JWT_SECRET, { expiresIn: '1h' })}`;

/** Laisse partir les écritures détachées : elles ne sont jamais attendues par la requête. */
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

describe('#9607 — la dernière activité avance sur le `sid`, échantillonnée', () => {
  beforeEach(() => {
    process.env.JWT_SECRET = JWT_SECRET;
    const { __mockStoreMap } = require('../../../services/CacheStore');
    __mockStoreMap.clear();
  });

  it('une requête REST portant seulement le JWT fait avancer `lastActivityAt` de SA session', async () => {
    const createdAt = new Date(T0.getTime() - 2 * 60 * MINUTE);
    const sessions = storeAt(createdAt);
    const horloge = clock(T0);
    const auth = middlewareFor(sessions, new SessionActivitySampler({ now: horloge.now }));

    await auth.createAuthContext(bearer(SID_A));
    await flush();

    expect(sessions.byId(SID_A).lastActivityAt.getTime()).toBe(T0.getTime());
    expect(sessions.byId(SID_B).lastActivityAt.getTime()).toBe(createdAt.getTime());
  });

  it("cinquante requêtes en dix minutes n'écrivent QU'UNE fois ; la suivante après le quart d'heure écrit de nouveau", async () => {
    const sessions = storeAt(new Date(T0.getTime() - 60 * MINUTE));
    const horloge = clock(T0);
    const auth = middlewareFor(sessions, new SessionActivitySampler({ now: horloge.now }));

    for (let i = 0; i < 50; i++) {
      await auth.createAuthContext(bearer(SID_A));
      horloge.advance(12 * 1000);
    }
    await flush();
    expect(sessions.calls.updateMany).toBe(1);
    expect(sessions.calls.update).toBe(0);

    horloge.advance(SESSION_ACTIVITY_INTERVAL_MS);
    await auth.createAuthContext(bearer(SID_A));
    await flush();
    expect(sessions.calls.updateMany).toBe(2);
    expect(sessions.byId(SID_A).lastActivityAt.getTime()).toBe(horloge.now());
  });

  it('deux sessions du même compte ont chacune leur échantillon', async () => {
    const sessions = storeAt(new Date(T0.getTime() - 60 * MINUTE));
    const auth = middlewareFor(sessions, new SessionActivitySampler({ now: clock(T0).now }));

    await auth.createAuthContext(bearer(SID_A));
    await auth.createAuthContext(bearer(SID_B));
    await auth.createAuthContext(bearer(SID_A));
    await flush();

    expect(sessions.calls.updateMany).toBe(2);
    expect(sessions.byId(SID_A).lastActivityAt.getTime()).toBe(T0.getTime());
    expect(sessions.byId(SID_B).lastActivityAt.getTime()).toBe(T0.getTime());
  });

  it("une écriture faite par une AUTRE instance il y a cinq minutes n'est pas refaite : la base porte la borne", async () => {
    const recente = new Date(T0.getTime() - 5 * MINUTE);
    const sessions = storeAt(recente);
    const auth = middlewareFor(sessions, new SessionActivitySampler({ now: clock(T0).now }));

    await auth.createAuthContext(bearer(SID_A));
    await flush();

    expect(sessions.byId(SID_A).lastActivityAt.getTime()).toBe(recente.getTime());
  });

  it("une session RÉVOQUÉE ne voit pas son activité réécrite", async () => {
    const sessions = storeAt(new Date(T0.getTime() - 60 * MINUTE));
    const sampler = new SessionActivitySampler({ now: clock(T0).now });
    const avant = sessions.byId(SID_B).lastActivityAt.getTime();
    sessions.byId(SID_B).isValid = false;

    sampler.touch(sessions, { userId: USER_ID, sessionId: SID_B });
    await flush();

    expect(sessions.byId(SID_B).lastActivityAt.getTime()).toBe(avant);
  });

  it("l'écriture ne retient pas la requête : une base qui ne répond jamais n'empêche pas l'admission", async () => {
    const pendante = {
      findFirst: jest.fn(async () => ({ isValid: true })),
      updateMany: jest.fn(() => new Promise<never>(() => undefined)),
    };
    const auth = middlewareFor(pendante as never, new SessionActivitySampler({ now: clock(T0).now }));

    const contexte = await auth.createAuthContext(bearer(SID_A));

    expect(contexte.isAuthenticated).toBe(true);
    expect(pendante.updateMany).toHaveBeenCalledTimes(1);
  });

  it("une écriture REJETÉE est rattrapée : aucun rejet non géré (Node 22 tuerait le processus)", async () => {
    const rejets: unknown[] = [];
    const ecoute = (raison: unknown) => { rejets.push(raison); };
    process.on('unhandledRejection', ecoute);
    try {
      const enPanne = {
        findFirst: jest.fn(async () => ({ isValid: true })),
        updateMany: jest.fn(async () => { throw new Error('mongo indisponible'); }),
      };
      const auth = middlewareFor(enPanne as never, new SessionActivitySampler({ now: clock(T0).now }));

      await auth.createAuthContext(bearer(SID_A));
      await flush();
      await flush();
    } finally {
      process.off('unhandledRejection', ecoute);
    }
    expect(rejets).toEqual([]);
  });

  it("avec l'en-tête `x-session-token`, c'est la session du JWT qui avance — et plus d'écriture à chaque requête", async () => {
    const createdAt = new Date(T0.getTime() - 60 * MINUTE);
    const sessions = storeAt(createdAt);
    const auth = middlewareFor(sessions, new SessionActivitySampler({ now: clock(T0).now }));

    for (let i = 0; i < 5; i++) await auth.createAuthContext(bearer(SID_A), 'tok-b');
    await flush();

    expect(sessions.calls.update).toBe(0);
    expect(sessions.calls.updateMany).toBe(1);
    expect(sessions.byId(SID_A).lastActivityAt.getTime()).toBe(T0.getTime());
    expect(sessions.byId(SID_B).lastActivityAt.getTime()).toBe(createdAt.getTime());
  });

  it('la mémoire de l’échantillonneur est BORNÉE : au-delà du plafond, la plus ancienne entrée part', () => {
    const sampler = new SessionActivitySampler({ now: clock(T0).now, maxTrackedSessions: 3 });
    const muet = { updateMany: jest.fn(async () => ({ count: 0 })) };

    ['s1', 's2', 's3', 's4'].forEach((sessionId) => sampler.touch(muet, { userId: USER_ID, sessionId }));

    expect(sampler.trackedCount()).toBe(3);
    expect(sampler.touch(muet, { userId: USER_ID, sessionId: 's4' })).toBe(false);
    expect(sampler.touch(muet, { userId: USER_ID, sessionId: 's1' })).toBe(true);
  });

  it("le contexte d'un inscrit NOMME sa session — la porte que lisent les routes de sessions", async () => {
    const sessions = storeAt(new Date(T0.getTime() - 60 * MINUTE));
    const auth = middlewareFor(sessions, new SessionActivitySampler({ now: clock(T0).now }));

    const contexte = await auth.createAuthContext(bearer(SID_B));

    expect(contexte.sessionId).toBe(SID_B);
  });
});
