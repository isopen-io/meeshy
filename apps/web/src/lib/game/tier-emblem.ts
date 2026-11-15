import { LEVEL_TIER_KEYS, type LevelTierKey } from '@meeshy/shared/utils/game/levels';
import { isSpectralTier } from '@/lib/game/ladder';

/**
 * LES VINGT EMBLÈMES DE PALIER (#9481, #9688) — un dessin par palier, Étincelle →
 * Galaxie pour les niveaux 1 à 100, puis Nébuleuse → Singularité au-delà, que
 * l'anneau de niveau imprime en filigrane dans son disque central.
 * Chaque emblème est bâti AUTOUR de la Signature (les trois traits de Meeshy
 * au cœur) et prend la couleur spectrale de son palier (`--game-tier-<palier>`,
 * Galaxie et Singularité : le prisme).
 *
 * C'est une DONNÉE — des primitives dans une boîte de 100 centrée sur
 * l'origine — que le composant (`components/game/tier-emblem.tsx`) habille :
 * l'iOS dessine les mêmes formes. Une forme est `fill` (aplat) ou `stroke`
 * (trait à bouts ronds) ; jamais une couleur écrite ici.
 *
 * `core` dit si le cœur est PLEIN (la Signature s'y creuse, à la couleur du
 * disque) ou OUVERT (la Signature y reste de la couleur du palier).
 */

export const EMBLEM_BOX = 100;

export type EmblemPaint = 'fill' | 'stroke';

export type EmblemShape =
  | { readonly kind: 'path'; readonly d: string; readonly paint: EmblemPaint; readonly width?: number }
  | { readonly kind: 'circle'; readonly cx: number; readonly cy: number; readonly r: number; readonly paint: EmblemPaint; readonly width?: number }
  | { readonly kind: 'line'; readonly x1: number; readonly y1: number; readonly x2: number; readonly y2: number; readonly width: number };

export type TierEmblemDesign = {
  readonly shapes: readonly EmblemShape[];
  readonly core: 'filled' | 'open';
};

const round = (value: number): number => Math.round(value * 10) / 10;

/** Le rang d'un palier : Étincelle 1 … Galaxie 10 … Singularité 20. */
export const tierOrdinal = (tier: LevelTierKey): number => LEVEL_TIER_KEYS.indexOf(tier) + 1;

export const TIER_ROMAN = [
  'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X',
  'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX',
] as const;

/** Le palier en chiffres romains (I à XX) — le cartouche de l'anneau. */
export const tierRoman = (tier: LevelTierKey): string => TIER_ROMAN[tierOrdinal(tier) - 1] ?? 'I';

const polar = (radius: number, degrees: number, origin: { readonly x: number; readonly y: number } = { x: 0, y: 0 }) => {
  const angle = (degrees * Math.PI) / 180;
  return { x: round(origin.x + radius * Math.cos(angle)), y: round(origin.y + radius * Math.sin(angle)) };
};

/** Un polygone en étoile : `points` pointes, de `outer` à `inner`, une pointe vers le haut. */
const starPath = (points: number, outer: number, inner: number): string =>
  Array.from({ length: points * 2 }, (_, k) => {
    const { x, y } = polar(k % 2 === 0 ? outer : inner, -90 + (k * 180) / points);
    return `${k === 0 ? 'M' : 'L'}${x} ${y}`;
  }).join('') + 'Z';

const rays = (count: number, from: number, to: number, width: number): readonly EmblemShape[] =>
  Array.from({ length: count }, (_, k) => {
    const a = polar(from, (k * 360) / count);
    const b = polar(to, (k * 360) / count);
    return { kind: 'line', x1: a.x, y1: a.y, x2: b.x, y2: b.y, width };
  });

const fan = (degrees: readonly number[]): readonly EmblemShape[] =>
  degrees.map((d) => {
    const origin = { x: 0, y: 36 };
    const a = polar(12, -90 + d, origin);
    const b = polar(62, -90 + d, origin);
    return { kind: 'line', x1: a.x, y1: a.y, x2: b.x, y2: b.y, width: 6 };
  });

const CONSTELLATION: readonly (readonly [number, number])[] = [
  [-34, 18],
  [-14, -14],
  [10, 4],
  [32, -26],
  [36, 24],
];

const constellation = (): readonly EmblemShape[] => [
  ...CONSTELLATION.slice(1).map(([x2, y2], k): EmblemShape => {
    const [x1, y1] = CONSTELLATION[k] ?? [0, 0];
    return { kind: 'line', x1, y1, x2, y2, width: 3 };
  }),
  ...CONSTELLATION.map(([cx, cy]): EmblemShape => ({ kind: 'circle', cx, cy, r: 6, paint: 'fill' })),
];

/** Des points posés en amas — les paliers d'au-delà de 100 (#9688). */
const dots = (points: readonly (readonly [number, number, number])[]): readonly EmblemShape[] =>
  points.map(([cx, cy, r]): EmblemShape => ({ kind: 'circle', cx, cy, r, paint: 'fill' }));

/** Une ellipse horizontale en tracé, demi-axes `rx` × `ry`. */
const ellipse = (rx: number, ry: number): string => `M${-rx} 0 A${rx} ${ry} 0 1 0 ${rx} 0 A${rx} ${ry} 0 1 0 ${-rx} 0`;

/** Le signe de l'infini : deux boucles qui se croisent au cœur. */
const LEMNISCATE = 'M0 0 C12 -22 44 -22 44 0 C44 22 12 22 0 0 C-12 -22 -44 -22 -44 0 C-44 22 -12 22 0 0 Z';

/** Les lignes de champ d'un magnétar : deux boucles de part et d'autre du cœur. */
const FIELD = 'M0 -16 C34 -46 34 46 0 16';

/** Un bras de spirale en coordonnées absolues ; le second est son point symétrique. */
const ARM = 'M0 0 C8 -8 22 -6 26 6 C30 22 8 36 -12 30 C-36 22 -40 -8 -22 -28 C-6 -44 24 -46 40 -28';
const negate = (d: string): string => d.replace(/-?\d+(?:\.\d+)?/g, (n) => String(-Number(n)));

export const TIER_EMBLEMS: Readonly<Record<LevelTierKey, TierEmblemDesign>> = {
  etincelle: {
    core: 'filled',
    shapes: [
      { kind: 'path', paint: 'fill', d: 'M0 -46 C3 -12 12 -3 46 0 C12 3 3 12 0 46 C-3 12 -12 3 -46 0 C-12 -3 -3 -12 0 -46 Z' },
      { kind: 'path', paint: 'fill', d: 'M30 -44 C31 -36 34 -33 42 -32 C34 -31 31 -28 30 -20 C29 -28 26 -31 18 -32 C26 -33 29 -36 30 -44 Z' },
    ],
  },
  lueur: {
    core: 'filled',
    shapes: [
      { kind: 'circle', cx: 0, cy: 0, r: 15, paint: 'fill' },
      { kind: 'circle', cx: 0, cy: 0, r: 28, paint: 'stroke', width: 4 },
      { kind: 'circle', cx: 0, cy: 0, r: 41, paint: 'stroke', width: 3 },
    ],
  },
  lumiere: {
    core: 'filled',
    shapes: [{ kind: 'circle', cx: 0, cy: 0, r: 17, paint: 'fill' }, ...rays(8, 27, 44, 5)],
  },
  eclat: {
    core: 'filled',
    shapes: [{ kind: 'path', paint: 'fill', d: starPath(12, 46, 27) }],
  },
  rayon: {
    core: 'open',
    shapes: fan([-50, -25, 0, 25, 50]),
  },
  aurore: {
    core: 'open',
    shapes: [
      { kind: 'path', paint: 'fill', d: 'M-20 14 A20 20 0 0 1 20 14 Z' },
      { kind: 'path', paint: 'stroke', width: 4, d: 'M-33 14 A33 33 0 0 1 33 14' },
      { kind: 'path', paint: 'stroke', width: 3.5, d: 'M-45 14 A45 45 0 0 1 45 14' },
      { kind: 'line', x1: -45, y1: 25, x2: 45, y2: 25, width: 5 },
    ],
  },
  comete: {
    core: 'open',
    shapes: [
      { kind: 'circle', cx: 22, cy: -20, r: 13, paint: 'fill' },
      { kind: 'path', paint: 'stroke', width: 7, d: 'M12 -10 Q-10 10 -40 24' },
      { kind: 'path', paint: 'stroke', width: 4, d: 'M8 -22 Q-16 -8 -42 -6' },
      { kind: 'path', paint: 'stroke', width: 4, d: 'M24 -6 Q10 18 -8 40' },
    ],
  },
  etoile: {
    core: 'filled',
    shapes: [{ kind: 'path', paint: 'fill', d: starPath(5, 46, 19) }],
  },
  constellation: {
    core: 'open',
    shapes: constellation(),
  },
  galaxie: {
    core: 'open',
    shapes: [
      { kind: 'path', paint: 'stroke', width: 5, d: ARM },
      { kind: 'path', paint: 'stroke', width: 5, d: negate(ARM) },
      { kind: 'circle', cx: 0, cy: 0, r: 6, paint: 'fill' },
    ],
  },
  nebuleuse: {
    core: 'filled',
    shapes: dots([
      [0, 0, 20],
      [-22, -8, 15],
      [20, -14, 14],
      [16, 18, 15],
      [-16, 20, 12],
    ]),
  },
  pulsar: {
    core: 'filled',
    shapes: [
      { kind: 'circle', cx: 0, cy: 0, r: 16, paint: 'fill' },
      { kind: 'circle', cx: 0, cy: 0, r: 26, paint: 'stroke', width: 3 },
      { kind: 'line', x1: 0, y1: -32, x2: 0, y2: -48, width: 6 },
      { kind: 'line', x1: 0, y1: 32, x2: 0, y2: 48, width: 6 },
    ],
  },
  quasar: {
    core: 'filled',
    shapes: [
      { kind: 'circle', cx: 0, cy: 0, r: 15, paint: 'fill' },
      { kind: 'path', paint: 'stroke', width: 4, d: ellipse(44, 13) },
      { kind: 'line', x1: 16, y1: -16, x2: 36, y2: -40, width: 5 },
      { kind: 'line', x1: -16, y1: 16, x2: -36, y2: 40, width: 5 },
    ],
  },
  supernova: {
    core: 'filled',
    shapes: [{ kind: 'path', paint: 'fill', d: starPath(16, 47, 24) }],
  },
  magnetar: {
    core: 'filled',
    shapes: [
      { kind: 'circle', cx: 0, cy: 0, r: 15, paint: 'fill' },
      { kind: 'path', paint: 'stroke', width: 4, d: FIELD },
      { kind: 'path', paint: 'stroke', width: 4, d: negate(FIELD) },
    ],
  },
  amas: {
    core: 'open',
    shapes: dots([
      [0, -30, 8],
      [-26, -14, 7],
      [26, -14, 7],
      [-30, 14, 6],
      [30, 14, 6],
      [-12, 32, 7],
      [12, 32, 7],
      [0, 6, 5],
    ]),
  },
  superamas: {
    core: 'open',
    shapes: [
      { kind: 'line', x1: 0, y1: -30, x2: -28, y2: 20, width: 2.5 },
      { kind: 'line', x1: -28, y1: 20, x2: 28, y2: 20, width: 2.5 },
      { kind: 'line', x1: 28, y1: 20, x2: 0, y2: -30, width: 2.5 },
      ...dots([
        [0, -30, 7],
        [-8, -40, 4],
        [8, -40, 4],
        [-28, 20, 7],
        [-40, 14, 4],
        [-36, 30, 4],
        [28, 20, 7],
        [40, 14, 4],
        [36, 30, 4],
      ]),
    ],
  },
  cosmos: {
    core: 'open',
    shapes: [
      { kind: 'circle', cx: 0, cy: 0, r: 24, paint: 'stroke', width: 3 },
      { kind: 'circle', cx: 0, cy: 0, r: 40, paint: 'stroke', width: 3 },
      ...dots([
        [24, 0, 6],
        [-28, -28, 6],
        [12, 38, 5],
      ]),
    ],
  },
  infini: {
    core: 'open',
    shapes: [{ kind: 'path', paint: 'stroke', width: 7, d: LEMNISCATE }],
  },
  singularite: {
    core: 'filled',
    shapes: [
      { kind: 'circle', cx: 0, cy: 0, r: 17, paint: 'fill' },
      { kind: 'path', paint: 'stroke', width: 3.5, d: ellipse(42, 15) },
      ...rays(12, 30, 47, 2.5),
    ],
  },
};

/** La teinte d'un palier, en jeton CSS — Galaxie et Singularité sont des spectres : une des couleurs du prisme. */
export const tierTint = (tier: LevelTierKey): string => (isSpectralTier(tier) ? 'var(--game-prism-3)' : `var(--game-tier-${tier})`);
