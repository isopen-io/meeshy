/**
 * Garde de source W1 — le web n'a qu'UNE bouche pour parler au contrat.
 *
 * Modèle : `__tests__/focal/reading-modes-flag-single-occurrence.test.ts`
 * (marche d'arbre `fs`, mêmes exclusions).
 *
 * Elle COMPTE 1, elle n'assère pas une absence. C'est délibéré : une garde
 * formulée « personne n'appelle X » passerait au vert le jour où X disparaît,
 * en perdant sa protection. Ici, `lib/composer-door.ts` doit être trouvé, et
 * être le SEUL — un second appelant fait rougir, la disparition du premier
 * aussi.
 *
 * Ce que ça protège, concrètement :
 *  - `composerOpening(` — un second appelant serait un second endroit où la
 *    composition se résout en booléen, donc une seconde chance de diverger de
 *    la table partagée ;
 *  - `buildUpdatePayload(` — un appel direct contournerait le retrait des deux
 *    champs que le web ne sait pas rendre (`WEB_UNWRITABLE_POST_FIELDS`).
 */
import * as fs from 'fs';
import * as path from 'path';

const WEB_ROOT = path.join(__dirname, '../..');
const SINGLE_SOURCE = 'lib/composer-door.ts';

const EXCLUDED_DIRS = new Set([
  'node_modules',
  '.next',
  'dist',
  'coverage',
  'test-results',
  'playwright-report',
  '__tests__',
]);

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx']);

function isTestFile(filePath: string): boolean {
  return /\.(test|spec)\.[jt]sx?$/.test(filePath);
}

function walk(dir: string, files: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (EXCLUDED_DIRS.has(entry.name)) continue;
      walk(path.join(dir, entry.name), files);
      continue;
    }

    const fullPath = path.join(dir, entry.name);
    const ext = path.extname(entry.name);
    if (!SOURCE_EXTENSIONS.has(ext)) continue;
    if (entry.name.endsWith('.d.ts')) continue;
    if (isTestFile(fullPath)) continue;

    files.push(fullPath);
  }
  return files;
}

function productionFilesCalling(literal: string): string[] {
  return walk(WEB_ROOT)
    .filter((file) => fs.readFileSync(file, 'utf8').includes(literal))
    .map((file) => path.relative(WEB_ROOT, file))
    .sort();
}

describe('Garde W1 — un seul point du web parle le vocabulaire du contrat partagé', () => {
  it('`composerOpening(` est appelé dans EXACTEMENT UN fichier de production, et c\'est lib/composer-door.ts', () => {
    expect(productionFilesCalling('composerOpening(')).toEqual([SINGLE_SOURCE]);
  });

  it('`buildUpdatePayload(` est appelé dans EXACTEMENT UN fichier de production, et c\'est lib/composer-door.ts', () => {
    expect(productionFilesCalling('buildUpdatePayload(')).toEqual([SINGLE_SOURCE]);
  });

  it('ce fichier unique importe bien la loi partagée au lieu de la recopier', () => {
    const source = fs.readFileSync(path.join(WEB_ROOT, SINGLE_SOURCE), 'utf8');
    expect(source).toContain("from '@meeshy/shared/utils/composer-contract'");
    expect(source).toContain("from '@meeshy/shared/utils/reel-composition'");
  });
});
