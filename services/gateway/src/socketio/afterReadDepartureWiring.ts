import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { consumeAfterReadAndAnnounce } from '../services/messaging/afterReadConsumption';
import { readAfterReadIdsAtDeparture } from '../services/messaging/afterReadDeparture';
import { AfterReadDepartureTracker } from './AfterReadDepartureTracker';
import type { MessageMutationManager } from './broadcastMessageMutation';
import { resolveParticipant } from './utils/participant-resolver';
import { normalizeConversationId, type SocketUser } from './utils/socket-helpers';

export interface AfterReadDepartureWiring {
  prisma: PrismaClient;
  connectedUsers: Map<string, SocketUser>;
  socketToUser: Map<string, string>;
  manager: () => MessageMutationManager | null | undefined;
  onError: (error: unknown) => void;
  now?: () => Date;
}

/**
 * Le registre des départs (#18556) branché sur la gateway : le lecteur se
 * résout comme partout ailleurs (`resolveParticipant`, participation vivante),
 * et un départ consomme ce qu'il a lu par le MÊME site que la route du client.
 */
export function createAfterReadDepartureTracker(wiring: AfterReadDepartureWiring): AfterReadDepartureTracker {
  const { prisma, connectedUsers, socketToUser, onError } = wiring;
  const now = wiring.now ?? (() => new Date());
  const normalize = (rawConversationId: string) =>
    normalizeConversationId(rawConversationId, (where) =>
      prisma.conversation.findUnique({ where, select: { id: true, identifier: true } }),
    );

  return new AfterReadDepartureTracker({
    normalizeConversationId: normalize,
    resolveReader: async (socketId, rawConversationId) => {
      const userIdOrToken = socketToUser.get(socketId);
      if (!userIdOrToken) return null;
      const conversationId = await normalize(rawConversationId);
      const participant = await resolveParticipant({ prisma, userIdOrToken, conversationId, connectedUsers });
      if (!participant) return null;
      return {
        conversationId,
        participantId: participant.participantId,
        readerKey: participant.isAnonymous ? participant.participantId : participant.userId,
      };
    },
    onDeparture: async (departure) => {
      const at = now();
      const messageIds = await readAfterReadIdsAtDeparture(prisma, { ...departure, now: at });
      if (messageIds.length === 0) return;
      await consumeAfterReadAndAnnounce({ prisma, manager: wiring.manager(), ...departure, messageIds, now: at, onError });
    },
    onError,
  });
}
