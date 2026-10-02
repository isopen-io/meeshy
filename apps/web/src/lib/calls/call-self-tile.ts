import { createStore } from 'zustand/vanilla';

/**
 * **MA VIGNETTE EN COIN, EN LOI PURE** (#8577) — trois tailles, x1 · x2 · x3 ;
 * x2 est la vignette d'avant (112 × 160). Pincer ma vignette la fait passer
 * d'un cran — deux si le geste est franc —, et elle s'accroche toujours à
 * une taille : jamais entre deux. Elle ne dépasse jamais 45 % de la largeur ni
 * 40 % de la hauteur de l'écran. La taille choisie tient pour l'appel en
 * cours (`selfTileStore`), son coin aussi (#8747), et le suivant repart de x2.
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

/**
 * **ELLE SE GLISSE DE COIN EN COIN** (#8747, miroir de `pipCenter` /
 * `nearestCorner` dans `CallView+SelfView.swift`) — quatre coins à 16 px du
 * bord ; en haut 128 px sous la zone sûre, en bas 176 px au-dessus d'elle :
 * une rangée de commandes tient toujours entre la vignette et l'en-tête comme
 * entre elle et la pilule. Lâchée, elle s'aimante au coin le plus proche ;
 * sous 8 px, le geste reste un toucher.
 */
export type SelfTileCorner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

export const SELF_CORNERS: readonly SelfTileCorner[] = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];

export const DEFAULT_SELF_CORNER: SelfTileCorner = 'top-right';

export const SELF_TILE_MARGIN = 16;

export const SELF_TILE_TOP = 128;

export const SELF_TILE_BOTTOM = 176;

const DRAG_THRESHOLD = 8;

export type TileBox = TileSize & { readonly x: number; readonly y: number };

const onTop = (corner: SelfTileCorner): boolean => corner.startsWith('top');

const onLeft = (corner: SelfTileCorner): boolean => corner.endsWith('left');

type BoxInput = { readonly corner: SelfTileCorner; readonly size: TileSize; readonly viewport: TileSize };

export function selfTileBox({ corner, size, viewport }: BoxInput): TileBox {
  const x = onLeft(corner) ? SELF_TILE_MARGIN : viewport.width - SELF_TILE_MARGIN - size.width;
  const y = onTop(corner) ? SELF_TILE_TOP : Math.max(SELF_TILE_TOP, viewport.height - SELF_TILE_BOTTOM - size.height);
  return { x, y, width: size.width, height: size.height };
}

type NearestInput = { readonly center: { readonly x: number; readonly y: number }; readonly size: TileSize; readonly viewport: TileSize };

export function nearestSelfCorner({ center, size, viewport }: NearestInput): SelfTileCorner {
  const away = (corner: SelfTileCorner): number => {
    const box = selfTileBox({ corner, size, viewport });
    return Math.hypot(center.x - (box.x + box.width / 2), center.y - (box.y + box.height / 2));
  };
  return SELF_CORNERS.reduce((best, corner) => (away(corner) < away(best) ? corner : best), DEFAULT_SELF_CORNER);
}

export const isTileDrag = ({ dx, dy }: { readonly dx: number; readonly dy: number }): boolean => Math.hypot(dx, dy) >= DRAG_THRESHOLD;

const cornerOf = (top: boolean, left: boolean): SelfTileCorner => `${top ? 'top' : 'bottom'}-${left ? 'left' : 'right'}`;

export function cornerAfterArrow(corner: SelfTileCorner, key: string): SelfTileCorner | null {
  const top = onTop(corner);
  const left = onLeft(corner);
  const next = key === 'ArrowUp' ? cornerOf(true, left) : key === 'ArrowDown' ? cornerOf(false, left) : key === 'ArrowLeft' ? cornerOf(top, true) : key === 'ArrowRight' ? cornerOf(top, false) : null;
  return next === corner ? null : next;
}

type SelfTileState = { readonly callId: string | null; readonly scale: SelfTileScale; readonly corner: SelfTileCorner };

export const selfTileStore = createStore<SelfTileState>(() => ({ callId: null, scale: DEFAULT_SELF_TILE, corner: DEFAULT_SELF_CORNER }));

export const selfTileScaleFor = (state: SelfTileState, callId: string): SelfTileScale => (state.callId === callId ? state.scale : DEFAULT_SELF_TILE);

export const selfTileCornerFor = (state: SelfTileState, callId: string): SelfTileCorner => (state.callId === callId ? state.corner : DEFAULT_SELF_CORNER);

export const setSelfTileScale = (callId: string, scale: SelfTileScale): void => selfTileStore.setState((state) => ({ callId, scale, corner: selfTileCornerFor(state, callId) }));

export const setSelfTileCorner = (callId: string, corner: SelfTileCorner): void => selfTileStore.setState((state) => ({ callId, scale: selfTileScaleFor(state, callId), corner }));
