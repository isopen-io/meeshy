import { createStore } from 'zustand/vanilla';

/**
 * **MA VIGNETTE EN COIN, EN LOI PURE** (#8577) — trois tailles, x1 · x2 · x3 ;
 * x2 est la vignette d'avant (112 × 160). Pincer ma vignette la fait passer
 * d'un cran — deux si le geste est franc —, et elle s'accroche toujours à
 * une taille : jamais entre deux. Elle ne dépasse jamais 45 % de la largeur ni
 * 40 % de la hauteur de l'écran. La taille choisie tient pour l'appel en
 * cours (`selfTileStore`), et le suivant repart de x2.
 */

export type SelfTileScale = 1 | 2 | 3;

export type TileSize = { readonly width: number; readonly height: number };

export const DEFAULT_SELF_TILE: SelfTileScale = 2;

const SIZES: Readonly<Record<SelfTileScale, TileSize>> = {
  1: { width: 80, height: 114 },
  2: { width: 112, height: 160 },
  3: { width: 168, height: 240 },
};

const MAX_WIDTH = 0.45;

const MAX_HEIGHT = 0.4;

export function selfTileSize(scale: SelfTileScale, viewport: TileSize): TileSize {
  const size = SIZES[scale];
  const fit = Math.min(1, (viewport.width * MAX_WIDTH) / size.width, (viewport.height * MAX_HEIGHT) / size.height);
  return { width: Math.round(size.width * fit), height: Math.round(size.height * fit) };
}

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

type SelfTileState = { readonly callId: string | null; readonly scale: SelfTileScale };

export const selfTileStore = createStore<SelfTileState>(() => ({ callId: null, scale: DEFAULT_SELF_TILE }));

export const selfTileScaleFor = (state: SelfTileState, callId: string): SelfTileScale => (state.callId === callId ? state.scale : DEFAULT_SELF_TILE);

export const setSelfTileScale = (callId: string, scale: SelfTileScale): void => selfTileStore.setState({ callId, scale });
