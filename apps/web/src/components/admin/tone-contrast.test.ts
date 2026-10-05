import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'bun:test';

import type { AdminTone } from '@/lib/admin/interpret/types';

import { TONE_COLOR, toneBackground } from './tone';

/**
 * **L'ENCRE D'UN BADGE CONTRASTE AU MOINS 4,5:1 AVEC SA TEINTE** (#8876), en clair ET en
 * sombre — le seuil WCAG du texte (1.4.3). Un badge écrit son mot en 12 px dans la couleur
 * de son ton, sur ce même ton à 14 % : ce n'est pas un composant graphique (3:1), c'est du
 * texte.
 *
 * Mesuré avant la correction : `--ios-info` (#60a5fa, sans variante claire) 2,3:1 ; l'indigo
 * de marque 3,8:1 ; le vert de succès 4,49:1 ; l'encre discrète du neutre, plus bas encore.
 *
 * Ce témoin ne recopie AUCUNE couleur : il lit les feuilles (jetons générés depuis Swift,
 * tables héritées, `styles/admin.css`), résout les chaînes de `var()` comme le navigateur
 * (la règle la plus spécifique gagne, puis la dernière), peint la teinte avec
 * `toneBackground` lui-même, et mesure `TONE_COLOR` dessus — sur la surface ET sur la carte,
 * où les badges se posent réellement.
 */
const ROOT = fileURLToPath(new URL('../../../../../', import.meta.url));
const SHEETS = [
  'packages/design-tokens/tokens.css',
  'packages/design-tokens/ios.css',
  'packages/design-tokens/dark.css',
  'packages/design-tokens/light.css',
  'apps/web/src/styles/ios.css',
  'apps/web/src/styles/admin.css',
].map((path) => readFileSync(`${ROOT}${path}`, 'utf8'));

type Scheme = 'light' | 'dark';
type Declaration = { readonly name: string; readonly value: string; readonly specificity: number; readonly order: number };

function declarationsOf(scheme: Scheme): readonly Declaration[] {
  const found: Declaration[] = [];
  let order = 0;
  for (const sheet of SHEETS) {
    const css = sheet.replace(/\/\*[\s\S]*?\*\//g, '');
    for (const block of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const selectors = (block[1] ?? '').split(',').map((part) => part.trim());
      const own = scheme === 'light' ? ':root.light' : ':root.dark';
      const specificity = selectors.includes(own) ? 2 : selectors.includes(':root') ? 1 : selectors.some((part) => part.includes('@theme')) ? 0 : null;
      if (specificity === null) continue;
      for (const declaration of (block[2] ?? '').matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
        order += 1;
        found.push({ name: declaration[1] ?? '', value: (declaration[2] ?? '').trim(), specificity, order });
      }
    }
  }
  return found;
}

const TABLES: Readonly<Record<Scheme, readonly Declaration[]>> = { light: declarationsOf('light'), dark: declarationsOf('dark') };

function valueOf(token: string, scheme: Scheme): string {
  const winner = TABLES[scheme]
    .filter((declaration) => declaration.name === token)
    .sort((left, right) => right.specificity - left.specificity || right.order - left.order)[0];
  if (winner === undefined) throw new Error(`jeton ${token} introuvable en ${scheme}`);
  return winner.value;
}

type Painted = { readonly rgb: readonly [number, number, number]; readonly alpha: number };

function paintOf(value: string, scheme: Scheme): Painted {
  const trimmed = value.trim();
  const variable = /^var\((--[\w-]+)\)$/.exec(trimmed);
  if (variable?.[1] !== undefined) return paintOf(valueOf(variable[1], scheme), scheme);

  const hex = /^#([0-9a-fA-F]{6})$/.exec(trimmed);
  if (hex?.[1] !== undefined) {
    const channel = (offset: number) => parseInt(hex[1]?.slice(offset, offset + 2) ?? '00', 16);
    return { rgb: [channel(0), channel(2), channel(4)], alpha: 1 };
  }

  const mixed = /^color-mix\(in srgb,\s*(.+?)\s+(\d+(?:\.\d+)?)%,\s*transparent\)$/.exec(trimmed);
  if (mixed?.[1] !== undefined && mixed[2] !== undefined) {
    const inner = paintOf(mixed[1], scheme);
    return { rgb: inner.rgb, alpha: inner.alpha * (Number(mixed[2]) / 100) };
  }
  throw new Error(`valeur non gérée par le témoin : ${trimmed}`);
}

const over = (painted: Painted, base: readonly [number, number, number]): readonly [number, number, number] =>
  [0, 1, 2].map((index) => (painted.rgb[index] ?? 0) * painted.alpha + (base[index] ?? 0) * (1 - painted.alpha)) as unknown as readonly [number, number, number];

function luminance(rgb: readonly [number, number, number]): number {
  const [r = 0, g = 0, b = 0] = rgb.map((channel) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(foreground: readonly [number, number, number], background: readonly [number, number, number]): number {
  const [light = 0, dark = 0] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (light + 0.05) / (dark + 0.05);
}

const TONES: readonly AdminTone[] = ['neutral', 'brand', 'success', 'warning', 'danger', 'info'];
const SURFACES = ['--ios-surface', '--ios-surface-card'] as const;

describe('l’encre des tons — contraste du texte', () => {
  test('la mesure est juste : noir sur blanc vaut 21:1, et la teinte se compose sur sa surface', () => {
    expect(contrast([0, 0, 0], [255, 255, 255])).toBeCloseTo(21, 5);
    expect(over({ rgb: [0, 0, 0], alpha: 0.5 }, [255, 255, 255]).map(Math.round)).toEqual([128, 128, 128]);
  });

  test('le témoin sait que l’ancienne encre ÉCHOUAIT : --ios-info sur sa teinte, en clair, sous 3:1', () => {
    const base = over(paintOf('var(--ios-surface)', 'light'), [255, 255, 255]);
    const tint = over(paintOf('color-mix(in srgb, var(--ios-info) 14%, transparent)', 'light'), base);
    expect(contrast(over(paintOf('var(--ios-info)', 'light'), tint), tint)).toBeLessThan(3);
  });

  test('chaque ton colore sa propre encre : six jetons distincts, tous déclarés par l’administration', () => {
    const colored = TONES.filter((tone) => tone !== 'neutral');
    expect(new Set(colored.map((tone) => TONE_COLOR[tone])).size).toBe(colored.length);
    for (const tone of colored) expect(TONE_COLOR[tone]).toMatch(/^var\(--color-admin-[a-z]+-ink\)$/);
    expect(TONE_COLOR.neutral).toBe('var(--color-ios-ink)');
  });

  for (const scheme of ['light', 'dark'] as const) {
    for (const surface of SURFACES) {
      for (const tone of TONES) {
        test(`${tone} : encre ≥ 4,5:1 sur sa teinte, posée sur ${surface}, en ${scheme === 'light' ? 'clair' : 'sombre'}`, () => {
          const base = over(paintOf(`var(${surface})`, scheme), [255, 255, 255]);
          const tint = over(paintOf(toneBackground(tone), scheme), base);
          const ink = over(paintOf(TONE_COLOR[tone], scheme), tint);

          expect(contrast(ink, tint)).toBeGreaterThanOrEqual(4.5);
        });
      }
    }
  }
});
