import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'bun:test';

import { GAME_ERROR, GAME_GOOD, GAME_ON_WARM, GAME_WARM } from './game-surface';

/**
 * LES COULEURS D'ÉTAT DU JEU SUIVENT LE THÈME (revue #9383) — une erreur, un
 * succès, un avertissement se LISENT : en texte sur la surface de l'écran, et
 * le texte d'un bouton chaud sur son fond. Les jetons bruts `--ios-error`,
 * `--ios-success`, `--ios-warning` sont fixés pour le thème sombre : servis
 * tels quels sur la surface claire (#ffffff) ils rendent 2,8:1, 1,9:1 et
 * 1,7:1. Le témoin résout chaque jeton dans les deux thèmes, comme le
 * navigateur, et mesure le contraste WCAG.
 */

const read = (path: string): string => readFileSync(new URL(path, import.meta.url).pathname, 'utf8');

const TOKENS = '../../../../packages/design-tokens/';
const dark = read(`${TOKENS}dark.css`);
const light = read(`${TOKENS}light.css`);
const ios = read(`${TOKENS}ios.css`);
const app = read('../styles/app.css');
const iosApp = read('../styles/ios.css');

const blockAfter = (css: string, selector: string): string => {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) return '';
  return css.slice(start, css.indexOf('\n}', start));
};

const withoutComments = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, '');

const declarations = (css: string): Map<string, string> =>
  new Map(
    Array.from(withoutComments(css).matchAll(/(--[\w-]+)\s*:\s*([^;\n]+);/g), (match) => [match[1] ?? '', (match[2] ?? '').trim()]),
  );

const layers = {
  dark: [declarations(app), declarations(iosApp), declarations(blockAfter(ios, ':root.dark')), declarations(blockAfter(dark, ':root.dark'))],
  light: [
    declarations(app),
    declarations(iosApp),
    declarations(blockAfter(ios, ':root.dark')),
    declarations(blockAfter(dark, ':root.dark')),
    declarations(blockAfter(ios, ':root.light')),
    declarations(blockAfter(light, ':root.light')),
  ],
} as const;

const lookup = (theme: keyof typeof layers, name: string): string | undefined =>
  layers[theme].reduce<string | undefined>((found, layer) => layer.get(name) ?? found, undefined);

const resolve = (theme: keyof typeof layers, value: string, depth = 0): string => {
  const reference = /^var\((--[\w-]+)\)$/.exec(value.trim());
  if (reference === null || depth > 12) return value.trim();
  const next = lookup(theme, reference[1] ?? '');
  return next === undefined ? value.trim() : resolve(theme, next, depth + 1);
};

const luminance = (hex: string): number => {
  const digits = /^#([0-9a-f]{6})$/i.exec(hex)?.[1];
  if (digits === undefined) throw new Error(`couleur non résolue : ${hex}`);
  const channel = (offset: number): number => {
    const value = Number.parseInt(digits.slice(offset, offset + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
};

const contrast = (a: string, b: string): number => {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return ((high ?? 0) + 0.05) / ((low ?? 0) + 0.05);
};

const THEMES = ['dark', 'light'] as const;

describe('les couleurs d’état du jeu se lisent dans les deux thèmes', () => {
  for (const theme of THEMES) {
    const surface = resolve(theme, 'var(--color-ios-surface)');

    test(`${theme} : l’erreur, le succès et l’avertissement en texte sur la surface ≥ 4,5:1`, () => {
      for (const token of [GAME_ERROR, GAME_GOOD, GAME_WARM]) {
        expect({ token, ratio: contrast(resolve(theme, token), surface) >= 4.5 }).toEqual({ token, ratio: true });
      }
    });

    test(`${theme} : le texte d’un bouton chaud sur son fond ≥ 4,5:1`, () => {
      expect(contrast(resolve(theme, GAME_ON_WARM), resolve(theme, GAME_WARM))).toBeGreaterThanOrEqual(4.5);
    });
  }
});
