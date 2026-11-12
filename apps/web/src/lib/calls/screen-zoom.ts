/**
 * **LE ZOOM D'UN ÉCRAN PARTAGÉ À LA UNE** (#9098, `GroupCallSpotlight.clampedZoom`) — les lois pures de son crochet
 * (`components/use-screen-zoom.ts`), que l'écran d'appel remet à la grille avec lui (`CALL_GRID_KIT`) : la grille
 * ne les paie pas (`budgets.json` › `call_grid`).
 */

/** Le zoom d'un écran partagé à la une (#9098, `GroupCallSpotlight.clampedZoom`) : de 1 à 4, autour du centre. */
export const SCREEN_MAX_ZOOM = 4;

const clampZoom = (zoom: number): number => Math.min(Math.max(zoom, 1), SCREEN_MAX_ZOOM);

export const screenZoomAfterPinch = (zoom: number, ratio: number): number => clampZoom(zoom * ratio);

/** Un cran de Ctrl + molette (ou du pincement d'un pavé tactile) : vers le haut grandit. */
export const screenZoomAfterWheel = (zoom: number, deltaY: number): number => clampZoom(zoom * Math.exp(-deltaY / 300));

export type ScreenPan = { readonly x: number; readonly y: number };

export type ScreenFrame = { readonly width: number; readonly height: number };

/** À 1× l'image remplit son cadre ; zoomée, elle déborde de la moitié de son surplus de chaque côté du centre. */
const panBound = (zoom: number, extent: number): number => (Number.isFinite(extent) ? Math.max(0, (extent * (zoom - 1)) / 2) : 0);

const within = (value: number, bound: number): number => Math.min(Math.max(value, -bound), bound) + 0;

/**
 * Le déplacement de l'écran reçu zoomé (P15.11) : l'image ne quitte jamais son cadre — son bord reste au bord —, donc rien ne
 * bouge à 1× et la borne se resserre avec le zoom (reculer vers 1× recentre).
 */
export const screenPanClamp = (pan: ScreenPan, zoom: number, frame: ScreenFrame): ScreenPan => ({
  x: within(pan.x, panBound(zoom, frame.width)),
  y: within(pan.y, panBound(zoom, frame.height)),
});

/** Un glissé ajoute son écart au déplacement acquis, borné. */
export const screenPanAfterDrag = (pan: ScreenPan, drag: { readonly dx: number; readonly dy: number }, zoom: number, frame: ScreenFrame): ScreenPan =>
  screenPanClamp({ x: pan.x + drag.dx, y: pan.y + drag.dy }, zoom, frame);

/** UNE matrice sur le GPU (pas de reflow) ; rien à 1×. */
export const screenZoomTransform = (zoom: number, pan: ScreenPan): string => (zoom === 1 ? 'none' : `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})`);

/** Le double toucher ne sert qu'à revenir : il n'agit qu'une fois zoomé (iOS `CallReceivedScreenZoom`). */
export const screenZoomResets = (zoom: number): boolean => zoom > 1;
