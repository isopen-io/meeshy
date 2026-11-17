/**
 * #19281 (passerelle) — le cache d'authentification ne réécrit jamais une ligne
 * plus ancienne que celle qu'une écriture de profil vient d'effacer.
 *
 * La course : une requête concurrente lit la ligne utilisateur JUSTE AVANT
 * l'écriture du profil, l'écriture efface `auth:user:<id>`, puis la lecture
 * remet l'ANCIENNE ligne en cache. `GET /me` servait l'ancien nom, l'ancienne
 * langue ou l'ancienne photo pendant 60 s.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import jwt from 'jsonwebtoken';
import { AuthMiddleware } from '../../../middleware/auth';

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

const JWT_SECRET = 'test-secret-auth-cache-race-19281';
const USER_ID = '507f1f77bcf86cd799439011';
const CACHE_KEY = `auth:user:${USER_ID}`;

const userRow = (overrides: Record<string, unknown> = {}) => ({
  id: USER_ID,
  username: 'alice',
  email: 'alice@example.com',
  firstName: 'Alice',
  lastName: 'Cooper',
  displayName: 'Alice Cooper',
  bio: '',
  avatar: null,
  banner: null,
  phoneNumber: null,
  role: 'USER',
  systemLanguage: 'fr',
  regionalLanguage: null,
  customDestinationLanguage: null,
  isOnline: true,
  lastActiveAt: new Date('2026-11-17T09:00:00.000Z'),
  isActive: true,
  emailVerifiedAt: new Date('2026-01-01T00:00:00.000Z'),
  emailReleasedAt: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-11-17T09:00:00.000Z'),
  deviceLocale: null,
  profileCompletionRate: 0,
  ...overrides,
});

const prismaReading = (findUnique: unknown) =>
  ({
    user: { findUnique },
    userSession: { findFirst: jest.fn().mockResolvedValue({ isValid: true, expiresAt: new Date(Date.now() + 86_400_000) }), update: jest.fn().mockResolvedValue({}) },
    participant: { findFirst: jest.fn().mockResolvedValue(null) },
  }) as unknown as ConstructorParameters<typeof AuthMiddleware>[0];

const bearer = () => `Bearer ${jwt.sign({ userId: USER_ID, sid: '507f1f77bcf86cd799439031' }, JWT_SECRET, { expiresIn: '1h' })}`;

describe('AuthMiddleware — la lecture concurrente ne ressuscite pas une ligne effacée (#19281)', () => {
  beforeEach(() => {
    process.env.JWT_SECRET = JWT_SECRET;
    const { __mockStoreMap } = require('../../../services/CacheStore');
    __mockStoreMap.clear();
    jest.clearAllMocks();
  });

  it('une écriture de profil (effacement du cache) entre la lecture et la mise en cache : l’ancienne ligne n’est pas gardée', async () => {
    const { getCacheStore } = require('../../../services/CacheStore');
    const cache = getCacheStore();
    const old = userRow({ displayName: 'Alice Cooper' });
    const findUnique = jest.fn(async () => {
      const read = old;
      await cache.del(CACHE_KEY);
      return read;
    });
    const middleware = new AuthMiddleware(prismaReading(findUnique));

    const ctx = await middleware.createAuthContext(bearer());

    expect(ctx.isAuthenticated).toBe(true);
    expect(await cache.get(CACHE_KEY)).toBeNull();
  });

  it('sans écriture concurrente, la ligne lue est mise en cache comme avant', async () => {
    const { getCacheStore } = require('../../../services/CacheStore');
    const cache = getCacheStore();
    const middleware = new AuthMiddleware(prismaReading(jest.fn(async () => userRow())));

    await middleware.createAuthContext(bearer());

    expect(JSON.parse((await cache.get(CACHE_KEY)) as string)).toMatchObject({ id: USER_ID, displayName: 'Alice Cooper' });
  });

  it('la lecture suivante, après l’écriture, relit la base et sert le nouveau nom', async () => {
    const { getCacheStore } = require('../../../services/CacheStore');
    const cache = getCacheStore();
    const rows = [userRow(), userRow({ displayName: 'Alicia' })];
    const findUnique = jest.fn(async () => {
      const row = rows.shift() as ReturnType<typeof userRow>;
      if (row.displayName === 'Alice Cooper') await cache.del(CACHE_KEY);
      return row;
    });
    const middleware = new AuthMiddleware(prismaReading(findUnique));

    await middleware.createAuthContext(bearer());
    const ctx = await middleware.createAuthContext(bearer());

    expect(ctx.registeredUser?.displayName).toBe('Alicia');
  });
});
