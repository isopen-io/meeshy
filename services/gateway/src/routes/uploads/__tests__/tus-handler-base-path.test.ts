/**
 * Témoin de #4277 (critère 2) — `registerTusRoutes` ne connaît plus `/api/v1`
 * en dur. Contrairement à `tus-handler.test.ts` (qui capture les OPTIONS
 * passées à `new Server(...)` via un `buildFakeFastify()` sans routeur réel),
 * ce fichier fait tourner une VRAIE instance Fastify et vérifie, par
 * `app.inject()`, l'ADRESSE effectivement servie — la seule façon de prouver
 * qu'une chaîne n'est plus câblée en dur : la faire varier au site
 * d'enregistrement et observer que le serveur SUIT.
 *
 * `@tus/server`/`@tus/file-store` sont mockés pour la même raison que dans
 * la suite jumelle (ESM pur, non transformable par Jest) — la plomberie du
 * protocole est hors périmètre ; seul le ROUTAGE Fastify est sous test ici.
 */
import Fastify, { FastifyInstance } from 'fastify';
import { describe, it, expect, jest, beforeEach } from '@jest/globals';

jest.mock('@tus/server', () => ({
  Server: class MockTusServer {
    path: string;

    constructor(opts: any) {
      this.path = opts.path;
    }

    handle(_req: any, res: any) {
      // Renvoie le `path` de construction dans le corps : c'est la preuve
      // directe que `new Server({ path })` a reçu l'adresse attendue, pas
      // seulement que la route Fastify a matché.
      res.statusCode = 200;
      res.end(this.path);
    }
  },
}));

jest.mock('@tus/file-store', () => ({
  FileStore: class MockFileStore {
    constructor(_opts: unknown) {}
  },
}));

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() }) },
}));

async function buildApp(basePath?: string): Promise<FastifyInstance> {
  const { registerTusRoutes } = await import('../tus-handler');
  const app = Fastify({ logger: false });
  app.decorate('prisma', {} as any);
  await app.register(registerTusRoutes, basePath ? { basePath } : {});
  await app.ready();
  return app;
}

describe('registerTusRoutes — adresse pilotée par le site d\'enregistrement (#4277)', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it('sert sous la basePath fournie — pas sous /api/v1/uploads codé en dur', async () => {
    const app = await buildApp('/api/v2/uploads-experimental');

    const hitNew = await app.inject({ method: 'POST', url: '/api/v2/uploads-experimental' });
    expect(hitNew.statusCode).toBe(200);
    expect(hitNew.body).toBe('/api/v2/uploads-experimental');

    const missNewWildcard = await app.inject({ method: 'PATCH', url: '/api/v2/uploads-experimental/abc123' });
    expect(missNewWildcard.statusCode).toBe(200);

    // L'ancienne adresse codée en dur ne doit plus répondre — la preuve que
    // la chaîne n'est plus câblée dans le module : un client qui l'appellerait
    // encore obtient un 404 Fastify ordinaire, jamais la route TUS.
    const missOld = await app.inject({ method: 'POST', url: '/api/v1/uploads' });
    expect(missOld.statusCode).toBe(404);

    await app.close();
  });

  it('replie sur /api/v1/uploads (valeur historique) quand aucune basePath n\'est fournie', async () => {
    // Reproduit l'appel ACTUEL de route-registration.ts avant l'application
    // de l'édit d'enregistrement de #4277 (`server.register(registerTusRoutes)`,
    // sans options) — le comportement de PRODUCTION ne doit pas bouger tant
    // que cet édit n'est pas appliqué.
    const app = await buildApp(undefined);

    const hit = await app.inject({ method: 'POST', url: '/api/v1/uploads' });
    expect(hit.statusCode).toBe(200);
    expect(hit.body).toBe('/api/v1/uploads');

    await app.close();
  });
});
