/**
 * LA GRILLE AU CLAVIER (#10531) — la loi du déplacement, sans DOM : la grille
 * d'emojis et la rangée des catégories la partagent (une rangée est une grille
 * d'autant de colonnes que d'éléments).
 */
const GRID_KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'] as const;

export type GridKey = (typeof GRID_KEYS)[number];

export const isGridKey = (key: string): key is GridKey => GRID_KEYS.some((candidate) => candidate === key);

export function nextGridIndex({
  index,
  count,
  columns,
  key,
  rtl,
}: {
  readonly index: number;
  readonly count: number;
  readonly columns: number;
  readonly key: string;
  readonly rtl: boolean;
}): number {
  if (!isGridKey(key) || count <= 0) return index;
  const last = count - 1;
  const width = Math.max(1, columns);
  const forward = Math.min(last, index + 1);
  const backward = Math.max(0, index - 1);
  if (key === 'Home') return 0;
  if (key === 'End') return last;
  if (key === 'ArrowRight') return rtl ? backward : forward;
  if (key === 'ArrowLeft') return rtl ? forward : backward;
  if (key === 'ArrowUp') return index - width >= 0 ? index - width : index;
  if (index + width <= last) return index + width;
  return Math.floor(index / width) < Math.floor(last / width) ? last : index;
}
