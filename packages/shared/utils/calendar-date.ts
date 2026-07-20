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
 * Index de jour calendaire local canonique : le triplet (année, mois, jour) local
 * projeté sur une échelle UTC sans DST. Deux jours consécutifs sont toujours espacés
 * d'exactement `DAY_MS`, ce que la différence de deux minuits *locaux* ne garantit pas
 * lors des transitions heure d'été/hiver (jour de 23 h ou 25 h).
 */
const localDayIndex = (ms: number): number => {
  const d = new Date(ms);
  return Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY_MS);
};

/**
 * Nombre de jours calendaires entre `targetMs` et `nowMs` (positif = dans le passé).
 * Compare les jours calendaires locaux, donc insensible à l'heure de la journée **et**
 * aux transitions DST : le lendemain d'un passage à l'heure d'été (jour de 23 h) reste
 * bien à 1 jour d'écart, là où une soustraction de minuits locaux tombait à 0.
 */
export function calendarDayDiff(targetMs: number, nowMs: number): number {
  return localDayIndex(nowMs) - localDayIndex(targetMs);
}
