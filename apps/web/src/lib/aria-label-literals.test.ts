import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'bun:test';

/**
 * **UN NOM ACCESSIBLE SE LIT DANS LE CATALOGUE, JAMAIS EN DUR** (#7566) — le
 * cliquet qui empêche le retour des `aria-label` écrits en clair dans
 * `src/components` et `src/routes`. Un littéral y est le même mot pour les sept
 * langues : un lecteur anglophone entendait « Fermer » sur toutes les feuilles.
 *
 * Le relevé lit aussi ce qu'une EXPRESSION prononce : le texte fixe d'un gabarit
 * (`Le lien expire dans ${…}`), une branche de ternaire (`inert ? undefined :
 * 'Stories'`), un repli. Il ne lit pas ce qui est passé à un appel (une clé de
 * catalogue) ni ce qui est comparé (`status === 'playing'`) : ces chaînes ne
 * s'entendent jamais.
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

const QUOTED = /aria-label=(?:"([^"]*)"|'([^']*)')/g;
const EXPRESSION = /aria-label=\{/g;
const COMPARED_BEFORE = /(?:===|!==|==|!=)\s*$/;
const COMPARED_AFTER = /^\s*(?:===|!==|==|!=)/;
const SPOKEN = /\p{L}{2,}/u;

type Literal = { readonly path: string; readonly value: string };

const closingQuote = (text: string, from: number, quote: string): number => {
  const next = text.indexOf(quote, from);
  return next > 0 && text[next - 1] === '\\' ? closingQuote(text, next + 1, quote) : next;
};

const placeholderEnd = (text: string, from: number, depth = 1): number => {
  if (from >= text.length || depth === 0) return from;
  const step = text[from] === '{' ? 1 : text[from] === '}' ? -1 : 0;
  return placeholderEnd(text, from + 1, depth + step);
};

/** Les chaînes qu'une expression `aria-label={…}` PRONONCE, à partir de `start` (juste après `{`). */
const spokenStrings = (text: string, start: number): readonly string[] => {
  const spoken: string[] = [];
  let index = start;
  let braces = 0;
  let parens = 0;
  while (index < text.length) {
    const char = text[index] ?? '';
    if (char === '"' || char === "'") {
      const end = closingQuote(text, index + 1, char);
      const heard = parens === 0 && !COMPARED_BEFORE.test(text.slice(start, index)) && !COMPARED_AFTER.test(text.slice(end + 1));
      if (heard) spoken.push(text.slice(index + 1, end));
      index = end + 1;
      continue;
    }
    if (char === '`') {
      let cursor = index + 1;
      let chunk = '';
      while (cursor < text.length && text[cursor] !== '`') {
        if (text[cursor] === '$' && text[cursor + 1] === '{') {
          if (parens === 0) spoken.push(chunk);
          chunk = '';
          const end = placeholderEnd(text, cursor + 2);
          if (parens === 0) spoken.push(...spokenStrings(`${text.slice(cursor + 2, end - 1)}}`, 0));
          cursor = end;
          continue;
        }
        chunk += text[cursor];
        cursor += 1;
      }
      if (parens === 0) spoken.push(chunk);
      index = cursor + 1;
      continue;
    }
    if (char === '}' && braces === 0) break;
    braces += char === '{' ? 1 : char === '}' ? -1 : 0;
    parens += char === '(' ? 1 : char === ')' ? -1 : 0;
    index += 1;
  }
  return spoken;
};

const literalsOf = (path: string, text: string): readonly Literal[] => {
  const source = withoutComments(text);
  const quoted = [...source.matchAll(QUOTED)].map((match) => match[1] ?? match[2] ?? '');
  const expressed = [...source.matchAll(EXPRESSION)].flatMap((match) => spokenStrings(source, match.index + match[0].length));
  return [...quoted, ...expressed.filter((value) => SPOKEN.test(value))].map((value) => ({ path, value }));
};

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

  test('le relevé entend le texte fixe d’un gabarit, une branche de ternaire et un repli', () => {
    const sample = [
      '<p aria-label={`Le lien expire dans ${spoken(remaining, locale)}`} />',
      "<b aria-label={`${label}, ${active ? 'actif' : 'inactif'}`} />",
      "<ul aria-label={inert ? undefined : 'Stories'} />",
      "<i aria-label={name ?? 'Sans nom'} />",
    ].join('\n');
    expect(literalsOf('x.tsx', sample).map(({ value }) => value)).toEqual([
      'Le lien expire dans ',
      'actif',
      'inactif',
      'Stories',
      'Sans nom',
    ]);
  });

  test('le relevé n’entend ni une clé passée à un appel, ni une valeur comparée, ni la ponctuation', () => {
    const sample = [
      "<a aria-label={translate(language, viewOnce ? 'composer.viewOnce.active' : 'composer.viewOnce.activate')} />",
      "<b aria-label={translate(language, status === 'playing' ? 'reels.pause' : 'reels.play')} />",
      "<c aria-label={`${translate(language, `report.reason.${reason}` as 'report.reason.spam')} — ${name}`} />",
      "<d aria-label={mode === 'voice' ? first : second} />",
    ].join('\n');
    expect(literalsOf('x.tsx', sample).map(({ value }) => value)).toEqual([]);
  });
});
