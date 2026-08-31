/**
 * Cliquet : les énumérations Swift du SDK iOS sont-elles à jour ? (#4282)
 *
 * Jumeau de `endpoints-manifest-ratchet.test.ts`, qui joue ce rôle pour la
 * projection TypeScript. Il régénère depuis le VRAI manifeste et compare aux
 * fichiers du disque, octet pour octet.
 *
 * Ce qu'il attrape, et qu'aucun test Swift ne pourrait voir : une route
 * ajoutée, retirée ou renommée côté serveur pendant que le catalogue iOS reste
 * figé. Le symptôme sans lui est un 404 en production sur une route que le
 * client croit connaître — donc à l'exécution, chez l'utilisateur, et non à la
 * compilation.
 *
 * Il vérifie aussi qu'aucun fichier ORPHELIN ne subsiste : un namespace qui
 * perd sa dernière route laisserait un `enum` décrivant des adresses que le
 * serveur ne sert plus, et un `enum` qui compile ne dit jamais qu'il ment.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { buildApiEndpointsCatalog, type ManifestRouteInput } from '../build-catalog.js';
import { renderSwiftEndpoints } from '../build-swift-endpoints.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '../../../..');
const MANIFEST_PATH = resolve(REPO_ROOT, 'services/gateway/route-manifest.json');
const OUTPUT_DIR = resolve(
  REPO_ROOT,
  'packages/MeeshySDK/Sources/MeeshySDK/Networking/Endpoints'
);
const HAND_WRITTEN = new Set(['MeeshyEndpoint.swift']);
const REGENERATE = 'cd packages/shared && npm run ios-endpoints:generate';

function manifestRoutes(): readonly ManifestRouteInput[] {
  const parsed = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as {
    routes: readonly ManifestRouteInput[];
  };
  return parsed.routes;
}

describe("cliquet — les énumérations Swift suivent le manifeste", () => {
  it('chaque fichier généré est identique à sa régénération', () => {
    const files = renderSwiftEndpoints(buildApiEndpointsCatalog(manifestRoutes()).entries);
    expect(files.length).toBeGreaterThan(0);

    for (const file of files) {
      const onDisk = readFileSync(join(OUTPUT_DIR, file.fileName), 'utf8');
      expect(onDisk, `${file.fileName} a divergé du manifeste. Régénérer : ${REGENERATE}`).toBe(
        file.source
      );
    }
  });

  it('aucun fichier ORPHELIN ne subsiste dans le dossier généré', () => {
    const expected = new Set(
      renderSwiftEndpoints(buildApiEndpointsCatalog(manifestRoutes()).entries).map(
        (file) => file.fileName
      )
    );
    const orphans = readdirSync(OUTPUT_DIR).filter(
      (name) => name.endsWith('.swift') && !HAND_WRITTEN.has(name) && !expected.has(name)
    );
    expect(orphans, `Fichiers sans route au manifeste. Régénérer : ${REGENERATE}`).toEqual([]);
  });

  /**
   * Fusible : les deux témoins ci-dessus passeraient au vert sur un dossier
   * VIDE — le premier ne bouclerait sur rien, le second ne trouverait aucun
   * orphelin. Ce qu'ils protègent est précisément l'existence du catalogue.
   */
  it('le dossier généré contient bien les énumérations, pas seulement le protocole', () => {
    const swift = readdirSync(OUTPUT_DIR).filter((name) => name.endsWith('.swift'));
    expect(swift.length).toBeGreaterThan(10);
    expect(swift).toContain('MeeshyEndpoint.swift');
    expect(swift).toContain('AuthEndpoint.swift');
  });
});
