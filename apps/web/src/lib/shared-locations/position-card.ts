import { SHARED_LOCATION_DURATIONS_MINUTES, type SharedLocationPrecision } from '@meeshy/shared/types/shared-location-constants';

import type { SharedLocation } from '@/lib/api/shared-locations';
import type { InterfaceLanguage } from '@/lib/interface-language';

/**
 * **LA CARTE D'UNE POSITION PARTAGÉE** (#18881) — ce que la feuille basse de la carte dit d'UNE personne :
 * la précision que son cercle ouvre, le temps qui reste (et sa part du partage), l'itinéraire. Tout vient
 * de la charge SERVIE ; rien n'est fabriqué : le lieu (« Alfama ») et la distance ne sont pas servis, la
 * carte s'en passe au lieu de les inventer.
 *
 * Le partage dure 1 h ou 8 h (LOC-02) mais le serveur ne sert que l'échéance : la durée totale est la plus
 * courte des durées permises qui contient le temps restant — la jauge ne ment jamais par excès.
 */
export type PositionCard = {
  readonly precision: SharedLocationPrecision;
  readonly remainingMinutes: number;
  readonly totalMinutes: number;
  readonly fraction: number;
};

const MINUTE_MS = 60_000;

export function positionCardOf({ location, now }: { readonly location: SharedLocation; readonly now: number }): PositionCard | null {
  const remainingMs = Date.parse(location.expiresAt) - now;
  if (!Number.isFinite(remainingMs) || remainingMs <= 0) return null;
  const remainingMinutes = Math.max(1, Math.round(remainingMs / MINUTE_MS));
  const totalMinutes = SHARED_LOCATION_DURATIONS_MINUTES.find((minutes) => minutes >= remainingMinutes) ?? remainingMinutes;
  return { precision: location.precision, remainingMinutes, totalMinutes, fraction: Math.min(1, remainingMinutes / totalMinutes) };
}

/** L'itinéraire vers la position TELLE QUE SERVIE (déjà tronquée à la précision accordée) : rien de plus fin ne part. */
export const directionsHref = (location: Pick<SharedLocation, 'latitude' | 'longitude'>): string =>
  `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${location.latitude},${location.longitude}`)}`;

export function remainingWords(language: InterfaceLanguage, minutes: number): string {
  const unit = (value: number, name: 'hour' | 'minute'): string => new Intl.NumberFormat(language, { style: 'unit', unit: name, unitDisplay: 'narrow' }).format(value);
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return unit(rest, 'minute');
  return rest === 0 ? unit(hours, 'hour') : `${unit(hours, 'hour')} ${unit(rest, 'minute')}`;
}
