/**
 * `GET /admin/route-usage` (#4275) — la mesure lisible sans SSH (critère 2).
 *
 * Ce que ces témoins protègent, dans l'ordre de ce qui coûterait le plus
 * cher :
 *
 * 1. **La porte est S5, ET les DEUX permissions sont exigées.** Exactement le
 *    même piège que `health-probes.test.ts` documente pour
 *    `/health/metrics` : `canAccessAdmin` et `canViewAnalytics` ne se
 *    distinguent qu'en ANALYST (porte la seconde sans la première) et
 *    MODERATOR (porte la première sans la seconde). Un témoin qui n'essaie
 *    que BIGBOSS et USER passerait au vert avec UNE SEULE des deux.
 * 2. **La route n'est PAS montée par ce lot** (territoire strict, #4275) —
 *    elle est prouvée ici en la montant elle-même sur une instance Fastify
 *    JETABLE, comme le font les autres suites de `routes/admin/__tests__/`.
 * 3. **La charge sert bien ce que le compteur agrège**, sans le recomposer
 *    à la main dans le test — on écrit dans le VRAI singleton
 *    (`routeUsageCounter`), on lit la VRAIE réponse HTTP sérialisée.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import Fastify, { type FastifyInstance } from 'fastify';

import { routeUsageRoutes } from '../../../../routes/admin/route-usage';
import { routeUsageCounter } from '../../../../utils/route-usage-counter';

const PREFIX = '/api/v1/admin';

const makeAuthContext = (role = 'ADMIN') => ({
  isAuthenticated: true,
  registeredUser: { id: 'adminUser', role, username: 'admin' },
});

function buildApp(role = 'ADMIN'): FastifyInstance {
  const app = Fastify({ logger: false });
  app.decorate('authenticate', async (request: any) => {
    request.authContext = makeAuthContext(role);
  });
  app.register(routeUsageRoutes, { prefix: PREFIX });
  return app;
}

function buildNoAuthApp(): FastifyInstance {
  const app = Fastify({ logger: false });
  app.decorate('authenticate', async () => {});
  app.register(routeUsageRoutes, { prefix: PREFIX });
  return app;
}

function inject(app: FastifyInstance) {
  return app.inject({ method: 'GET', url: `${PREFIX}/route-usage` });
}

// ════════════════════════════════════════════════════════════════════════════
// S5 — la porte, sur les SIX rôles
// ════════════════════════════════════════════════════════════════════════════

describe('GET /api/v1/admin/route-usage — S5', () => {
  afterEach(() => {
    routeUsageCounter.clear();
  });

  it('rejette un appelant anonyme (401)', async () => {
    const app = buildNoAuthApp();
    await app.ready();
    const res = await inject(app);
    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body).success).toBe(false);
    await app.close();
  });

  // Les deux permissions exigées — `canAccessAdmin` ET `canViewAnalytics` —
  // ne se distinguent qu'ici : ANALYST porte la seconde sans la première,
  // MODERATOR la première sans la seconde. Un témoin qui n'essaierait que
  // BIGBOSS et USER passerait au vert avec UNE SEULE des deux (cf.
  // routes/health/__tests__/health-probes.test.ts, même piège).
  const ADMIS = ['BIGBOSS', 'ADMIN', 'AUDIT'];
  const REFUSES = ['MODERATOR', 'ANALYST', 'USER'];

  it.each(ADMIS)('admet %s (200)', async (role) => {
    const app = buildApp(role);
    await app.ready();
    const res = await inject(app);
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it.each(REFUSES)('refuse %s (403)', async (role) => {
    const app = buildApp(role);
    await app.ready();
    const res = await inject(app);
    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).success).toBe(false);
    await app.close();
  });
});

// ════════════════════════════════════════════════════════════════════════════
// La charge — ce qu'elle sert réellement
// ════════════════════════════════════════════════════════════════════════════

describe('GET /api/v1/admin/route-usage — la charge', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    routeUsageCounter.clear();
    app = buildApp('ADMIN');
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    routeUsageCounter.clear();
  });

  it('sert un instantané vide sur un compteur vierge, jamais une erreur', async () => {
    const res = await inject(app);
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.entries).toEqual([]);
    expect(body.data.window.bucketCount).toBe(0);
    expect(body.data.window.coverageMs).toBe(0);
  });

  it('sert le compte agrégé écrit dans le VRAI singleton, pas une copie', async () => {
    routeUsageCounter.record({ method: 'GET', route: '/api/v1/admin/reports', versionHeader: '1.4.2' });
    routeUsageCounter.record({ method: 'GET', route: '/api/v1/admin/reports', versionHeader: '1.4.2' });
    routeUsageCounter.record({ method: 'DELETE', route: '/api/v1/users/:id/legacy-alias', versionHeader: undefined });

    const res = await inject(app);
    const body = JSON.parse(res.body);
    expect(body.data.entries).toEqual(
      expect.arrayContaining([
        { method: 'GET', route: '/api/v1/admin/reports', clientVersion: '1.4.2', count: 2 },
        { method: 'DELETE', route: '/api/v1/users/:id/legacy-alias', clientVersion: 'unknown', count: 1 },
      ])
    );
  });

  it('sert `window.windowMs`/`bucketMs` tels que portés par le compteur — un lecteur peut juger la granularité', async () => {
    const res = await inject(app);
    const body = JSON.parse(res.body);
    expect(body.data.window.windowMs).toBe(routeUsageCounter.windowMsValue);
    expect(body.data.window.bucketMs).toBe(routeUsageCounter.bucketMsValue);
  });

  it('sert `coverageMs` < `windowMs` sur un compteur jeune — le garde-fou contre le faux zéro (critère 5)', async () => {
    routeUsageCounter.record({ method: 'GET', route: '/api/v1/x', versionHeader: undefined });
    const res = await inject(app);
    const body = JSON.parse(res.body);
    expect(body.data.window.coverageMs).toBeLessThan(body.data.window.windowMs);
    expect(body.data.window.coverageMs).toBeGreaterThanOrEqual(0);
  });

  it("n'expose jamais un identifiant concret dans `route` — seul le gabarit sort (critère 1)", async () => {
    routeUsageCounter.record({ method: 'GET', route: '/api/v1/users/:id', versionHeader: undefined });
    const res = await inject(app);
    const body = JSON.parse(res.body);
    for (const entry of body.data.entries) {
      expect(entry.route).not.toMatch(/[0-9a-f]{24}/); // forme d'un ObjectId Mongo
    }
  });
});
