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
