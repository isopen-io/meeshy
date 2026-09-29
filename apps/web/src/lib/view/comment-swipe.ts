/**
 * **GLISSER UN COMMENTAIRE VERS LA DROITE POUR Y RÉPONDRE** (#8583) — la loi
 * PURE du geste, miroir de `CommentSwipeRules` (`CommentSwipeToReply.swift`)
 * et de la piste de la bulle qu'il reprend (`BubbleSwipeResistance.swift`,
 * résistance `.normal`) : engagement 3:1 au-delà de 22 px, zone d'action de
 * 72 px, élastique à 15 % au-delà, validation à 66 px.
 *
 * UNE différence avec la bulle, la même qu'iOS : un commentaire n'a qu'une
 * action, la réponse, donc seul le glissé vers la DROITE (dans le sens de
 * lecture) déplace la rangée. Aucun DOM ici — `use-comment-swipe.ts` ne fait
 * qu'y brancher les événements de pointeur.
 */

export const COMMENT_SWIPE_MINIMUM_DISTANCE = 22;
export const COMMENT_SWIPE_DOMINANCE_RATIO = 3;
export const COMMENT_SWIPE_ACTION_ZONE = 72;
export const COMMENT_SWIPE_RUBBER_BAND = 0.15;
export const COMMENT_SWIPE_COMMIT_DISTANCE = 66;

/** Un glissé HORIZONTAL FRANC — sinon le geste appartient au défilement. */
export function commentSwipeEngages(dx: number, dy: number): boolean {
  const horizontal = Math.abs(dx);
  return horizontal > Math.abs(dy) * COMMENT_SWIPE_DOMINANCE_RATIO && horizontal > COMMENT_SWIPE_MINIMUM_DISTANCE;
}

/** Le doigt est suivi 1:1 jusqu'à la zone d'action, puis l'élastique freine. */
export function commentSwipeTrackedOffset(dx: number): number {
  const horizontal = Math.abs(dx);
  if (horizontal <= COMMENT_SWIPE_ACTION_ZONE) return dx;
  return Math.sign(dx) * (COMMENT_SWIPE_ACTION_ZONE + (horizontal - COMMENT_SWIPE_ACTION_ZONE) * COMMENT_SWIPE_RUBBER_BAND);
}

/**
 * Le décalage à peindre pour une translation `(dx, dy)` exprimée dans le SENS
 * DE LECTURE, ou `null` quand le geste n'est pas (encore) un glissé franc — la
 * rangée garde alors sa position. Vers la gauche, rien ne bouge (`0`).
 */
export function commentSwipeOffset(dx: number, dy: number): number | null {
  if (!commentSwipeEngages(dx, dy)) return null;
  return Math.max(0, commentSwipeTrackedOffset(dx));
}

/** Relâcher au-delà du seuil RÉPOND ; en deçà, le geste s'annule. */
export function commentSwipeCommits(offset: number): boolean {
  return offset >= COMMENT_SWIPE_COMMIT_DISTANCE;
}

/** Avancement de 0 à 1 jusqu'au seuil — pilote la flèche révélée. */
export function commentSwipeProgress(offset: number): number {
  return Math.min(1, Math.max(0, offset / COMMENT_SWIPE_COMMIT_DISTANCE));
}

/**
 * LA TRANSLATION LUE DANS LE SENS DE LECTURE — en arabe, « vers la droite »
 * se lit « depuis le bord de DÉBUT » (`ReadingDirection.readingDelta` d'iOS).
 */
export function readingDelta(dx: number, direction: 'ltr' | 'rtl'): number {
  return direction === 'rtl' ? -dx : dx;
}
