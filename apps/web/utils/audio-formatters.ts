/**
 * Utilitaires de formatage pour l'audio
 */

import { formatClock } from '@meeshy/shared/utils/duration-format';

/**
 * Formater le temps avec millisecondes (MM:SS.ms ou HH:MM:SS.ms selon la durée).
 * Délègue à la fonction canonique {@link formatClock} (source unique).
 */
export function formatTime(seconds: number): string {
  return formatClock(seconds, { includeCentiseconds: true });
}

/**
 * Formater la durée simple (sans millisecondes).
 * Délègue à la fonction canonique {@link formatClock} (source unique).
 */
export function formatDuration(seconds: number): string {
  return formatClock(seconds);
}

/**
 * Convertir la vitesse de lecture avec points d'accroche
 */
export function snapPlaybackRate(value: number): number {
  const snapPoints = [1.0, 1.5, 2.0, 3.0];
  const snapTolerance = 0.05;

  for (const snapPoint of snapPoints) {
    if (Math.abs(value - snapPoint) < snapTolerance) {
      return snapPoint;
    }
  }

  return value;
}
