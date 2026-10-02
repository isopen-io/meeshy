import type { CallLayout } from './call-view';

/**
 * **GLISSER L'ÉCRAN D'APPEL VERS LE BAS** (#9096) — la règle, pure, miroir de
 * `CallPiPPolicy.swipeDownOffset` / `swipeDownOutcome` (iOS, #8435) :
 *
 * - le geste n'existe qu'en DUO connecté et au repos (vidéo, audio, écran
 *   partagé) : en groupe la scène garde ses gestes, un menu, un panneau ou un
 *   mode ouvert garde les siens ;
 * - il ne naît qu'au-delà de 50 px vers le bas, surtout vertical : en deçà,
 *   un toucher reste un toucher ;
 * - PROGRESSIF et ANNULABLE : l'écran suit le doigt sur sa course (300 px),
 *   et relâché avant les trois quarts il revient — sauf un lancer franc, dont
 *   la fin prévue dépasse la course ;
 * - conclu, il quitte le plein écran : vers l'image dans l'image quand le
 *   navigateur l'offre, sinon vers la bulle ;
 * - mouvement réduit : l'écran ne suit pas le doigt, le geste conclut quand même.
 */

export const SWIPE_DOWN_COURSE = 300;
export const SWIPE_DOWN_COMMIT_FRACTION = 0.75;
export const SWIPE_DOWN_START = 50;
/** L'élan d'un relâcher (px/ms) projeté sur ce temps : la fin « prévue » du geste. */
export const SWIPE_DOWN_PROJECTION_MS = 200;

export type SwipeDownOutcome = 'none' | 'pip' | 'pill';

type Travel = { readonly dx: number; readonly dy: number };

export const swipeDownStarted = ({ dx, dy }: Travel): boolean => dy >= SWIPE_DOWN_START && dy > Math.abs(dx);

type Scene = { readonly joined: boolean; readonly layout: CallLayout; readonly layerIdle: boolean };

export const swipeDownAllowed = ({ joined, layout, layerIdle }: Scene): boolean => joined && layerIdle && layout !== 'grid';

type OffsetInput = { readonly dy: number; readonly allowed: boolean; readonly reducedMotion: boolean };

export function swipeDownOffset({ dy, allowed, reducedMotion }: OffsetInput): number {
  if (!allowed || reducedMotion) return 0;
  return Math.min(Math.max(dy, 0), SWIPE_DOWN_COURSE);
}

type OutcomeInput = { readonly dy: number; readonly velocity: number; readonly allowed: boolean; readonly canPip: boolean };

export function swipeDownOutcome({ dy, velocity, allowed, canPip }: OutcomeInput): SwipeDownOutcome {
  if (!allowed || dy <= 0) return 'none';
  const predicted = dy + Math.max(velocity, 0) * SWIPE_DOWN_PROJECTION_MS;
  const committed = dy >= SWIPE_DOWN_COURSE * SWIPE_DOWN_COMMIT_FRACTION || predicted >= SWIPE_DOWN_COURSE;
  if (!committed) return 'none';
  return canPip ? 'pip' : 'pill';
}
