/**
 * QUI A PRIS PART À L'APPEL, POUR LA CARTE DU FIL (#17868, planche A1) — la
 * ligne « Awa, Karim, Lina et vous » sous le titre du résumé d'appel.
 *
 * Même notion que le journal de l'historique (`callHistoryParticipants.ts`) :
 * ceux qui ont REJOINT (`CallParticipant`), dans l'ordre d'arrivée. Elle en
 * diffère par deux choix : le lecteur n'est PAS retiré (le résumé est un seul
 * message pour tous ses lecteurs, chacun se retire par `userId`), et le nom
 * suit la loi de lecture de la conversation (`resolveParticipantDisplayName` :
 * copie du participant, puis nom du compte, puis « Prénom Nom », puis pseudo).
 *
 * Rien d'autre que `userId` + `displayName` n'est lu : ni e-mail, ni numéro,
 * ni présence. Une panne de lecture rend la liste vide — le résumé part sans
 * la ligne, jamais perdu.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { CallSummaryParticipant } from '@meeshy/shared/utils/call-summary';
import { resolveParticipantDisplayName } from '@meeshy/shared/utils/participant-helpers';
import { accountDisplayName } from '../participantNameSnapshots';
import { logger } from '../../utils/logger';

type JoinedRow = {
  readonly participant: {
    readonly userId: string | null;
    readonly displayName: string;
    readonly user: {
      readonly displayName: string | null;
      readonly firstName: string | null;
      readonly lastName: string | null;
      readonly username: string;
    } | null;
  } | null;
};

const readableName = (row: NonNullable<JoinedRow['participant']>): string =>
  resolveParticipantDisplayName(row) ?? (row.user === null ? '' : accountDisplayName(row.user));

const toSummaryParticipant = ({ participant }: JoinedRow): ReadonlyArray<CallSummaryParticipant> =>
  participant === null || participant.userId === null
    ? []
    : [{ userId: participant.userId, displayName: readableName(participant) }];

export async function resolveCallSummaryParticipants(
  prisma: Pick<PrismaClient, 'callParticipant'>,
  callId: string
): Promise<ReadonlyArray<CallSummaryParticipant>> {
  try {
    const rows: ReadonlyArray<JoinedRow> = await prisma.callParticipant.findMany({
      where: { callSessionId: callId },
      orderBy: { joinedAt: 'asc' },
      select: {
        participant: {
          select: {
            userId: true,
            displayName: true,
            user: { select: { displayName: true, firstName: true, lastName: true, username: true } }
          }
        }
      }
    });
    return rows.flatMap(toSummaryParticipant);
  } catch (error) {
    logger.warn('Failed to read call summary participants', {
      callId,
      error: error instanceof Error ? error.message : String(error)
    });
    return [];
  }
}
