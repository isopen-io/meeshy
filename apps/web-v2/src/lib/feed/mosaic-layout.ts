/**
 * L'AGENCEMENT D'UNE PUBLICATION, CHOISI PAR SON AUTEUR (#6514) — dérivation de
 * `MosaicLayoutMode` (`packages/MeeshySDK/.../Models/CanvasV3.swift`) et de la
 * géométrie `MosaicLayout` (`packages/MeeshySDK/.../MeeshyUI/Story/MosaicLayout.swift`),
 * le seul rendu qui existait avant ce lot (le fil iOS, `PostSceneMosaic`).
 *
 * C'est une décision d'AUTEUR, qui voyage avec la publication
 * (`Post.storyEffects.layout`, document canvas v3, aucun champ serveur) : deux
 * lecteurs doivent voir la même mise en page, sur les trois clients. La
 * calculer ici d'après le nombre de médias ou la largeur rendrait deux réponses
 * pour un même post.
 *
 * Les cotes sont DÉRIVÉES, jamais importées (le SDK est du Swift) :
 * `scripts/lib/curve-mosaic-layout.mjs` les compare à la source et au schéma
 * partagé (`MosaicLayoutModeSchema`, `packages/shared/types/canvas-v3.ts`) à
 * chaque gate. Les cadres sont en FRACTIONS (0…1) de la boîte — `reel` déborde
 * volontairement à droite, ses `x` dépassent 1.
 */
export const MOSAIC_LAYOUT_MODES = ['wave', 'hero', 'reel', 'sine', 'carousel'] as const;

export type MosaicLayoutMode = (typeof MOSAIC_LAYOUT_MODES)[number];

/** Les quatre modes qui POSENT des tuiles côte à côte — le cinquième pagine. */
export type TiledLayoutMode = Exclude<MosaicLayoutMode, 'carousel'>;

/** Le défaut de TOUT le corpus : aucune publication antérieure au 2026-09-06
 * ne porte `layout` (`MosaicLayoutMode.fallback`). */
export const MOSAIC_FALLBACK_LAYOUT: MosaicLayoutMode = 'carousel';

export const MOSAIC_MAX_VISIBLE = 4;
export const MOSAIC_GUTTER = 0.014;
export const HERO_LARGE_WIDTH = 0.62;
export const WAVE_HOLLOW_HEIGHT = 0.74;
export const REEL_TILE_WIDTH = 0.6;
export const SINE_TILE_HEIGHT = 0.62;
export const FULL_CAPTION_WORDS = 20;
export const MOSAIC_CAPTION_WORDS = 8;
export const CAPTION_WORD_FLOOR = 2;
/** Le voile du « +N » (`PostSceneMosaic.report` : `.black.opacity(0.45)`) et
 * son chiffre (`.title2.weight(.bold)`, 22 pt au corps par défaut). */
export const MOSAIC_OVERFLOW_VEIL_OPACITY = 0.45;
export const MOSAIC_OVERFLOW_LABEL_SIZE = 22;
/** Le rayon d'une tuile (`RoundedRectangle(cornerRadius: 12)`). */
export const MOSAIC_TILE_RADIUS = 12;

const ASPECT_RATIOS: Readonly<Record<TiledLayoutMode, number>> = {
  wave: 0.78,
  hero: 0.82,
  reel: 1.05,
  sine: 0.92,
};

const isMosaicLayoutMode = (value: unknown): value is MosaicLayoutMode =>
  typeof value === 'string' && (MOSAIC_LAYOUT_MODES as readonly string[]).includes(value);

/**
 * `resolvedLayout` (iOS) : la disposition de l'auteur, ou le carrousel. Seul un
 * document MARQUÉ `v >= 3` est un canvas (`StoryModels.swift`, `mark >= 3`) —
 * un rang supérieur se lit, un blob v1 n'a jamais porté d'agencement. Une
 * valeur inconnue, écrite par un client plus récent, retombe sur le défaut :
 * un post rendu dans une autre disposition coûte moins qu'un post qui ne rend
 * rien.
 */
export function resolveMosaicLayout(storyEffects: unknown): MosaicLayoutMode {
  if (typeof storyEffects !== 'object' || storyEffects === null) return MOSAIC_FALLBACK_LAYOUT;
  const { v, layout } = storyEffects as { readonly v?: unknown; readonly layout?: unknown };
  if (typeof v !== 'number' || v < 3) return MOSAIC_FALLBACK_LAYOUT;
  return isMosaicLayoutMode(layout) ? layout : MOSAIC_FALLBACK_LAYOUT;
}

export function isPagedLayout(mode: MosaicLayoutMode): mode is 'carousel' {
  return mode === 'carousel';
}

export type MosaicTile = {
  readonly index: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /** `> 0` sur la DERNIÈRE tuile seulement : ce qui reste à voir, jamais le total. */
  readonly overflow: number;
};

const tile = (index: number, x: number, y: number, width: number, height: number): MosaicTile => ({
  index,
  x,
  y,
  width,
  height,
  overflow: 0,
});

const range = (n: number): readonly number[] => Array.from({ length: n }, (_, i) => i);

const evenWidth = (n: number): number => (1 - MOSAIC_GUTTER * (n - 1)) / n;

function waveTiles(n: number): readonly MosaicTile[] {
  const width = evenWidth(n);
  return range(n).map((i) => {
    const height = i % 2 === 1 ? WAVE_HOLLOW_HEIGHT : 1;
    return tile(i, i * (width + MOSAIC_GUTTER), (1 - height) / 2, width, height);
  });
}

function heroTiles(n: number): readonly MosaicTile[] {
  const column = 1 - HERO_LARGE_WIDTH - MOSAIC_GUTTER;
  const satellites = n - 1;
  const height = (1 - MOSAIC_GUTTER * (satellites - 1)) / satellites;
  return [
    tile(0, 0, 0, HERO_LARGE_WIDTH, 1),
    ...range(satellites).map((i) => tile(i + 1, HERO_LARGE_WIDTH + MOSAIC_GUTTER, i * (height + MOSAIC_GUTTER), column, height)),
  ];
}

function reelTiles(n: number): readonly MosaicTile[] {
  const step = REEL_TILE_WIDTH + MOSAIC_GUTTER * 2;
  return range(n).map((i) => tile(i, i * step, 0, REEL_TILE_WIDTH, 1));
}

function sineTiles(n: number): readonly MosaicTile[] {
  const width = evenWidth(n);
  return range(n).map((i) => tile(i, i * (width + MOSAIC_GUTTER), i % 2 === 0 ? 0 : 1 - SINE_TILE_HEIGHT, width, SINE_TILE_HEIGHT));
}

const GEOMETRY: Readonly<Record<MosaicLayoutMode, (n: number) => readonly MosaicTile[]>> = {
  wave: waveTiles,
  hero: heroTiles,
  reel: reelTiles,
  sine: sineTiles,
  carousel: (n) => range(n).map((i) => tile(i, 0, 0, 1, 1)),
};

/**
 * `MosaicLayout.tiles(sceneCount:mode:)` — les mosaïques plafonnent à quatre et
 * comptent le reste sur leur dernière tuile ; le carrousel ne cache rien. Un
 * seul visuel rend une tuile pleine : une mosaïque d'un élément n'en est pas
 * une.
 */
export function mosaicTiles(count: number, mode: MosaicLayoutMode): readonly MosaicTile[] {
  const n = isPagedLayout(mode) ? Math.max(0, count) : Math.max(0, Math.min(count, MOSAIC_MAX_VISIBLE));
  if (n === 0) return [];
  const rest = isPagedLayout(mode) ? 0 : Math.max(0, count - MOSAIC_MAX_VISIBLE);
  const tiles = n === 1 ? [tile(0, 0, 0, 1, 1)] : GEOMETRY[mode](n);
  return tiles.map((t, i) => (i === tiles.length - 1 ? { ...t, overflow: rest } : t));
}

/** Le rapport HAUTEUR / LARGEUR de la boîte, DÉCLARÉ par mode (jamais dérivé
 * des médias : quatre portraits côte à côte donneraient une bande plus haute
 * qu'un écran). */
export function mosaicAspectRatio(mode: TiledLayoutMode): number {
  return ASPECT_RATIOS[mode];
}

/** `MosaicLayout.tileCarriesCaption` — le critère est la PLACE : la grande
 * tuile d'un hero, les tuiles d'un défilement, un visuel seul. */
export function tileCarriesCaption(mode: MosaicLayoutMode, index: number, count: number): boolean {
  if (count <= 1) return true;
  if (mode === 'hero') return index === 0;
  return mode === 'carousel' || mode === 'reel';
}

/** `MosaicLayout.captionWordLimit(mode:visualCount:tileWidth:)` — une limite en
 * MOTS (jamais en lignes), réduite à la part de la rangée, plancher deux mots. */
export function captionWordLimit(mode: MosaicLayoutMode, count: number, tileWidth: number): number {
  const full = count <= 1 || mode === 'carousel' || mode === 'reel' ? FULL_CAPTION_WORDS : MOSAIC_CAPTION_WORDS;
  if (tileWidth >= 1) return full;
  return Math.max(CAPTION_WORD_FLOOR, Math.round(full * Math.max(0, tileWidth)));
}
