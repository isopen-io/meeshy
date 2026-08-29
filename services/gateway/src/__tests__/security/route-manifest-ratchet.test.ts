/**
 * Le CLIQUET de `route-manifest.json` (#4276, critère 2).
 *
 * `route-manifest.json` est un ARTEFACT commité — la table des routes du
 * gateway (méthode, chemin complet, module d'origine, niveau de sécurité au
 * mieux), produite MÉCANIQUEMENT par `route-manifest/collect.ts` depuis le
 * serveur Fastify ASSEMBLÉ. Un artefact commité qui peut dériver de ce qu'il
 * décrit n'est qu'une opinion de plus — exactement le défaut que ce lot
 * ferme (voir le contexte de l'issue : `apps/web/services/monitoring.service.ts`
 * appelait trois routes `/health/*` qui n'existaient nulle part, #4219 ;
 * `use-group-modal.ts` postait vers `/groups`, absente, #4222). Ce test
 * régénère la table à CHAQUE exécution et la compare, champ par champ, à la
 * version commitée : toute divergence — une route ajoutée sans régénérer,
 * un module renommé, une garde d'authentification déplacée — le fait rougir.
 *
 * Une route ajoutée à `route-registration.ts` sans lancer la régénération
 * fait donc tomber CE test, jamais un `git diff` que personne ne relit.
 *
 * Régénérer : cd services/gateway && npm run route-manifest:generate
 * (équivalent : npx tsx scripts/generate-route-manifest.ts)
 */

import { describe, it, expect } from '@jest/globals';
import fs from 'fs';
import path from 'path';

// `@tus/server`/`@tus/file-store` sont publiés en ESM pur — Jest ne peut pas
// les transformer (`transformIgnorePatterns` de jest.config.json exclut
// node_modules hors `@meeshy/shared`), donc importer `route-manifest/collect`
// sans mock fait échouer TOUTE la suite au chargement (elle importe
// `route-registration.ts`, qui importe `routes/uploads/tus-handler.ts`).
// `route-auth-coverage.test.ts` porte le même mock, en plus élaboré : il y
// préserve le VRAI `onUploadCreate` pour vérifier sa garde d'authentification.
// Ce cliquet n'envoie aucune requête HTTP — il n'a besoin que d'un `Server`
// CONSTRUCTIBLE, jamais fonctionnel.
jest.mock('@tus/server', () => ({
  Server: class MockTusServer {
    constructor(_opts: any) {}
  },
}));
jest.mock('@tus/file-store', () => ({
  FileStore: class MockFileStore {
    constructor(_opts: any) {}
  },
}));

// `routes/voice-profile.ts` et `routes/voice-analysis.ts` appellent
// `ZMQSingleton.getInstance()` à l'enregistrement (pas dans un handler) et
// ouvrent un VRAI socket ZMQ vers 0.0.0.0:5555/5558. Sans mock, ce socket ne
// se ferme jamais (Jest reste bloqué sur les handles ouverts pendant ~2 min)
// — identique à la raison documentée dans `route-auth-coverage.test.ts`.
jest.mock('../../services/ZmqSingleton', () => {
  const { EventEmitter: EE } = require('events');
  return { ZMQSingleton: { getInstance: jest.fn().mockResolvedValue(new EE()) } };
});

import { buildRouteManifest, type ManifestRoute, type RouteManifestArtifact } from '../../route-manifest';

const MANIFEST_PATH = path.resolve(__dirname, '../../../route-manifest.json');
const REGENERATE_COMMAND = 'cd services/gateway && npm run route-manifest:generate';

function routeKey(route: Pick<ManifestRoute, 'method' | 'path'>): string {
  return `${route.method} ${route.path}`;
}

/** Même comparateur que `buildRouteManifest()` — dupliqué à dessein : un test qui importerait le tri de la production ne pourrait jamais le prendre en défaut. */
function byMethodThenPath(a: Pick<ManifestRoute, 'method' | 'path'>, b: Pick<ManifestRoute, 'method' | 'path'>): number {
  return a.method === b.method ? a.path.localeCompare(b.path) : a.method.localeCompare(b.method);
}

describe('Cliquet — route-manifest.json reflète le serveur assemblé', () => {
  it("l'artefact commité existe (sinon : régénérer, jamais l'écrire à la main)", () => {
    expect(fs.existsSync(MANIFEST_PATH)).toBe(true);
  });

  it('garde-fou anti-régression du harnais lui-même : au moins une centaine de routes, routeCount cohérent', async () => {
    const fresh = await buildRouteManifest();
    expect(fresh.routes.length).toBeGreaterThan(100);
    expect(fresh.routeCount).toBe(fresh.routes.length);
  });

  it('les routes sont triées par (méthode, chemin) — sans quoi ce cliquet rougirait au hasard de l’ordre d’enregistrement', async () => {
    const fresh = await buildRouteManifest();
    const keys = fresh.routes.map(routeKey);
    const sortedKeys = [...fresh.routes].sort(byMethodThenPath).map(routeKey);
    expect(keys).toEqual(sortedKeys);
  });

  it('route-manifest.json est identique à une régénération fraîche depuis le serveur assemblé', async () => {
    const committedRaw = fs.readFileSync(MANIFEST_PATH, 'utf8');
    let committed: RouteManifestArtifact;
    try {
      committed = JSON.parse(committedRaw) as RouteManifestArtifact;
    } catch (error) {
      throw new Error(
        `route-manifest.json (${MANIFEST_PATH}) ne se parse pas comme du JSON — ` +
        `il a probablement été édité à la main. Régénérer : ${REGENERATE_COMMAND}\n\n` +
        `Erreur de parsing : ${error instanceof Error ? error.message : String(error)}`
      );
    }

    const fresh = await buildRouteManifest();

    // Comparaison au niveau DONNÉE (pas au caractère près) : un reformatage
    // inoffensif du JSON commité n'a aucune raison de faire rougir ce cliquet,
    // seul un écart de CONTENU en a une.
    if (JSON.stringify(fresh) === JSON.stringify(committed)) {
      return;
    }

    const committedRoutes: readonly ManifestRoute[] = Array.isArray(committed.routes) ? committed.routes : [];
    const freshByKey = new Map(fresh.routes.map((route) => [routeKey(route), route]));
    const committedByKey = new Map(committedRoutes.map((route) => [routeKey(route), route]));

    const added = fresh.routes
      .filter((route) => !committedByKey.has(routeKey(route)))
      .map((route) => `+ ${routeKey(route)}  (module=${route.module})`);

    const removed = committedRoutes
      .filter((route) => !freshByKey.has(routeKey(route)))
      .map((route) => `- ${routeKey(route)}  (module=${route.module})`);

    const changed: string[] = [];
    for (const [key, freshRoute] of freshByKey) {
      const committedRoute = committedByKey.get(key);
      if (!committedRoute) continue;
      if (JSON.stringify(freshRoute) === JSON.stringify(committedRoute)) continue;
      const champs = (Object.keys(freshRoute) as Array<keyof ManifestRoute>).filter(
        (champ) => JSON.stringify(freshRoute[champ]) !== JSON.stringify(committedRoute[champ])
      );
      changed.push(`~ ${key}  (${champs.join(', ')} a/ont changé)`);
    }

    const noticeChanged = JSON.stringify(fresh.notice) !== JSON.stringify(committed.notice);
    const orderChanged =
      added.length === 0 && removed.length === 0 && changed.length === 0 && !noticeChanged &&
      JSON.stringify(fresh.routes.map(routeKey)) !== JSON.stringify(committedRoutes.map(routeKey));

    const lignes = [
      ...added,
      ...removed,
      ...changed,
      ...(noticeChanged ? ['~ notice  (description des colonnes ou légende de sécurité a changé)'] : []),
      ...(orderChanged ? ['~ ordre des routes (mêmes routes, ordre différent)'] : []),
    ];

    throw new Error(
      `route-manifest.json (${MANIFEST_PATH}) est PÉRIMÉ par rapport au serveur assemblé — ` +
      `${lignes.length} différence(s) :\n\n` +
      lignes.slice(0, 80).join('\n') +
      (lignes.length > 80 ? `\n… et ${lignes.length - 80} de plus` : '') +
      `\n\nRégénérer avec : ${REGENERATE_COMMAND}`
    );
  });
});
