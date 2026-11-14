/**
 * QUI ÉTAIT DANS UN APPEL DE GROUPE (#8066) — le journal nomme les
 * participants d'un appel de groupe dans sa ligne et sa fiche. La liste dit
 * qui a DÉCROCHÉ (`answeredCallRoster`, #18242 B1 : une ligne existe dès la
 * sonnerie, elle ne suffit pas), sans le lecteur, dans l'ordre d'arrivée, sous
 * le nom que la carte du fil lui donne (`conversationMemberName`) ;
 * elle ne porte aucune présence (ni `isOnline` ni `lastActiveAt`) ni aucun
 * moyen de contact : la visibilité de la présence n'en est pas touchée.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { CallHistoryParticipant } from '../callHistory';
import { answeredCallRoster, type CallRosterLine, type RosterCall } from './answeredCallRoster';
import { conversationMemberName } from './callSummaryParticipantNames';

type RosterParticipant = {
  id: string;
  userId: string | null;
  displayName: string;
  nickname?: string | null;
  avatar: string | null;
  user: { username: string; displayName: string | null; firstName: string | null; lastName: string | null; avatar: string | null } | null;
};

type RosterRow = CallRosterLine & { callSessionId: string; participant: RosterParticipant | null };

export type JournalCall = RosterCall;

const toHistoryParticipant = (participant: RosterParticipant): CallHistoryParticipant => ({
  participantId: participant.id,
  userId: participant.userId ?? null,
  username: participant.user?.username ?? null,
  displayName: conversationMemberName(participant),
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
  calls: ReadonlyArray<JournalCall>,
  readerId: string
): Promise<ReadonlyMap<string, readonly CallHistoryParticipant[]>> {
  if (calls.length === 0) return new Map();
  const rows: RosterRow[] = await prisma.callParticipant.findMany({
    where: { callSessionId: { in: calls.map((call) => call.id) } },
    orderBy: { joinedAt: 'asc' },
    select: {
      callSessionId: true,
      role: true,
      answeredAt: true,
      participant: {
        select: {
          id: true,
          userId: true,
          displayName: true,
          nickname: true,
          avatar: true,
          user: { select: { username: true, displayName: true, firstName: true, lastName: true, avatar: true } }
        }
      }
    }
  });
  const tookPart = calls.flatMap((call) =>
    answeredCallRoster(rows.filter((row) => row.callSessionId === call.id), call)
  );
  return tookPart.reduce<ReadonlyMap<string, readonly CallHistoryParticipant[]>>((byCall, row) => {
    if (!row.participant || row.participant.userId === readerId) return byCall;
    return appendOnce(byCall, row.callSessionId, toHistoryParticipant(row.participant));
  }, new Map());
}
