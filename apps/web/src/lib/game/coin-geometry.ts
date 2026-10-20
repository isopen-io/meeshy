import coin from '@meeshy/shared/design/meesh-coin.json';
import type { MeeshEdition } from '@meeshy/shared/utils/game/mint';

import type { GameBirdKey } from './birds';
import type { GamePaint } from './materials';

/**
 * LA GÉOMÉTRIE DE LA MEESH (épopée § 6, #11176) — la LECTURE web de
 * `packages/shared/design/meesh-coin.json`, la seule source des coordonnées de
 * la pièce (repère 120 × 120, angles en degrés, sens horaire depuis 3 h). iOS
 * rejoue les mêmes formules : chaque fonction ci-dessous est celle que le
 * `$doc` du fichier partagé énonce, rien de plus.
 */

export type CoinSide = 'obverse' | 'reverse';
export type CoinDecor = 'veins' | 'beads' | 'rosette' | 'stars' | 'laurels' | 'iris' | 'cabochons' | 'sunburst' | 'crown' | 'sparkles';
export type CoinSeparator = 'dot' | 'star';
/** La tranche cannelée : gris de tranche (argent), encre de l'or (or), spectre à contre-sens (prisme). */
export type CoinFlute = 'rim' | 'ink' | 'iris';

export type CoinBird = { readonly bird: GameBirdKey; readonly x: number; readonly y: number; readonly scale: number; readonly flip: boolean };

export type CoinEdition = {
  readonly metal: GamePaint;
  readonly field: GamePaint;
  readonly flute: CoinFlute;
  readonly separator: CoinSeparator;
  readonly birds: readonly CoinBird[];
  readonly decor: Readonly<Record<CoinSide, readonly CoinDecor[]>>;
};

/** Le fichier partagé est du JSON : ce relevé lui donne les types qu'il promet, sans rien recopier. */
const EDITIONS = coin.editions as unknown as Readonly<Record<MeeshEdition, CoinEdition>>;

export const COIN = coin;

export const coinEdition = (edition: MeeshEdition): CoinEdition => EDITIONS[edition];

const C = coin.center;
const rad = (deg: number): number => (deg * Math.PI) / 180;
const round = (n: number): number => Math.round(n * 1000) / 1000;
const polar = (radius: number, deg: number): { readonly x: number; readonly y: number } => ({
  x: round(C + radius * Math.cos(rad(deg))),
  y: round(C + radius * Math.sin(rad(deg))),
});

export type RingGlyph = {
  /** La place du glyphe dans le texte répété, espaces compris. */
  readonly index: number;
  readonly glyph: string;
  readonly separator: boolean;
  readonly x: number;
  readonly y: number;
  readonly rotate: number;
};

/** La couronne de l'avers, glyphe par glyphe : centré sur son cercle, la tête vers l'extérieur. */
export const inscriptionLayout = (): readonly RingGlyph[] => {
  const { text, repeat, radius, startDeg, separator } = coin.inscription;
  const chars = [...text.repeat(repeat)];
  const step = 360 / chars.length;
  return chars.flatMap((glyph, index) => {
    if (glyph === ' ') return [];
    const angle = startDeg + index * step;
    return [{ index, glyph, separator: glyph === separator, ...polar(radius, angle), rotate: round(angle + 90) }];
  });
};

export type BeadRing = { readonly radius: number; readonly count: number; readonly dot: number; readonly startDeg: number };

export const beadPoints = (ring: BeadRing): readonly { readonly x: number; readonly y: number }[] =>
  Array.from({ length: ring.count }, (_, i) => polar(ring.radius, ring.startDeg + (i * 360) / ring.count));

const polygon = (cx: number, cy: number, radius: number, sides: number, startDeg: number): string =>
  `${Array.from({ length: sides }, (_, i) => {
    const deg = startDeg + (i * 360) / sides;
    return `${i === 0 ? 'M' : 'L'}${round(cx + radius * Math.cos(rad(deg)))} ${round(cy + radius * Math.sin(rad(deg)))}`;
  }).join(' ')} Z`;

export type CabochonShape = { readonly x: number; readonly y: number; readonly outer: string; readonly table: string };

/** Les cabochons du prisme : un octogone taillé et sa table, posés sur la tranche. */
export const cabochonShapes = (): readonly CabochonShape[] => {
  const { count, radius, startDeg, size, table } = coin.decor.cabochons;
  return Array.from({ length: count }, (_, i) => {
    const angle = startDeg + (i * 360) / count;
    const { x, y } = polar(radius, angle);
    return { x, y, outer: polygon(x, y, size, 8, angle + 22.5), table: polygon(x, y, size * table, 8, angle + 22.5) };
  });
};

/** Le guilloché en rosace de l'or : des cercles dont les centres tournent autour de celui de la pièce. */
export const rosetteCircles = (): readonly { readonly cx: number; readonly cy: number; readonly r: number }[] => {
  const { count, orbit, radius } = coin.decor.rosette;
  return Array.from({ length: count }, (_, i) => {
    const { x, y } = polar(orbit, (i * 360) / count);
    return { cx: x, cy: y, r: radius };
  });
};

export type Ray = { readonly x1: number; readonly y1: number; readonly x2: number; readonly y2: number };

/** Le guilloché en soleil du prisme, jusqu'au bord du champ de la face moins sa marge, un rayon sur deux raccourci. */
export const sunburstRays = (fieldRadius: number): readonly Ray[] => {
  const { count, inner, margin, short } = coin.decor.sunburst;
  const outer = fieldRadius - margin;
  return Array.from({ length: count }, (_, i) => {
    const angle = (i * 360) / count;
    const from = polar(inner, angle);
    const to = polar(i % 2 === 0 ? outer : inner + (outer - inner) * short, angle);
    return { x1: from.x, y1: from.y, x2: to.x, y2: to.y };
  });
};

/** Une petite étoile de la couronne de l'or, centrée sur (x, y), une branche tournée vers l'extérieur. */
export const starPath = ({ x, y, rotate }: { readonly x: number; readonly y: number; readonly rotate: number }): string => {
  const { points, outer, inner } = coin.decor.stars;
  return `${Array.from({ length: points * 2 }, (_, i) => {
    const deg = rotate - 90 + (i * 180) / points;
    const r = i % 2 === 0 ? outer : inner;
    return `${i === 0 ? 'M' : 'L'}${round(x + r * Math.cos(rad(deg)))} ${round(y + r * Math.sin(rad(deg)))}`;
  }).join(' ')} Z`;
};

export type Sparkle = { readonly x: number; readonly y: number; readonly size: number };

/** Un éclat de diamant : une étoile à quatre branches, la gorge à `inner` × size. */
export const sparklePath = ({ x, y, size }: Sparkle): string => {
  const g = round(size * coin.decor.sparkles.inner);
  const s = size;
  return `M${x} ${round(y - s)} L${round(x + g)} ${round(y - g)} L${round(x + s)} ${y} L${round(x + g)} ${round(y + g)} L${x} ${round(y + s)} L${round(x - g)} ${round(y + g)} L${round(x - s)} ${y} L${round(x - g)} ${round(y - g)} Z`;
};

export type Leaf = { readonly x: number; readonly y: number; readonly angle: number; readonly length: number; readonly width: number };

/** Une feuille de laurier : de sa base vers `angle`, deux courbes qui se rejoignent à la pointe. */
export const laurelLeafPath = ({ x, y, angle, length, width }: Leaf): string => {
  const along = (d: number, across: number): string => {
    const a = rad(angle);
    return `${round(x + d * Math.cos(a) - across * Math.sin(a))} ${round(y + d * Math.sin(a) + across * Math.cos(a))}`;
  };
  return `M${x} ${y} Q${along(length / 2, -width)} ${along(length, 0)} Q${along(length / 2, width)} ${x} ${y} Z`;
};
