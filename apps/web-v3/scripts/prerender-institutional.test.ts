import { describe, expect, test } from 'bun:test';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolveDistDir } from './prerender-institutional';

/**
 * LE TÉMOIN DU DIST RÉELLEMENT CONSTRUIT (#5821).
 *
 * `check-shell-dist.mjs` construit la variante B avec `--outDir
 * dist-capacitor` ; le greffon `meeshy-prerender-institutional` de
 * `vite.config.ts` tourne pour les DEUX variantes et invoquait ce script en
 * lui laissant deviner `../dist` — faux dès que l'`outDir` diffère, et
 * silencieusement faux quand un `dist/` d'une construction PRÉCÉDENTE traîne
 * encore (le script écrit alors dans le mauvais dossier sans qu'aucune
 * erreur ne le signale). `resolveDistDir` retire la supposition : le
 * greffon transmet l'`outDir` RÉSOLU par `MEESHY_PRERENDER_DIST`, ce script
 * ne fait plus que le lire.
 *
 * Importer ce module ne construit rien : le pilote (`main()`) ne tourne que
 * si le fichier est le point d'entrée, même garde que `check-shell-dist.mjs`
 * (#5604, revue-correction).
 */

const HERE = dirname(fileURLToPath(import.meta.url));

describe('resolveDistDir — le dist réellement construit, jamais deviné', () => {
  test('sans MEESHY_PRERENDER_DIST, retombe sur ../dist (lancement isolé, variante A par défaut)', () => {
    expect(resolveDistDir({})).toBe(join(HERE, '../dist'));
  });

  test('MEESHY_PRERENDER_DIST impose le dist RÉELLEMENT construit (variante B, --outDir dist-capacitor)', () => {
    const outDir = join(HERE, '../dist-capacitor');
    expect(resolveDistDir({ MEESHY_PRERENDER_DIST: outDir })).toBe(outDir);
  });

  test('une chaîne vide reste une valeur EXPLICITE, jamais remplacée par le repli', () => {
    // `??` ne retombe que sur `undefined`/`null` — une chaîne vide déclarée
    // par l'appelant ne doit pas se faire écraser silencieusement.
    expect(resolveDistDir({ MEESHY_PRERENDER_DIST: '' })).toBe('');
  });
});
