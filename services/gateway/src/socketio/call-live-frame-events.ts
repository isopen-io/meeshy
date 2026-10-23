import { CLIENT_EVENTS, ROOMS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import { callLiveFrameSelectSchema, type CallLiveFrameSelectedEvent } from '@meeshy/shared/types/call-live-frame';
import { CALL_MAX_PARTICIPANTS } from '@meeshy/shared/types/call-rules';
import { readClientCapabilities, type ClientCapability } from '@meeshy/shared/utils/client-capabilities';
import type { MeeshyIOServer, MeeshySocket } from './typed-socket';
import { SOCKET_RATE_LIMITS, type SocketRateLimiter } from '../utils/socket-rate-limiter';
import { ACCEPTED, gatedCallControl, refused } from './call-control-gate';

/**
 * `call:frame-select` (#9214, #11279) — le cadre en direct d'un appel.
 *
 * Chaque participant compose sa vue chez lui ; seul le CHOIX voyage : l'identifiant
 * du cadre (ou `null` pour le retirer) et les textes que l'émetteur partage. Le cadre
 * se PROPOSE aux autres, qui l'appliquent ou le refusent (`reply`, #9287) — jamais
 * imposé. Seul un participant CONNECTÉ à cet appel choisit, et jamais seul. Le choix
 * part aux autres sockets de la room de l'appel — jamais à la conversation. Rien
 * n'est persisté.
 *
 * À DEUX, il part à toute la room, comme depuis #9214. EN GROUPE (3 à
 * `CALL_MAX_PARTICIPANTS`), il ne part qu'aux sockets qui annoncent
 * `call-live-frame-group` : un ancien iOS en groupe poserait la proposition dans
 * sa carte du haut d'écran sans pouvoir afficher le cadre (#11279).
 */

export type CallLiveFrameSender = {
  readonly userId: string;
  readonly activeParticipants: number;
};

export type CallLiveFrameRecipient = {
  readonly socketId: string;
  readonly capabilities: ReadonlySet<ClientCapability>;
  readonly emit: (payload: CallLiveFrameSelectedEvent) => void;
};

export type CallLiveFrameEventDeps = {
  readonly rateLimiter: Pick<SocketRateLimiter, 'checkLimit'>;
  readonly resolveSender: (userId: string, callId: string) => Promise<CallLiveFrameSender | null>;
  readonly groupRecipients: (callId: string) => Promise<readonly CallLiveFrameRecipient[]>;
  readonly now?: () => Date;
};

/** Les sockets de la room de l'appel, sur tous les nœuds, avec ce que chacune annonce. */
export function callRoomRecipients(io: Pick<MeeshyIOServer, 'in'>): CallLiveFrameEventDeps['groupRecipients'] {
  return async (callId) =>
    (await io.in(ROOMS.call(callId)).fetchSockets()).map((member) => ({
      socketId: member.id,
      capabilities: readClientCapabilities(member.handshake.auth),
      emit: (payload) => {
        member.emit(SERVER_EVENTS.CALL_FRAME_SELECTED, payload);
      },
    }));
}

const DUO = 2;
const GROUP_CAPABILITY: ClientCapability = 'call-live-frame-group';

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
      run: async (userId, { callId, frameId, texts, reply }) => {
        const sender = await deps.resolveSender(userId, callId);
        if (!sender) return refused('NOT_A_PARTICIPANT');
        if (sender.activeParticipants < DUO) return refused('CALL_NOT_ACTIVE');
        if (sender.activeParticipants > CALL_MAX_PARTICIPANTS) return refused('PERMISSION_DENIED');
        const sharedTexts = texts && Object.keys(texts).length > 0 ? { texts } : {};
        const payload: CallLiveFrameSelectedEvent = {
          callId,
          userId: sender.userId,
          frameId,
          ...sharedTexts,
          ...(reply ? { reply } : {}),
          at: now().toISOString(),
        };
        if (sender.activeParticipants === DUO) {
          socket.to(ROOMS.call(callId)).emit(SERVER_EVENTS.CALL_FRAME_SELECTED, payload);
          return ACCEPTED;
        }
        const recipients = await deps.groupRecipients(callId);
        recipients
          .filter((recipient) => recipient.socketId !== socket.id && recipient.capabilities.has(GROUP_CAPABILITY))
          .forEach((recipient) => recipient.emit(payload));
        return ACCEPTED;
      },
    })
  );
}
