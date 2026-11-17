import { createStore } from 'zustand/vanilla';

import type { CallLayout } from './call-view';

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

/**
 * **L1.5 — DANS UNE FENÊTRE PLUS LARGE QUE HAUTE, MA VIGNETTE SE COUCHE** (`CallSelfTileScale.isLandscape` d'iOS,
 * `CallSelfTileLaw.isLandscape` d'Android) : 130 × 96 au palier x2, les deux autres à la même proportion (x1.3 en
 * largeur, ratio 96/130). La forme se lit sur la fenêtre, jamais sur l'appareil : redimensionner un navigateur la couche
 * comme tourner un téléphone.
 */
const LANDSCAPE_SIZES: Readonly<Record<SelfTileScale, TileSize>> = {
  1: { width: 93, height: 69 },
  2: { width: 130, height: 96 },
  3: { width: 195, height: 144 },
};

export const isLandscapeWindow = (viewport: TileSize): boolean => viewport.width > viewport.height;

const MAX_WIDTH = 0.45;

const MAX_HEIGHT = 0.4;

export function selfTileSize(scale: SelfTileScale, viewport: TileSize): TileSize {
  const size = (isLandscapeWindow(viewport) ? LANDSCAPE_SIZES : SIZES)[scale];
  const fit = Math.min(1, (viewport.width * MAX_WIDTH) / size.width, (viewport.height * MAX_HEIGHT) / size.height);
  return { width: Math.round(size.width * fit), height: Math.round(size.height * fit) };
}

/**
 * **RANGER MA VIGNETTE EST UNE TRANSFORMATION** (G1.11, #17536 ; `restingFactor` d'iOS) :
 * son cadre garde la taille du palier choisi, et rangée elle est mise à l'échelle de sa
 * petite taille — le compositeur seul la porte, la mise en page ne bouge pas.
 */
export const selfTileRestingFactor = (chosen: SelfTileScale, chromeVisible: boolean, viewport: TileSize): number => (chromeVisible ? 1 : selfTileSize(1, viewport).width / selfTileSize(chosen, viewport).width);

/** Ce qui ne doit pas rapetisser avec la vignette rangée (liseré, coins) : divisé par le facteur, dessiné à sa taille de petite vignette. */
export const selfTileCounterScaled = (length: number, factor: number): number => (Number.isFinite(factor) && factor > 0 ? length / factor : length);

/**
 * **ELLE SE GLISSE DE COIN EN COIN** (#8747, miroir de `pipCenter` /
 * `nearestCorner` dans `CallView+SelfView.swift`) — quatre coins à 16 px du
 * bord ; en haut 128 px sous la zone sûre, en bas 176 px au-dessus d'elle :
 * une rangée de commandes tient toujours entre la vignette et l'en-tête comme
 * entre elle et la pilule. Lâchée, elle s'aimante au coin le plus proche ;
 * sous 8 px, le geste reste un toucher.
 */
export type SelfTileCorner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

/** L'ancre du rangement et du pincement : le coin où la vignette se tient, qui garde ainsi sa marge. */
export const selfTileOrigin = (corner: SelfTileCorner): string => corner.replace('-', ' ');

export const SELF_CORNERS: readonly SelfTileCorner[] = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];

export const DEFAULT_SELF_CORNER: SelfTileCorner = 'top-right';

/**
 * **W1.5 — LE COIN DE FIN DU SENS DE LECTURE** (`.topTrailing` d'iOS, `TopEnd` d'Android) : un appel neuf pose ma vignette
 * en haut, côté fin de ligne — là où la colonne du journal (W1) se pose aussi. Haut-droite en gauche à droite,
 * haut-gauche en droite à gauche. Un coin que j'ai choisi, lui, est physique et ne bouge plus.
 */
export const defaultSelfCorner = (rtl = typeof document !== 'undefined' && document.documentElement.dir === 'rtl'): SelfTileCorner => (rtl ? 'top-left' : DEFAULT_SELF_CORNER);

export const SELF_TILE_MARGIN = 16;

export const SELF_TILE_TOP = 128;

export const SELF_TILE_BOTTOM = 176;

/** Couchée, les coins se tiennent à la hauteur d'iOS et d'Android (`TOP_CLEARANCE_DP` 60, `BOTTOM_CLEARANCE_DP` 130) : l'écran manque de hauteur, et les coins bas ne retombent plus sur les hauts. */
export const SELF_TILE_TOP_LANDSCAPE = 60;

export const SELF_TILE_BOTTOM_LANDSCAPE = 130;

/** Ce que ma vignette laisse libre sous la zone sûre, en haut et en bas, selon la forme de la fenêtre — ce que la pile des bandeaux AJOUTE au-dessus est `selfTileClearance` (`call-top-banners.ts`). */
export const selfTileCornerInsets = (viewport: TileSize): { readonly top: number; readonly bottom: number } =>
  isLandscapeWindow(viewport) ? { top: SELF_TILE_TOP_LANDSCAPE, bottom: SELF_TILE_BOTTOM_LANDSCAPE } : { top: SELF_TILE_TOP, bottom: SELF_TILE_BOTTOM };

export type TileBox = TileSize & { readonly x: number; readonly y: number };

/** Ma vignette quand l'autre partage son écran : en haut à droite, 4,5 rem sous la zone sûre, à la taille x2. */
export const SCREEN_SELF_TILE = { y: 72, width: 112, height: 160 } as const;

/**
 * Ma vignette en coin et son coin, dans les mesures de la scène sous sa zone sûre (l'écran, moins la colonne du journal quand elle est ouverte).
 * `yields` : elle cède le coin au rail de son bord ({@link selfTileRailShift}), qui reste alors à ce bord, ouvert comme sortant.
 */
export type TileFootprint = TileBox & { readonly corner: SelfTileCorner; readonly yields?: boolean };

/**
 * **L2.8 — EN PAYSAGE, MA VIGNETTE CÈDE LE COIN AU RAIL** (décision porteur du 2026-11-13, #17965 point 1 ; capture L2 ;
 * le web s'aligne, #17438). Dans une fenêtre plus large que haute, `(…)` ouvert, le rail de son bord reste à ce bord,
 * centré sur toute sa hauteur, et ma vignette glisse vers l'intérieur, contre lui ; les rails rangés, elle revient à son
 * coin. Debout, rien ne change : le rail se pose sous elle (P2, `call-rails-clearance.ts`).
 *
 * Le pas est celui du rail : posé à 12 du bord (`call-rails.tsx`, `EDGE`), large de 60 (un bouton de 44 et 8 de verre
 * de chaque côté, `railLength(1)`), plus l'écart de 8 (`RAIL_TILE_GAP`), moins la marge de ma vignette — recopiés ici,
 * car le chunk des rails n'importe rien de l'écran d'appel ; un témoin tient les deux ensemble.
 */
export const RAIL_YIELD = 64;

/** Le décalage horizontal de ma vignette, en pixels : vers la gauche pour un coin droit, vers la droite pour un coin gauche. Les coins sont physiques, le sens de lecture n'y change rien. */
export function selfTileRailShift({ corner, viewport, railsOpen }: { readonly corner: SelfTileCorner; readonly viewport: TileSize; readonly railsOpen: boolean }): number {
  if (!railsOpen || !isLandscapeWindow(viewport)) return 0;
  return corner.endsWith('right') ? -RAIL_YIELD : RAIL_YIELD;
}

/** Ce que l'écran d'appel sait de ma vignette ; son coin et sa taille sont ceux que je lui ai choisis (`selfTileStore`). */
type FootprintInput = {
  readonly layout: CallLayout;
  readonly cameraOn: boolean;
  /** Mon image remplit l'écran : le coin montre l'autre, et reste une vignette. */
  readonly swapped: boolean;
  /** Un cadre en direct me compose dans sa case : ma vignette se retire (#16943). */
  readonly framed: boolean;
  /** L'écran partagé de l'autre en plein écran : ma vignette se retire. */
  readonly immersive: boolean;
  readonly corner: SelfTileCorner;
  readonly scale: SelfTileScale;
  readonly viewport: TileSize;
  /** Ce que la capsule de capture prend sous l'en-tête (R1) : ma vignette descend d'autant. */
  readonly topInset: number;
  /** Ce que la colonne du journal retire à la scène (W1) : ma vignette se mesure dans la scène qui reste. */
  readonly bleed?: number;
  /** Les rails du duo sont sortis : en paysage, ma vignette leur cède le coin (L2.8). */
  readonly railsOpen?: boolean;
};

/** La vignette du coin que la scène pose (`call-stage.tsx`), à sa taille choisie — les rails du duo l'évitent (#17429), ou, en paysage, elle leur cède le coin (L2.8). L'écran reçu de l'autre garde sa place (#17730). */
export function selfTileFootprint({ layout, cameraOn, swapped, framed, immersive, corner, scale, viewport, topInset, bleed = 0, railsOpen = false }: FootprintInput): TileFootprint | null {
  if (layout === 'screen') return cameraOn && !immersive ? { corner: 'top-right', x: viewport.width - bleed - SELF_TILE_MARGIN - SCREEN_SELF_TILE.width, ...SCREEN_SELF_TILE } : null;
  if (layout !== 'video-duo' || !(swapped || cameraOn) || (framed && !swapped)) return null;
  const box = selfTileBox({ corner, size: selfTileSize(scale, viewport), viewport, topInset, bleed });
  return { corner, ...box, x: box.x + selfTileRailShift({ corner, viewport, railsOpen }), yields: isLandscapeWindow(viewport) };
}

/** L'écran de l'appel ; hors navigateur, celui de la planche. */
export const callViewport = (): TileSize => (typeof window === 'undefined' ? { width: 390, height: 844 } : { width: window.innerWidth, height: window.innerHeight });

const onTop = (corner: SelfTileCorner): boolean => corner.startsWith('top');

const onLeft = (corner: SelfTileCorner): boolean => corner.endsWith('left');

/** `bleed` : la largeur que la colonne du journal retire à la scène (W1) — la vignette se tient dans la scène réduite, la forme de la fenêtre (`viewport`) restant celle qui décide de sa taille et de ses hauteurs. */
type BoxInput = { readonly corner: SelfTileCorner; readonly size: TileSize; readonly viewport: TileSize; readonly topInset?: number; readonly bleed?: number };

export function selfTileBox({ corner, size, viewport, topInset = 0, bleed = 0 }: BoxInput): TileBox {
  const clearance = selfTileCornerInsets(viewport);
  const top = clearance.top + topInset;
  const x = onLeft(corner) ? SELF_TILE_MARGIN : viewport.width - bleed - SELF_TILE_MARGIN - size.width;
  const y = onTop(corner) ? top : Math.max(top, viewport.height - clearance.bottom - size.height);
  return { x, y, width: size.width, height: size.height };
}

type NearestInput = { readonly center: { readonly x: number; readonly y: number }; readonly size: TileSize; readonly viewport: TileSize; readonly topInset?: number; readonly bleed?: number };

export function nearestSelfCorner({ center, size, viewport, topInset = 0, bleed = 0 }: NearestInput): SelfTileCorner {
  const away = (corner: SelfTileCorner): number => {
    const box = selfTileBox({ corner, size, viewport, topInset, bleed });
    return Math.hypot(center.x - (box.x + box.width / 2), center.y - (box.y + box.height / 2));
  };
  return SELF_CORNERS.reduce((best, corner) => (away(corner) < away(best) ? corner : best), DEFAULT_SELF_CORNER);
}

type SelfTileState = { readonly callId: string | null; readonly scale: SelfTileScale; readonly corner: SelfTileCorner };

export const selfTileStore = createStore<SelfTileState>(() => ({ callId: null, scale: DEFAULT_SELF_TILE, corner: DEFAULT_SELF_CORNER }));

export const selfTileScaleFor = (state: SelfTileState, callId: string): SelfTileScale => (state.callId === callId ? state.scale : DEFAULT_SELF_TILE);

export const selfTileCornerFor = (state: SelfTileState, callId: string, rtl?: boolean): SelfTileCorner => (state.callId === callId ? state.corner : defaultSelfCorner(rtl));

export const setSelfTileScale = (callId: string, scale: SelfTileScale): void => selfTileStore.setState((state) => ({ callId, scale, corner: selfTileCornerFor(state, callId) }));

export const setSelfTileCorner = (callId: string, corner: SelfTileCorner): void => selfTileStore.setState((state) => ({ callId, scale: selfTileScaleFor(state, callId), corner }));
