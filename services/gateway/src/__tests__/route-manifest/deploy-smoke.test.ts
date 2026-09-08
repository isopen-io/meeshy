/**
 * #5644 — le test de fumée post-déploiement doit frapper les routes que les
 * clients publiés appellent réellement (dérivées de `route-manifest.json`,
 * filtrées des routes d'exploitation — `OPS_ONLY_ROUTES`) et distinguer un
 * 404 (route ABSENTE du serveur assemblé) d'un 401 ou tout autre code (route
 * PRÉSENTE, verdict métier). Ces trois fonctions sont la règle PURE derrière
 * `scripts/smoke-test-deployed-routes.ts`.
 */
import { describe, it, expect } from '@jest/globals';

import {
  classifyRouteProbe,
  resolveSmokeTestPath,
  selectSmokeTestRoutes,
  type ManifestRouteInput,
} from '../../route-manifest/deploy-smoke';

describe('classifyRouteProbe', () => {
  it('classe un 404 comme route ABSENTE', () => {
    expect(classifyRouteProbe(404)).toBe('absent');
  });

  it.each([200, 201, 400, 401, 403, 409, 429, 500, 503])(
    'classe un %i comme route PRÉSENTE (le serveur a matché la route)',
    (code) => {
      expect(classifyRouteProbe(code)).toBe('present');
    }
  );
});

describe('resolveSmokeTestPath', () => {
  it('laisse un chemin sans paramètre inchangé', () => {
    expect(resolveSmokeTestPath('/api/v1/admin/agent/configs')).toBe('/api/v1/admin/agent/configs');
  });

  it('substitue un segment `:param` par un identifiant plausible (forme ObjectId)', () => {
    const résolu = resolveSmokeTestPath('/api/v1/admin/agent/configs/:conversationId');
    expect(résolu).toBe('/api/v1/admin/agent/configs/000000000000000000000000');
  });

  it('substitue chaque paramètre indépendamment sur un chemin à plusieurs segments dynamiques', () => {
    const résolu = resolveSmokeTestPath('/api/v1/admin/agent/roles/:conversationId/:userId/assign');
    expect(résolu).toBe(
      '/api/v1/admin/agent/roles/000000000000000000000000/000000000000000000000000/assign'
    );
  });

  it('substitue un segment `*` (wildcard Fastify) par le même identifiant plausible', () => {
    expect(resolveSmokeTestPath('/api/attachments/file/*')).toBe(
      '/api/attachments/file/000000000000000000000000'
    );
  });
});

describe('selectSmokeTestRoutes', () => {
  const manifest = (routes: readonly ManifestRouteInput[]) => ({ routeCount: routes.length, routes });

  it('ne retient que les routes GET — les autres verbes ne se sondent pas sans risque de mutation', () => {
    const routes = selectSmokeTestRoutes(
      manifest([
        { method: 'GET', path: '/api/v1/conversations' },
        { method: 'POST', path: '/api/v1/conversations' },
        { method: 'DELETE', path: '/api/v1/conversations/:id' },
      ])
    );

    expect(routes).toEqual([{ method: 'GET', path: '/api/v1/conversations' }]);
  });

  it("retire les routes d'exploitation (OPS_ONLY_ROUTES) — jamais appelées par un client publié", () => {
    const routes = selectSmokeTestRoutes(
      manifest([
        { method: 'GET', path: '/api/v1/stats' },
        { method: 'GET', path: '/api/v1/conversations' },
      ])
    );

    expect(routes).toEqual([{ method: 'GET', path: '/api/v1/conversations' }]);
  });

  it('rend un tableau vide sur un manifeste sans route GET client', () => {
    expect(selectSmokeTestRoutes(manifest([{ method: 'POST', path: '/api/v1/conversations' }]))).toEqual([]);
  });
});
