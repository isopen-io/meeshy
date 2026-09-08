/**
 * TDD de `filterOutOpsOnlyRoutes()` (#5424) — le filtre qui retire les
 * routes d'EXPLOITATION (jamais destinées à un client Meeshy) des catalogues
 * dérivés du manifeste, sans jamais toucher au manifeste lui-même.
 *
 * Le second bloc confronte la liste déclarée au VRAI manifeste : une entrée
 * qui ne désigne plus rien (route renommée, retirée) est un piège muet — le
 * filtre continuerait de tourner sans jamais rien retirer, et personne ne le
 * verrait avant `check-ts-catalog-dead-entries.mjs`/`check-swift-catalog-dead-entries.mjs`
 * qui compteraient l'entrée comme dette au lieu de disparue par décision.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { OPS_ONLY_ROUTES, filterOutOpsOnlyRoutes, isOpsOnlyRoute, type ManifestRouteInput } from '../ops-only-routes.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '../../../..');
const MANIFEST_PATH = resolve(REPO_ROOT, 'services/gateway/route-manifest.json');

describe('filterOutOpsOnlyRoutes — retire les routes déclarées, rien de plus', () => {
  const CLIENT_ROUTE: ManifestRouteInput = { method: 'GET', path: '/api/v1/conversations' };

  it('retire chacune des routes déclarées', () => {
    const routes = [CLIENT_ROUTE, ...OPS_ONLY_ROUTES];

    const filtered = filterOutOpsOnlyRoutes(routes);

    expect(filtered).toEqual([CLIENT_ROUTE]);
  });

  it('ne retire AUCUNE route non déclarée', () => {
    const others: readonly ManifestRouteInput[] = [
      CLIENT_ROUTE,
      { method: 'GET', path: '/health' },
      { method: 'GET', path: '/api/v1/stats/other' },
      { method: 'GET', path: '/api/v1/user-status/history' },
    ];

    expect(filterOutOpsOnlyRoutes(others)).toEqual(others);
  });

  it('distingue par MÉTHODE — un même chemin sous un autre verbe survit', () => {
    const sameLikePath = OPS_ONLY_ROUTES[0];
    const otherVerb: ManifestRouteInput = { method: 'DELETE', path: sameLikePath.path };

    expect(isOpsOnlyRoute(otherVerb)).toBe(false);
    expect(filterOutOpsOnlyRoutes([otherVerb])).toEqual([otherVerb]);
  });
});

describe('OPS_ONLY_ROUTES — chacune existe RÉELLEMENT dans le manifeste', () => {
  it('n\'est pas vide', () => {
    expect(OPS_ONLY_ROUTES.length).toBeGreaterThan(0);
  });

  it('chaque entrée désigne une route SERVIE — une entrée périmée ne filtre plus rien', () => {
    const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as {
      readonly routes: readonly ManifestRouteInput[];
    };
    const served = new Set(manifest.routes.map((r) => `${r.method} ${r.path}`));

    const missing = OPS_ONLY_ROUTES.filter((r) => !served.has(`${r.method} ${r.path}`));

    expect(missing).toEqual([]);
  });

  it('`GET /info` n\'y figure PAS — cette route est retirée du gateway, pas filtrée du catalogue', () => {
    expect(OPS_ONLY_ROUTES.some((r) => r.path === '/info')).toBe(false);
  });
});
