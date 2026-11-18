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
    setIfEquals: jest.fn(async (key: string, expected: string, value: string, ttl: number) => {
      const entry = store.get(key);
      if (!entry || entry.expiresAt <= Date.now() || entry.value !== expected) return false;
      store.set(key, { value, expiresAt: Date.now() + ttl * 1000 });
      return true;
    }),
    del: jest.fn(async (key: string) => { store.delete(key); }),
    keys: jest.fn(async () => []),
    setnx: jest.fn(async (key: string, value: string, ttl?: number) => {
      const entry = store.get(key);
      if (entry && entry.expiresAt > Date.now()) return false;
      store.set(key, { value, expiresAt: Date.now() + (ttl || 3600) * 1000 });
      return true;
    }),
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

  it('un effacement qui tombe juste après la première opération de cache suivant la lecture ne laisse pas l’ancienne ligne en cache', async () => {
    const { getCacheStore, __mockStoreMap } = require('../../../services/CacheStore');
    const cache = getCacheStore();
    let readDone = false;
    let writerLanded = false;
    const writerAfter = (name: 'get' | 'set' | 'setIfEquals') => {
      const plain = cache[name].getMockImplementation();
      cache[name].mockImplementation(async (...args: unknown[]) => {
        const out = await plain(...args);
        if (readDone && !writerLanded) {
          writerLanded = true;
          __mockStoreMap.delete(CACHE_KEY);
        }
        return out;
      });
      return () => cache[name].mockImplementation(plain);
    };
    const restore = (['get', 'set', 'setIfEquals'] as const).map(writerAfter);
    const findUnique = jest.fn(async () => {
      readDone = true;
      return userRow();
    });
    const middleware = new AuthMiddleware(prismaReading(findUnique));

    await middleware.createAuthContext(bearer());

    restore.forEach((undo) => undo());
    expect(writerLanded).toBe(true);
    expect(await cache.get(CACHE_KEY)).toBeNull();
  });

  it('une lecture qui arrive pendant une autre ne lui vole pas sa réservation : la première remplit le cache et la suivante le lit', async () => {
    const { getCacheStore } = require('../../../services/CacheStore');
    const cache = getCacheStore();
    let releaseSecond: () => void = () => {};
    const secondBlocked = new Promise<void>((resolve) => { releaseSecond = resolve; });
    let secondRun: Promise<unknown> = Promise.resolve();
    let secondStarted: () => void = () => {};
    const secondInFlight = new Promise<void>((resolve) => { secondStarted = resolve; });
    const findUnique = jest.fn(async () => userRow());
    const middleware = new AuthMiddleware(prismaReading(findUnique));
    findUnique
      .mockImplementationOnce(async () => {
        secondRun = middleware.createAuthContext(bearer());
        await secondInFlight;
        return userRow();
      })
      .mockImplementationOnce(async () => {
        secondStarted();
        await secondBlocked;
        return userRow();
      });

    await middleware.createAuthContext(bearer());
    const third = await middleware.createAuthContext(bearer());
    releaseSecond();
    await secondRun;

    expect(third.isAuthenticated).toBe(true);
    expect(findUnique).toHaveBeenCalledTimes(2);
    expect(JSON.parse((await cache.get(CACHE_KEY)) as string)).toMatchObject({ id: USER_ID });
  });

  it('une ligne déjà en cache n’est jamais écrasée par une réservation', async () => {
    const { getCacheStore } = require('../../../services/CacheStore');
    const cache = getCacheStore();
    const cachedByAnother = JSON.stringify(userRow({ displayName: 'Alicia', updatedAt: new Date('2026-11-17T09:31:00.000Z') }));
    const plainGet = cache.get.getMockImplementation();
    let raced = false;
    cache.get.mockImplementation(async (key: string) => {
      if (key !== CACHE_KEY || raced) return plainGet(key);
      raced = true;
      await cache.set(CACHE_KEY, cachedByAnother, 60);
      return null;
    });
    const middleware = new AuthMiddleware(prismaReading(jest.fn(async () => userRow())));

    await middleware.createAuthContext(bearer());

    cache.get.mockImplementation(plainGet);
    expect(await cache.get(CACHE_KEY)).toBe(cachedByAnother);
  });

  it('la réservation n’est pas du JSON : une passerelle d’avant #19281 la lit comme une absence, jamais comme un compte désactivé', async () => {
    const { getCacheStore } = require('../../../services/CacheStore');
    const cache = getCacheStore();
    let reservation: string | null = null;
    const findUnique = jest.fn(async () => {
      reservation = await cache.get(CACHE_KEY);
      return userRow();
    });
    const middleware = new AuthMiddleware(prismaReading(findUnique));

    await middleware.createAuthContext(bearer());

    expect(reservation).not.toBeNull();
    expect(() => JSON.parse(reservation as unknown as string)).toThrow();
  });

  it('une réservation en place est lue comme une absence : la ligne est relue en base', async () => {
    const { getCacheStore } = require('../../../services/CacheStore');
    const cache = getCacheStore();
    const findUnique = jest.fn(async () => userRow({ displayName: 'Alicia' }));
    const middleware = new AuthMiddleware(prismaReading(findUnique));
    let reservation: string | null = null;
    findUnique.mockImplementationOnce(async () => {
      reservation = await cache.get(CACHE_KEY);
      return userRow({ displayName: 'Alicia' });
    });
    await middleware.createAuthContext(bearer());
    await cache.set(CACHE_KEY, reservation as unknown as string, 10);

    const ctx = await middleware.createAuthContext(bearer());

    expect(findUnique).toHaveBeenCalledTimes(2);
    expect(ctx.registeredUser?.displayName).toBe('Alicia');
  });
});

