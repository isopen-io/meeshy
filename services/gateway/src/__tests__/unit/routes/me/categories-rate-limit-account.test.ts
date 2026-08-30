/**
 * #4182 critère 7, sur l'adresse CANONIQUE `POST /me/categories` (#4359) —
 * débit par COMPTE, jamais par IP, avec l'authentification posée en
 * `onRequest` (montage AUTONOME de `meCategoriesRoutes` — pas nichée sous un
 * parent qui la pose en `preHandler`, comme l'est l'alias).
 *
 * `category-rate-limits.test.ts` (`routes/me/preferences/`) mesure déjà ce
 * critère sur l'ALIAS. Le piège nommé par #4359 — `config.rateLimit` SANS
 * `hook: 'preHandler'` retombe sur l'IP parce qu'@fastify/rate-limit vérifie
 * par défaut à `onRequest`, AVANT que l'auth ne pose `request.auth` — change
 * de FORME sur ce montage : ici l'auth ELLE-MÊME tourne en `onRequest`. La
 * garantie d'ordre (`onRequest` avant `preHandler`, quel que soit qui la
 * pose) doit tenir malgré tout — c'est ce que ce fichier MESURE sur le vrai
 * plugin, pas ce qu'il suppose.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { meCategoriesRoutes } from '../../../../routes/me/categories';

function makePrisma() {
  return {
    userConversationCategory: {
      findFirst: jest.fn<any>().mockResolvedValue(null),
      create: jest.fn<any>().mockImplementation(({ data }: any) =>
        Promise.resolve({ id: 'cat-x', ...data, createdAt: new Date(), updatedAt: new Date() })
      ),
    },
  } as any;
}

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', makePrisma());

  // Pilotable par requête via un en-tête de TEST, comme
  // `category-rate-limits.test.ts` : UNE seule instance d'app (donc UN seul
  // magasin de compteurs) sert plusieurs comptes distincts.
  app.decorate('authenticate', async (req: FastifyRequest) => {
    const userId = req.headers['x-test-user-id'] as string | undefined;
    (req as any).auth = userId ? { userId, isAuthenticated: true } : { isAuthenticated: false };
  });

  // Plugin RÉEL, store LocalStore (mémoire) : chaque route déclare son propre
  // config.rateLimit, rien ne doit retomber sur un défaut global.
  await app.register(rateLimit, { global: false });

  await app.register(meCategoriesRoutes, { prefix: '/api/v1/me' });
  await app.ready();
  return app;
}

function createCategory(app: FastifyInstance, userId: string) {
  return app.inject({
    method: 'POST',
    url: '/api/v1/me/categories',
    headers: { 'x-test-user-id': userId },
    payload: { name: 'X' },
  });
}

describe('POST /me/categories (create) — 30/min par compte, VRAI plugin, auth en onRequest (#4359)', () => {
  it('le 31e appel du MÊME compte est refusé (429)', async () => {
    const app = await buildApp();

    for (let i = 0; i < 30; i++) {
      const res = await createCategory(app, 'user-a');
      expect(res.statusCode).toBe(200);
    }
    const res31 = await createCategory(app, 'user-a');

    expect(res31.statusCode).toBe(429);
    await app.close();
  });

  it("le compte B n'est PAS affecté par le plafond épuisé du compte A — le seau n'est pas partagé/IP", async () => {
    const app = await buildApp();

    for (let i = 0; i < 30; i++) {
      await createCategory(app, 'user-a');
    }
    const blockedA = await createCategory(app, 'user-a');
    const stillOkB = await createCategory(app, 'user-b');

    expect(blockedA.statusCode).toBe(429);
    expect(stillOkB.statusCode).toBe(200);
    await app.close();
  });
});

describe('meCategoriesRoutes — config.rateLimit déclaré par route, hook preHandler (#4359, #4182 critère 7)', () => {
  it('les cinq routes déclarent le bon plafond, avec `hook: preHandler` et une clé PAR COMPTE (jamais par IP)', async () => {
    const captured: Array<{ method: string; url: string; config: any }> = [];
    const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
    app.decorate('prisma', makePrisma());
    app.decorate('authenticate', async () => undefined);
    app.addHook('onRoute', (routeOptions: any) => {
      captured.push({ method: routeOptions.method, url: routeOptions.url, config: routeOptions.config });
    });
    await app.register(meCategoriesRoutes, { prefix: '/api/v1/me' });
    await app.ready();

    const byRoute = (method: string, url: string) =>
      captured.find((r) => r.method === method && r.url === url);

    const expectations: Array<[string, string, number]> = [
      ['GET', '/api/v1/me/categories', 300],
      ['POST', '/api/v1/me/categories', 30],
      ['PATCH', '/api/v1/me/categories/:categoryId', 60],
      ['DELETE', '/api/v1/me/categories/:categoryId', 30],
      ['POST', '/api/v1/me/categories/reorder', 30],
    ];

    for (const [method, url, max] of expectations) {
      const route = byRoute(method, url);
      expect(route).toBeDefined();

      const cfg = route?.config?.rateLimit;
      expect(cfg?.max).toBe(max);
      expect(cfg?.timeWindow).toBe('1 minute');
      // Le hook par défaut d'@fastify/rate-limit est `onRequest` — ICI
      // exactement la phase où `fastify.authenticate` pose lui-même
      // `request.auth` (voir doc-comment de module) : sans `hook:
      // 'preHandler'`, l'ORDRE relatif des deux `onRequest` (auth, débit)
      // deviendrait un pari plutôt qu'une garantie de phase.
      expect(cfg?.hook).toBe('preHandler');

      const keyForAuthed = cfg.keyGenerator({ auth: { userId: 'user-x' }, ip: '203.0.113.9' } as any);
      const keyForAnon = cfg.keyGenerator({ auth: undefined, ip: '203.0.113.9' } as any);
      expect(keyForAuthed).toContain('user-x');
      expect(keyForAuthed).not.toContain('203.0.113.9');
      expect(keyForAnon).toContain('203.0.113.9');
    }

    await app.close();
  });
});
