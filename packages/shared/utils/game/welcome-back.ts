/**
 * LE RETOUR (#17373, #20218) — celui qui revient après une absence n'est pas tiré sur ses habitudes d'avant.
 *
 * ## Quand un retour commence
 *
 * Au tirage d'une journée de jeu, quand la journée de jeu précédente date d'au moins `WELCOME_BACK_ABSENCE_DAYS`
 * jours — la même mesure que le moment de guide « retour après absence » (`return-after-absence`, `guide.ts`), dont
 * les clients rejouent le seuil. Un compte qui n'a jamais eu de journée de jeu commence : il ne revient pas.
 *
 * Une fois par période de `WELCOME_BACK_PERIOD_DAYS` jours, comptés depuis le dernier retour : partir et revenir ne
 * paie pas l'absence.
 *
 * ## Ce qu'il change
 *
 * Le jour du retour et les deux suivants (`WELCOME_BACK_EASED_DAYS`), le Rêve est ALLÉGÉ : il se tire comme celui
 * d'un compte qui commence (`easedProfile`), chaque acte au plancher de son gabarit. Ce que le compte peut faire
 * reste ; ce qu'il faisait d'habitude est oublié le temps de reprendre. L'objectif allégé ne dépasse jamais
 * l'ordinaire : `missionTarget` borne tout objectif par le plancher.
 *
 * Pure, sans horloge : les jours sont des clés `AAAA-MM-JJ` du fuseau du compte. Une clé illisible ne fabrique
 * aucun retour.
 */

import { dayDiff, isDayKey } from './day-prng.js';
import type { MissionProfile } from './missions.js';

export const WELCOME_BACK_ABSENCE_DAYS = 7;
export const WELCOME_BACK_EASED_DAYS = 3;
export const WELCOME_BACK_PERIOD_DAYS = 30;

const readable = (key: string | null): key is string => key !== null && isDayKey(key);

/**
 * Le jour du retour en vigueur pour `today` : aujourd'hui si un retour y commence, sinon le dernier retour gravé
 * (`lastWelcomeDay`), sinon `null`.
 */
export function welcomeBackDay(params: {
  readonly previousGameDay: string | null;
  readonly today: string;
  readonly lastWelcomeDay: string | null;
}): string | null {
  const { previousGameDay, today } = params;
  if (!isDayKey(today)) return null;
  const last = readable(params.lastWelcomeDay) ? params.lastWelcomeDay : null;
  const away = readable(previousGameDay) && dayDiff(previousGameDay, today) >= WELCOME_BACK_ABSENCE_DAYS;
  const periodOpen = last === null || dayDiff(last, today) >= WELCOME_BACK_PERIOD_DAYS;
  return away && periodOpen ? today : last;
}

/** Le Rêve de `today` est-il allégé ? Le jour du retour et les `WELCOME_BACK_EASED_DAYS − 1` suivants. */
export function isEasedDreamDay(params: { readonly welcomeDay: string | null; readonly today: string }): boolean {
  const { welcomeDay, today } = params;
  if (!readable(welcomeDay) || !isDayKey(today)) return false;
  const since = dayDiff(welcomeDay, today);
  return since >= 0 && since < WELCOME_BACK_EASED_DAYS;
}

/** Le profil d'un Rêve allégé : les capacités du compte, sans ses habitudes. */
export const easedProfile = (profile: MissionProfile): MissionProfile => ({ capabilities: profile.capabilities, habits: {} });
