import type { LeagueMoment } from '@meeshy/shared/utils/game/league';

/**
 * L'instant de l'horloge LOCALE (#10131) : le jour civil et la minute depuis minuit, tels que les lois du Jeu les
 * lisent (`LeagueMoment`). Miroir de `LeagueMoment.local` (SDK) : c'est l'heure du poste qui fait basculer une copie
 * gardée hors ligne, jamais celle d'un serveur qu'on ne joint pas.
 */
export function localMoment(now: Date = new Date()): LeagueMoment {
  const pad = (n: number): string => String(n).padStart(2, '0');
  return { dayKey: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`, minuteOfDay: now.getHours() * 60 + now.getMinutes() };
}
