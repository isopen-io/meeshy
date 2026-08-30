/**
 * #4182 critère 7 — débit par COMPTE, jamais par IP, sur les six routes de
 * `/me/preferences/categories` : 300/min en lecture (GET liste, GET par id),
 * 30/min sur POST (create) et sur le lot (POST /reorder), 60/min sur
 * PATCH /:id, 30/min sur DELETE /:id.
 *
 * Une clé IP laisserait un seul compte, réparti sur plusieurs
 * sessions/adresses, contourner la limite, et pénaliserait tout le monde
 * derrière une même sortie NAT (`server.ts:507`, plafond global 300/min/IP —
 * ce que ce lot ne réutilise PAS pour cette raison).
 *
 * Deux niveaux de preuve, comme #4147 (`social-write-rate-limit.test.ts`) :
 *  - bout en bout, VRAI plugin @fastify/rate-limit (`global:false`), sur
 *    `POST /` (create, 30/min — le plafond le plus abordable à saturer) avec
 *    DEUX comptes distincts : un témoin mono-compte passerait au vert sur un
 *    seau global, donc partagé ;
 *  - capture de `config.rateLimit` via un hook `onRoute`, pour les SIX
 *    routes, qui vérifie `max`/`timeWindow` et que `keyGenerator` rend une clé
 *    PAR COMPTE (jamais par IP) dès que `request.auth.userId` est connu.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { categoriesRoutes } from '../../../../../routes/me/preferences/categories';

function makePrisma() {
  return {
    userConversationCategory: {
      findMany: jest.fn<any>().mockResolvedValue([]),
      count: jest.fn<any>().mockResolvedValue(0),
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

  // Pilotable par requête via un en-tête de TEST, pour qu'UNE seule instance
  // d'app (donc UN seul magasin de compteurs) serve plusieurs comptes
  // distincts — condition du témoin « le seau ne se partage pas ». Posé en
  // `preValidation`, comme `social-write-rate-limit.test.ts`, pour garantir
  // qu'il tourne avant TOUT preHandler — dont celui que le plugin de débit
  // attache par route.
  app.addHook('preValidation', async (req: FastifyRequest) => {
    const userId = req.headers['x-test-user-id'] as string | undefined;
    (req as any).auth = userId ? { userId, isAuthenticated: true } : { isAuthenticated: false };
  });

  // Plugin RÉEL, store LocalStore (mémoire) : chaque route déclare son propre
  // config.rateLimit, rien ne doit retomber sur un défaut global.
  await app.register(rateLimit, { global: false });

  await app.register(categoriesRoutes);
  await app.ready();
  return app;
}

function createCategory(app: FastifyInstance, userId: string) {
  return app.inject({
    method: 'POST',
    url: '/',
    headers: { 'x-test-user-id': userId },
    payload: { name: 'X' },
  });
}

describe('POST / (create) — 30/min par compte, VRAI plugin (#4182 critère 7)', () => {
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

describe('categoriesRoutes — config.rateLimit déclaré par route (#4182 critère 7)', () => {
  it('les six routes déclarent le bon plafond, avec une clé PAR COMPTE (jamais par IP)', async () => {
    const captured: Array<{ method: string; url: string; config: any }> = [];
    const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
    app.decorate('prisma', makePrisma());
    app.addHook('onRoute', (routeOptions: any) => {
      captured.push({ method: routeOptions.method, url: routeOptions.url, config: routeOptions.config });
    });
    await app.register(categoriesRoutes);
    await app.ready();

    const byRoute = (method: string, url: string) =>
      captured.find((r) => r.method === method && r.url === url);

    const expectations: Array<[string, string, number]> = [
      ['GET', '/', 300],
      ['GET', '/:categoryId', 300],
      ['POST', '/', 30],
      ['PATCH', '/:categoryId', 60],
      ['DELETE', '/:categoryId', 30],
      ['POST', '/reorder', 30],
    ];

    for (const [method, url, max] of expectations) {
      const route = byRoute(method, url);
      expect(route).toBeDefined();

      const cfg = route?.config?.rateLimit;
      expect(cfg?.max).toBe(max);
      expect(cfg?.timeWindow).toBe('1 minute');
      // Le hook par défaut d'@fastify/rate-limit est `onRequest`, qui tourne
      // AVANT le `preHandler` d'authentification du plugin parent — sans
      // cette option `keyGenerator` ne verrait jamais `request.auth` et
      // retomberait toujours sur l'IP (cf. commentaire de production).
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
