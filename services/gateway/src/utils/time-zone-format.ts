import { isValidTimeZone } from '@meeshy/shared/utils/client-session';

/**
 * Formate une date dans un fuseau, SANS jamais lever (audit L2-1).
 *
 * `toLocaleString(locale, { timeZone })` lève une `RangeError` sur un fuseau
 * inconnu. Sur le chemin de l'alerte « nouvelle connexion », cette levée était
 * avalée par le `.catch` du login : un fuseau forgé dans un en-tête taisait
 * l'alerte. Un fuseau inconnu ou absent vaut désormais UTC — l'alerte part
 * toujours, au pire datée en UTC.
 */
export function safeTimeZone(timeZone: string | null | undefined): string {
  return isValidTimeZone(timeZone) ? timeZone : 'UTC';
}

export function formatInTimeZone(
  date: Date,
  locale: string,
  timeZone: string | null | undefined,
  options: Intl.DateTimeFormatOptions,
): string {
  const zone = safeTimeZone(timeZone);
  try {
    return date.toLocaleString(locale, { ...options, timeZone: zone });
  } catch {
    return date.toLocaleString('en-US', { ...options, timeZone: 'UTC' });
  }
}
