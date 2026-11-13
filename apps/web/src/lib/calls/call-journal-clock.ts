import { formatCallJournalClock } from './call-store';

/**
 * L'heure d'une phrase DANS l'appel (`mm:ss` depuis son début, `h:mm:ss` au-delà) :
 * la même pour la ligne du journal vivant, la ligne de capture et le journal
 * d'après l'appel (iOS `CallJournalClock`). Sans début d'appel connu, aucune heure
 * plutôt qu'une heure murale qui ne dirait pas la même chose.
 */
export function journalClock(at: number, startedAt: number | null): string | null {
  return startedAt === null ? null : formatCallJournalClock((at - startedAt) / 1000);
}
