import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'bun:test';

import { ADMIN_OTHERS_TOKEN, ADMIN_SERIES_TOKENS } from './chart-card';

/**
 * **CHAQUE COULEUR DE GRAPHIQUE CONTRASTE AU MOINS 3:1 AVEC LA SURFACE** (#8876),
 * en clair ET en sombre — le seuil WCAG des composants graphiques (1.4.11).
 *
 * Les valeurs sont LUES dans `packages/design-tokens/ios.css` (générée depuis
 * Swift) : ce témoin ne recopie aucune couleur, il mesure ce que les feuilles
 * déclarent. Le bloc `:root, :root.dark` porte le sombre ; `:root.light` ne
 * redéclare que ce qui change (la surface) — un jeton qui ne change pas garde sa
 * valeur sombre en clair.
 *
 * **Deux jetons du plan d'origine sont RETIRÉS, et ce témoin le prouve** :
 * `--ios-tile-location` (vert, 2,1:1 en clair) et `--ios-tile-file` (cyan, 2,4:1)
 * tombent sous 3:1 sur fond blanc — une barre verte sur la carte blanche se
 * lit à peine. La règle écrite à la conception est « un jeton qui échoue est
 * retiré » ; `--ios-tile-photo` et `--ios-pinned` les remplacent et passent
 * dans les deux schémas.
 */
const CSS = readFileSync(fileURLToPath(new URL('../../../../../../packages/design-tokens/ios.css', import.meta.url)), 'utf8');
const [DARK_BLOCK = '', LIGHT_BLOCK = ''] = CSS.split(':root.light {');

function hexOf(token: string, scheme: 'light' | 'dark'): string {
  const pattern = new RegExp(`${token}:\\s*(#[0-9a-fA-F]{6})`);
  const found = (scheme === 'light' ? pattern.exec(LIGHT_BLOCK) : null) ?? pattern.exec(DARK_BLOCK);
  if (found?.[1] === undefined) throw new Error(`jeton ${token} introuvable en ${scheme}`);
  return found[1];
}

function luminance(hex: string): number {
  const [r = 0, g = 0, b = 0] = [1, 3, 5].map((offset) => {
    const channel = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(foreground: string, background: string): number {
  const [light, dark] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return ((light ?? 0) + 0.05) / ((dark ?? 0) + 0.05);
}

const ratio = (token: string, scheme: 'light' | 'dark'): number => contrast(hexOf(token, scheme), hexOf('--ios-surface', scheme));

describe('la palette des graphiques', () => {
  test('la mesure est juste : noir sur blanc vaut 21:1', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 5);
  });

  test('quatre jetons de catégories, dans un ordre fixe, plus « Autres »', () => {
    expect([...ADMIN_SERIES_TOKENS]).toEqual(['--ios-indigo-500', '--ios-tile-voice', '--ios-tile-photo', '--ios-pinned']);
    expect(ADMIN_OTHERS_TOKEN).toBe('--ios-neutral-500');
  });

  for (const scheme of ['light', 'dark'] as const) {
    for (const token of [...ADMIN_SERIES_TOKENS, ADMIN_OTHERS_TOKEN]) {
      test(`${token} contraste ≥ 3:1 avec --ios-surface en ${scheme === 'light' ? 'clair' : 'sombre'}`, () => {
        expect(ratio(token, scheme)).toBeGreaterThanOrEqual(3);
      });
    }
  }

  test('les deux jetons retirés tombent bien sous 3:1 en clair — le retrait est justifié', () => {
    expect(ratio('--ios-tile-location', 'light')).toBeLessThan(3);
    expect(ratio('--ios-tile-file', 'light')).toBeLessThan(3);
  });

  test('les quatre catégories sont deux à deux distinguables (aucun jeton en double)', () => {
    expect(new Set(ADMIN_SERIES_TOKENS).size).toBe(ADMIN_SERIES_TOKENS.length);
    const hexes = ADMIN_SERIES_TOKENS.map((token) => hexOf(token, 'dark'));
    expect(new Set(hexes).size).toBe(hexes.length);
  });
});
