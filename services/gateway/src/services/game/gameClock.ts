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

const instantFormat = (zone: string): Intl.DateTimeFormat =>
  new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });

/** L'écart (en minutes) entre l'heure murale de `zone` et UTC à cet instant ; `null` si le fuseau est inconnu. */
function zoneOffsetMinutes(date: Date, zone: string): number | null {
  try {
    const parts = instantFormat(zone).formatToParts(date);
    const read = (type: string): number => Number(parts.find((p) => p.type === type)?.value);
    const wall = Date.UTC(read('year'), read('month') - 1, read('day'), read('hour') % 24, read('minute'), read('second'));
    return Number.isFinite(wall) ? Math.round((wall - Math.floor(date.getTime() / 1000) * 1000) / 60_000) : null;
  } catch {
    return null;
  }
}

/** Le fuseau, ou UTC s'il est absent ou invalide — la MÊME repli que `dayKeyOf`. */
export const effectiveZone = (timezone: string | null | undefined): string =>
  timezone && zoneOffsetMinutes(new Date(0), timezone) !== null ? timezone : 'UTC';

/**
 * L'instant UTC où l'horloge murale de `timezone` marque `dayKey` à
 * `minuteOfDay`. Deux passes : le décalage lu à l'instant visé corrige celui
 * qu'avait supposé la première (heure d'été).
 */
export function instantOfLocal(params: { readonly dayKey: string; readonly minuteOfDay: number; readonly timezone: string | null | undefined }): Date {
  const zone = effectiveZone(params.timezone);
  const wallAsUtc = markerOfDayKey(params.dayKey).getTime() + params.minuteOfDay * 60_000;
  const first = wallAsUtc - (zoneOffsetMinutes(new Date(wallAsUtc), zone) ?? 0) * 60_000;
  const second = wallAsUtc - (zoneOffsetMinutes(new Date(first), zone) ?? 0) * 60_000;
  return new Date(second);
}
