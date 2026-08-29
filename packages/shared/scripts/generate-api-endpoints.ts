/**
 * Régénère `api/endpoints.ts` depuis `services/gateway/route-manifest.json`
 * (#4276, #4280 critère 2).
 *
 * Usage (une commande, sans argument), depuis `packages/shared` :
 *
 *   npm run api-endpoints:generate
 *   # ou, équivalent : npx tsx scripts/generate-api-endpoints.ts
 *
 * Ce script est un simple CLI autour de `buildApiEndpointsCatalog()`
 * (`api/build-catalog.ts`) — toute la RÈGLE de dérivation vit là-bas, testée
 * indépendamment de tout accès fichier. Ici, on ne fait que lire le
 * manifeste, appeler la fonction pure, et écrire son résultat.
 *
 * Comme `services/gateway/scripts/generate-route-manifest.ts` dont ce script
 * s'inspire, il n'est PAS couvert par `tsconfig.json` (`include` ne liste que
 * `types/`, `utils/`, `encryption/`, `agent/`, `providers/`, et désormais
 * `api/` — jamais `scripts/`) : il s'exécute via `tsx`, qui transpile sans
 * vérifier le graphe de types du paquet entier. C'est la même convention que
 * le gateway applique déjà à ses propres scripts CLI.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildApiEndpointsCatalog, type ManifestRouteInput } from '../api/build-catalog.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '../../..');
const MANIFEST_PATH = resolve(REPO_ROOT, 'services/gateway/route-manifest.json');
const OUTPUT_PATH = resolve(HERE, '../api/endpoints.ts');
const REGENERATE_MANIFEST_COMMAND = 'cd services/gateway && npm run route-manifest:generate';

interface RawManifestFile {
  readonly routes: readonly ManifestRouteInput[];
}

function readManifest(): readonly ManifestRouteInput[] {
  let raw: string;
  try {
    raw = readFileSync(MANIFEST_PATH, 'utf8');
  } catch (error) {
    throw new Error(
      `Manifeste introuvable : ${MANIFEST_PATH}. Le générer d'abord : ${REGENERATE_MANIFEST_COMMAND}\n` +
        `(${error instanceof Error ? error.message : String(error)})`
    );
  }

  let parsed: RawManifestFile;
  try {
    parsed = JSON.parse(raw) as RawManifestFile;
  } catch (error) {
    throw new Error(
      `${MANIFEST_PATH} ne se parse pas comme du JSON — a-t-il été édité à la main ? ` +
        `Régénérer : ${REGENERATE_MANIFEST_COMMAND}\n` +
        `(${error instanceof Error ? error.message : String(error)})`
    );
  }

  if (!Array.isArray(parsed.routes)) {
    throw new Error(`${MANIFEST_PATH} ne porte pas de tableau "routes" — forme inattendue.`);
  }

  return parsed.routes.map((route) => ({ method: route.method, path: route.path }));
}

function main(): void {
  const routes = readManifest();
  const { source, pathTemplates } = buildApiEndpointsCatalog(routes);

  writeFileSync(OUTPUT_PATH, source, 'utf8');

  // eslint-disable-next-line no-console
  console.log(
    `api/endpoints.ts régénéré depuis ${routes.length} route(s) du manifeste ` +
      `(${pathTemplates.length} chemin(s) unique(s)) → ${OUTPUT_PATH}`
  );
}

main();
