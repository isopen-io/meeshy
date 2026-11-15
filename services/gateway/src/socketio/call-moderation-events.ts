import { CLIENT_EVENTS, ROOMS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import { CALL_TERMINAL_STATUSES } from '@meeshy/shared/types/video-call';
import { callMuteParticipantSchema } from '@meeshy/shared/types/call-controls';
import type { MeeshyIOServer, MeeshySocket } from './typed-socket';
import type { CallService } from '../services/CallService';
import { SOCKET_RATE_LIMITS, type SocketRateLimiter } from '../utils/socket-rate-limiter';
import { activeCallStanding, mayModerateCallParticipant } from '../services/calls/callModerationPolicy';
import { ACCEPTED, gatedCallControl, refused } from './call-control-gate';

/**
 * `call:mute-participant` (#8438) — l'admin d'un appel coupe le micro d'un
 * participant.
 *
 * La personne visée reçoit, SEULE, `call:muted-by-moderator` : c'est son
 * client qui coupe sa piste — la passerelle n'a pas la main sur un micro. Les
 * autres apprennent l'état par le chemin ordinaire `call:media-toggled`, jamais
 * renvoyé à la cible (qui le lirait comme l'état d'un PAIR). Aucun « rallumer »
 * n'existe : la cible rouvre son micro elle-même, par `call:toggle-audio`.
 */

export type CallModerationEventDeps = {
  readonly io: MeeshyIOServer;
  readonly rateLimiter: Pick<SocketRateLimiter, 'checkLimit'>;
  readonly callService: Pick<CallService, 'getCallSession' | 'updateParticipantMedia'>;
};

const TERMINAL: ReadonlySet<string> = new Set(CALL_TERMINAL_STATUSES);

export function registerCallModerationEvents(
  deps: CallModerationEventDeps,
  socket: MeeshySocket,
  getUserId: (socketId: string) => string | undefined
): void {
  socket.on(
    CLIENT_EVENTS.CALL_MUTE_PARTICIPANT,
    gatedCallControl({
      socket,
      getUserId,
      rateLimiter: deps.rateLimiter,
      limit: SOCKET_RATE_LIMITS.CALL_MODERATION,
      schema: callMuteParticipantSchema,
      label: 'call-mute-participant',
      run: async (userId, { callId, targetUserId }) => {
        const session = await deps.callService.getCallSession(callId).catch(() => null);
        if (!session) return refused('NOT_A_PARTICIPANT');
        if (TERMINAL.has(session.status)) return refused('CALL_NOT_ACTIVE');
        const actor = activeCallStanding(session, userId);
        if (!actor) return refused('NOT_A_PARTICIPANT');
        const target = activeCallStanding(session, targetUserId);
        if (!target) return refused('TARGET_NOT_IN_CALL');
        if (!mayModerateCallParticipant(actor, target)) return refused('PERMISSION_DENIED');

        await deps.callService.updateParticipantMedia(callId, target.participantId, 'audio', false);
        const targetRoom = ROOMS.user(target.key);
        deps.io.to(targetRoom).emit(SERVER_EVENTS.CALL_MUTED_BY_MODERATOR, { callId, byUserId: actor.key });
        deps.io.to(ROOMS.call(callId)).except(targetRoom).emit(SERVER_EVENTS.CALL_MEDIA_TOGGLED, {
          callId,
          participantId: target.participantId,
          userId: target.key,
          mediaType: 'audio',
          enabled: false,
        });
        return ACCEPTED;
      },
    })
  );
}
