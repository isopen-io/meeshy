/**
 * Cliquet : les objets de routes Kotlin du client Android sont-ils à jour ? (#11817)
 *
 * Jumeau de `ios-endpoints-generated-ratchet.test.ts`. Il régénère depuis le VRAI
 * manifeste et compare aux fichiers du disque, octet pour octet, et refuse les
 * fichiers générés orphelins.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { buildApiEndpointsCatalog, type ManifestRouteInput } from '../build-catalog.js';
import { renderKotlinEndpoints } from '../build-kotlin-endpoints.js';
import { filterOutOpsOnlyRoutes } from '../ops-only-routes.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '../../../..');
const MANIFEST_PATH = resolve(REPO_ROOT, 'services/gateway/route-manifest.json');
const OUTPUT_DIR = resolve(
  REPO_ROOT,
  'apps/android/core/network/src/main/kotlin/me/meeshy/sdk/net/routes'
);
const GENERATED_MARK = '// GÉNÉRÉ — ne pas éditer à la main.';
const REGENERATE = 'cd packages/shared && npm run android-endpoints:generate';

function manifestRoutes(): readonly ManifestRouteInput[] {
  const parsed = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as {
    routes: readonly ManifestRouteInput[];
  };
  return filterOutOpsOnlyRoutes(parsed.routes);
}

describe('cliquet — les objets de routes Kotlin suivent le manifeste', () => {
  it('chaque fichier généré est identique à sa régénération', () => {
    const files = renderKotlinEndpoints(buildApiEndpointsCatalog(manifestRoutes()).entries);
    expect(files.length).toBeGreaterThan(10);

    for (const file of files) {
      const onDisk = readFileSync(join(OUTPUT_DIR, file.fileName), 'utf8');
      expect(onDisk, `${file.fileName} a divergé du manifeste. Régénérer : ${REGENERATE}`).toBe(
        file.source
      );
    }
  });

  it('aucun fichier ORPHELIN ne subsiste dans le dossier généré', () => {
    const expected = new Set(
      renderKotlinEndpoints(buildApiEndpointsCatalog(manifestRoutes()).entries).map(
        (file) => file.fileName
      )
    );
    const orphans = readdirSync(OUTPUT_DIR).filter(
      (name) =>
        name.endsWith('.kt') &&
        !expected.has(name) &&
        readFileSync(join(OUTPUT_DIR, name), 'utf8').startsWith(GENERATED_MARK)
    );
    expect(orphans, `Fichiers sans route au manifeste. Régénérer : ${REGENERATE}`).toEqual([]);
  });
});
