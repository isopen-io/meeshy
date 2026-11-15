import type { SelfTileCorner, SelfTileScale } from './call-self-tile';

/**
 * **CE QUE LES GESTES FONT DE MA VIGNETTE, EN LOI PURE** (#8577, #8747, #17930) — pincer la fait passer d'un cran (deux
 * si le geste est franc), Ctrl + molette d'un cran, et elle s'accroche toujours à une taille ; sous 8 px, un glissé reste
 * un toucher ; les flèches la portent au coin voisin. Ces lois ne servent qu'APRÈS un geste : elles vivent avec la vignette
 * du coin et l'écran reçu en duo, dans leurs chunks, jamais dans `call_overlay` (`call-self-tile.ts` y garde la place).
 */

const clampScale = (value: number): SelfTileScale => (value <= 1 ? 1 : value >= 3 ? 3 : 2);

const pinchSteps = (ratio: number): number => {
  if (ratio >= 1.8) return 2;
  if (ratio >= 1.15) return 1;
  if (ratio <= 0.55) return -2;
  if (ratio <= 0.87) return -1;
  return 0;
};

export const scaleAfterPinch = (scale: SelfTileScale, ratio: number): SelfTileScale => clampScale(scale + pinchSteps(ratio));

export const scaleAfterWheel = (scale: SelfTileScale, deltaY: number): SelfTileScale => clampScale(scale + Math.sign(-deltaY));

const DRAG_THRESHOLD = 8;

export const isTileDrag = ({ dx, dy }: { readonly dx: number; readonly dy: number }): boolean => Math.hypot(dx, dy) >= DRAG_THRESHOLD;

const cornerOf = (top: boolean, left: boolean): SelfTileCorner => `${top ? 'top' : 'bottom'}-${left ? 'left' : 'right'}`;

export function cornerAfterArrow(corner: SelfTileCorner, key: string): SelfTileCorner | null {
  const top = corner.startsWith('top');
  const left = corner.endsWith('left');
  const next = key === 'ArrowUp' ? cornerOf(true, left) : key === 'ArrowDown' ? cornerOf(false, left) : key === 'ArrowLeft' ? cornerOf(top, true) : key === 'ArrowRight' ? cornerOf(top, false) : null;
  return next === corner ? null : next;
}
