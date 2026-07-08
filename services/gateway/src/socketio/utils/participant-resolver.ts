import { PrismaClient } from '@meeshy/shared/prisma/client';
import { getConnectedUser, type SocketUser } from './socket-helpers';

export type ParticipantResolution = {
  participantId: string;
  userId: string;
  isAnonymous: boolean;
  displayName: string;
};

export async function resolveParticipant(opts: {
  prisma: PrismaClient;
  userIdOrToken: string;
  conversationId: string;
  connectedUsers: Map<string, SocketUser>;
}): Promise<ParticipantResolution | null> {
  const { prisma, userIdOrToken, conversationId, connectedUsers } = opts;

  const userResult = getConnectedUser(userIdOrToken, connectedUsers);
  if (!userResult) return null;

  const { user, realUserId } = userResult;

  if (user.isAnonymous) {
    // An anonymous participant is bound to exactly ONE conversation
    // (Participant row created when joining a share link; the socket joins
    // only that conversation room — see AuthHandler._authenticateAnonymousUser).
    // Verify the participant is active in the REQUESTED conversation before
    // trusting the in-memory identity, mirroring the registered path below.
    // Without this check an anonymous socket could pass an arbitrary
    // conversationId to any participant-gated handler (typing:start, reactions,
    // …) and broadcast into a room it does not belong to. The DB read also
    // re-checks `isActive`, so an anon removed/banned since connect is rejected.
    const participantId = user.participantId || user.id;
    const anonParticipant = await prisma.participant.findFirst({
      where: { id: participantId, conversationId, isActive: true },
      select: { id: true, displayName: true, nickname: true },
    });

    if (!anonParticipant) return null;

    return {
      participantId: anonParticipant.id,
      userId: realUserId,
      isAnonymous: true,
      displayName: anonParticipant.nickname || anonParticipant.displayName || user.displayName || 'Anonymous User',
    };
  }

  const userId = user.userId || realUserId;

  const participant = await prisma.participant.findFirst({
    where: { userId, conversationId, isActive: true },
    select: { id: true, displayName: true, nickname: true },
  });

  if (!participant) return null;

  return {
    participantId: participant.id,
    userId,
    isAnonymous: false,
    displayName: participant.nickname || participant.displayName || user.displayName || 'Unknown User',
  };
}

export async function resolveParticipantFromMessage(opts: {
  prisma: PrismaClient;
  userIdOrToken: string;
  messageId: string;
  connectedUsers: Map<string, SocketUser>;
}): Promise<ParticipantResolution | null> {
  const { prisma, messageId } = opts;

  const message = await prisma.message.findUnique({
    where: { id: messageId },
    select: { conversationId: true },
  });

  if (!message) return null;

  return resolveParticipant({
    prisma: opts.prisma,
    userIdOrToken: opts.userIdOrToken,
    conversationId: message.conversationId,
    connectedUsers: opts.connectedUsers,
  });
}
