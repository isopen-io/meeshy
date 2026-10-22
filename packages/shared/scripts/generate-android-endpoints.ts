/**
 * Régénère les objets de routes Kotlin du client Android (#11817) depuis
 * `services/gateway/route-manifest.json`.
 *
 * Usage, depuis `packages/shared` :
 *
 *   npm run android-endpoints:generate
 *   npm run android-endpoints:generate -- --check   # échoue si un fichier a divergé
 *
 * Jumeau de `generate-ios-endpoints.ts` : manifeste → `buildApiEndpointsCatalog()`
 * → rendu. Il supprime les fichiers générés devenus orphelins (reconnus à leur
 * marque d'en-tête, jamais à une liste de noms).
 */

import { exigerNodeRecent } from '../../../scripts/node-guard/require-node-runtime.js';

exigerNodeRecent('packages/shared/scripts/generate-android-endpoints.ts');

import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildApiEndpointsCatalog, type ManifestRouteInput } from '../api/build-catalog.js';
import { renderKotlinEndpoints } from '../api/build-kotlin-endpoints.js';
import { filterOutOpsOnlyRoutes } from '../api/ops-only-routes.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '../../..');
const MANIFEST_PATH = resolve(REPO_ROOT, 'services/gateway/route-manifest.json');
const OUTPUT_DIR = resolve(
  REPO_ROOT,
  'apps/android/core/network/src/main/kotlin/me/meeshy/sdk/net/routes'
);
const GENERATED_MARK = '// GÉNÉRÉ — ne pas éditer à la main.';

function readManifest(): readonly ManifestRouteInput[] {
  const parsed = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as {
    routes?: readonly ManifestRouteInput[];
  };
  if (!Array.isArray(parsed.routes) || parsed.routes.length === 0) {
    throw new Error(
      `Manifeste vide ou sans champ "routes" : ${MANIFEST_PATH}. ` +
        'Le régénérer : cd services/gateway && npm run route-manifest:generate'
    );
  }
  return parsed.routes;
}

function generatedFilesOnDisk(): readonly string[] {
  try {
    return readdirSync(OUTPUT_DIR).filter(
      (name) =>
        name.endsWith('.kt') && readFileSync(join(OUTPUT_DIR, name), 'utf8').startsWith(GENERATED_MARK)
    );
  } catch {
    return [];
  }
}

function main(): void {
  const check = process.argv.includes('--check');
  const { entries } = buildApiEndpointsCatalog(filterOutOpsOnlyRoutes(readManifest()));
  const files = renderKotlinEndpoints(entries);
  const expected = new Set(files.map((file) => file.fileName));

  if (check) {
    const stale = [
      ...files
        .filter((file) => {
          try {
            return readFileSync(join(OUTPUT_DIR, file.fileName), 'utf8') !== file.source;
          } catch {
            return true;
          }
        })
        .map((file) => file.fileName),
      ...generatedFilesOnDisk().filter((name) => !expected.has(name)),
    ];
    if (stale.length > 0) {
      console.error(
        `Routes Kotlin périmées (${stale.join(', ')}). Régénérer : cd packages/shared && npm run android-endpoints:generate`
      );
      process.exit(1);
    }
    console.log(`${files.length} objets de routes Kotlin à jour.`);
    return;
  }

  mkdirSync(OUTPUT_DIR, { recursive: true });
  for (const name of generatedFilesOnDisk()) {
    if (expected.has(name)) continue;
    rmSync(join(OUTPUT_DIR, name));
    console.log(`- ${name} (namespace disparu du manifeste)`);
  }
  for (const file of files) {
    writeFileSync(join(OUTPUT_DIR, file.fileName), file.source, 'utf8');
  }
  console.log(`${files.length} objets écrits dans ${OUTPUT_DIR} (${entries.length} adresses).`);
}

main();
