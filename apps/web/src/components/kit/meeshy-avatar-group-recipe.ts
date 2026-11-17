import type { CSSProperties } from 'react';

/**
 * K48 · MeeshyAvatarGroup — LA LOI ET LA RECETTE (#18877, #18857).
 *
 * Un groupe, une disposition, une phrase. Le groupe range des visages sans savoir qui ils
 * sont : l'hôte pose son avatar (avec présence et anneau) dans `cell`, trie, et écrit le
 * résumé. Il ne compte que ce qui déborde.
 */
export type MeeshyAvatarGroupSize = 26 | 40 | 44 | 56 | 72;
export type MeeshyAvatarGroupLayout = 'stack' | 'duo' | 'rail' | { readonly grid: 2 | 3 | 4 };
export type MeeshyAvatarGroupSelection = { readonly single: number | null } | { readonly multiple: ReadonlySet<number> };

export const MEESHY_AVATAR_GROUP_MEASURE: Readonly<Record<MeeshyAvatarGroupSize, { readonly overlap: number; readonly ring: number }>> = {
  26: { overlap: 10, ring: 2 },
  40: { overlap: 9, ring: 3 },
  44: { overlap: 10, ring: 3 },
  56: { overlap: 13, ring: 3.5 },
  72: { overlap: 17, ring: 4 },
};

export const MEESHY_AVATAR_GROUP_STACK_MAX = { min: 2, max: 5 } as const;
export const MEESHY_AVATAR_GROUP_OVERFLOW_CAP = 99;
export const MEESHY_AVATAR_GROUP_GRID_ROWS = 2;
export const MEESHY_AVATAR_GROUP_HALO = 0.34;
export const MEESHY_AVATAR_GROUP_SELECTION_RING = 2.5;
export const MEESHY_AVATAR_GROUP_CHECK = 24;
export const MEESHY_AVATAR_GROUP_TAP = 48;

export type MeeshyAvatarGroupRecipeInput = {
  readonly layout?: MeeshyAvatarGroupLayout | undefined;
  readonly size?: MeeshyAvatarGroupSize | undefined;
  readonly count: number;
  readonly max?: number | undefined;
  readonly reduceMotion?: boolean | undefined;
};

export type MeeshyAvatarGroupRecipe = {
  readonly isRenderable: boolean;
  readonly size: MeeshyAvatarGroupSize;
  readonly overlap: number;
  readonly ring: number;
  readonly visible: number;
  readonly overflow: number;
  readonly overflowLabel: string | null;
  readonly columns: number | null;
  readonly breathes: boolean;
  readonly haloOpacity: number;
};

const clamp = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), max);

export const meeshyAvatarGroupOverflowLabel = (overflow: number): string | null =>
  overflow <= 0 ? null : overflow > MEESHY_AVATAR_GROUP_OVERFLOW_CAP ? `${MEESHY_AVATAR_GROUP_OVERFLOW_CAP}+` : `+${overflow}`;

export const meeshyAvatarGroupRecipe = (input: MeeshyAvatarGroupRecipeInput): MeeshyAvatarGroupRecipe => {
  const layout = input.layout ?? 'stack';
  const size = input.size ?? 40;
  const count = Number.isFinite(input.count) ? Math.max(Math.trunc(input.count), 0) : 0;
  const requested = Math.trunc(input.max ?? 4);
  const columns = typeof layout === 'object' ? layout.grid : null;
  const visible =
    layout === 'duo'
      ? 2
      : layout === 'rail'
        ? count
        : columns !== null
          ? Math.min(count, clamp(requested, 1, columns * MEESHY_AVATAR_GROUP_GRID_ROWS - 1))
          : Math.min(count, clamp(requested, MEESHY_AVATAR_GROUP_STACK_MAX.min, MEESHY_AVATAR_GROUP_STACK_MAX.max));
  const overflow = layout === 'duo' || layout === 'rail' ? 0 : Math.max(count - visible, 0);
  const measure = MEESHY_AVATAR_GROUP_MEASURE[size];
  return {
    isRenderable: count > 0 && (layout !== 'duo' || count === 2),
    size,
    overlap: measure.overlap,
    ring: measure.ring,
    visible,
    overflow,
    overflowLabel: meeshyAvatarGroupOverflowLabel(overflow),
    columns,
    breathes: layout === 'duo' && input.reduceMotion !== true,
    haloOpacity: MEESHY_AVATAR_GROUP_HALO,
  };
};

const REM = 16;
const rem = (px: number): string => `${px / REM}rem`;

export const meeshyAvatarGroupStyle = (recipe: MeeshyAvatarGroupRecipe, tint: string | undefined, surface: string | undefined): CSSProperties =>
  ({
    '--kit-group-size': rem(recipe.size),
    '--kit-group-overlap': rem(recipe.overlap),
    '--kit-group-ring': rem(recipe.ring),
    '--kit-group-select': rem(MEESHY_AVATAR_GROUP_SELECTION_RING),
    '--kit-group-check': rem(MEESHY_AVATAR_GROUP_CHECK),
    '--kit-group-halo': recipe.haloOpacity,
    ...(tint === undefined ? {} : { '--kit-group-tint': tint }),
    ...(surface === undefined ? {} : { '--kit-group-surface': surface }),
  }) as CSSProperties;
