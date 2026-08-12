/**
 * Source unique du formatage d'une durée en horloge MM:SS / H:MM:SS.
 *
 * Avant iter 42, cet algorithme était réimplémenté à l'identique (à des
 * variantes mineures près) dans au moins cinq endroits : `call-summary.ts`
 * (shared), `use-call-duration.ts` + `audio-formatters.ts` (web) et
 * `NotificationService.ts` (gateway). `formatClock` les unifie.
 *
 * Pur et sans effet de bord. Le calcul se fait en millisecondes pour rendre les
 * centièmes de seconde exacts. Les entrées négatives ou non finies sont ramenées
 * à zéro.
 */

export type ClockFormatOptions = {
  /** Zéro-pad les minutes même en dessous d'une heure (`04:32` au lieu de `4:32`). */
  readonly padMinutes?: boolean;
  /** Ajoute les centièmes de seconde (`1:23.45`). */
  readonly includeCentiseconds?: boolean;
};

const pad2 = (value: number): string => (value < 10 ? `0${value}` : `${value}`);

export function formatClock(totalSeconds: number, options: ClockFormatOptions = {}): string {
  const { padMinutes = false, includeCentiseconds = false } = options;
  const safeSeconds = Number.isFinite(totalSeconds) ? Math.max(0, totalSeconds) : 0;
  const totalMs = Math.floor(safeSeconds * 1000);

  const hours = Math.floor(totalMs / 3_600_000);
  const minutes = Math.floor((totalMs % 3_600_000) / 60_000);
  const seconds = Math.floor((totalMs % 60_000) / 1000);
  const centiseconds = Math.floor((totalMs % 1000) / 10);

  const minutesStr = hours > 0 || padMinutes ? pad2(minutes) : `${minutes}`;
  const head = hours > 0 ? `${hours}:${minutesStr}` : minutesStr;
  const tail = includeCentiseconds ? `.${pad2(centiseconds)}` : '';

  return `${head}:${pad2(seconds)}${tail}`;
}
