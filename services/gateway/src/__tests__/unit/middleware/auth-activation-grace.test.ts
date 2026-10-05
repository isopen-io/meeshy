/**
 * Le délai de grâce de l'adresse à la porte de TOUTE requête authentifiée
 * (#8238) : passé 28 jours sans preuve et sans numéro, une session existante
 * est refusée — `401 ACCOUNT_ACTIVATION_REQUIRED` —, et la prochaine connexion
 * mène au code d'activation. Avant, elle passe, et le middleware porte l'état
 * `activation` que `GET /me` sert.
 *
 * Horloge INJECTÉE (`options.now`) : jamais l'horloge murale.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import jwt from 'jsonwebtoken';
import Fastify from 'fastify';

jest.mock('../../../services/CacheStore', () => {
  const store = new Map<string, string>();
  const mockStore = {
    get: jest.fn(async (key: string) => store.get(key) ?? null),
    set: jest.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
    del: jest.fn(async (key: string) => {
      store.delete(key);
    }),
  };
  return { getCacheStore: jest.fn(() => mockStore), __mockStoreMap: store };
});

import { AuthMiddleware, ActivationBlockedError, createUnifiedAuthMiddleware } from '../../../middleware/auth';
import { ACTIVATION_GRACE_EPOCH } from '../../../services/auth/account-activation';

const JWT_SECRET = 'test-secret-activation-grace-8238';
const USER_ID = '507f1f77bcf86cd799439011';
const DAY_MS = 24 * 60 * 60 * 1000;
const CREATED = new Date(ACTIVATION_GRACE_EPOCH.getTime() + DAY_MS);
const jour = (n: number): Date => new Date(CREATED.getTime() + n * DAY_MS);

const compte = (overrides: Record<string, unknown> = {}) => ({
  id: USER_ID,
  username: 'lena',
  email: 'lena@example.com',
  firstName: 'Lena',
  lastName: 'Vogel',
  displayName: 'Lena Vogel',
  avatar: null,
  phoneNumber: null,
  role: 'USER',
  systemLanguage: 'fr',
  regionalLanguage: 'fr',
  customDestinationLanguage: null,
  isOnline: true,
  lastActiveAt: CREATED,
  isActive: true,
  emailVerifiedAt: null,
  emailReleasedAt: null,
  createdAt: CREATED,
  updatedAt: CREATED,
  deviceLocale: null,
  ...overrides,
});

const prismaFor = (ligne: Record<string, unknown>) =>
  ({
    user: { findUnique: jest.fn(async () => ligne) },
    userSession: { findFirst: jest.fn(async () => ({ isValid: true })), update: jest.fn(async () => ({})) },
    participant: { findFirst: jest.fn(async () => null) },
  }) as never;

const bearer = (): string =>
  `Bearer ${jwt.sign({ userId: USER_ID, username: 'lena', role: 'USER', sid: 'sess-1' }, JWT_SECRET, { expiresIn: '1h' })}`;

beforeEach(() => {
  process.env.JWT_SECRET = JWT_SECRET;
  const { __mockStoreMap } = jest.requireMock('../../../services/CacheStore') as { __mockStoreMap: Map<string, string> };
  __mockStoreMap.clear();
});

describe('AuthMiddleware — une session existante sous le délai de grâce', () => {
  it('J10 (`invite`) : admise, et le contexte porte l’état servi par `GET /me`', async () => {
    const middleware = new AuthMiddleware(prismaFor(compte()), undefined, { now: () => jour(10) });

    const ctx = await middleware.createAuthContext(bearer());

    expect(ctx.isAuthenticated).toBe(true);
    expect(ctx.registeredUser?.activation).toEqual({ phase: 'invite', deadline: jour(28).toISOString(), missing: ['email', 'phone'] });
  });

  it('J28 (`blocked`) : refusée par une erreur NOMMÉE', async () => {
    const middleware = new AuthMiddleware(prismaFor(compte()), undefined, { now: () => jour(28) });

    await expect(middleware.createAuthContext(bearer())).rejects.toBeInstanceOf(ActivationBlockedError);
  });

  it('J28 servi depuis le CACHE d’auth : refusée aussi', async () => {
    const prisma = prismaFor(compte());
    await new AuthMiddleware(prisma, undefined, { now: () => jour(1) }).createAuthContext(bearer());

    const plusTard = new AuthMiddleware(prisma, undefined, { now: () => jour(30) });
    await expect(plusTard.createAuthContext(bearer())).rejects.toBeInstanceOf(ActivationBlockedError);
  });

  it('un compte qui porte un numéro n’est jamais refusé', async () => {
    const middleware = new AuthMiddleware(prismaFor(compte({ phoneNumber: '+33612345678' })), undefined, { now: () => jour(400) });

    const ctx = await middleware.createAuthContext(bearer());

    expect(ctx.isAuthenticated).toBe(true);
  });

  it('une adresse prouvée n’est jamais refusée', async () => {
    const middleware = new AuthMiddleware(prismaFor(compte({ emailVerifiedAt: jour(2) })), undefined, { now: () => jour(400) });

    const ctx = await middleware.createAuthContext(bearer());

    expect(ctx.registeredUser?.activation?.phase).toBe('done');
  });
});

describe('createUnifiedAuthMiddleware — la réponse d’une route authentifiée', () => {
  const monter = async (maintenant: Date) => {
    const app = Fastify({ logger: false });
    app.get('/protegee', { preValidation: [createUnifiedAuthMiddleware(prismaFor(compte()), { requireAuth: true, now: () => maintenant })] }, async () => ({ ok: true }));
    await app.ready();
    return app;
  };

  it('J28 : 401 `ACCOUNT_ACTIVATION_REQUIRED`, jamais le 401 générique', async () => {
    const app = await monter(jour(28));

    const res = await app.inject({ method: 'GET', url: '/protegee', headers: { authorization: bearer() } });

    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ success: false, code: 'ACCOUNT_ACTIVATION_REQUIRED' });
    await app.close();
  });

  it('J27 : la route répond', async () => {
    const app = await monter(jour(27));

    const res = await app.inject({ method: 'GET', url: '/protegee', headers: { authorization: bearer() } });

    expect(res.statusCode).toBe(200);
    await app.close();
  });
});
