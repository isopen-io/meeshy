/**
 * L'HORLOGE DU JEU (#9375) — le jour est une CLÉ `AAAA-MM-JJ` dans le fuseau de
 * l'utilisateur, et la loi partagée ne manipule que des clés.
 *
 * Sur `civilDay.ts` (la convention des séries) : un seul découpage du jour civil
 * dans le dépôt. Ce module n'y ajoute que la clé, son marqueur et la minute.
 */

import { civilDayInTimezone, civilDayKey } from '../engagement/civilDay';

/** La clé de jour de `date` dans `timezone` (repli UTC si absent ou invalide). */
export const dayKeyOf = (date: Date, timezone: string | null | undefined): string =>
  civilDayKey(civilDayInTimezone(date, timezone));

/** Le marqueur de jour d'une clé : minuit UTC, la forme de `User.lastStreakDate`. */
export const markerOfDayKey = (dayKey: string): Date => new Date(`${dayKey}T00:00:00.000Z`);

/**
 * La minute du jour local, 0..1439 — pour situer l'Heure du Prisme.
 * `hourCycle: 'h23'` : avec `hour12: false`, certains moteurs rendent « 24 » à
 * minuit, qui vaudrait 1440 minutes au lieu de 0.
 */
export function minuteOfDayInTimezone(date: Date, timezone: string | null | undefined): number {
  const read = (zone: string | undefined): number | null => {
    try {
      const parts = new Intl.DateTimeFormat('en-US', {
        ...(zone ? { timeZone: zone } : {}),
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      }).formatToParts(date);
      const hour = Number(parts.find((p) => p.type === 'hour')?.value);
      const minute = Number(parts.find((p) => p.type === 'minute')?.value);
      return Number.isFinite(hour) && Number.isFinite(minute) ? (hour % 24) * 60 + minute : null;
    } catch {
      return null;
    }
  };
  return (timezone ? read(timezone) : null) ?? read('UTC') ?? date.getUTCHours() * 60 + date.getUTCMinutes();
}
