/**
 * Utilitaires de formatage pour l'audio
 */

/**
 * Formater le temps avec millisecondes (MM:SS.ms ou HH:MM:SS.ms selon la durée)
 */
export function formatTime(seconds: number): string {
  if (!isFinite(seconds) || isNaN(seconds) || seconds < 0) return '0:00.00';

  const totalMs = Math.floor(seconds * 1000);
  const hours = Math.floor(totalMs / 3600000);
  const mins = Math.floor((totalMs % 3600000) / 60000);
  const secs = Math.floor((totalMs % 60000) / 1000);
  const ms = Math.floor((totalMs % 1000) / 10);

  if (hours > 0) {
    return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
}

/**
 * Formater la durée simple (sans millisecondes)
 */
export function formatDuration(seconds: number): string {
  if (!seconds || !isFinite(seconds)) return '0:00';

  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
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
