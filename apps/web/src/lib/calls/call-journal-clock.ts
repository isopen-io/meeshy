import { formatCallClock } from './call-store';

/**
 * L'heure d'une phrase du journal : `MM:SS` (minutes complétées), `H:MM:SS` passé une heure —
 * `paddedClockPromotingHours` d'iOS (#17878 A1.5). Ici et non dans `call-store.ts`, que la première
 * peinture charge : seuls le journal vivant et celui d'après l'appel, tous deux à la demande, la lisent.
 */
export function formatCallJournalClock(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  return safe >= 3600 ? formatCallClock(safe) : `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`;
}

/**
 * L'heure d'une phrase DANS l'appel (`mm:ss` depuis son début, `h:mm:ss` au-delà) :
 * la même pour la ligne du journal vivant, la ligne de capture et le journal
 * d'après l'appel (iOS `CallJournalClock`). Sans début d'appel connu, aucune heure
 * plutôt qu'une heure murale qui ne dirait pas la même chose.
 */
export function journalClock(at: number, startedAt: number | null): string | null {
  return startedAt === null ? null : formatCallJournalClock((at - startedAt) / 1000);
}
