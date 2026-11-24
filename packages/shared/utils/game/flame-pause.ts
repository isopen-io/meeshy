/**
 * LA FLAMME EN VEILLE (#17372, #20507) — deux Veilleuses ne couvrent pas une semaine d'examens ou de voyage. Le
 * joueur ANNONCE une pause de 1 à 7 jours, une fois par trimestre civil : pendant la veille, la Flamme attend — elle
 * ne grandit pas, ne s'éteint pas, ne consomme aucune Veilleuse, et aucun rappel ne part.
 *
 * Trois décisions, écrites ici parce qu'elles se lisent dans le code :
 *  - la veille commence le LENDEMAIN de l'annonce : le jour de l'annonce compte encore, comme tout autre jour ;
 *  - un geste pendant la veille la termine la VEILLE du geste : la série reprend normalement, et la pause compte
 *    pour le trimestre ;
 *  - un jour en veille est retiré du calcul, il n'est ni gagné ni manqué : le dernier jour actif AVANCE d'autant de
 *    jours en veille, et `advanceFlame` / `flameStatus` s'appliquent sans changer une ligne.
 *
 * Les jours sont des clés `AAAA-MM-JJ` dans le fuseau du joueur : pur, sans horloge.
 */

import { addDays, dayDiff } from './day-prng.js';
import type { FlameStatus } from './flame.js';

export const FLAME_PAUSE_MIN_DAYS = 1;
export const FLAME_PAUSE_MAX_DAYS = 7;

/** Une veille : ses premier et dernier jours, inclus. `until < from` : annoncée puis terminée avant de commencer. */
export type FlamePause = { readonly from: string; readonly until: string };

export type FlamePauseRefusal = 'invalid-days' | 'no-flame' | 'already-paused' | 'quarterly-limit';

export type FlamePauseDecision =
  | { readonly allowed: true; readonly pause: FlamePause }
  | { readonly allowed: false; readonly reason: FlamePauseRefusal };

/** Le trimestre civil d'un jour : `AAAA-T1` à `AAAA-T4`. */
export const quarterOf = (dayKey: string): string => `${dayKey.slice(0, 4)}-T${Math.floor((Number(dayKey.slice(5, 7)) - 1) / 3) + 1}`;

/** Une veille vide (terminée avant son premier jour) n'existe pas. */
const lasting = (pause: FlamePause | null): FlamePause | null =>
  pause !== null && dayDiff(pause.from, pause.until) >= 0 ? pause : null;

export const isFlamePausedOn = (pause: FlamePause | null, day: string): boolean => {
  const kept = lasting(pause);
  return kept !== null && dayDiff(kept.from, day) >= 0 && dayDiff(day, kept.until) >= 0;
};

/**
 * Le dernier jour actif tel que la Flamme le voit : le jour du dernier geste AVANCÉ des jours en veille qui le
 * suivent, jusqu'à `through` inclus. Pour lire l'état du jour, `through` est aujourd'hui (un jour en veille n'est pas
 * à risque) ; pour le geste du jour, c'est la veille (le jour du geste n'est jamais en veille : le geste la termine).
 */
export function restedLastActiveDay(params: {
  readonly lastActiveDay: string | null;
  readonly through: string;
  readonly pause: FlamePause | null;
}): string | null {
  const pause = lasting(params.pause);
  if (params.lastActiveDay === null || pause === null) return params.lastActiveDay;
  const firstRested = dayDiff(params.lastActiveDay, pause.from) > 0 ? pause.from : addDays(params.lastActiveDay, 1);
  const lastRested = dayDiff(pause.until, params.through) >= 0 ? pause.until : params.through;
  const rested = dayDiff(firstRested, lastRested) + 1;
  return rested > 0 ? addDays(params.lastActiveDay, rested) : params.lastActiveDay;
}

/**
 * Annoncer une veille de `days` jours, à partir de demain. Refusée hors de 1 à 7 jours, à une Flamme absente ou
 * éteinte (il n'y a rien à garder), pendant une veille en cours ou à venir, et une seconde fois dans le trimestre où
 * la nouvelle veille commencerait. Une veille terminée avant de commencer ne compte pas.
 */
export function canPauseFlame(params: {
  readonly today: string;
  readonly days: number;
  readonly status: FlameStatus;
  readonly pause: FlamePause | null;
}): FlamePauseDecision {
  const days = params.days;
  if (!Number.isInteger(days) || days < FLAME_PAUSE_MIN_DAYS || days > FLAME_PAUSE_MAX_DAYS) {
    return { allowed: false, reason: 'invalid-days' };
  }
  if (params.status === 'none' || params.status === 'out') return { allowed: false, reason: 'no-flame' };
  const from = addDays(params.today, 1);
  const previous = lasting(params.pause);
  if (previous !== null && dayDiff(params.today, previous.until) >= 0) return { allowed: false, reason: 'already-paused' };
  if (previous !== null && quarterOf(previous.from) === quarterOf(from)) return { allowed: false, reason: 'quarterly-limit' };
  return { allowed: true, pause: { from, until: addDays(params.today, days) } };
}

/** Le geste d'un jour en veille la termine la veille de ce jour ; hors de la veille, rien ne change (`null`). */
export function pauseEndedBy(pause: FlamePause | null, today: string): FlamePause | null {
  if (!isFlamePausedOn(pause, today) || pause === null) return null;
  return { from: pause.from, until: addDays(today, -1) };
}

/** Ce que le bloc dit : la veille qui couvre aujourd'hui ou un jour à venir, `null` sinon. */
export function servedFlamePause(pause: FlamePause | null, today: string): FlamePause | null {
  const kept = lasting(pause);
  return kept !== null && dayDiff(today, kept.until) >= 0 ? { from: kept.from, until: kept.until } : null;
}
