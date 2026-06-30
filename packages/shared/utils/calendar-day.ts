/**
 * Source unique de la classification calendaire d'une date en
 * « aujourd'hui / hier / cette semaine / plus ancien ».
 *
 * Avant iter 44, ce calcul calendaire — différence de jours mesurée à **minuit
 * local** (et non en millisecondes écoulées) — était réimplémenté à l'identique
 * dans `apps/web/utils/date-format.ts` (`formatRelativeDate`, `formatConversationDate`)
 * et en variante équivalente (`startOfToday`/`startOfYesterday`) dans
 * `apps/web/utils/notification-helpers.ts` (`formatContentPublishedAt`).
 * `classifyCalendarDay` unifie la classification ; la présentation (clés i18n,
 * queue date/heure absolue, composition avec `classifyRelativeTime` pour la
 * granularité intra-journée) reste app-side.
 *
 * Symétrique de `classifyRelativeTime` (iter 43, F18b) : le « maintenant » est
 * injecté (`nowMs`) plutôt que lu via `Date.now()`, ce qui rend la fonction
 * déterministe et trivialement testable. Le minuit est calculé dans le fuseau
 * **local** (`new Date(y, m, d)`), conforme au comportement attendu des libellés
 * « hier / cette semaine » côté appareil.
 *
 * Buckets : même jour calendaire → `today` ; 1 jour calendaire en arrière →
 * `yesterday` ; 2..`weekDays`-1 jours → `thisWeek` (avec `diffDays`) ; au-delà →
 * `older`. Une cible dans le futur (`diffDays < 0`) est classée `today`.
 */

export type CalendarDayBucket =
  | { readonly unit: 'today' }
  | { readonly unit: 'yesterday' }
  | { readonly unit: 'thisWeek'; readonly diffDays: number }
  | { readonly unit: 'older' };

export type CalendarDayOptions = {
  /**
   * Nombre de jours calendaires à partir duquel le bucket devient `older`
   * (l'appelant rend alors une date absolue). Défaut `7`.
   */
  readonly weekDays?: number;
};

const DAY_MS = 86_400_000;

function startOfLocalDay(ms: number): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

export function classifyCalendarDay(
  targetMs: number,
  nowMs: number,
  options: CalendarDayOptions = {}
): CalendarDayBucket {
  const { weekDays = 7 } = options;
  const diffDays = Math.floor((startOfLocalDay(nowMs) - startOfLocalDay(targetMs)) / DAY_MS);

  if (diffDays <= 0) return { unit: 'today' };
  if (diffDays === 1) return { unit: 'yesterday' };
  if (diffDays < weekDays) return { unit: 'thisWeek', diffDays };
  return { unit: 'older' };
}
