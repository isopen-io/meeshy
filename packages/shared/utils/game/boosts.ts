/**
 * LES BOOSTS (#9373) — le Vent arrière et l'Heure du Prisme.
 * `docs/product/jeu-meeshy-conception.html` § II.1.
 */

import { seededRng } from './day-prng.js';

/** Le Vent arrière : ×1,25 sur les étincelles des gestes. */
export const TAILWIND_FACTOR = 1.25;

/**
 * La loi d'AVANT les étincelles (#9377) : le Vent arrière soufflait dès que le niveau passait sous le record. Gardée pour
 * le bloc d'un compte sans étincelles et pour les clients publiés (vecteurs `tailwind`) ; retirée avec eux.
 */
export const tailwindFactor = (params: { readonly level: number; readonly levelRecord: number }): number =>
  params.level < params.levelRecord ? TAILWIND_FACTOR : 1;

/** L'écart au record de niveau à partir duquel le Vent arrière souffle (porteur 2026-10-17, #10896). RÉGLABLE. */
export const TAILWIND_LEVEL_GAP = 7;

/**
 * LE VENT ARRIÈRE DES ÉTINCELLES (porteur 2026-10-17, #10896). Le niveau se lit sur la poche (#10892), qu'une frappe
 * débite : le Vent arrière aide à remonter une GROSSE perte. Il souffle tant que le niveau est `TAILWIND_LEVEL_GAP`
 * niveaux ou plus sous le record de niveau du cycle, et s'arrête dès que l'écart retombe en dessous — sans état. Le
 * record du cycle repart à 1 au Prestige : un Prestige ne l'allume pas.
 */
export const sparksTailwindFactor = (params: { readonly level: number; readonly levelRecord: number }): number =>
  params.levelRecord - params.level >= TAILWIND_LEVEL_GAP ? TAILWIND_FACTOR : 1;

/**
 * La réponse reçue (+3 points à l'auteur répondu) se récompense au plus 20 fois
 * par auteur et par jour civil de l'auteur : au-delà, la réponse fait toujours
 * avancer les missions, mais ne paie plus de points.
 */
export const REPLY_RECEIVED_DAILY_CAP = 20;

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
