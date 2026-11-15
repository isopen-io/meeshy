import { CLIENT_EVENTS, ROOMS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import { callReactionSchema, type CallReactionEmoji } from '@meeshy/shared/types/call-controls';
import type { MeeshySocket } from './typed-socket';
import { SOCKET_RATE_LIMITS, type SocketRateLimiter } from '../utils/socket-rate-limiter';
import { ACCEPTED, gatedCallControl, refused } from './call-control-gate';
import { logger } from '../utils/logger';

/**
 * `call:reaction` (#8439) — une réaction envoyée pendant l'appel.
 *
 * Seul un participant CONNECTÉ à cet appel réagit ; la réaction part aux autres
 * sockets de la room de l'appel (l'émetteur l'affiche déjà chez lui), jamais à
 * la conversation. Le compte par emoji est écrit APRÈS le relais : une base
 * lente ou indisponible ne retarde ni n'empêche la réaction d'être vue.
 */

export type CallReactionEventDeps = {
  readonly rateLimiter: Pick<SocketRateLimiter, 'checkLimit'>;
  readonly resolveActiveCallParticipant: (
    userId: string,
    callId: string
  ) => Promise<{ readonly participantId: string; readonly userId: string } | null>;
  readonly recordReaction: (callId: string, emoji: CallReactionEmoji) => Promise<void>;
  readonly now?: () => Date;
};

export function registerCallReactionEvents(
  deps: CallReactionEventDeps,
  socket: MeeshySocket,
  getUserId: (socketId: string) => string | undefined
): void {
  const now = deps.now ?? (() => new Date());
  socket.on(
    CLIENT_EVENTS.CALL_REACTION,
    gatedCallControl({
      socket,
      getUserId,
      rateLimiter: deps.rateLimiter,
      limit: SOCKET_RATE_LIMITS.CALL_REACTION,
      schema: callReactionSchema,
      label: 'call-reaction',
      run: async (userId, { callId, emoji }) => {
        const sender = await deps.resolveActiveCallParticipant(userId, callId);
        if (!sender) return refused('NOT_A_PARTICIPANT');
        socket.to(ROOMS.call(callId)).emit(SERVER_EVENTS.CALL_REACTION_RECEIVED, {
          callId,
          userId: sender.userId,
          emoji,
          at: now().toISOString(),
        });
        await deps.recordReaction(callId, emoji).catch((error: unknown) =>
          logger.warn('call-reaction: count not recorded', { callId, error })
        );
        return ACCEPTED;
      },
    })
  );
}
