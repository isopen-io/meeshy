/**
 * QUI A PRIS PART À UN APPEL (#18242 B1) — la loi UNIQUE que le résumé du fil
 * (`callSummaryParticipants.ts`), le journal (`callHistoryParticipants.ts`) et
 * la direction du journal (`callHistoryList.ts`) appliquent à leurs lignes
 * `CallParticipant`.
 *
 * Une ligne existe dès la SONNERIE (iOS et Android émettent `call:join` pour
 * recevoir l'offre en sonnant), et `CallSession.answeredAt` est porté par
 * l'appel entier : ni l'une ni l'autre ne disent qui a décroché. Seul
 * `CallParticipant.answeredAt` le dit — posé par la réponse SDP
 * (`callParticipantAnswered.ts`). L'initiateur d'un appel décroché compte
 * toujours.
 *
 * Le repli « aucune ligne marquée ⇒ la liste d'avant » ne vaut que pour un
 * appel décroché AVANT le déploiement du champ (rien ne permet de reconstituer
 * qui avait décroché). Après, l'absence de toute marque est une ANOMALIE
 * (écriture perdue, chemin de réponse oublié) : elle se journalise et ne
 * rouvre jamais la liste à qui a seulement sonné (#18242 C1).
 */
import { logger } from '../../utils/logger';

/**
 * Le premier instant où toute réponse SDP marque sa ligne. À recaler, si la
 * promotion en production tombe plus tard, sur la date de cette promotion.
 */
export const CALL_PARTICIPANT_ANSWERS_TRACKED_SINCE = new Date('2026-11-16T00:00:00.000Z');

export type CallRosterLine = {
  readonly role?: string | null;
  readonly answeredAt?: Date | null;
};

export type RosterCall = { readonly id: string; readonly answeredAt: Date | null };

const INITIATOR_ROLE = 'initiator';

const hasAnswered = (line: CallRosterLine): boolean => line.answeredAt instanceof Date;

const answeredBeforeTracking = (call: RosterCall): boolean =>
  call.answeredAt instanceof Date && call.answeredAt.getTime() < CALL_PARTICIPANT_ANSWERS_TRACKED_SINCE.getTime();

export function answeredCallRoster<T extends CallRosterLine>(
  lines: ReadonlyArray<T>,
  call: RosterCall
): ReadonlyArray<T> {
  if (!(call.answeredAt instanceof Date)) return [];
  if (!lines.some(hasAnswered)) {
    if (answeredBeforeTracking(call)) return lines;
    if (lines.length > 0) {
      logger.warn('Answered call has no answered participant line', { callId: call.id, answeredAt: call.answeredAt.toISOString() });
    }
  }
  return lines.filter((line) => hasAnswered(line) || line.role === INITIATOR_ROLE);
}
