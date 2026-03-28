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
    const participantId = user.participantId || user.id;
    return {
      participantId,
      userId: realUserId,
      isAnonymous: true,
      displayName: user.displayName || 'Anonymous User',
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
