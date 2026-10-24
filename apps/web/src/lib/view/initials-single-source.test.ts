import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, test } from 'bun:test';

import { initialsOf } from './initials';

/**
 * **UNE SEULE FONCTION D'INITIALES** (#12571) — six jumelles divergeaient : mon
 * propre profil affichait « T( » pendant que les autres voyaient « TF » ; une
 * carte de contact gardait la première ET la dernière lettre et un « # » ; la
 * liste des communautés rendait une chaîne vide sans lettre. Deux écritures de la
 * même règle divergent au premier nom composé : la définition vit dans
 * `lib/view/initials.ts`, et ce témoin interdit d'en réécrire une.
 */
describe('initialsOf — la table de la règle partagée', () => {
  const TABLE: readonly (readonly [string, string])[] = [
    ['Théo (foot)', 'TF'],
    ['Awa', 'AW'],
    ['🎉 Fête', 'FÊ'],
    ['Jean Paul Kouassi', 'JP'],
    ['@awa', 'AW'],
    ['+33 6 12', '?'],
    ['🎉', '?'],
    ['', '?'],
  ];
  for (const [name, expected] of TABLE) {
    test(`« ${name} » donne « ${expected} »`, () => {
      expect(initialsOf(name)).toBe(expected);
    });
  }
});

const SRC = new URL('../../', import.meta.url).pathname;
const CANONICAL = 'lib/view/initials.ts';

const sources = (dir: string): readonly string[] =>
  readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.(ts|tsx)$/.test(entry) && !entry.includes('.test.') ? [path] : [];
  });

describe('aucune jumelle d’initiales hors de lib/view/initials.ts', () => {
  test('aucun module ne DÉFINIT une fonction d’initiales : ils importent `initialsOf`', () => {
    const definitions = sources(SRC)
      .filter((path) => relative(SRC, path) !== CANONICAL)
      .flatMap((path) =>
        [...readFileSync(path, 'utf8').matchAll(/(?:function|const)\s+([A-Za-z]*[iI]nitials[A-Za-z]*)\s*(?:\(|=\s*(?:\(|<))/g)].map(
          (match) => `${relative(SRC, path)} → ${match[1] ?? ''}`,
        ),
      );
    expect(definitions).toEqual([]);
  });
});
