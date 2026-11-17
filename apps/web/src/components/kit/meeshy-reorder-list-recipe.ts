import type { CSSProperties } from 'react';

/**
 * K52 · MeeshyReorderList — LA LOI ET LA RECETTE (#18877, #18857).
 *
 * Tout ordre réglable au doigt l'est aussi sans le doigt : le glisser, les actions de la
 * voix et les flèches du clavier appellent le même `onMove(from, to)`, avec les mêmes bornes
 * et la même annonce. Le composant porte le geste et rend deux index ; le contenu de la
 * rangée, l'enregistrement de l'ordre et son retour arrière sont à l'hôte.
 */
export type MeeshyReorderRank = 'hidden' | 'ordinal';
export type MeeshyReorderPhase = 'rest' | 'grabbed' | 'flying' | 'dropped';
export type MeeshyReorderHandleEdge = 'trailing' | 'leading';

export const MEESHY_REORDER_MEASURE = {
  handle: { regular: { width: 44, height: 44 }, narrow: { width: 32, height: 44 } },
  rankBadge: 30,
  grabScale: 1.02,
  flyTilt: 2,
  disabledHandleOpacity: 0.32,
  dropHalo: 4,
  dropHaloMs: 600,
  longPressMs: 350,
} as const;

/** Déplace un identifiant : une NOUVELLE liste, bornes tenues, rien ne change sur place. */
export const meeshyReorderMove = <T,>(ids: readonly T[], from: number, to: number): readonly T[] => {
  const last = ids.length - 1;
  if (last < 0 || from < 0 || from > last) return ids;
  const target = Math.min(Math.max(to, 0), last);
  if (target === from) return ids;
  const next = ids.filter((_, index) => index !== from);
  return [...next.slice(0, target), ids[from] as T, ...next.slice(target)];
};

/** Où la rangée saisie tomberait : le centre de la rangée, décalé du doigt, dit dans quelle case de l'ordre d'origine il se trouve. */
export const meeshyReorderTargetIndex = ({ from, offset, heights, spacing }: { readonly from: number; readonly offset: number; readonly heights: readonly number[]; readonly spacing: number }): number => {
  const last = heights.length - 1;
  if (last < 0 || from < 0 || from > last) return Math.max(from, 0);
  const tops = heights.reduce<readonly number[]>((acc, _height, index) => [...acc, index === 0 ? 0 : (acc[index - 1] ?? 0) + (heights[index - 1] ?? 0) + spacing], []);
  const center = (tops[from] ?? 0) + (heights[from] ?? 0) / 2 + offset;
  const slot = tops.findIndex((top, index) => center < top + (heights[index] ?? 0) + spacing);
  return slot < 0 ? last : slot;
};

export type MeeshyReorderListRecipeInput = {
  readonly phase?: MeeshyReorderPhase | undefined;
  readonly rank?: MeeshyReorderRank | undefined;
  readonly isFirst?: boolean | undefined;
  readonly emphasizesFirst?: boolean | undefined;
  readonly isEnabled?: boolean | undefined;
  readonly isPending?: boolean | undefined;
  readonly handleEdge?: MeeshyReorderHandleEdge | undefined;
  readonly reduceMotion?: boolean | undefined;
};

export type MeeshyReorderListRecipe = {
  readonly handle: { readonly width: number; readonly height: number };
  readonly rankBadge: number;
  readonly scale: number;
  readonly tilt: number;
  readonly lifted: boolean;
  readonly handleOpacity: number;
  readonly emphasized: boolean;
  readonly showsRank: boolean;
  readonly isPending: boolean;
  readonly dropHalo: number;
};

export const meeshyReorderListRecipe = (input: MeeshyReorderListRecipeInput): MeeshyReorderListRecipe => {
  const phase = input.phase ?? 'rest';
  const lifted = phase === 'grabbed' || phase === 'flying';
  const reduce = input.reduceMotion === true;
  return {
    handle: MEESHY_REORDER_MEASURE.handle[input.handleEdge === 'leading' ? 'narrow' : 'regular'],
    rankBadge: MEESHY_REORDER_MEASURE.rankBadge,
    scale: lifted && !reduce ? MEESHY_REORDER_MEASURE.grabScale : 1,
    tilt: phase === 'flying' && !reduce ? MEESHY_REORDER_MEASURE.flyTilt : 0,
    lifted,
    handleOpacity: input.isEnabled === false ? MEESHY_REORDER_MEASURE.disabledHandleOpacity : 1,
    emphasized: input.emphasizesFirst === true && input.isFirst === true,
    showsRank: input.rank === 'ordinal',
    isPending: input.isPending === true,
    dropHalo: phase === 'dropped' ? MEESHY_REORDER_MEASURE.dropHalo : 0,
  };
};

const REM = 16;
const rem = (px: number): string => `${px / REM}rem`;

export const meeshyReorderListStyle = (recipe: MeeshyReorderListRecipe, tint: string | undefined): CSSProperties =>
  ({
    '--kit-reorder-handle-w': rem(recipe.handle.width),
    '--kit-reorder-handle-h': rem(recipe.handle.height),
    '--kit-reorder-badge': rem(recipe.rankBadge),
    '--kit-reorder-handle-opacity': recipe.handleOpacity,
    ...(tint === undefined ? {} : { '--kit-reorder-tint': tint }),
  }) as CSSProperties;
