/**
 * QUI A PRIS PART À L'APPEL, POUR LA CARTE DU FIL (#17868, planche A1) — la
 * ligne « Awa, Karim, Lina et vous » sous le titre du résumé d'appel.
 *
 * Ceux qui ont DÉCROCHÉ (`answeredCallRoster`, #18242 B1 et B-1 : un duo
 * décroché compte ses deux bouts), dans l'ordre d'arrivée, lecteur compris (le résumé est un seul message pour tous ses
 * lecteurs, chacun se retire par `userId`). Seul le COMPTE est lu : le nom se
 * compose à la lecture du message (`callSummaryParticipantNames.ts`, B2), pour
 * suivre un renommage ou une purge.
 *
 * Une panne de lecture REMONTE : `postCallSummary` reprend, et seule sa
 * dernière tentative sert le résumé sans la ligne (`CallService`).
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { logger } from '../../utils/logger';
import { answerKeyedLineIds, answeredCallRoster, isDuoCall, missingAnswerMarks, type DuoShape } from './answeredCallRoster';

type JoinedLine = {
  readonly id: string;
  readonly role: string | null;
  readonly answeredAt: Date | null;
  readonly participant: { readonly userId: string | null } | null;
};

export type SummaryCall = DuoShape & { readonly id: string; readonly answeredAt: Date | null };

const accountOf = ({ participant }: JoinedLine): ReadonlyArray<string> =>
  participant?.userId ? [participant.userId] : [];

export async function resolveCallSummaryParticipantIds(
  prisma: Pick<PrismaClient, 'callParticipant'>,
  call: SummaryCall
): Promise<ReadonlyArray<string>> {
  if (!call.answeredAt) return [];
  const [lines, keyed]: [ReadonlyArray<JoinedLine>, ReadonlySet<string>] = await Promise.all([
    prisma.callParticipant.findMany({
      where: { callSessionId: call.id },
      orderBy: { joinedAt: 'asc' },
      select: { id: true, role: true, answeredAt: true, participant: { select: { userId: true } } }
    }),
    answerKeyedLineIds(prisma, call.id)
  ]);
  const roster = { id: call.id, answeredAt: call.answeredAt, duo: isDuoCall(call), tracksAnswers: keyed.size > 0 };
  // #18242 R5 — l'anomalie se signale UNE fois, à l'écriture du résumé ; la lecture du journal se tait.
  // #18453 — pas seulement quand AUCUNE ligne n'est marquée : dès qu'un participant qui a pris part n'a pas de marque.
  const missing = missingAnswerMarks(lines, roster, keyed);
  if (missing.length > 0) {
    logger.warn('Answered call has a participant without an answer mark', { callId: call.id, duo: roster.duo, answeredAt: call.answeredAt.toISOString(), missing });
  }
  return [...new Set(answeredCallRoster(lines, roster).flatMap(accountOf))];
}
