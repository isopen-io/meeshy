/**
 * LES MATIÈRES DU JEU (#9380) — métaux, pierre et feu des objets décorés.
 *
 * Un dégradé de métal est une ILLUSTRATION (comme le plumage de Mee) : il ne
 * se lit pas dans la charte de chrome, il n'a pas de variante claire/sombre —
 * l'argent est de l'argent dans les deux schémas. Le code ne porte donc AUCUNE
 * couleur : chaque arrêt NOMME un jeton `--game-<peinture>-<i>` que
 * `styles/game.css` déclare, et l'encre gravée dessus `--game-<peinture>-ink`.
 * `materials.test.ts` garde l'inventaire dans les deux sens.
 */

/** Les sept matières des badges, de la plus modeste à la plus rare. */
export const GAME_BADGE_MATERIALS = ['copper', 'bronze', 'silver', 'gold', 'platinum', 'obsidian', 'prism'] as const;
export type GameMaterial = (typeof GAME_BADGE_MATERIALS)[number];

/** Les peintures de plus : métal des pièces, fond de la pièce, indigo de la marque, feu. */
export const GAME_PAINTS = [...GAME_BADGE_MATERIALS, 'coin-silver', 'coin-silver-in', 'coin-gold', 'indigo', 'flame'] as const;
export type GamePaint = (typeof GAME_PAINTS)[number];

export type PaintStop = { readonly offset: number; readonly color: string };

/** Les positions des arrêts de chaque peinture ; la COULEUR vient du jeton `--game-<peinture>-<i>`. */
const OFFSETS: Readonly<Record<GamePaint, readonly number[]>> = {
  copper: [0, 1],
  bronze: [0, 1],
  silver: [0, 1],
  gold: [0, 1],
  platinum: [0, 1],
  obsidian: [0, 1],
  prism: [0, 0.25, 0.5, 0.75, 1],
  'coin-silver': [0, 0.45, 1],
  'coin-silver-in': [0, 1],
  'coin-gold': [0, 0.5, 1],
  indigo: [0, 1],
  flame: [0, 0.55, 1],
};

export const paintStops = (paint: GamePaint): readonly PaintStop[] =>
  OFFSETS[paint].map((offset, i) => ({ offset, color: `var(--game-${paint}-${i})` }));

export type PaintAxis = { readonly x1: number; readonly y1: number; readonly x2: number; readonly y2: number };

const DIAGONAL: PaintAxis = { x1: 0, y1: 0, x2: 1, y2: 1 };

/** Le sens de la lumière : en diagonale presque partout, du bas vers le haut pour le feu, inversé dans le creux de la pièce. */
export const paintAxis = (paint: GamePaint): PaintAxis => {
  if (paint === 'flame') return { x1: 0, y1: 1, x2: 0, y2: 0 };
  if (paint === 'coin-silver-in') return { x1: 1, y1: 0, x2: 0, y2: 1 };
  return DIAGONAL;
};

/** L'encre qu'on grave sur une matière : toujours plus sombre qu'elle (plus claire sur l'obsidienne). */
export const inkToken = (paint: GamePaint): string => `var(--game-${paint}-ink)`;

/** Un jeton transverse : `shade`, `glint`, `edge`, `track`, `rim`, `ash`. */
export const tokenVar = (name: 'shade' | 'glint' | 'edge' | 'track' | 'rim' | 'ash'): string => `var(--game-${name})`;

/** L'identifiant d'une peinture dans les `<defs>` d'UNE instance. */
export const paintId = (uid: string, paint: GamePaint): string => `${uid}-p-${paint}`;
export const paintUrl = (uid: string, paint: GamePaint): string => `url(#${paintId(uid, paint)})`;

/** `useId` rend des `:r1:` ou `P0-1` selon le moteur : seul `[A-Za-z0-9_-]` tient dans un `url(#…)`. */
export const safeUid = (raw: string): string => `g${raw.replace(/[^A-Za-z0-9_-]/g, '')}`;
