/**
 * QUI A PRIS PART À UN APPEL (#18242 B1) — la loi UNIQUE que le résumé du fil
 * (`callSummaryParticipants.ts`), le journal (`callHistoryParticipants.ts`) et
 * la direction du journal (`callHistoryList.ts`) appliquent à leurs lignes
 * `CallParticipant`. L'onglet « manqués » en est la traduction en requête
 * (`missedByReader`, à côté de la direction).
 *
 * Une ligne existe dès la SONNERIE (iOS et Android émettent `call:join` pour
 * recevoir l'offre en sonnant), et `CallSession.answeredAt` est porté par
 * l'appel entier : ni l'une ni l'autre ne disent qui a décroché. Seul
 * `CallParticipant.answeredAt` le dit — posé par la réponse SDP
 * (`callParticipantAnswered.ts`). L'initiateur d'un appel décroché compte
 * toujours.
 *
 * Deux replis, aucun ne lit l'horloge (#18242 B-1) :
 * - un DUO décroché compte ses deux bouts : seul le destinataire peut y
 *   décrocher, si bien qu'une marque perdue (panne d'écriture avalée, réplica
 *   ancien qui sert la réponse) ne fait jamais lire « manqué » à qui a parlé.
 *   Un duo où quelqu'un a été invité n'en est plus un ;
 * - un appel NON SUIVI garde la liste d'avant. Un appel est suivi quand au
 *   moins une de ses lignes porte la CLÉ `answeredAt` : le code qui marque
 *   l'écrit à la création (`answeredAt: null`, `CallService`), le code d'avant
 *   ne l'écrit jamais. Rien ne permet de reconstituer qui avait décroché dans
 *   un appel d'avant le champ.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';

export type CallRosterLine = {
  readonly role?: string | null;
  readonly answeredAt?: Date | null;
};

export type RosterCall = {
  readonly id: string;
  readonly answeredAt: Date | null;
  readonly duo: boolean;
  readonly tracksAnswers: boolean;
};

/** Les deux clés sont REQUISES (#18453 M32) : un `select` qui en oublie une ne compile pas, au lieu de lire un duo comme un groupe. */
export type DuoShape = {
  readonly invitedUserIds: readonly string[] | null;
  readonly conversation: { readonly type: string | null } | null;
};

/**
 * Pourquoi un appel SUIVI et décroché a pris part sans que ses marques le
 * disent (#18453) :
 * - `no-answerer-marked` : l'appel est décroché, donc quelqu'un d'autre que
 *   l'initiateur a pris part, et aucune ligne non initiatrice n'est marquée —
 *   même quand l'initiateur l'est (un duo devenu groupe puis revenu à deux) ;
 * - `lines-without-answer-key` : une ligne ne porte pas la clé (écrite par le
 *   code d'avant pendant la transition) — elle sort de la liste sans qu'on
 *   sache si elle avait décroché.
 */
export type MissingAnswerMark = 'no-answerer-marked' | 'lines-without-answer-key';

export type KeyedRosterLine = CallRosterLine & { readonly id: string };

const INITIATOR_ROLE = 'initiator';

const hasAnswered = (line: CallRosterLine): boolean => line.answeredAt instanceof Date;

export const isDuoCall = (call: DuoShape): boolean =>
  call.conversation?.type === 'direct' && (call.invitedUserIds ?? []).length === 0;

export function answeredCallRoster<T extends CallRosterLine>(
  lines: ReadonlyArray<T>,
  call: RosterCall
): ReadonlyArray<T> {
  if (!(call.answeredAt instanceof Date)) return [];
  if (call.duo || !call.tracksAnswers) return lines;
  return lines.filter((line) => hasAnswered(line) || line.role === INITIATOR_ROLE);
}

/** Ce qui manque aux marques d'un appel suivi et décroché — une écriture perdue, un chemin de réponse oublié, une ligne d'avant le champ. */
export function missingAnswerMarks(
  lines: ReadonlyArray<KeyedRosterLine>,
  call: RosterCall,
  keyedLineIds: ReadonlySet<string>
): ReadonlyArray<MissingAnswerMark> {
  if (!(call.answeredAt instanceof Date) || !call.tracksAnswers) return [];
  const answererMarked = lines.some((line) => line.role !== INITIATOR_ROLE && hasAnswered(line));
  const keyless = lines.some((line) => !keyedLineIds.has(line.id));
  return [
    ...(answererMarked ? [] : ['no-answerer-marked' as const]),
    ...(keyless ? ['lines-without-answer-key' as const] : [])
  ];
}

/** Les lignes d'UN appel qui portent la clé `answeredAt` : l'appel est suivi dès qu'il y en a une. */
export async function answerKeyedLineIds(
  prisma: Pick<PrismaClient, 'callParticipant'>,
  callId: string
): Promise<ReadonlySet<string>> {
  const keyed: ReadonlyArray<{ readonly id: string }> = await prisma.callParticipant.findMany({
    where: { callSessionId: callId, answeredAt: { isSet: true } },
    select: { id: true }
  });
  return new Set(keyed.map((line) => line.id));
}

/** Les appels dont au moins une ligne porte la clé `answeredAt` — une seule requête pour toute une page. */
export async function callsTrackingAnswers(
  prisma: Pick<PrismaClient, 'callParticipant'>,
  callIds: ReadonlyArray<string>
): Promise<ReadonlySet<string>> {
  if (callIds.length === 0) return new Set();
  const tracked: ReadonlyArray<{ readonly callSessionId: string }> = await prisma.callParticipant.findMany({
    where: { callSessionId: { in: [...new Set(callIds)] }, answeredAt: { isSet: true } },
    select: { callSessionId: true }
  });
  return new Set(tracked.map((line) => line.callSessionId));
}
