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

import {
  SWIPE_ACTION_ZONE,
  SWIPE_COMMIT_DISTANCE,
  SWIPE_RUBBER_BAND,
  swipeCommits,
  swipeDominanceRatio,
  swipeEngages,
  swipeMinimumDistance,
  swipeTrackedOffset,
} from './swipe';

export { readingDelta } from './swipe';

/* La LOI vit dans `swipe.ts` (#7559), partagée avec le glissé d'un message ;
   ce fichier n'en garde que la projection « répondre seul, vers la droite ». */
export const COMMENT_SWIPE_MINIMUM_DISTANCE = swipeMinimumDistance('normal');
export const COMMENT_SWIPE_DOMINANCE_RATIO = swipeDominanceRatio('normal');
export const COMMENT_SWIPE_ACTION_ZONE = SWIPE_ACTION_ZONE;
export const COMMENT_SWIPE_RUBBER_BAND = SWIPE_RUBBER_BAND;
export const COMMENT_SWIPE_COMMIT_DISTANCE = SWIPE_COMMIT_DISTANCE;

/** Un glissé HORIZONTAL FRANC — sinon le geste appartient au défilement. */
export function commentSwipeEngages(dx: number, dy: number): boolean {
  return swipeEngages(dx, dy, 'normal');
}

/** Le doigt est suivi 1:1 jusqu'à la zone d'action, puis l'élastique freine. */
export const commentSwipeTrackedOffset = swipeTrackedOffset;

/**
 * Le décalage à peindre pour une translation `(dx, dy)` exprimée dans le SENS
 * DE LECTURE, ou `null` quand le geste n'est pas (encore) un glissé franc — la
 * rangée garde alors sa position. Vers la gauche, rien ne bouge (`0`).
 */
export function commentSwipeOffset(dx: number, dy: number): number | null {
  if (!commentSwipeEngages(dx, dy)) return null;
  return Math.max(0, swipeTrackedOffset(dx));
}

/** Relâcher au-delà du seuil RÉPOND ; en deçà, le geste s'annule. */
export const commentSwipeCommits = swipeCommits;

/** Avancement de 0 à 1 jusqu'au seuil — pilote la flèche révélée. */
export function commentSwipeProgress(offset: number): number {
  return Math.min(1, Math.max(0, offset / SWIPE_COMMIT_DISTANCE));
}
