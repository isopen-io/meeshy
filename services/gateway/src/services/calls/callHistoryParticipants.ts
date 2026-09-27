/**
 * QUI ÉTAIT DANS UN APPEL DE GROUPE (#8066) — le journal nomme les
 * participants d'un appel de groupe dans sa ligne et sa fiche. La liste dit
 * qui a REJOINT l'appel (`CallParticipant`), sans le lecteur, dans l'ordre
 * d'arrivée ; elle ne porte aucune présence (ni `isOnline` ni `lastActiveAt`)
 * ni aucun moyen de contact : la visibilité de la présence n'en est pas touchée.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { CallHistoryParticipant } from '../callHistory';

type RosterParticipant = {
  id: string;
  userId: string | null;
  displayName: string;
  avatar: string | null;
  user: { username: string; displayName: string | null; avatar: string | null } | null;
};

type RosterRow = { callSessionId: string; participant: RosterParticipant | null };

const toHistoryParticipant = (participant: RosterParticipant): CallHistoryParticipant => ({
  participantId: participant.id,
  userId: participant.userId ?? null,
  username: participant.user?.username ?? null,
  displayName: participant.user?.displayName || participant.displayName,
  avatar: participant.user?.avatar ?? participant.avatar ?? null,
});

const appendOnce = (
  byCall: ReadonlyMap<string, readonly CallHistoryParticipant[]>,
  callId: string,
  participant: CallHistoryParticipant
): ReadonlyMap<string, readonly CallHistoryParticipant[]> => {
  const current = byCall.get(callId) ?? [];
  if (current.some((known) => known.participantId === participant.participantId)) return byCall;
  return new Map(byCall).set(callId, [...current, participant]);
};

export async function resolveGroupCallParticipants(
  prisma: PrismaClient,
  callIds: readonly string[],
  readerId: string
): Promise<ReadonlyMap<string, readonly CallHistoryParticipant[]>> {
  if (callIds.length === 0) return new Map();
  const rows: RosterRow[] = await prisma.callParticipant.findMany({
    where: { callSessionId: { in: [...callIds] } },
    orderBy: { joinedAt: 'asc' },
    select: {
      callSessionId: true,
      participant: {
        select: {
          id: true,
          userId: true,
          displayName: true,
          avatar: true,
          user: { select: { username: true, displayName: true, avatar: true } }
        }
      }
    }
  });
  return rows.reduce<ReadonlyMap<string, readonly CallHistoryParticipant[]>>((byCall, row) => {
    if (!row.participant || row.participant.userId === readerId) return byCall;
    return appendOnce(byCall, row.callSessionId, toHistoryParticipant(row.participant));
  }, new Map());
}
