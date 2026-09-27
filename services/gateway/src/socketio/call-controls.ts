import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { MeeshyIOServer, MeeshySocket } from './typed-socket';
import type { CallService } from '../services/CallService';
import type { PushNotificationService } from '../services/PushNotificationService';
import type { SocketRateLimiter } from '../utils/socket-rate-limiter';
import { recordCallReaction } from '../services/calls/callReactions';
import { resolveActiveCallParticipant } from './call-participants';
import { callInviteDependencies, registerCallInviteEvents } from './call-invite-events';
import { registerCallModerationEvents } from './call-moderation-events';
import { registerCallReactionEvents } from './call-reaction-events';

/**
 * Les contrôles d'un appel EN COURS — inviter (#8433), couper un micro
 * (#8438), réagir (#8439) — branchés d'un seul appel depuis
 * `CallEventsHandler`, qui est hors budget de taille et ne reçoit plus de
 * verbe neuf.
 */
export type CallControlDeps = {
  readonly io: MeeshyIOServer;
  readonly prisma: PrismaClient;
  readonly callService: CallService;
  readonly rateLimiter: Pick<SocketRateLimiter, 'checkLimit'>;
  readonly pushService: () => PushNotificationService | null;
};

export function registerCallControlEvents(
  deps: CallControlDeps,
  socket: MeeshySocket,
  getUserId: (socketId: string) => string | undefined
): void {
  const { io, prisma, callService, rateLimiter } = deps;
  registerCallInviteEvents(callInviteDependencies(deps), socket, getUserId);
  registerCallModerationEvents({ io, rateLimiter, callService }, socket, getUserId);
  registerCallReactionEvents(
    {
      rateLimiter,
      resolveActiveCallParticipant: (userId, callId) => resolveActiveCallParticipant({ prisma, callService }, userId, callId),
      recordReaction: (callId, emoji) => recordCallReaction(prisma, callId, emoji),
    },
    socket,
    getUserId
  );
}
