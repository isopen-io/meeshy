/**
 * #10493 — le jeton du lien « ce n'était pas moi » n'ouvre pas le REST, sous
 * aucune de ses deux formes, même quand le compte a une session vivante.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import jwt from 'jsonwebtoken';
import { signRevokeAllLinkToken } from '../../../services/auth/revoke-all-link-token';

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

import { AuthMiddleware } from '../../../middleware/auth';

const JWT_SECRET = 'test-secret-revoke-all-link-rest-0123456789';
const USER_ID = '507f1f77bcf86cd799439011';

const SINCE = new Date('2026-10-01T00:00:00Z');
const COMPTE = {
  id: USER_ID, username: 'lena', email: 'lena@example.com', firstName: 'Lena', lastName: 'Vogel', displayName: 'Lena Vogel',
  avatar: null, phoneNumber: null, role: 'USER', systemLanguage: 'fr', regionalLanguage: 'fr', customDestinationLanguage: null,
  isOnline: false, lastActiveAt: SINCE, isActive: true, deletedAt: null, emailVerifiedAt: SINCE, emailReleasedAt: null,
  createdAt: SINCE, updatedAt: SINCE, deviceLocale: null,
};

const prismaWithLiveSession = () =>
  ({
    user: { findUnique: jest.fn(async () => COMPTE) },
    accountDeletionRequest: { findFirst: jest.fn(async () => null) },
    userSession: {
      findFirst: jest.fn(async () => ({ isValid: true, expiresAt: new Date(Date.now() + 3_600_000) })),
      update: jest.fn(async () => ({})),
    },
    participant: { findFirst: jest.fn(async () => null) },
  }) as never;

beforeEach(() => {
  process.env.JWT_SECRET = JWT_SECRET;
  const { __mockStoreMap } = jest.requireMock('../../../services/CacheStore') as { __mockStoreMap: Map<string, string> };
  __mockStoreMap.clear();
});

describe('REST — le jeton du lien « ce n’était pas moi » n’authentifie rien (#10493)', () => {
  it('refuse l’ancienne forme, signée avec JWT_SECRET', async () => {
    const legacy = jwt.sign({ userId: USER_ID, action: 'revoke-all' }, JWT_SECRET, { expiresIn: '24h' });
    const middleware = new AuthMiddleware(prismaWithLiveSession());

    await expect(middleware.createAuthContext(`Bearer ${legacy}`)).rejects.toBeDefined();
  });

  it('refuse l’ancienne forme même munie d’un `sid` vivant', async () => {
    const forged = jwt.sign({ userId: USER_ID, action: 'revoke-all', sid: '507f1f77bcf86cd799439022' }, JWT_SECRET, { expiresIn: '24h' });
    const middleware = new AuthMiddleware(prismaWithLiveSession());

    await expect(middleware.createAuthContext(`Bearer ${forged}`)).rejects.toBeDefined();
  });

  it('refuse la nouvelle forme, dont la signature ne se vérifie pas avec JWT_SECRET', async () => {
    const link = signRevokeAllLinkToken({ userId: USER_ID, jwtSecret: JWT_SECRET });
    const middleware = new AuthMiddleware(prismaWithLiveSession());

    await expect(middleware.createAuthContext(`Bearer ${link}`)).rejects.toBeDefined();
  });

  it('admet, avec le même double, un jeton de session nominal — le refus vient bien du jeton', async () => {
    const session = jwt.sign({ userId: USER_ID, username: 'lena', role: 'USER', sid: '507f1f77bcf86cd799439022' }, JWT_SECRET, { expiresIn: '1h' });
    const middleware = new AuthMiddleware(prismaWithLiveSession());

    const context = await middleware.createAuthContext(`Bearer ${session}`);

    expect(context.userId).toBe(USER_ID);
  });
});
