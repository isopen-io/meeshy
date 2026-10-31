/**
 * D-5 (#13947, lot #13954) — le plancher de version s'applique à l'admission
 * de session REST et aux routes de cercles, pas seulement à la création de
 * scène. Sous le plancher de SA plateforme ⇒ 426 UPGRADE_REQUIRED avec
 * `minVersion` et `storeUrl` ; en-tête absent (web) ⇒ jamais bloqué ; plancher
 * vide (défaut) ⇒ porte désarmée. Vraies requêtes `app.inject()` sur le VRAI
 * middleware — jamais un double de la garde.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import jwt from 'jsonwebtoken';
import Fastify, { FastifyInstance } from 'fastify';
import { createUnifiedAuthMiddleware } from '../../../middleware/auth';
import { appVersionFloorPreHandler } from '../../../middleware/app-version-floor';

jest.mock('../../../services/CacheStore', () => {
  const store = new Map<string, { value: string; expiresAt: number }>();
  const mockStore = {
    get: jest.fn(async (key: string) => store.get(key)?.value ?? null),
    set: jest.fn(async (key: string, value: string) => { store.set(key, { value, expiresAt: Date.now() + 3600_000 }); }),
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
  return { getCacheStore: jest.fn(() => mockStore), resetCacheStore: jest.fn(() => store.clear()), __mockStoreMap: store };
});

const JWT_SECRET = 'test-secret-version-floor-13954';
const USER_ID = '507f1f77bcf86cd799439011';
const SESSION_ID = '507f1f77bcf86cd799439021';

const user = () => ({
  id: USER_ID, username: 'alice', email: 'a@example.com', firstName: 'A', lastName: 'B', displayName: 'Alice',
  avatar: null, role: 'USER', systemLanguage: 'fr', regionalLanguage: 'en', customDestinationLanguage: null,
  isOnline: true, lastActiveAt: new Date(), isActive: true, emailVerifiedAt: null, createdAt: new Date(),
  updatedAt: new Date(), deviceLocale: null,
});

const prismaDouble = () => ({
  user: { findUnique: jest.fn().mockResolvedValue(user()) },
  userSession: {
    findFirst: jest.fn().mockResolvedValue({ isValid: true, expiresAt: new Date(Date.now() + 86_400_000) }),
    update: jest.fn().mockResolvedValue({}),
  },
  participant: { findFirst: jest.fn().mockResolvedValue(null) },
});

const bearer = () => ({ authorization: `Bearer ${jwt.sign({ userId: USER_ID, sid: SESSION_ID, username: 'alice', role: 'USER' }, JWT_SECRET, { expiresIn: '1h' })}` });

const KEYS = ['MIN_APP_VERSION', 'MIN_APP_VERSION_IOS', 'MIN_APP_VERSION_ANDROID'] as const;

async function authProbe(options: { requireAuth: boolean; allowAnonymous?: boolean }): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.get(
    '/probe',
    { preValidation: [createUnifiedAuthMiddleware(prismaDouble() as never, options)] },
    async (_request, reply) => reply.send({ ok: true })
  );
  await app.ready();
  return app;
}

async function circlesProbe(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.get('/circles', { preHandler: [appVersionFloorPreHandler] }, async (_request, reply) => reply.send({ ok: true }));
  await app.ready();
  return app;
}

describe('plancher de version — admission de session REST et routes de cercles', () => {
  const saved = KEYS.map((key) => [key, process.env[key]] as const);
  beforeEach(() => {
    process.env.JWT_SECRET = JWT_SECRET;
    KEYS.forEach((key) => delete process.env[key]);
    process.env.MIN_APP_VERSION_IOS = '1.2.0';
    process.env.MIN_APP_VERSION_ANDROID = '3.1.0';
    require('../../../services/CacheStore').__mockStoreMap.clear();
  });
  afterEach(() =>
    saved.forEach(([key, value]) => {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    })
  );

  describe('middleware d’authentification', () => {
    it('une session admise sous le plancher d’iOS ⇒ 426, minVersion et storeUrl à la racine, la route n’est pas atteinte', async () => {
      const app = await authProbe({ requireAuth: true });
      const res = await app.inject({ method: 'GET', url: '/probe', headers: { ...bearer(), 'x-app-version': '1.1.4', 'x-app-platform': 'ios' } });
      await app.close();

      expect(res.statusCode).toBe(426);
      expect(res.json()).toEqual(expect.objectContaining({
        success: false,
        code: 'UPGRADE_REQUIRED',
        minVersion: '1.2.0',
        storeUrl: 'https://apps.apple.com/app/id6760208591',
      }));
    });

    it('Android sous SON plancher ⇒ 426 vers le Play Store ; iOS à 1.1.4 n’est pas jugé par le plancher d’Android', async () => {
      const app = await authProbe({ requireAuth: true });
      const android = await app.inject({ method: 'GET', url: '/probe', headers: { ...bearer(), 'x-app-version': '3.0.0', 'x-app-platform': 'android' } });
      process.env.MIN_APP_VERSION_IOS = '1.1.0';
      const ios = await app.inject({ method: 'GET', url: '/probe', headers: { ...bearer(), 'x-app-version': '1.1.4', 'x-app-platform': 'ios' } });
      await app.close();

      expect(android.statusCode).toBe(426);
      expect(android.json().storeUrl).toContain('play.google.com');
      expect(ios.statusCode).toBe(200);
    });

    it('au plancher ⇒ 200 ; en-tête absent (web) ⇒ 200 ; web déclaré ⇒ 200', async () => {
      const app = await authProbe({ requireAuth: true });
      const at = await app.inject({ method: 'GET', url: '/probe', headers: { ...bearer(), 'x-app-version': '1.2.0', 'x-app-platform': 'ios' } });
      const absent = await app.inject({ method: 'GET', url: '/probe', headers: bearer() });
      process.env.MIN_APP_VERSION = '9.0.0';
      const web = await app.inject({ method: 'GET', url: '/probe', headers: { ...bearer(), 'x-app-version': '2.0.4', 'x-app-platform': 'pwa' } });
      await app.close();

      expect([at.statusCode, absent.statusCode, web.statusCode]).toEqual([200, 200, 200]);
    });

    it('plancher vide (défaut) ⇒ même une version antique passe', async () => {
      KEYS.forEach((key) => delete process.env[key]);
      const app = await authProbe({ requireAuth: true });
      const res = await app.inject({ method: 'GET', url: '/probe', headers: { ...bearer(), 'x-app-version': '0.0.1', 'x-app-platform': 'ios' } });
      await app.close();
      expect(res.statusCode).toBe(200);
    });

    it('une route à authentification facultative juge aussi le client connecté — il ne retombe pas en visiteur', async () => {
      const app = await authProbe({ requireAuth: false, allowAnonymous: true });
      const res = await app.inject({ method: 'GET', url: '/probe', headers: { ...bearer(), 'x-app-version': '1.1.4', 'x-app-platform': 'ios' } });
      const visitor = await app.inject({ method: 'GET', url: '/probe', headers: { 'x-app-version': '1.1.4', 'x-app-platform': 'ios' } });
      await app.close();

      expect(res.statusCode).toBe(426);
      expect(visitor.statusCode).toBe(200);
    });
  });

  describe('preHandler des routes de cercles', () => {
    it('sous le plancher ⇒ 426 sans atteindre la route ; au plancher, sans en-tête ou web ⇒ passe', async () => {
      const app = await circlesProbe();
      const below = await app.inject({ method: 'GET', url: '/circles', headers: { 'x-app-version': '1.1.4', 'x-app-platform': 'ios' } });
      const at = await app.inject({ method: 'GET', url: '/circles', headers: { 'x-app-version': '1.2.0', 'x-app-platform': 'ios' } });
      const absent = await app.inject({ method: 'GET', url: '/circles' });
      const pwa = await app.inject({ method: 'GET', url: '/circles', headers: { 'x-app-version': '0.0.1', 'x-app-platform': 'pwa' } });
      await app.close();

      expect(below.statusCode).toBe(426);
      expect(below.json()).toEqual(expect.objectContaining({ code: 'UPGRADE_REQUIRED', minVersion: '1.2.0' }));
      expect([at.statusCode, absent.statusCode, pwa.statusCode]).toEqual([200, 200, 200]);
    });
  });
});
