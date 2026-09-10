import { describe, expect, test } from 'bun:test';

// @ts-expect-error — module .mjs sans déclaration de types ; ce témoin
// interroge son API publique exactement comme le pilote le fait.
import { findRuleBody, sizelessTextClasses, textSizeRoles, usedClasses } from './check-utilities.mjs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { unlinkSync, writeFileSync } from 'node:fs';

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * LE TÉMOIN DU GATE DE TAILLE MASQUÉE (#5606, revue-correction, défaut 1).
 *
 * `check-utilities.mjs` ne vérifiait, avant ce lot, que « la classe a-t-elle
 * UNE règle ? ». `.text-meta{color:...}` répond oui, alors que le jeton
 * `--text-meta` promettait un `font-size` qu'un `--color-meta` homonyme a
 * fait disparaître de la résolution Tailwind. Ce fichier fixe le comportement
 * qui a manqué le défaut, pour qu'une future collision de nom ne repasse plus
 * en silence.
 */
/**
 * LE TÉMOIN DU FAUX-POSITIF DE COMMENTAIRE (régression CI 2026-09-10, #5958).
 *
 * Un commentaire JSDoc qui CITE un extrait JSX d'un AUTRE fichier, avec un
 * `className="…"` qui franchit un saut de ligne, faisait capturer par la
 * regex le marqueur de continuation ` * ` comme un TOKEN de classe à part
 * entière : `className="flex\n * justify-center py-1.5"` rendait les tokens
 * `flex`, `*`, `justify-center`, `py-1.5` — `*` n'a jamais été une classe,
 * et n'avait donc aucune règle dans la feuille produite, ce qui a fait
 * échouer `Gates web-v3` sur `dev` pour TOUTE PR (pas seulement celle qui
 * touchait le fichier). Deux correctifs complémentaires ont atterri côte à
 * côte (#5958, le commentaire réel reformulé sans guillemets JSX ; #5960,
 * `usedClasses` dépouille désormais les commentaires avant de scanner) :
 * ce témoin verrouille le second, sur un fixture qui reproduit EXACTEMENT
 * le motif fautif — il doit rendre zéro token, quelle que soit la forme du
 * commentaire qui le porte.
 */
describe('usedClasses — un commentaire ne doit jamais injecter de faux token', () => {
  test('un className="…" multi-lignes à l’intérieur d’un JSDoc ne produit plus aucun token', () => {
    const fixture = [
      '/**',
      ' * au navigateur (`thread-modes.tsx`, le `<div className="flex',
      ' * justify-center py-1.5">` qui précède chaque rangée)',
      ' */',
      'export const x = 1;',
      '',
    ].join('\n');
    const file = join(HERE, '__fixtures-regression-comment.tsx');
    writeFileSync(file, fixture);
    try {
      const found = usedClasses([file]);
      expect([...found.keys()]).toEqual([]);
    } finally {
      unlinkSync(file);
    }
  });

  test('thread-chrome.ts (réel) ne contient plus aucun className littéral — zéro token', () => {
    const file = join(HERE, '..', 'src', 'lib', 'view', 'thread-chrome.ts');
    const found = usedClasses([file]);
    expect([...found.keys()]).toEqual([]);
  });
});

describe('textSizeRoles — les rôles de taille déclarés par une source de thème', () => {
  test('extrait le nom qui suit chaque `--text-<rôle>:`', () => {
    const source = '@theme inline {\n  --text-meta: var(--text-sm);\n  --text-chip: var(--text-xs);\n}';
    expect(textSizeRoles(source)).toEqual(new Set(['meta', 'chip']));
  });

  test('une source sans déclaration `--text-` rend un ensemble vide', () => {
    expect(textSizeRoles('@theme inline {\n  --color-brand: #000;\n}')).toEqual(new Set());
  });
});

describe('findRuleBody — le corps de la règle compilée pour une classe', () => {
  test('rend le corps entre accolades quand la règle existe', () => {
    expect(findRuleBody('.text-meta{color:#000}', 'text-meta')).toBe('color:#000');
  });

  test('rend `null` quand la règle est absente', () => {
    expect(findRuleBody('.text-body{font-size:17px}', 'text-meta')).toBeNull();
  });
});

describe('sizelessTextClasses — la taille promise mais masquée par une couleur homonyme', () => {
  test('signale une classe dont le rôle a un jeton de taille mais dont la règle ne porte aucun `font-size`', () => {
    const used = new Map([['text-meta', 'src/institutional/page.tsx']]);
    const css = '.text-meta{color:var(--ios-bubble-meta)}';
    const findings = sizelessTextClasses(used, css, new Set(['meta']));
    expect(findings).toEqual([{ name: 'text-meta', file: 'src/institutional/page.tsx' }]);
  });

  test('ne signale rien quand la règle compilée porte bien `font-size`', () => {
    const used = new Map([['text-caption', 'src/institutional/page.tsx']]);
    const css = '.text-caption{font-size:.875rem}';
    expect(sizelessTextClasses(used, css, new Set(['caption']))).toEqual([]);
  });

  test('ignore un rôle sans jeton de taille déclaré — rien à promettre, rien à masquer', () => {
    const used = new Map([['text-brand', 'src/institutional/page.tsx']]);
    const css = '.text-brand{color:#000}';
    expect(sizelessTextClasses(used, css, new Set())).toEqual([]);
  });

  test('ignore une classe morte (absente de la feuille) — déjà couverte par `dead`', () => {
    const used = new Map([['text-meta', 'src/institutional/page.tsx']]);
    const css = '.text-body{font-size:17px}';
    expect(sizelessTextClasses(used, css, new Set(['meta']))).toEqual([]);
  });

  test('ignore une classe qui n’est pas de la forme `text-<rôle>` (variante ou autre préfixe)', () => {
    const used = new Map([['placeholder:text-meta', 'src/institutional/page.tsx']]);
    const css = '.placeholder\\:text-meta::placeholder{color:#000}';
    expect(sizelessTextClasses(used, css, new Set(['meta']))).toEqual([]);
  });
});
