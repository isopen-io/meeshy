import { INK, escapeSvg } from './art';
import { P, at } from './props';

/**
 * LES COMPOSITIONS RÉPÉTÉES DU CATALOGUE (#9034) — une pluie, une volée de
 * cœurs, un bandeau de légende — pour que chaque sticker se lise en une
 * phrase et que deux pluies ne divergent pas.
 */

/** Coupe un texte saisi pour qu'il tienne dans sa place, sans jamais casser l'échappement. */
export function clip(text: string, max: number): string {
  const trimmed = text.trim();
  return trimmed.length > max ? `${trimmed.slice(0, max - 1).trimEnd()}…` : trimmed;
}

const FONT = 'font-family="system-ui,sans-serif"';

/** Le BANDEAU d'un sticker dynamique : une ligne forte (lieu, heure, météo) et, dessous, une ligne douce. */
export function band(main: string, sub: string | undefined, o: { readonly fill?: string; readonly ink?: string } = {}): string {
  const fill = o.fill ?? '#ffffff';
  const ink = o.ink ?? INK;
  const top = clip(main, 20);
  const bottom = sub !== undefined && sub.trim() !== '' ? clip(sub, 28) : '';
  const mainSize = top.length > 14 ? 15 : 19;
  return bottom === ''
    ? `<rect x="14" y="158" width="172" height="34" rx="17" fill="${fill}" stroke="${INK}" stroke-width="2.4"/><text x="100" y="${181 - (19 - mainSize) / 2}" text-anchor="middle" font-size="${mainSize}" font-weight="900" fill="${ink}" ${FONT}>${escapeSvg(top)}</text>`
    : `<rect x="14" y="148" width="172" height="46" rx="16" fill="${fill}" stroke="${INK}" stroke-width="2.4"/><text x="100" y="169" text-anchor="middle" font-size="${mainSize}" font-weight="900" fill="${ink}" ${FONT}>${escapeSvg(top)}</text><text x="100" y="186" text-anchor="middle" font-size="11.5" font-weight="700" fill="${ink}" opacity=".78" ${FONT}>${escapeSvg(bottom)}</text>`;
}

/** Un texte libre posé sur une surface (un cœur, une banderole, une lettre). */
export function label(x: number, y: number, text: string, o: { readonly size?: number; readonly fill?: string; readonly max?: number } = {}): string {
  return `<text x="${x}" y="${y}" text-anchor="middle" font-size="${o.size ?? 13}" font-weight="900" fill="${o.fill ?? INK}" ${FONT}>${escapeSvg(clip(text, o.max ?? 16))}</text>`;
}

type Spot = readonly [x: number, y: number];

/** Une même pièce posée à plusieurs endroits, chacune décalée sur la boucle — une pluie, des notes, des cœurs. */
export function many(spots: readonly Spot[], inner: string, role: string, period: number, o: { readonly s?: number } = {}): string {
  return spots.map(([x, y], i) => at(x, y, inner, { role, d: -(period * i) / spots.length, ...(o.s !== undefined ? { s: o.s } : {}) })).join('');
}

export const rain = (role: string, x0 = 30, x1 = 170, y = 40, n = 7) =>
  many(
    Array.from({ length: n }, (_, i) => [Math.round(x0 + ((x1 - x0) * i) / (n - 1)), y + (i % 3) * 8] as const),
    P.drop(),
    role,
    1.1,
  );

export const snowfall = (role: string, n = 7) =>
  many(
    Array.from({ length: n }, (_, i) => [24 + i * 25, 30 + (i % 2) * 14] as const),
    P.snowflake(),
    role,
    3,
    { s: 0.9 },
  );

export const hearts = (role: string, spots: readonly Spot[], period: number, c?: string) => many(spots, P.heart(c, 9), role, period);
export const notes = (role: string, spots: readonly Spot[], period: number) =>
  spots.map(([x, y], i) => at(x, y, P.note(i % 2 === 0 ? '#8b5cf6' : '#ec4899'), { role, d: -(period * i) / spots.length })).join('');
export const sparkles = (role: string, spots: readonly Spot[], period: number, c?: string) => many(spots, P.sparkle(c), role, period);
export const tears = (role: string, spots: readonly Spot[], period: number) => many(spots, P.tear(), role, period);
export const zs = (role: string, x: number, y: number) => many([[x, y], [x + 4, y - 2], [x + 8, y - 4]], P.zzz(), role, 2.4);
export const sunAt = (x: number, y: number, role?: string, s = 1) =>
  `${at(x, y, P.sunRays(), { s, ...(role !== undefined ? { role } : {}) })}${at(x, y, P.sunCore(), { s })}`;
/** Une ombre portée sous les pattes : un personnage qui flotte garde un sol. */
export const shadow = (x: number, y: number, w = 34) => `<ellipse cx="${x}" cy="${y}" rx="${w}" ry="5" fill="${INK}" opacity=".12"/>`;
