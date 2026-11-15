/**
 * `GET`/`PUT /me/consents` — débit par COMPTE, jamais par IP (#4348, critère
 * repris de #4335 : « 20/h en écriture, 120/min en lecture »).
 *
 * Même piège que #4334/#4347/#4359 : `config.rateLimit` SANS `hook:
 * 'preHandler'` retombe sur l'IP parce qu'@fastify/rate-limit vérifie par
 * défaut à `onRequest`, AVANT que l'authentification (elle-même posée en
 * `onRequest` sur ce montage AUTONOME) n'ait écrit `request.auth`. Ce fichier
 * mesure la clé RÉELLEMENT calculée en montant la route sur le VRAI plugin
 * `@fastify/rate-limit` — jamais une lecture de sa configuration seule.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { meConsentsRoutes } from '../../../../routes/me/consents';

jest.mock('../../../../utils/logger', () => ({ logError: jest.fn() }));

const EMPTY_COLUMNS = {
  dataProcessingConsentAt: null,
  voiceDataConsentAt: null,
  voiceProfileConsentAt: null,
  voiceCloningEnabledAt: null,
};

function makePrisma() {
  return {
    user: {
      findUnique: jest.fn<any>().mockResolvedValue({ ...EMPTY_COLUMNS }),
      update: jest.fn<any>().mockResolvedValue({ ...EMPTY_COLUMNS }),
    },
    userPreferences: {
      findUnique: jest.fn<any>().mockResolvedValue(null),
    },
  } as any;
}

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', makePrisma());
  app.decorate('authenticate', async (req: FastifyRequest) => {
    const userId = req.headers['x-test-user-id'] as string | undefined;
    (req as any).auth = userId ? { userId, isAuthenticated: true } : undefined;
  });

  // Plugin RÉEL, store LocalStore (mémoire) — comme
  // `categories-rate-limit-account.test.ts`.
  await app.register(rateLimit, { global: false });
  await app.register(meConsentsRoutes, { prefix: '/api/v1/me' });
  await app.ready();
  return app;
}

function getConsents(app: FastifyInstance, userId: string) {
  return app.inject({
    method: 'GET',
    url: '/api/v1/me/consents',
    headers: { 'x-test-user-id': userId },
  });
}

function putConsent(app: FastifyInstance, userId: string) {
  return app.inject({
    method: 'PUT',
    url: '/api/v1/me/consents/data-processing',
    headers: { 'content-type': 'application/json', 'x-test-user-id': userId },
    payload: { granted: true, policyVersion: '2026-08-30' },
  });
}

describe('GET /me/consents — 120/min par compte, VRAI plugin', () => {
  it('le 121e appel du MÊME compte est refusé (429)', async () => {
    const app = await buildApp();

    for (let i = 0; i < 120; i++) {
      const res = await getConsents(app, 'user-a');
      expect(res.statusCode).toBe(200);
    }
    const res121 = await getConsents(app, 'user-a');

    expect(res121.statusCode).toBe(429);
    await app.close();
  });

  it("le compte B n'est pas affecté par le plafond épuisé du compte A", async () => {
    const app = await buildApp();

    for (let i = 0; i < 120; i++) {
      await getConsents(app, 'user-a');
    }
    const blockedA = await getConsents(app, 'user-a');
    const stillOkB = await getConsents(app, 'user-b');

    expect(blockedA.statusCode).toBe(429);
    expect(stillOkB.statusCode).toBe(200);
    await app.close();
  });
});

describe('PUT /me/consents/:purpose — 20/h par compte, VRAI plugin', () => {
  it('le 21e appel du MÊME compte est refusé (429)', async () => {
    const app = await buildApp();

    for (let i = 0; i < 20; i++) {
      const res = await putConsent(app, 'user-a');
      expect(res.statusCode).toBe(200);
    }
    const res21 = await putConsent(app, 'user-a');

    expect(res21.statusCode).toBe(429);
    await app.close();
  });
});

describe('meConsentsRoutes — config.rateLimit déclaré par route, hook preHandler, clé par compte', () => {
  it('les deux routes déclarent le bon plafond, `hook: preHandler`, et une clé PAR COMPTE (jamais par IP)', async () => {
    const captured: Array<{ method: string; url: string; config: any }> = [];
    const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
    app.decorate('prisma', makePrisma());
    app.decorate('authenticate', async () => undefined);
    app.addHook('onRoute', (routeOptions: any) => {
      captured.push({ method: routeOptions.method, url: routeOptions.url, config: routeOptions.config });
    });
    await app.register(meConsentsRoutes, { prefix: '/api/v1/me' });
    await app.ready();

    const byRoute = (method: string, url: string) =>
      captured.find((r) => r.method === method && r.url === url);

    const expectations: Array<[string, string, number, string]> = [
      ['GET', '/api/v1/me/consents', 120, '1 minute'],
      ['PUT', '/api/v1/me/consents/:purpose', 20, '1 hour'],
    ];

    for (const [method, url, max, timeWindow] of expectations) {
      const route = byRoute(method, url);
      expect(route).toBeDefined();

      const cfg = route?.config?.rateLimit;
      expect(cfg?.max).toBe(max);
      expect(cfg?.timeWindow).toBe(timeWindow);
      expect(cfg?.hook).toBe('preHandler');

      const keyForAuthed = cfg.keyGenerator({ auth: { userId: 'user-x' }, ip: '203.0.113.9' } as any);
      const keyForAnon = cfg.keyGenerator({ auth: undefined, ip: '203.0.113.9' } as any);
      expect(keyForAuthed).toContain('user-x');
      expect(keyForAuthed).not.toContain('203.0.113.9');
      expect(keyForAnon).toContain('203.0.113.9');
    }

    await app.close();
  });

  it('les deux routes posent `onRequest: [fastify.authenticate]` (montage AUTONOME, pas de parent)', async () => {
    const captured: Array<{ method: string; url: string; onRequest: any }> = [];
    const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
    app.decorate('prisma', makePrisma());
    const authenticate = async () => undefined;
    app.decorate('authenticate', authenticate);
    app.addHook('onRoute', (routeOptions: any) => {
      captured.push({ method: routeOptions.method, url: routeOptions.url, onRequest: routeOptions.onRequest });
    });
    await app.register(meConsentsRoutes, { prefix: '/api/v1/me' });
    await app.ready();

    for (const route of captured) {
      expect(route.onRequest).toContain(authenticate);
    }

    await app.close();
  });
});
