/**
 * Source unique de l'arithmétique « jour calendaire local ».
 *
 * Avant iter 44, le calcul du début de jour local (minuit) et de la différence
 * en jours calendaires (comparaison des minuits, et non du délai écoulé brut)
 * était réimplémenté à l'identique dans `apps/web/utils/date-format.ts`
 * (`formatRelativeDate` + `formatConversationDate`) et `notification-helpers.ts`
 * (`formatContentPublishedAt`). Ces helpers les unifient.
 *
 * Purs et sans effet de bord. Le « maintenant » est injecté (`nowMs`) pour rendre
 * `calendarDayDiff` déterministe. Le découpage en jours suit le fuseau **local** du
 * runtime (sémantique de `new Date(year, month, day)`), identique aux sites appelants.
 */

const DAY_MS = 86_400_000;

/** Minuit local du jour contenant `ms`, en millisecondes epoch. */
export function startOfLocalDayMs(ms: number): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/**
 * Nombre de jours calendaires entre `targetMs` et `nowMs` (positif = dans le passé).
 * Compare les minuits locaux, donc insensible à l'heure de la journée.
 */
export function calendarDayDiff(targetMs: number, nowMs: number): number {
  return Math.floor((startOfLocalDayMs(nowMs) - startOfLocalDayMs(targetMs)) / DAY_MS);
}
