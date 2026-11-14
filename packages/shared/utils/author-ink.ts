/**
 * LA RÈGLE DE LISIBILITÉ DE LA COULEUR D'AUTEUR (#17879) — loi pure, à côté de
 * `authorAccentColor` (`conversation-colors.ts`) dont elle rend la teinte
 * LISIBLE : une teinte déjà à 4,5:1 (AA) sur CHAQUE fond reste exactement la
 * sienne, sinon elle est rapprochée de l'encre du thème du plus PETIT pas qui
 * tient l'AA. Une couleur vive n'est pas une encre : un bleu profond tombe sous
 * 4,5:1 en sombre, un ambre en clair.
 *
 * Consommée par le web (`apps/web/src/lib/view/author-ink.ts`, qui fournit les
 * fonds du fil), reproduite par les miroirs Swift (`AuthorInk`) et Kotlin
 * (`AuthorInk`), qui rejouent `fixtures/author-ink.vectors.json` (la palette
 * entière × les deux schémas).
 */

type Rgb = readonly [number, number, number];

export const AUTHOR_INK_AA = 4.5;
export const AUTHOR_INK_STEP = 0.04;

const rgbOf = (hex: string): Rgb => {
  const value = hex.replace('#', '');
  return [0, 2, 4].map((offset) => Number.parseInt(value.slice(offset, offset + 2), 16)) as unknown as Rgb;
};

const hexOf = (rgb: Rgb): string => `#${rgb.map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')}`;

/** `color-mix(in srgb, a (1−t), b t)` — l'interpolation que la feuille applique. */
export const mixHex = (a: string, b: string, t: number): string => {
  const [ra, ga, ba] = rgbOf(a);
  const [rb, gb, bb] = rgbOf(b);
  return hexOf([ra + (rb - ra) * t, ga + (gb - ga) * t, ba + (bb - ba) * t]);
};

const luminance = (hex: string): number => {
  const linear = (c: number): number => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = rgbOf(hex);
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
};

export const contrastRatio = (a: string, b: string): number => {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};

export type LegibleTintInput = { readonly tint: string; readonly toward: string; readonly backgrounds: readonly string[] };

/**
 * La teinte rapprochée de `toward` du plus PETIT pas qui tient l'AA (4,5:1)
 * sur TOUS les `backgrounds` — une teinte déjà lisible reste exactement la
 * sienne ; si aucun pas ne tient, l'encre elle-même.
 */
export const legibleTint = ({ tint, toward, backgrounds }: LegibleTintInput): string => {
  const legible = (hex: string): boolean => backgrounds.every((background) => contrastRatio(hex, background) >= AUTHOR_INK_AA);
  const steps = Array.from({ length: Math.ceil(1 / AUTHOR_INK_STEP) + 1 }, (_, i) => Math.min(1, i * AUTHOR_INK_STEP));
  return steps.map((t) => mixHex(tint, toward, t)).find(legible) ?? toward;
};
