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
export interface ParticipantRoomBroadcast {
  to(room: string): ParticipantRoomBroadcast;
  emit(event: string, payload: unknown): void;
}

export interface ParticipantRoomEmitter {
  to(room: string): ParticipantRoomBroadcast;
}

/**
 * The single chained personal-room fan-out over the participants of a
 * conversation, and the one place that decides HOW a participant is addressed.
 *
 * Two properties, and both matter:
 *
 *  1. **A participant is addressed by `userId ?? id`.** A participant with no
 *     `User` row still has a personal room, and `AuthHandler` says so in the
 *     comment that put it there: it joins `ROOMS.user(participant.id)` for an
 *     anonymous socket precisely because that is "the only room every
 *     personal-event emitter targets". Addressing by `userId` alone therefore
 *     does not skip a room that does not exist — it skips one that does. A
 *     conversation opened through a share link is populated with ANONYMOUS
 *     participants, so this is not an edge case of the audience, it IS part of
 *     the audience.
 *  2. **Chaining, not looping.** `io.to(a).to(b).emit(...)` makes Socket.IO
 *     deliver the event AT MOST ONCE per socket, in a single emit rather than
 *     one per participant.
 *
 * `seedRooms` prepends rooms that are not derived from a participant — the
 * conversation room for a conversation-wide event. They take part in the same
 * dedup, so a participant already reached through a seed room is not addressed
 * twice.
 *
 * Returns the rooms actually reached, in chain order, so a caller can log them
 * without rebuilding the set.
 */
export function emitToParticipantRooms(params: {
  io: ParticipantRoomEmitter | null | undefined;
  participants: ReadonlyArray<ParticipantRoomTarget>;
  events: ReadonlyArray<string>;
  payload: unknown;
  seedRooms?: ReadonlyArray<string>;
}): string[] {
  const { io, participants, events, payload, seedRooms } = params;
  if (!io) return [];

  const seen = new Set<string>();
  const rooms: string[] = [];
  for (const room of seedRooms ?? []) {
    if (seen.has(room)) continue;
    seen.add(room);
    rooms.push(room);
  }
  for (const participant of participants) {
    const room = ROOMS.user(participant.userId ?? participant.id);
    if (seen.has(room)) continue;
    seen.add(room);
    rooms.push(room);
  }
  if (rooms.length === 0) return [];

  let emitter = io.to(rooms[0]);
  for (const room of rooms.slice(1)) emitter = emitter.to(room);
  for (const event of events) emitter.emit(event, payload);

  return rooms;
}
