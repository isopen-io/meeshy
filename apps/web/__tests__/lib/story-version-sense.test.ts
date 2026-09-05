/**
 * #4774 — le web n'a qu'UN sens à porter : la LECTURE.
 *
 * Aucune surface web ne VALIDE un canvas (la validation vit côté passerelle,
 * `CanvasV3Schema` + `rejectNonV3StoryEffects`). Le web ne fait que rendre, et
 * un lecteur qui se durcit rend le VIDE : la forme v1 (`textObjects`,
 * `background`…) est absente d'un document v3+, donc rétrograder un `v: 4` sur
 * la branche legacy ne dégrade pas le rendu, il le supprime.
 *
 * Ce fichier tient donc deux choses :
 *  1. le prédicat de lecture EXISTE, nommé par son sens, et il est UNIQUE ;
 *  2. aucun consommateur ne le réécrit à la main (le cliquet ci-dessous) —
 *     c'est cette réécriture, six fois, qui a produit la divergence #4774.
 *
 * Leçon 261 : le témoin porte sur le rang 4. Au rang 3, `v === 3` et `v >= 3`
 * rendent le même verdict et aucun témoin ne peut tomber.
 */

import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

import { isCanvasV3OrNewer } from '@/lib/story-transforms';

const WEB_ROOT = join(__dirname, '..', '..');

/** Le seul site autorisé à ÉCRIRE la comparaison, côté web. */
const SITE_UNIQUE = join('lib', 'story-transforms.ts');

/**
 * Un prédicat de version écrit à la main : une marque (`v`, `.v`, `mark`,
 * `version`) comparée au littéral 3. La forme, pas le nom du fichier — c'est
 * ce qui rattrape une septième réécriture dans un fichier qu'on n'a pas prévu.
 */
const PREDICAT_MANUEL = /(?:\.\s*v|\bv|\bmark|\bversion|\bschemaVersion)\s*(?:===|==|>=|>|<=|<|!==|!=)\s*3\b/;

const SANS_COMMENTAIRES = (source: string): string =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((ligne) => ligne.replace(/\/\/.*$/, ''))
    .join('\n');

const IGNORES = new Set(['node_modules', '.next', 'dist', 'coverage', '__tests__', '.turbo']);

function sources(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (IGNORES.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) sources(full, acc);
    else if (/\.tsx?$/.test(entry) && !/\.(test|spec)\./.test(entry)) acc.push(full);
  }
  return acc;
}

describe('#4774 — le prédicat de version de scène, côté web', () => {
  it('tolère un rang supérieur : un v:4 reste un document canvas', () => {
    expect(isCanvasV3OrNewer({ v: 4, scenes: [] })).toBe(true);
    expect(isCanvasV3OrNewer({ v: 3, scenes: [] })).toBe(true);
  });

  it('refuse ce qui ne porte pas de marque — la tolérance ne rétrograde rien', () => {
    expect(isCanvasV3OrNewer({ background: '#000', textObjects: [] })).toBe(false);
    expect(isCanvasV3OrNewer({ v: 2 })).toBe(false);
    expect(isCanvasV3OrNewer({ v: '3' })).toBe(false);
    expect(isCanvasV3OrNewer(null)).toBe(false);
    expect(isCanvasV3OrNewer(undefined)).toBe(false);
    expect(isCanvasV3OrNewer('{"v":4}')).toBe(false);
  });

  it('cliquet — aucun consommateur ne réécrit la comparaison à la main', () => {
    const dossiers = ['lib', 'components', 'hooks', 'services', 'utils', 'app', 'stores']
      .map((d) => join(WEB_ROOT, d))
      .filter((d) => {
        try { return statSync(d).isDirectory(); } catch { return false; }
      });

    // Une liste vide passerait au vert pour la pire des raisons.
    expect(dossiers.length).toBeGreaterThan(4);

    const fautifs = dossiers
      .flatMap((d) => sources(d))
      .filter((f) => !f.endsWith(SITE_UNIQUE))
      .flatMap((f) => SANS_COMMENTAIRES(readFileSync(f, 'utf8'))
        .split('\n')
        .filter((ligne) => PREDICAT_MANUEL.test(ligne))
        .map((ligne) => `${f.slice(WEB_ROOT.length + 1)} — ${ligne.trim()}`));

    expect(fautifs).toEqual([]);
  });

  it('cliquet — le site unique n\'écrit la comparaison qu\'UNE fois', () => {
    const occurrences = SANS_COMMENTAIRES(readFileSync(join(WEB_ROOT, SITE_UNIQUE), 'utf8'))
      .split('\n')
      .filter((ligne) => PREDICAT_MANUEL.test(ligne));

    expect(occurrences).toHaveLength(1);
  });
});
