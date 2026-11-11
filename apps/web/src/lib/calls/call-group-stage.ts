/**
 * **LA SCÈNE D'UN GROUPE, SANS ÉCRAN** (`GroupCallStageGeometry` d'Android, `CallGroupStageSizing`
 * d'iOS) — les mesures du bandeau des autres, le plancher de la grille, et le mouvement d'une
 * vignette dont la case change (grille ↔ à la une, P14.10). Pur : la grille mesure et joue, ces
 * lois décident.
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

/** La grille garde 140 de haut au moins (P12.7) ; en hauteur compacte, les rangées de la pilule se replient en une ligne. */
export const GRID_MIN_HEIGHT = 140;
export const COMPACT_HEIGHT = 500;

export const isCompactHeight = (height: number): boolean => height > 0 && height < COMPACT_HEIGHT;

export type SlotBox = { readonly x: number; readonly y: number; readonly width: number; readonly height: number };

/** En deçà, l'écart est un arrondi de mesure, pas un mouvement. */
const EPSILON_PX = 0.5;

/**
 * Le mouvement d'une vignette qui a changé de case : l'ancienne case vue comme une transformation de
 * la nouvelle (FLIP — la mise en page est déjà à son état final, origine en haut à gauche), rejouée
 * vers zéro. Transformation seule : le compositeur la porte, aucune mise en page par image. Sous
 * « Réduire les animations », un fondu court à la place du déplacement. `null` : rien ne bouge, ou
 * une case sans mesure.
 */
export function slotFlipKeyframes({ first, last, reducedMotion }: { readonly first: SlotBox; readonly last: SlotBox; readonly reducedMotion: boolean }): readonly Keyframe[] | null {
  if (first.width <= 0 || first.height <= 0 || last.width <= 0 || last.height <= 0) return null;
  const dx = first.x - last.x;
  const dy = first.y - last.y;
  const sx = first.width / last.width;
  const sy = first.height / last.height;
  const moved = Math.abs(dx) >= EPSILON_PX || Math.abs(dy) >= EPSILON_PX || Math.abs(first.width - last.width) >= EPSILON_PX || Math.abs(first.height - last.height) >= EPSILON_PX;
  if (!moved) return null;
  return reducedMotion ? [{ opacity: 0 }, { opacity: 1 }] : [{ transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})` }, { transform: 'none' }];
}
