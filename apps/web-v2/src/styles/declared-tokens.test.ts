import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';

/**
 * **UN JETON QU'AUCUNE FEUILLE NE DÉCLARE NE PEINT RIEN — ET NE ROUGIT NULLE
 * PART** (#7135, trouvé à la capture — critère (6), « captures clair ET
 * sombre, REGARDÉES »).
 *
 * `style={{ background: 'var(--color-ios-fill-2)' }}` compile, passe `tsc`,
 * passe `check:utilities` (qui juge les CLASSES, pas les styles en ligne),
 * passe tous les témoins de composant — et la propriété entière est INVALIDE
 * au rendu, donc silencieusement ABSENTE. Mesuré : `--color-ios-fill-2`,
 * référencé par les trois surfaces du fil de commentaires, n'était déclaré
 * nulle part — le champ du composeur, le champ d'édition et les trois barres
 * du squelette n'avaient AUCUN fond dans les deux schémas. Et
 * `--color-ios-separator`, référencé par le composeur de story, faisait
 * retomber ses bordures sur `currentColor` : un filet à l'encre du texte là
 * où une hairline était voulue.
 *
 * Le défaut se voit à l'œil et par rien d'autre : c'est exactement la forme
 * qu'une garde d'INVENTAIRE attrape, et qu'aucun témoin de comportement ne
 * peut attraper. Elle lit ce que le CODE référence et ce que les FEUILLES
 * déclarent, sans rien savoir des valeurs (D-4 : les valeurs viennent de
 * Swift, cette garde ne les juge pas).
 */

const ROOT = new URL('..', import.meta.url).pathname;

const filesUnder = (dir: string, extensions: readonly string[]): readonly string[] => {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...filesUnder(full, extensions));
      continue;
    }
    if (extensions.some((ext) => entry.endsWith(ext))) out.push(full);
  }
  return out;
};

/** Les feuilles du chantier ET les jetons générés depuis Swift. */
const STYLESHEETS = [
  ...filesUnder(join(ROOT, 'styles'), ['.css']),
  ...filesUnder(join(ROOT, '..', '..', '..', 'packages', 'design-tokens'), ['.css']),
];

/**
 * `var(--color-…)` REFERENCÉ par du code — jamais par une feuille, qui peut
 * légitimement lire un jeton qu'une autre déclare.
 *
 * **CE QUE CETTE GARDE JUGE : `var(--x)` SANS REPLI.** `var(--x, #fff)` PEINT,
 * quoi qu'il arrive — nommer là un jeton inexistant est une dette de
 * vocabulaire (D-4 : la valeur devrait venir de Swift), pas la panne
 * silencieuse que cette garde existe pour attraper. Deux sites sont dans ce
 * cas au moment où elle est écrite (`--color-ios-on-brand`,
 * `--color-ios-danger`) ; ils ont leur propre suivi, et les élargir ici
 * ferait de cette garde un registre d'exemptions — exactement ce qui empêche
 * une garde d'être crue.
 */
const REFERENCES = filesUnder(ROOT, ['.ts', '.tsx']).filter((f) => !f.endsWith('.test.ts') && !f.endsWith('.test.tsx'));

const declared = (): ReadonlySet<string> => {
  const names = new Set<string>();
  for (const sheet of STYLESHEETS) {
    for (const match of readFileSync(sheet, 'utf8').matchAll(/(--color-[a-z0-9-]+)\s*:/g)) {
      const name = match[1];
      if (name !== undefined) names.add(name);
    }
  }
  return names;
};

const referenced = (): ReadonlyMap<string, string> => {
  const sites = new Map<string, string>();
  for (const file of REFERENCES) {
    /* `[^,)]` ferme le groupe sur un `)` immédiat : un repli (`, #fff`) fait
       échouer la capture, et le site sort du périmètre. */
    for (const match of readFileSync(file, 'utf8').matchAll(/var\((--color-[a-z0-9-]+)\s*\)/g)) {
      const name = match[1];
      if (name !== undefined && !sites.has(name)) sites.set(name, file.slice(ROOT.length));
    }
  }
  return sites;
};

describe('les jetons de couleur référencés par le code sont DÉCLARÉS par une feuille', () => {
  test('aucun `var(--color-…)` fantôme', () => {
    const connus = declared();
    const fantomes = [...referenced().entries()]
      .filter(([name]) => !connus.has(name))
      .map(([name, site]) => `${name} (${site})`);
    expect(fantomes).toEqual([]);
  });

  /** CONTRE-ÉPREUVE : la garde saurait le dire. Sans elle, une liste vide
   * pourrait tout aussi bien signifier « la lecture n'a rien lu ». */
  test('la garde LIT bien quelque chose — des jetons déclarés et des jetons référencés', () => {
    expect(declared().size).toBeGreaterThan(20);
    expect(referenced().size).toBeGreaterThan(20);
    expect(declared().has('--color-ios-card')).toBe(true);
  });
});
