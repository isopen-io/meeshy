/**
 * `GET /me` sert la couleur d'accent de la vitrine (#19201) : la porte d'authentification la
 * charge, la garde dans son cache, et `buildRegisteredMeUser` la projette — un accent choisi sur
 * un appareil se relit sur les autres au prochain `GET /me`, cache compris.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import jwt from 'jsonwebtoken';

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
    setnx: jest.fn(async (key: string, value: string) => {
      if (store.has(key)) return false;
      store.set(key, value);
      return true;
    }),
    setIfEquals: jest.fn(async (key: string, expected: string, value: string) => {
      if (store.get(key) !== expected) return false;
      store.set(key, value);
      return true;
    }),
  };
  return { getCacheStore: jest.fn(() => mockStore), __mockStoreMap: store };
});

import { AuthMiddleware } from '../../../middleware/auth';
import { buildRegisteredMeUser } from '../../../routes/me/get-me';

const JWT_SECRET = 'test-secret-profile-accent-19201';
const USER_ID = '507f1f77bcf86cd799439011';
const NOW = new Date('2026-11-17T10:00:00.000Z');

const compte = (overrides: Record<string, unknown> = {}) => ({
  id: USER_ID, username: 'lena', email: 'lena@example.com', firstName: 'Lena', lastName: 'Vogel',
  displayName: 'Lena Vogel', bio: '', avatar: null, banner: null, phoneNumber: '+33612345678', role: 'USER',
  systemLanguage: 'fr', regionalLanguage: 'fr', customDestinationLanguage: null, isOnline: true,
  lastActiveAt: NOW, isActive: true, emailVerifiedAt: NOW, emailReleasedAt: null, createdAt: NOW, updatedAt: NOW,
  deviceLocale: null, profileCompletionRate: null, profileAccentColor: '#4ECDC4', ...overrides,
});

const prismaFor = (ligne: Record<string, unknown>) => {
  const findUnique = jest.fn(async (_args: unknown) => ligne);
  return {
    findUnique,
    prisma: {
      user: { findUnique },
      userSession: { findFirst: jest.fn(async () => ({ isValid: true, expiresAt: new Date('2100-01-01T00:00:00.000Z') })), update: jest.fn(async () => ({})) },
      participant: { findFirst: jest.fn(async () => null) },
    } as never,
  };
};

const bearer = (): string =>
  `Bearer ${jwt.sign({ userId: USER_ID, username: 'lena', role: 'USER', sid: '507f1f77bcf86cd799439031' }, JWT_SECRET, { expiresIn: '1h' })}`;

beforeEach(() => {
  process.env.JWT_SECRET = JWT_SECRET;
  const { __mockStoreMap } = jest.requireMock('../../../services/CacheStore') as { __mockStoreMap: Map<string, string> };
  __mockStoreMap.clear();
});

describe('la porte d’authentification porte la couleur d’accent jusqu’à GET /me', () => {
  it('la charge et la projette dans le profil servi', async () => {
    const { prisma, findUnique } = prismaFor(compte());
    const ctx = await new AuthMiddleware(prisma, undefined, { now: () => NOW }).createAuthContext(bearer());

    const [args] = findUnique.mock.calls[0] as [{ select: Record<string, boolean> }];
    expect(args.select).toMatchObject({ profileAccentColor: true });
    expect(buildRegisteredMeUser(ctx).profileAccentColor).toBe('#4ECDC4');
  });

  it('la garde dans le cache : la seconde requête la sert sans relire la base', async () => {
    const { prisma, findUnique } = prismaFor(compte());
    await new AuthMiddleware(prisma, undefined, { now: () => NOW }).createAuthContext(bearer());
    const ctx = await new AuthMiddleware(prisma, undefined, { now: () => NOW }).createAuthContext(bearer());

    expect(findUnique).toHaveBeenCalledTimes(1);
    expect(buildRegisteredMeUser(ctx).profileAccentColor).toBe('#4ECDC4');
  });

  it('`null` (automatique) part `null`, et une valeur hors liste aussi', async () => {
    for (const stored of [null, '#123456']) {
      const { prisma } = prismaFor(compte({ profileAccentColor: stored }));
      const { __mockStoreMap } = jest.requireMock('../../../services/CacheStore') as { __mockStoreMap: Map<string, string> };
      __mockStoreMap.clear();
      const ctx = await new AuthMiddleware(prisma, undefined, { now: () => NOW }).createAuthContext(bearer());
      expect(buildRegisteredMeUser(ctx).profileAccentColor).toBeNull();
    }
  });
});
