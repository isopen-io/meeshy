import { ROOMS } from '@meeshy/shared/types/socketio-events';

/**
 * A conversation participant, reduced to the two identities a room name can be
 * built from. `userId` is null for a participant with no account — the ONLY
 * reason `id` is here.
 */
export interface ParticipantRoomTarget {
  readonly id: string;
  readonly userId: string | null;
}

/**
 * The Socket.IO broadcast operator, kept structural so it accepts the typed
 * server, the manager's nullable `getIO()` and a test double alike. `to()`
 * returns something that can be chained AND emitted on — that is exactly
 * Socket.IO's `BroadcastOperator`.
 */
export interface ConversationRoomBroadcast {
  to(room: string): ConversationRoomBroadcast;
  emit(event: string, payload: unknown): void;
}

export interface ConversationRoomEmitter {
  to(room: string): ConversationRoomBroadcast;
}

/**
 * The single chained room fan-out for an event that concerns a whole
 * conversation.
 *
 * Two properties, and both matter:
 *
 *  1. **Chaining, not looping.** `io.to(a).to(b).emit(...)` makes Socket.IO
 *     deliver the event AT MOST ONCE per socket. A socket sitting in the
 *     conversation room and in its own user room would otherwise receive two
 *     copies, and a client that increments anything on receipt would double it.
 *  2. **A participant is addressed by `userId ?? id`.** A participant with no
 *     `User` row still has a personal room, and `AuthHandler` says so in the
 *     comment that put it there: it joins `ROOMS.user(participant.id)` for an
 *     anonymous socket precisely because that is "the only room every
 *     personal-event emitter targets (`io.to(ROOMS.user(participant.userId ??
 *     participant.id))`)", and because joining anything else had already left
 *     anonymous participants without their unread badge. Addressing by `userId`
 *     alone therefore does not skip a room that does not exist — it skips one
 *     that does.
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
  if (!io) return [];

  const conversationRoom = ROOMS.conversation(conversationId);
  const rooms = [conversationRoom];
  const seen = new Set<string>(rooms);

  let emitter = io.to(conversationRoom);
  for (const participant of participants) {
    const room = ROOMS.user(participant.userId ?? participant.id);
    if (seen.has(room)) continue;
    seen.add(room);
    rooms.push(room);
    emitter = emitter.to(room);
  }

  for (const event of events) emitter.emit(event, payload);

  return rooms;
}
