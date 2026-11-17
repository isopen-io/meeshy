/**
 * LES COULEURS DES ASSEMBLAGES DU KIT — une seule source (#18876).
 *
 * Quatre assemblages calculent une couleur à partir d'une teinte reçue : la bannière
 * vivante (orbe voisine, dégradé), la carte à code (teinte assombrie jusqu'à tenir sur
 * sa plaque), le billet (encre de la pastille) et la rangée de chiffres. Ils partagent
 * ces fonctions pures plutôt que d'en réécrire chacun une. Elles ne lisent que des
 * hexadécimaux ; toute autre écriture (`var(--accent)`) est rendue telle quelle par
 * l'appelant, qui n'en peut rien calculer.
 */
export type Rgb = { readonly r: number; readonly g: number; readonly b: number };

const byte = (value: number): number => Math.min(255, Math.max(0, Math.round(value)));

export const parseHex = (hex: string): Rgb | null => {
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (match === null) return null;
  const digits = match[1] ?? '';
  const full = digits.length === 3 ? [...digits].map((digit) => digit + digit).join('') : digits;
  return { r: parseInt(full.slice(0, 2), 16), g: parseInt(full.slice(2, 4), 16), b: parseInt(full.slice(4, 6), 16) };
};

const toHex = ({ r, g, b }: Rgb): string => `#${[r, g, b].map((channel) => byte(channel).toString(16).padStart(2, '0')).join('')}`;

const linear = (channel: number): number => {
  const value = channel / 255;
  return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
};

const luminance = ({ r, g, b }: Rgb): number => 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);

const ratio = (a: Rgb, b: Rgb): number => {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return ((light ?? 0) + 0.05) / ((dark ?? 0) + 0.05);
};

const BLACK: Rgb = { r: 0, g: 0, b: 0 };
const WHITE: Rgb = { r: 255, g: 255, b: 255 };

// harmony-exempt: l'encre noire et blanche du calcul de contraste (WCAG) ; elles se choisissent au contraste, elles ne sont pas du chrome
const INK = { light: '#ffffff', dark: '#000000' } as const;

/** Le rapport de contraste WCAG entre deux hexadécimaux ; 1 si l'un des deux n'en est pas un. */
export const contrastRatio = (a: string, b: string): number => {
  const first = parseHex(a);
  const second = parseHex(b);
  return first === null || second === null ? 1 : ratio(first, second);
};

/** `weight` de `a` mêlé à `1 − weight` de `b`. */
export const mixHex = (a: string, b: string, weight: number): string => {
  const first = parseHex(a);
  const second = parseHex(b);
  if (first === null || second === null) return a;
  const w = Math.min(1, Math.max(0, weight));
  return toHex({ r: first.r * w + second.r * (1 - w), g: first.g * w + second.g * (1 - w), b: first.b * w + second.b * (1 - w) });
};

type Hsl = { readonly h: number; readonly s: number; readonly l: number };

const toHsl = ({ r, g, b }: Rgb): Hsl => {
  const [rr, gg, bb] = [r / 255, g / 255, b / 255] as const;
  const max = Math.max(rr, gg, bb);
  const min = Math.min(rr, gg, bb);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === rr ? (gg - bb) / d + (gg < bb ? 6 : 0) : max === gg ? (bb - rr) / d + 2 : (rr - gg) / d + 4;
  return { h: h * 60, s, l };
};

const channel = (p: number, q: number, t: number): number => {
  const u = t < 0 ? t + 1 : t > 1 ? t - 1 : t;
  if (u < 1 / 6) return p + (q - p) * 6 * u;
  if (u < 1 / 2) return q;
  if (u < 2 / 3) return p + (q - p) * (2 / 3 - u) * 6;
  return p;
};

const fromHsl = ({ h, s, l }: Hsl): Rgb => {
  if (s === 0) return { r: l * 255, g: l * 255, b: l * 255 };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hue = (((h % 360) + 360) % 360) / 360;
  return { r: channel(p, q, hue + 1 / 3) * 255, g: channel(p, q, hue) * 255, b: channel(p, q, hue - 1 / 3) * 255 };
};

/** La teinte tournée de `degrees` sur la roue ; un gris reste gris. */
export const hueShiftHex = (hex: string, degrees: number): string => {
  const rgb = parseHex(hex);
  if (rgb === null) return hex;
  const hsl = toHsl(rgb);
  return hsl.s === 0 ? toHex(rgb) : toHex(fromHsl({ ...hsl, h: hsl.h + degrees }));
};

/** La teinte désaturée (gris de même clarté). */
export const desaturateHex = (hex: string): string => {
  const rgb = parseHex(hex);
  return rgb === null ? hex : toHex(fromHsl({ ...toHsl(rgb), s: 0 }));
};

/** La teinte assombrie, par pas de clarté, jusqu'à tenir `minimum`:1 sur `ground` ; inchangée si elle tient déjà. */
export const ensureContrast = (hex: string, ground: string, minimum = 4.5): string => {
  const rgb = parseHex(hex);
  if (rgb === null || contrastRatio(hex, ground) >= minimum) return hex;
  const hsl = toHsl(rgb);
  const darker = (step: number): string => toHex(fromHsl({ ...hsl, l: Math.max(0, hsl.l - step * 0.02) }));
  for (let step = 1; step <= 50; step += 1) {
    const candidate = darker(step);
    if (contrastRatio(candidate, ground) >= minimum) return candidate;
  }
  return INK.dark;
};

/** L'encre, noire ou blanche, qui contraste le plus sur ce fond (au moins 4,58:1, quel que soit le fond). */
export const inkOn = (background: string): typeof INK.light | typeof INK.dark => {
  const rgb = parseHex(background);
  if (rgb === null) return INK.light;
  return ratio(WHITE, rgb) >= ratio(BLACK, rgb) ? INK.light : INK.dark;
};
