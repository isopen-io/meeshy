import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'bun:test';

/**
 * LE CONTRASTE DE L'ÉCRAN PROGRESSION (#9383) — les jetons `--ios-warning`,
 * `--ios-success` et `--ios-error` sont ceux du thème SOMBRE : posés tels quels
 * en texte ou en fond de bouton sur la surface claire, ils tombent sous 3:1.
 * L'écran du jeu emploie déjà les jetons qui suivent le thème (`--color-warn`,
 * `--color-ok`, `--color-error`, et `--color-on-state` pour le texte posé sur
 * un fond d'état) : l'écran Progression les emploie aussi, jamais les bruts.
 */
const source = (name: string): string => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');

describe('aucun jeton d’état brut sur Progression', () => {
  for (const file of ['progression-parts.tsx', 'progression.tsx']) {
    test(`${file} lit les jetons qui suivent le thème`, () => {
      const code = source(file);
      expect(code).not.toMatch(/var\(--ios-(?:warning|success|error)\)/);
    });
  }

  test('un fond d’état porte le texte d’état, pas la surface', () => {
    for (const file of ['progression-parts.tsx', 'progression.tsx']) {
      expect(source(file)).not.toMatch(/backgroundColor: MEESH_TINT, color: 'var\(--color-ios-surface\)'/);
    }
  });
});
