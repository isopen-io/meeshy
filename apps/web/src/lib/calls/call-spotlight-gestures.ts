import type { SpotlightChoice } from './call-spotlight';

/**
 * **LES GESTES DE LA UNE D'UN GROUPE** (#8392, #9098) — ce que la GRILLE fait
 * de la règle de `call-spotlight.ts` : nommer un choix (un membre, moi, la
 * grille) et zoomer l'écran partagé à la une. Séparés de la règle parce que
 * seule la grille, chargée à part (#17650), les emploie : l'écran d'appel ne
 * lit que la règle.
 */

export const chooseMember = (userId: string): SpotlightChoice => ({ kind: 'member', userId });

export const chooseSelf = (): SpotlightChoice => ({ kind: 'self' });

export const chooseGrid = (dismissedSharer: string | null): SpotlightChoice => ({ kind: 'grid', dismissedSharer });

/** Le zoom d'un écran partagé à la une (#9098, `GroupCallSpotlight.clampedZoom`) : de 1 à 4, autour du centre. */
export const SCREEN_MAX_ZOOM = 4;

const clampZoom = (zoom: number): number => Math.min(Math.max(zoom, 1), SCREEN_MAX_ZOOM);

export const screenZoomAfterPinch = (zoom: number, ratio: number): number => clampZoom(zoom * ratio);

/** Un cran de Ctrl + molette (ou du pincement d'un pavé tactile) : vers le haut grandit. */
export const screenZoomAfterWheel = (zoom: number, deltaY: number): number => clampZoom(zoom * Math.exp(-deltaY / 300));
