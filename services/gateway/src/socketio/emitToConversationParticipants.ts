import { ROOMS } from '@meeshy/shared/types/socketio-events';
import {
  emitToParticipantRooms,
  type ParticipantRoomBroadcast,
  type ParticipantRoomEmitter,
  type ParticipantRoomTarget,
} from './emitToParticipantRooms';

export type { ParticipantRoomTarget };

/**
 * The Socket.IO broadcast operator, kept structural so it accepts the typed
 * server, the manager's nullable `getIO()` and a test double alike. `to()`
 * returns something that can be chained AND emitted on — that is exactly
 * Socket.IO's `BroadcastOperator`.
 */
export type ConversationRoomBroadcast = ParticipantRoomBroadcast;
export type ConversationRoomEmitter = ParticipantRoomEmitter;

/**
 * The single chained room fan-out for an event that concerns a whole
 * conversation.
 *
 * This is `emitToParticipantRooms` seeded with the conversation room, so the
 * two properties that matter both come from there: the chain delivers AT MOST
 * ONCE per socket (a socket in both the conversation room and its own user room
 * would otherwise get two copies, and a client that increments on receipt would
 * double it), and a participant is addressed by `userId ?? id`.
 *
 * This existed in THREE verbatim copies — `MessageHandler`'s auto-deliver
 * receipt, `routes/message-read-status.ts`, `routes/conversations/messages.ts` —
 * all three carrying `if (!p.userId) continue`, so an anonymous participant
 * received no read receipt and no delivery receipt from any peer, on any
 * transport. Two of the three did not even SELECT `Participant.id`, so the
 * fallback identity was not ignored, it was never read.
 *
 * The conversation room is NOT a substitute for the personal room, which is the
 * whole reason the chain exists: a client that navigates away from the
 * conversation leaves `conversation:<id>` and is reachable only through
 * `user:<id>`. An anonymous recipient sitting in the conversation list was
 * therefore the exact case the fan-out dropped.
 *
 * The correct form already existed one file away, in
 * `emitUnreadCountsToRecipients` (`ROOMS.user(recipient.userId ?? recipient.id)`),
 * which is what makes this an extraction rather than an invention.
 *
 * Returns the rooms actually reached, in chain order, so a caller can log them
 * without rebuilding the set.
 */
export function emitToConversationParticipants(params: {
  io: ConversationRoomEmitter | null | undefined;
  conversationId: string;
  participants: ReadonlyArray<ParticipantRoomTarget>;
  events: ReadonlyArray<string>;
  payload: unknown;
}): string[] {
  const { io, conversationId, participants, events, payload } = params;

  return emitToParticipantRooms({
    io,
    participants,
    events,
    payload,
    seedRooms: [ROOMS.conversation(conversationId)],
  });
}
