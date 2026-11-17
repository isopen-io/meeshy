import type { CSSProperties } from 'react';

/**
 * K49 · MeeshyMediaGrid — LA LOI ET LA RECETTE (#18877, #18857).
 *
 * La grille montre, elle ne range rien pour toi : aucune coche, aucun « + », aucune poignée.
 * L'ordre est celui que l'hôte donne, et une tuile touchée s'ouvre. L'image, son chargement
 * et sa mise en cache sont à l'hôte (`content`) ; la grille tient la géométrie et le type.
 */
export type MeeshyMediaTileKind = 'media' | 'text' | 'ghost' | 'skeleton';
export type MeeshyMediaGridLayout = 'regular' | 'masonry' | 'row';
export type MeeshyMediaTileShape = 'square' | 'tall' | 'free';
export type MeeshyMediaGridSpacing = 'tight' | 'regular';

export const MEESHY_MEDIA_GRID_MEASURE = {
  gap: { tight: 6, regular: 8 },
  wideGap: 14,
  radius: 18,
  tallAspect: 3 / 4,
  pressScale: 0.96,
  pressVeil: 0.12,
  hoverScale: 1.025,
  hoverElevation: 8,
  columns: { min: 2, max: 3 },
  fallbackWidth: 350,
} as const;

export const meeshyMediaGridColumns = (columns: number | undefined): number =>
  Math.min(Math.max(Math.trunc(Number.isFinite(columns) ? (columns as number) : MEESHY_MEDIA_GRID_MEASURE.columns.max), MEESHY_MEDIA_GRID_MEASURE.columns.min), MEESHY_MEDIA_GRID_MEASURE.columns.max);

const aspectOf = (aspect: number | undefined): number => (aspect !== undefined && Number.isFinite(aspect) && aspect > 0 ? aspect : 1);

export type MeeshyMediaGridPlacement = {
  /** Pour chaque colonne, les rangs des tuiles qui s'y empilent, dans l'ordre. */
  readonly columns: readonly (readonly number[])[];
  /** La hauteur de chaque colonne, écarts compris. */
  readonly heights: readonly number[];
};

/** La loi de placement de la maçonnerie : chaque tuile va dans la colonne la plus courte — la première à égalité. Un rapport illisible vaut 1. */
export const meeshyMediaGridPlacement = (input: {
  readonly aspects: readonly (number | undefined)[];
  readonly columns: number;
  readonly spacing: number;
  readonly width: number;
}): MeeshyMediaGridPlacement => {
  const count = Math.max(Math.trunc(input.columns), 1);
  const columnWidth = Math.max((input.width - input.spacing * (count - 1)) / count, 0);
  const placed = input.aspects.reduce<{ readonly lanes: readonly (readonly number[])[]; readonly heights: readonly number[] }>(
    (state, aspect, index) => {
      const target = state.heights.indexOf(Math.min(...state.heights));
      const tileHeight = columnWidth / aspectOf(aspect);
      return {
        lanes: state.lanes.map((lane, lanIndex) => (lanIndex === target ? [...lane, index] : lane)),
        heights: state.heights.map((height, lanIndex) => (lanIndex === target ? height + (height === 0 ? 0 : input.spacing) + tileHeight : height)),
      };
    },
    { lanes: Array.from({ length: count }, () => []), heights: Array.from({ length: count }, () => 0) },
  );
  return { columns: placed.lanes, heights: placed.heights };
};

export type MeeshyMediaGridRecipeInput = {
  readonly layout?: MeeshyMediaGridLayout | undefined;
  readonly shape?: MeeshyMediaTileShape | undefined;
  readonly columns?: number | undefined;
  readonly spacing?: MeeshyMediaGridSpacing | undefined;
  readonly kind?: MeeshyMediaTileKind | undefined;
  readonly isPressed?: boolean | undefined;
  readonly isHovered?: boolean | undefined;
  readonly isFocused?: boolean | undefined;
  readonly reduceMotion?: boolean | undefined;
};

export type MeeshyMediaGridRecipe = {
  readonly layout: MeeshyMediaGridLayout;
  readonly columns: number;
  readonly gap: number;
  readonly radius: number;
  readonly aspect: number | null;
  readonly isInteractive: boolean;
  readonly scale: number;
  readonly veil: number;
  readonly elevation: number;
  readonly showsHoverActions: boolean;
};

export const meeshyMediaGridRecipe = (input: MeeshyMediaGridRecipeInput): MeeshyMediaGridRecipe => {
  const kind = input.kind ?? 'media';
  const layout = input.layout ?? 'regular';
  const shape = input.shape ?? 'tall';
  const isInteractive = kind === 'media' || kind === 'text';
  const reduce = input.reduceMotion === true;
  const lifted = isInteractive && input.isHovered === true;
  const pressed = isInteractive && input.isPressed === true;
  return {
    layout,
    columns: meeshyMediaGridColumns(input.columns),
    gap: MEESHY_MEDIA_GRID_MEASURE.gap[input.spacing ?? 'regular'],
    radius: MEESHY_MEDIA_GRID_MEASURE.radius,
    aspect: layout === 'masonry' || shape === 'free' ? null : shape === 'square' || layout === 'row' ? 1 : MEESHY_MEDIA_GRID_MEASURE.tallAspect,
    isInteractive,
    scale: reduce ? 1 : pressed ? MEESHY_MEDIA_GRID_MEASURE.pressScale : lifted ? MEESHY_MEDIA_GRID_MEASURE.hoverScale : 1,
    veil: pressed ? MEESHY_MEDIA_GRID_MEASURE.pressVeil : 0,
    elevation: lifted ? MEESHY_MEDIA_GRID_MEASURE.hoverElevation : 0,
    showsHoverActions: isInteractive && (input.isHovered === true || input.isFocused === true),
  };
};

const REM = 16;
const rem = (px: number): string => `${px / REM}rem`;

export const meeshyMediaGridStyle = (recipe: MeeshyMediaGridRecipe, tint: string | undefined): CSSProperties =>
  ({
    '--kit-media-gap': rem(recipe.gap),
    '--kit-media-radius': rem(recipe.radius),
    '--kit-media-columns': recipe.columns,
    ...(tint === undefined ? {} : { '--kit-media-tint': tint }),
  }) as CSSProperties;
