/**
 * Régénère les énumérations d'endpoints Swift du SDK iOS (#4282) depuis
 * `services/gateway/route-manifest.json`.
 *
 * Usage (une commande, sans argument), depuis `packages/shared` :
 *
 *   npm run ios-endpoints:generate
 *   # ou, équivalent : npx tsx scripts/generate-ios-endpoints.ts
 *
 * Jumeau de `generate-api-endpoints.ts`, et volontairement bâti sur la même
 * chaîne : manifeste → `buildApiEndpointsCatalog()` → rendu. La RÈGLE de
 * nommage vit dans `api/build-catalog.ts`, la SYNTAXE Swift dans
 * `api/build-swift-endpoints.ts` ; ce script ne fait que lire, appeler, écrire.
 *
 * Il SUPPRIME les fichiers générés devenus orphelins — un namespace qui perd sa
 * dernière route laisserait sinon un `enum` décrivant des adresses que le
 * serveur ne sert plus, et rien ne le dirait. `MeeshyEndpoint.swift`, écrit à
 * la main, est explicitement préservé.
 */

import { exigerNodeRecent } from '../../../scripts/require-node-runtime.js';

// AVANT tout autre import : ce qui suit charge undici par transitivite,
// et un Node trop ancien y echoue sur une pile qui ne nomme pas la cause.
exigerNodeRecent('packages/shared/scripts/generate-ios-endpoints.ts');

import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildApiEndpointsCatalog, type ManifestRouteInput } from '../api/build-catalog.js';
import { renderSwiftEndpoints } from '../api/build-swift-endpoints.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '../../..');
const MANIFEST_PATH = resolve(REPO_ROOT, 'services/gateway/route-manifest.json');
const OUTPUT_DIR = resolve(
  REPO_ROOT,
  'packages/MeeshySDK/Sources/MeeshySDK/Networking/Endpoints'
);
/**
 * L'en-tête que ce script pose sur chaque fichier qu'il écrit. Il sert aussi de
 * MARQUE de propriété : la suppression des orphelins ne touche que les fichiers
 * qui la portent.
 *
 * Une LISTE de fichiers écrits à la main aurait fait l'affaire le jour de son
 * écriture, et se serait périmée au premier fichier ajouté — silencieusement,
 * en supprimant du code que personne n'a demandé à générer. La marque, elle,
 * voyage avec le fichier.
 */
const GENERATED_MARK = '// GÉNÉRÉ — ne pas éditer à la main.';
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
  const parsed = JSON.parse(raw) as RawManifestFile;
  if (!Array.isArray(parsed.routes) || parsed.routes.length === 0) {
    throw new Error(
      `Manifeste vide ou sans champ "routes" : ${MANIFEST_PATH}. ` +
        `Le régénérer : ${REGENERATE_MANIFEST_COMMAND}`
    );
  }
  return parsed.routes;
}

function main(): void {
  const { entries } = buildApiEndpointsCatalog(readManifest());
  const files = renderSwiftEndpoints(entries);

  mkdirSync(OUTPUT_DIR, { recursive: true });

  const written = new Set(files.map((file) => file.fileName));
  for (const existing of readdirSync(OUTPUT_DIR)) {
    if (!existing.endsWith('.swift')) continue;
    if (written.has(existing)) continue;
    const path = join(OUTPUT_DIR, existing);
    if (!readFileSync(path, 'utf8').startsWith(GENERATED_MARK)) continue;
    rmSync(path);
    console.log(`- ${existing} (namespace disparu du manifeste)`);
  }

  for (const file of files) {
    writeFileSync(join(OUTPUT_DIR, file.fileName), file.source, 'utf8');
  }

  console.log(
    `${files.length} énumérations écrites dans ${OUTPUT_DIR} ` +
      `(${entries.length} adresses, ${new Set(entries.map((e) => e.namespace)).size} namespaces).`
  );
}

main();
