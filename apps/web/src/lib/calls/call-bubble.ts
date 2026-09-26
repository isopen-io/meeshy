/**
 * **LA BULLE D'APPEL** (#8046, D9) — la géométrie de `CallBubbleView.swift`
 * sans DOM : une bulle posée contre un bord (`bubbleEdge`) à une hauteur
 * relative (`bubbleVerticalFraction`), clipsée au bord le plus proche au
 * lâcher, jamais hors des marges sûres. La place survit à l'appel : elle est
 * retenue sur l'appareil, comme iOS la garde sur `CallManager`.
 */

export type BubbleEdge = 'left' | 'right';

export type BubblePlacement = { readonly edge: BubbleEdge; readonly fraction: number };

export type Size = { readonly width: number; readonly height: number };

export type Insets = { readonly top: number; readonly bottom: number };

export type Point = { readonly x: number; readonly y: number };

export const DEFAULT_BUBBLE: BubblePlacement = { edge: 'right', fraction: 0.15 };

export const BUBBLE_KEY = 'meeshy.call.bubble.v1';

/** Au-delà, un glissement horizontal de la pastille la replie en bulle (iOS : swipe de `FloatingCallPillView`). */
export const PILL_COLLAPSE_DISTANCE = 64;

const MARGIN = 12;
const TAP_SLOP = 8;
const KEY_STEP = 0.1;
/** La barre de la bulle (micro, image dans l'image, raccrocher) : des cibles de 44. */
export const BUBBLE_BAR = 48;
const BUBBLE_WIDTH = 136;

/** Vidéo : un cadre portrait ; audio : un carré pour l'avatar. La barre de commandes est comprise. */
export function bubbleSize(kind: 'video' | 'portrait'): Size {
  return { width: BUBBLE_WIDTH, height: (kind === 'video' ? 180 : 104) + BUBBLE_BAR };
}

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

const travel = (viewport: Size, insets: Insets, size: Size): number => Math.max(0, viewport.height - insets.top - insets.bottom - 2 * MARGIN - size.height);

export function bubbleOrigin(placement: BubblePlacement, viewport: Size, insets: Insets, size: Size): { readonly left: number; readonly top: number } {
  const left = placement.edge === 'left' ? MARGIN : viewport.width - MARGIN - size.width;
  return { left, top: insets.top + MARGIN + clamp01(placement.fraction) * travel(viewport, insets, size) };
}

/** Le centre au lâcher → le bord le plus proche et la hauteur gardée. */
export function snapBubble(center: Point, viewport: Size, insets: Insets, size: Size): BubblePlacement {
  const range = travel(viewport, insets, size);
  const top = center.y - size.height / 2 - insets.top - MARGIN;
  return { edge: center.x < viewport.width / 2 ? 'left' : 'right', fraction: range === 0 ? 0 : clamp01(top / range) };
}

export function nudgeBubble(placement: BubblePlacement, key: string): BubblePlacement | null {
  switch (key) {
    case 'ArrowLeft':
      return { ...placement, edge: 'left' };
    case 'ArrowRight':
      return { ...placement, edge: 'right' };
    case 'ArrowUp':
      return { ...placement, fraction: clamp01(Math.round((placement.fraction - KEY_STEP) * 100) / 100) };
    case 'ArrowDown':
      return { ...placement, fraction: clamp01(Math.round((placement.fraction + KEY_STEP) * 100) / 100) };
    default:
      return null;
  }
}

export function isBubbleTap(moved: Point): boolean {
  return Math.hypot(moved.x, moved.y) < TAP_SLOP;
}

export function readBubblePlacement(storage: Pick<Storage, 'getItem'> | null): BubblePlacement {
  try {
    const parsed: unknown = JSON.parse(storage?.getItem(BUBBLE_KEY) ?? 'null');
    if (typeof parsed !== 'object' || parsed === null) return DEFAULT_BUBBLE;
    const { edge, fraction } = parsed as Record<string, unknown>;
    const valid = (edge === 'left' || edge === 'right') && typeof fraction === 'number' && fraction >= 0 && fraction <= 1;
    return valid ? { edge, fraction } : DEFAULT_BUBBLE;
  } catch {
    return DEFAULT_BUBBLE;
  }
}

export function writeBubblePlacement(storage: Pick<Storage, 'setItem'> | null, placement: BubblePlacement): void {
  try {
    storage?.setItem(BUBBLE_KEY, JSON.stringify(placement));
  } catch {
    /* Stockage bloqué : la place vaut pour cet appel. */
  }
}
