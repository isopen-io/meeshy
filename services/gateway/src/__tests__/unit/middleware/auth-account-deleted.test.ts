/**
 * #10264 — la porte de toute requête authentifiée dit « compte supprimé »
 * (`401 ACCOUNT_DELETED`) au porteur d'un jeton SIGNÉ d'un compte supprimé, et
 * seulement à lui. Même statut qu'avant : un ancien client ne lit que le 401.
 * Un jeton expiré, forgé, ou d'un compte simplement désactivé garde le 401
 * générique — c'est ce qui permet à un client de purger les données locales
 * de CE compte sans jamais les purger sur une simple expiration.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import jwt from 'jsonwebtoken';
import Fastify from 'fastify';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';

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

import { AuthMiddleware, AccountDeletedError, createUnifiedAuthMiddleware } from '../../../middleware/auth';

const JWT_SECRET = 'test-secret-account-deleted-10264';
const USER_ID = '507f1f77bcf86cd799439011';
const DELETED_AT = new Date('2026-10-01T00:00:00Z');

const compte = (overrides: Record<string, unknown> = {}) => ({
  id: USER_ID,
  username: 'lena',
  email: 'lena@example.com',
  firstName: 'Lena',
  lastName: 'Vogel',
  displayName: 'Lena Vogel',
  avatar: null,
  phoneNumber: '+33612345678',
  role: 'USER',
  systemLanguage: 'fr',
  regionalLanguage: 'fr',
  customDestinationLanguage: null,
  isOnline: false,
  lastActiveAt: DELETED_AT,
  isActive: true,
  deletedAt: null,
  emailVerifiedAt: DELETED_AT,
  emailReleasedAt: null,
  createdAt: DELETED_AT,
  updatedAt: DELETED_AT,
  deviceLocale: null,
  ...overrides,
});

// La purge CONFIRMÉE : seule preuve d'une suppression irréversible. Elle
// SUPPRIME les sessions du compte : le jeton nomme une session absente (#10493).
const supprime = () => compte({ isActive: false, deletedAt: DELETED_AT, demandes: ['COMPLETED'], session: null });
const graceExpiree = () => compte({ isActive: false, deletedAt: DELETED_AT, demandes: ['GRACE_PERIOD_EXPIRED'] });
const suppressionDeModeration = () => compte({ isActive: false, deactivatedAt: DELETED_AT, deletedAt: DELETED_AT, deletedBy: 'admin-id' });

const prismaFor = (ligne: Record<string, unknown> | null) => {
  const vivante = { isValid: true, expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) };
  const { demandes = [], session = vivante, ...colonnes } = (ligne ?? {}) as { demandes?: string[]; session?: unknown };
  const findUnique = jest.fn(async () => (ligne ? colonnes : null));
  return {
    prisma: {
      user: { findUnique },
      accountDeletionRequest: {
        findFirst: jest.fn(async ({ where }: { where: { status: string } }) => (demandes.includes(where.status) ? { id: 'req-1' } : null)),
      },
      userSession: { findFirst: jest.fn(async () => session), update: jest.fn(async () => ({})) },
      participant: { findFirst: jest.fn(async () => null) },
    } as never,
    findUnique,
  };
};

const signe = (options: jwt.SignOptions = { expiresIn: '1h' }, secret = JWT_SECRET): string =>
  jwt.sign({ userId: USER_ID, username: 'lena', role: 'USER', sid: '507f1f77bcf86cd799439031' }, secret, options);

const monter = async (ligne: Record<string, unknown> | null) => {
  const app = Fastify({ logger: false });
  app.get(
    '/protegee',
    {
      schema: { response: { 401: errorResponseSchema } },
      preValidation: [createUnifiedAuthMiddleware(prismaFor(ligne).prisma, { requireAuth: true })],
    },
    async () => ({ ok: true }),
  );
  await app.ready();
  return app;
};

const appeler = async (ligne: Record<string, unknown> | null, jeton: string) => {
  const app = await monter(ligne);
  const res = await app.inject({ method: 'GET', url: '/protegee', headers: { authorization: `Bearer ${jeton}` } });
  await app.close();
  return res;
};

beforeEach(() => {
  process.env.JWT_SECRET = JWT_SECRET;
  const { __mockStoreMap } = jest.requireMock('../../../services/CacheStore') as { __mockStoreMap: Map<string, string> };
  __mockStoreMap.clear();
});

describe('AuthMiddleware — un jeton signé d’un compte supprimé', () => {
  it('refuse par une erreur NOMMÉE qui porte l’identifiant du compte du jeton', async () => {
    const middleware = new AuthMiddleware(prismaFor(supprime()).prisma);

    const refus = await middleware.createAuthContext(`Bearer ${signe()}`).catch((e: unknown) => e);

    expect(refus).toBeInstanceOf(AccountDeletedError);
    expect((refus as AccountDeletedError).accountId).toBe(USER_ID);
  });

  it('un compte désactivé sans suppression reste un refus générique', async () => {
    const middleware = new AuthMiddleware(prismaFor(compte({ isActive: false })).prisma);

    const refus = await middleware.createAuthContext(`Bearer ${signe()}`).catch((e: unknown) => e);

    expect(refus).not.toBeInstanceOf(AccountDeletedError);
  });
});

describe('createUnifiedAuthMiddleware — la réponse servie, à travers le sérialiseur', () => {
  it('compte supprimé : 401 `ACCOUNT_DELETED` qui NOMME le compte du jeton', async () => {
    const res = await appeler(supprime(), signe());

    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ success: false, code: 'ACCOUNT_DELETED', accountId: USER_ID });
  });

  it.each([
    ['grâce expirée, encore annulable', graceExpiree],
    ['suppression de modération, annulable par restoreUser', suppressionDeModeration],
  ])('%s : 401 `AUTH_FAILED`, jamais « supprimé »', async (_cas, ligne) => {
    const res = await appeler(ligne(), signe());

    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ code: 'AUTH_FAILED' });
  });

  it('compte désactivé (non supprimé) : 401 `AUTH_FAILED`, comme avant', async () => {
    const res = await appeler(compte({ isActive: false }), signe());

    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ code: 'AUTH_FAILED' });
  });

  it('jeton EXPIRÉ d’un compte supprimé : 401 `AUTH_FAILED` — l’expiration ne dit rien du compte', async () => {
    const res = await appeler(supprime(), signe({ expiresIn: -60 }));

    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ code: 'AUTH_FAILED' });
  });

  it('jeton FORGÉ au nom d’un compte supprimé : 401 `AUTH_FAILED`, et la ligne n’est jamais lue', async () => {
    const { prisma, findUnique } = prismaFor(supprime());
    const app = Fastify({ logger: false });
    app.get('/protegee', { preValidation: [createUnifiedAuthMiddleware(prisma, { requireAuth: true })] }, async () => ({ ok: true }));
    await app.ready();

    const res = await app.inject({ method: 'GET', url: '/protegee', headers: { authorization: `Bearer ${signe({ expiresIn: '1h' }, 'autre-secret')}` } });
    await app.close();

    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ code: 'AUTH_FAILED' });
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('compte actif : la route répond', async () => {
    const res = await appeler(compte(), signe());

    expect(res.statusCode).toBe(200);
  });
});
