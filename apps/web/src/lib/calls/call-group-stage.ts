/**
 * **LE BANDEAU DES AUTRES, SANS ÉCRAN** (`GroupCallStageGeometry` d'Android, `GroupCallSpotlight.filmstrip`
 * d'iOS) — ses mesures et sa place. Le plancher de la grille est dans `call-view.ts`, le mouvement d'une
 * vignette dans `call-group-motion.ts`.
 */

/** Le bandeau des autres : des vignettes de 84 × 112, dans une colonne de 128 en paysage (P14.1, P14.2). */
export const STRIP_TILE_WIDTH = 84;
export const STRIP_TILE_HEIGHT = 112;
export const STRIP_COLUMN_WIDTH = 128;

/** L'air laissé au halo de qui parle autour d'une vignette du bandeau, sous l'espace de 8 entre deux vignettes. */
export const STRIP_HALO_PAD = 6;

export type Filmstrip = 'none' | 'bottom' | 'trailing';

/** `GroupCallSpotlight.filmstrip` : aucun bandeau en plein écran, une colonne à droite en paysage, une rangée dessous sinon. */
export const filmstripOf = ({ fullscreen, landscape }: { readonly fullscreen: boolean; readonly landscape: boolean }): Filmstrip => (fullscreen ? 'none' : landscape ? 'trailing' : 'bottom');
