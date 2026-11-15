/**
 * LA GAMME DE 16 COULEURS (#10632, § 7) — une entrée = une clé stable + la
 * surface d'un fond uni et l'accent personnel, en clair et en sombre. Source
 * UNIQUE : iOS la copie octet pour octet dans son catalogue (témoin vitest).
 *
 * Contrastes tenus par `__tests__/appearance-gamut.test.ts` : l'accent atteint
 * 3:1 sur sa surface (objets graphiques, WCAG 1.4.11). Une valeur qui échoue
 * se corrige ICI, jamais en baissant le seuil.
 */
export const GAMUT_KEYS = [
  'indigo',
  'bleu-nuit',
  'azur',
  'lagon',
  'emeraude',
  'olive',
  'moutarde',
  'sable',
  'terracotta',
  'corail',
  'rose-poudre',
  'framboise',
  'prune',
  'lavande',
  'ardoise',
  'graphite',
] as const;
export type GamutKey = (typeof GAMUT_KEYS)[number];

export type GamutScheme = 'light' | 'dark';
export type GamutShade = { readonly surface: string; readonly accent: string };
export type GamutEntry = { readonly name: string; readonly light: GamutShade; readonly dark: GamutShade };

export const APPEARANCE_GAMUT: Readonly<Record<GamutKey, GamutEntry>> = {
  'indigo': { name: 'Indigo Meeshy', light: { surface: '#EEF0FF', accent: '#6366F1' }, dark: { surface: '#14152E', accent: '#818CF8' } },
  'bleu-nuit': { name: 'Bleu nuit', light: { surface: '#E6ECF4', accent: '#1E3A5F' }, dark: { surface: '#0E1A2B', accent: '#5B8BC4' } },
  'azur': { name: 'Azur', light: { surface: '#E5F2FC', accent: '#2F8FD8' }, dark: { surface: '#0C1C2A', accent: '#5AAEEB' } },
  'lagon': { name: 'Lagon', light: { surface: '#E2F6F5', accent: '#0E9594' }, dark: { surface: '#0A1D1D', accent: '#2CC3C1' } },
  'emeraude': { name: 'Émeraude', light: { surface: '#E3F5EE', accent: '#0F8A63' }, dark: { surface: '#0A1C15', accent: '#34C38F' } },
  'olive': { name: 'Olive', light: { surface: '#EFF1E4', accent: '#6B7A3A' }, dark: { surface: '#16180F', accent: '#A3B46A' } },
  'moutarde': { name: 'Moutarde', light: { surface: '#FBF3DC', accent: '#9C7100' }, dark: { surface: '#1F1A0B', accent: '#E0B43A' } },
  'sable': { name: 'Sable', light: { surface: '#F6EFE2', accent: '#A47E4F' }, dark: { surface: '#1E1A14', accent: '#D2AE7E' } },
  'terracotta': { name: 'Terracotta', light: { surface: '#F9E9E1', accent: '#C0582F' }, dark: { surface: '#22140F', accent: '#E58560' } },
  'corail': { name: 'Corail', light: { surface: '#FDECE9', accent: '#E0604E' }, dark: { surface: '#24120F', accent: '#F38B7B' } },
  'rose-poudre': { name: 'Rose poudré', light: { surface: '#FAEDEF', accent: '#C76B7E' }, dark: { surface: '#22151A', accent: '#E79AAB' } },
  'framboise': { name: 'Framboise', light: { surface: '#FBE7EF', accent: '#C2185B' }, dark: { surface: '#250D18', accent: '#EC5C91' } },
  'prune': { name: 'Prune', light: { surface: '#F3E9F3', accent: '#7B3F7D' }, dark: { surface: '#1D1220', accent: '#B97DBB' } },
  'lavande': { name: 'Lavande', light: { surface: '#F0EDFA', accent: '#7C6CC4' }, dark: { surface: '#17142A', accent: '#A99BE8' } },
  'ardoise': { name: 'Ardoise', light: { surface: '#EEF0F3', accent: '#4B5563' }, dark: { surface: '#14171C', accent: '#9CA3AF' } },
  'graphite': { name: 'Graphite', light: { surface: '#F2F2F2', accent: '#27272A' }, dark: { surface: '#0E0E0F', accent: '#D4D4D8' } },
};

export const isGamutKey = (value: unknown): value is GamutKey => typeof value === 'string' && (GAMUT_KEYS as readonly string[]).includes(value);

const channel = (value: number): number => {
  const unit = value / 255;
  return unit <= 0.03928 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4;
};

const luminance = (hex: string): number => {
  const [r, g, b] = [1, 3, 5].map((index) => channel(Number.parseInt(hex.slice(index, index + 2), 16)));
  return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
};

/** Le rapport de contraste WCAG de deux couleurs `#RRGGBB`, de 1 à 21. */
export function contrastRatio(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return ((light ?? 0) + 0.05) / ((dark ?? 0) + 0.05);
}

/** L'encre servie SUR un accent : noir ou blanc, le plus contrasté. */
export const inkOnAccent = (accentHex: string): '#000000' | '#FFFFFF' =>
  contrastRatio(accentHex, '#FFFFFF') >= contrastRatio(accentHex, '#000000') ? '#FFFFFF' : '#000000';
