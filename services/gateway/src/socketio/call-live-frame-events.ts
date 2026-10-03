import { CLIENT_EVENTS, ROOMS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import { callLiveFrameSelectSchema } from '@meeshy/shared/types/call-live-frame';
import type { MeeshySocket } from './typed-socket';
import { SOCKET_RATE_LIMITS, type SocketRateLimiter } from '../utils/socket-rate-limiter';
import { ACCEPTED, gatedCallControl, refused } from './call-control-gate';

/**
 * `call:frame-select` (#9214) — le cadre en direct d'un appel à DEUX.
 *
 * Chaque participant compose sa vue chez lui ; seul le CHOIX voyage : l'identifiant
 * du cadre (ou `null` pour le retirer) et les textes que l'émetteur partage. Seul
 * un participant CONNECTÉ à cet appel choisit, et seulement tant que l'appel réunit
 * exactement deux personnes : à trois, le cadre en direct n'existe pas encore. Le
 * choix part aux autres sockets de la room de l'appel — l'autre participant —
 * jamais à la conversation. Rien n'est persisté.
 */

export type CallLiveFrameSender = {
  readonly userId: string;
  readonly activeParticipants: number;
};

export type CallLiveFrameEventDeps = {
  readonly rateLimiter: Pick<SocketRateLimiter, 'checkLimit'>;
  readonly resolveSender: (userId: string, callId: string) => Promise<CallLiveFrameSender | null>;
  readonly now?: () => Date;
};

const DUO = 2;

export function registerCallLiveFrameEvents(
  deps: CallLiveFrameEventDeps,
  socket: MeeshySocket,
  getUserId: (socketId: string) => string | undefined
): void {
  const now = deps.now ?? (() => new Date());
  socket.on(
    CLIENT_EVENTS.CALL_FRAME_SELECT,
    gatedCallControl({
      socket,
      getUserId,
      rateLimiter: deps.rateLimiter,
      limit: SOCKET_RATE_LIMITS.CALL_FRAME_SELECT,
      schema: callLiveFrameSelectSchema,
      label: 'call-frame-select',
      run: async (userId, { callId, frameId, texts }) => {
        const sender = await deps.resolveSender(userId, callId);
        if (!sender) return refused('NOT_A_PARTICIPANT');
        if (sender.activeParticipants < DUO) return refused('CALL_NOT_ACTIVE');
        if (sender.activeParticipants > DUO) return refused('PERMISSION_DENIED');
        const sharedTexts = texts && Object.keys(texts).length > 0 ? { texts } : {};
        socket.to(ROOMS.call(callId)).emit(SERVER_EVENTS.CALL_FRAME_SELECTED, {
          callId,
          userId: sender.userId,
          frameId,
          ...sharedTexts,
          at: now().toISOString(),
        });
        return ACCEPTED;
      },
    })
  );
}
