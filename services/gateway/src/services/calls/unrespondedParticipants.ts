import type { PrismaClient } from '@meeshy/shared/prisma/client';

export async function unrespondedParticipantUserIds(
  prisma: Pick<PrismaClient, 'callSession'>,
  callId: string
): Promise<string[]> {
  const callSession = await prisma.callSession.findUnique({
    where: { id: callId },
    include: {
      participants: true,
      conversation: {
        include: {
          participants: {
            where: { isActive: true },
            select: { id: true, userId: true },
          },
        },
      },
    },
  });

  if (!callSession) return [];

  const joinedParticipantIds = new Set(callSession.participants.map((p) => p.participantId));
  const members = callSession.conversation.participants;
  const joinedUserIds = new Set(
    members.filter((m) => joinedParticipantIds.has(m.id)).map((m) => m.userId)
  );

  return members
    .flatMap((m) => (m.userId ? [m.userId] : []))
    .filter((userId) => userId !== callSession.initiatorId && !joinedUserIds.has(userId));
}
