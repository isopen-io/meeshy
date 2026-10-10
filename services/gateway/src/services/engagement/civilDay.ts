/**
 * Le JOUR CIVIL d'un utilisateur — la seule horloge des séries d'engagement.
 *
 * Extrait d'`EngagementService` (#8906) : la série globale (`User.lastStreakDate`)
 * et l'état par conversation (`ConversationEngagement.day`) comparent la même
 * étiquette, et les routes de lecture la résolvent pour le lecteur. Trois
 * lecteurs d'une même convention ne la réécrivent pas trois fois.
 */

export const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/** Jour civil UTC (minuit) — la comparaison de série ne dépend jamais de l'heure de l'appel. */
export function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/**
 * Jour civil de `date` dans `timezone` (repli UTC si absent ou invalide, #5734) —
 * rendu comme un marqueur `Date.UTC(y, m, d)`, jamais comme le début RÉEL du jour
 * dans ce fuseau. La série ne compare que des ÉTIQUETTES de jour civil, jamais des
 * instants : deux jours civils consécutifs valent toujours exactement `ONE_DAY_MS`
 * sous ce marqueur, y compris à cheval sur une transition d'heure d'été — ce que
 * l'instant réel de minuit local ne garantit pas.
 */
export function civilDayInTimezone(date: Date, timezone: string | null | undefined): Date {
  if (!timezone) return startOfUtcDay(date);

  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date);
    const year = Number(parts.find((p) => p.type === 'year')?.value);
    const month = Number(parts.find((p) => p.type === 'month')?.value);
    const day = Number(parts.find((p) => p.type === 'day')?.value);
    if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
      return startOfUtcDay(date);
    }
    return new Date(Date.UTC(year, month - 1, day));
  } catch {
    return startOfUtcDay(date);
  }
}

/** L'étiquette `YYYY-MM-DD` d'un marqueur de jour civil — la forme du fil. */
export function civilDayKey(marker: Date): string {
  return startOfUtcDay(marker).toISOString().slice(0, 10);
}
