/**
 * **GLISSER UNE NOTIFICATION VERS LA GAUCHE LA SUPPRIME** (#8960) — la loi
 * PURE du geste, miroir du `.swipeActions(edge: .trailing, allowsFullSwipe:
 * true)` de la cloche iOS (#8958). Elle reprend la loi partagée du glissé
 * latéral (`swipe.ts`) : engagement 3:1 au-delà de 22 px, piste 1:1 jusqu'à
 * 72 px puis élastique, validation à 66 px — ici vers la FIN de la ligne
 * (dans le sens de lecture), le seul côté où vit une action.
 */

import { swipeCommits, swipeEngages, swipeProgress, swipeTrackedOffset } from './swipe';

export { readingDelta } from './swipe';

/**
 * Le décalage à peindre pour `(dx, dy)` — déjà lu dans le sens de lecture —,
 * `null` tant que le geste n'est pas un glissé franc. Vers le début, `0`.
 */
export function notificationSwipeOffset(dx: number, dy: number): number | null {
  if (!swipeEngages(dx, dy, 'normal')) return null;
  return Math.min(0, swipeTrackedOffset(dx));
}

/** Relâcher au-delà du seuil vers la fin de la ligne SUPPRIME. */
export function notificationSwipeCommits(offset: number): boolean {
  return swipeCommits(-offset);
}

/** Avancement de 0 à 1 jusqu'au seuil — pilote la corbeille révélée. */
export const notificationSwipeProgress = (offset: number): number => swipeProgress(Math.min(0, offset));
