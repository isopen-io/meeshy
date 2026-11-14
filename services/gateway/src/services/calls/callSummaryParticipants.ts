/**
 * QUI A PRIS PART À L'APPEL, POUR LA CARTE DU FIL (#17868, planche A1) — la
 * ligne « Awa, Karim, Lina et vous » sous le titre du résumé d'appel.
 *
 * Ceux qui ont DÉCROCHÉ (`answeredCallRoster`, #18242 B1), dans l'ordre
 * d'arrivée, lecteur compris (le résumé est un seul message pour tous ses
 * lecteurs, chacun se retire par `userId`). Seul le COMPTE est lu : le nom se
 * compose à la lecture du message (`callSummaryParticipantNames.ts`, B2), pour
 * suivre un renommage ou une purge.
 *
 * Une panne de lecture REMONTE : `postCallSummary` reprend, et seule sa
 * dernière tentative sert le résumé sans la ligne (`CallService`).
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { answeredCallRoster } from './answeredCallRoster';

type JoinedLine = {
  readonly role: string | null;
  readonly answeredAt: Date | null;
  readonly participant: { readonly userId: string | null } | null;
};

const accountOf = ({ participant }: JoinedLine): ReadonlyArray<string> =>
  participant?.userId ? [participant.userId] : [];

export async function resolveCallSummaryParticipantIds(
  prisma: Pick<PrismaClient, 'callParticipant'>,
  call: { readonly id: string; readonly answeredAt: Date | null }
): Promise<ReadonlyArray<string>> {
  if (!call.answeredAt) return [];
  const lines: ReadonlyArray<JoinedLine> = await prisma.callParticipant.findMany({
    where: { callSessionId: call.id },
    orderBy: { joinedAt: 'asc' },
    select: { role: true, answeredAt: true, participant: { select: { userId: true } } }
  });
  return [...new Set(answeredCallRoster(lines, call).flatMap(accountOf))];
}
