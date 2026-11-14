/**
 * QUI A PRIS PART À UN APPEL (#18242 B1) — la loi UNIQUE que le résumé du fil
 * (`callSummaryParticipants.ts`) et le journal (`callHistoryParticipants.ts`)
 * appliquent à leurs lignes `CallParticipant`.
 *
 * Une ligne existe dès la SONNERIE (iOS et Android émettent `call:join` pour
 * recevoir l'offre en sonnant), et `CallSession.answeredAt` est porté par
 * l'appel entier : ni l'une ni l'autre ne disent qui a décroché. Seul
 * `CallParticipant.answeredAt` le dit — posé par la réponse SDP sur les deux
 * bouts de la négociation (`callParticipantAnswered.ts`). L'initiateur d'un
 * appel décroché compte toujours.
 *
 * Un appel décroché AVANT ce champ n'a aucune ligne marquée : il garde la
 * liste d'avant (tous ceux qui ont rejoint), faute de mieux — rien ne permet
 * de la reconstituer, et une liste vide effacerait des participants réels.
 */
export type CallRosterLine = {
  readonly role?: string | null;
  readonly answeredAt?: Date | null;
};

const INITIATOR_ROLE = 'initiator';

const hasAnswered = (line: CallRosterLine): boolean => line.answeredAt instanceof Date;

export function answeredCallRoster<T extends CallRosterLine>(
  lines: ReadonlyArray<T>,
  callAnswered: boolean
): ReadonlyArray<T> {
  if (!callAnswered) return [];
  if (!lines.some(hasAnswered)) return lines;
  return lines.filter((line) => hasAnswered(line) || line.role === INITIATOR_ROLE);
}
