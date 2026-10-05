/**
 * LES BOOSTS (#9373) — le Vent arrière et l'Heure du Prisme.
 * `docs/product/jeu-meeshy-conception.html` § II.1.
 */

import { seededRng } from './day-prng.js';

/** +25 % sur les points tant que le niveau est sous le niveau record. */
export const TAILWIND_FACTOR = 1.25;

export const tailwindFactor = (params: { readonly level: number; readonly levelRecord: number }): number =>
  params.level < params.levelRecord ? TAILWIND_FACTOR : 1;

/** Les missions comptent double pendant l'Heure du Prisme. */
export const PRISM_HOUR_MULTIPLIER = 2;

const PRISM_HOUR_EARLIEST_MINUTE = 9 * 60;
const PRISM_HOUR_LATEST_END_MINUTE = 21 * 60;
const PRISM_HOUR_LENGTH = 60;
const PRISM_HOUR_GRANULARITY = 15;

export type PrismHourWindow = {
  /** Minute de la journée locale, [début, fin[. */
  readonly startMinute: number;
  readonly endMinute: number;
};

/**
 * Une heure par jour, tirée par la graine (utilisateur, jour), sur un quart
 * d'heure, entre 9 h et 21 h locales — jamais d'Heure du Prisme après 21 h.
 */
export function prismHourWindow(params: { readonly userId: string; readonly dayKey: string }): PrismHourWindow {
  const slots = (PRISM_HOUR_LATEST_END_MINUTE - PRISM_HOUR_LENGTH - PRISM_HOUR_EARLIEST_MINUTE) / PRISM_HOUR_GRANULARITY + 1;
  const slot = Math.floor(seededRng({ ...params, salt: 'prism-hour' })() * slots);
  const startMinute = PRISM_HOUR_EARLIEST_MINUTE + slot * PRISM_HOUR_GRANULARITY;
  return { startMinute, endMinute: startMinute + PRISM_HOUR_LENGTH };
}

export const isInPrismHour = (window: PrismHourWindow, minuteOfDay: number): boolean =>
  minuteOfDay >= window.startMinute && minuteOfDay < window.endMinute;
