import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'bun:test';

/**
 * **UN NOM ACCESSIBLE SE LIT DANS LE CATALOGUE, JAMAIS EN DUR** (#7566) — le
 * cliquet qui empêche le retour des `aria-label` écrits en clair dans
 * `src/components` et `src/routes`. Un littéral y est le même mot pour les sept
 * langues : un lecteur anglophone entendait « Fermer » sur toutes les feuilles.
 *
 * La liste blanche ne porte que des NOMS PROPRES, identiques dans toutes les
 * langues ; chaque entrée dit pourquoi. Elle ne s'allonge pas pour un libellé :
 * un libellé prend une clé dans les sept catalogues.
 */
const SRC = fileURLToPath(new URL('..', import.meta.url));
const ROOTS = ['components', 'routes'] as const;

const PROPER_NAMES: ReadonlyMap<string, string> = new Map([
  ['routes/kit.tsx|Kit', 'nom du catalogue de composants, titre « Kit » de la même page dans toutes les langues'],
]);

const isProductionSource = (path: string): boolean =>
  /\.(ts|tsx)$/.test(path) && !path.includes('.test.') && !path.includes('/__tests__/');

const withoutComments = (text: string): string =>
  text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');

const LITERAL = /aria-label=(?:"([^"]*)"|'([^']*)'|\{\s*"([^"]*)"\s*\}|\{\s*'([^']*)'\s*\}|\{\s*`([^`$]*)`\s*\})/g;

type Literal = { readonly path: string; readonly value: string };

const literalsOf = (path: string, text: string): readonly Literal[] =>
  [...withoutComments(text).matchAll(LITERAL)].map((match) => ({
    path,
    value: match.slice(1).find((group) => group !== undefined) ?? '',
  }));

const LITERALS: readonly Literal[] = ROOTS.flatMap((root) =>
  readdirSync(`${SRC}/${root}`, { recursive: true, encoding: 'utf8' })
    .map((path) => `${root}/${path.split('\\').join('/')}`)
    .filter(isProductionSource)
    .flatMap((path) => literalsOf(path, readFileSync(`${SRC}/${path}`, 'utf8'))),
);

describe('les aria-label de components et routes passent par les catalogues', () => {
  test('aucun libellé écrit en clair hors des noms propres déclarés', () => {
    const labels = LITERALS.filter(({ path, value }) => !PROPER_NAMES.has(`${path}|${value}`)).map(
      ({ path, value }) => `${path} → ${value}`,
    );
    expect(labels).toEqual([]);
  });

  test('chaque nom propre déclaré est encore porté par sa source', () => {
    const present = new Set(LITERALS.map(({ path, value }) => `${path}|${value}`));
    expect([...PROPER_NAMES.keys()].filter((key) => !present.has(key))).toEqual([]);
  });

  test('le relevé voit un littéral entre guillemets comme entre accolades, et ignore les commentaires', () => {
    const sample = [
      '/** `<section aria-label="Stories">` */',
      '// <nav aria-label="Ancien">',
      '<a aria-label="Un" />',
      "<b aria-label={'Deux'} />",
      '<i aria-label={`Trois`} />',
      '<u aria-label={`${label}`} />',
      '<s aria-label={label} />',
    ].join('\n');
    expect(literalsOf('x.tsx', sample).map(({ value }) => value)).toEqual(['Un', 'Deux', 'Trois']);
  });
});
