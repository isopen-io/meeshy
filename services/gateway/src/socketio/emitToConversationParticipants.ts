import { ROOMS } from '@meeshy/shared/types/socketio-events';
import { emitServerEvent, type ServerEmitArgs, type ServerEventName, type ServerEventPayload } from './serverEmit';

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
  except(room: string): ConversationRoomBroadcast;
  emit(...args: ServerEmitArgs): unknown;
}

export interface ConversationRoomEmitter {
  to(room: string): ConversationRoomBroadcast;
}

/**
 * The personal rooms a participant list maps to, deduped, in list order.
 *
 * `userId ?? id` is the entire point — see the note on
 * `emitToConversationParticipants` below for why an accountless participant's
 * room is named after its `Participant.id`, and why addressing by `userId`
 * alone skips a room that EXISTS rather than one that does not.
 *
 * Two families of emitter need these rooms and they do NOT share an emit
 * shape: the read/delivery receipts chain the conversation room together with
 * the personal ones (`emitToConversationParticipants`), while
 * `conversation:updated` addresses personal rooms ONLY — a conversation-room
 * copy would be redundant for anyone already looking at the thread, whose list
 * row is not on screen. Sharing the emit loop would have forced one shape onto
 * the other; sharing the room list is what they actually have in common, and it
 * is the only line every copy of this code got wrong.
 *
 * `seed` pre-fills both the result and the dedupe set, so a caller that also
 * targets the conversation room cannot reach a socket sitting in both twice.
 */
export function participantUserRooms(
  participants: ReadonlyArray<ParticipantRoomTarget>,
  seed: ReadonlyArray<string> = [],
): string[] {
  return [...seed, ...participantUserRoomTargets(participants, seed).map((target) => target.room)];
}

/**
 * The same deduped room list, but each room paired with the participant that
 * NAMED it — for the emitters that build a payload PER RECIPIENT rather than
 * one payload shared by the whole fan-out.
 *
 * `conversation:updated` is exactly that case: its last-message preview
 * translations are filtered to the reader's own Prisme (see
 * `resolveLastMessagePreviewPrism`), so two participants with different
 * language preferences must not receive the same map.
 *
 * This is where the dedupe rule now lives, and `participantUserRooms` is a
 * projection of it — the two cannot drift, which matters because `userId ?? id`
 * is, in this file's own words, "the only line every copy of this code got
 * wrong". A room already present in `seed` is skipped here too, so a caller
 * that seeds the conversation room never builds a second payload for it.
 */
export function participantUserRoomTargets<T extends ParticipantRoomTarget>(
  participants: ReadonlyArray<T>,
  seed: ReadonlyArray<string> = [],
): Array<{ room: string; participant: T }> {
  const seen = new Set<string>(seed);
  const targets: Array<{ room: string; participant: T }> = [];
  for (const participant of participants) {
    // Neither identity present means no room CAN be named — a caller whose
    // `select` forgot both would otherwise blast every event at the single
    // room `user:undefined`, where any socket that ever joined it receives
    // every conversation's traffic. The type says this cannot happen; the
    // partial selects this function exists to fix say otherwise.
    const key = participant.userId ?? participant.id;
    if (!key) continue;
    const room = ROOMS.user(key);
    if (seen.has(room)) continue;
    seen.add(room);
    targets.push({ room, participant });
  }
  return targets;
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
 * `exceptRooms` takes rooms back out of the fan-out, and exists for the
 * emitter that has two audiences for one event: a payload for the peers, and a
 * different one for the others. Dropping their personal rooms from the chain
 * is not enough — the conversation room is chained too, and it holds their
 * sockets whenever they have the thread open, which would hand them the
 * peer copy on top of their own. `.except()` removes them from the WHOLE chain,
 * so each socket still receives the event exactly once (property 1 above), and
 * the caller is free to emit the other version to their `ROOMS.user(...)` after.
 * The returned room list honors the exclusion, so a log never claims a room the
 * emit did not serve.
 *
 * PLURIEL parce que la seconde audience n'est pas toujours une personne : le
 * fanout d'effectif (`emitConversationMemberCount`) sert l'entier à TOUS les
 * lecteurs autorisés d'un fil — plusieurs admins de groupe, plusieurs
 * modérateurs plateforme — et devait donc en exclure autant.
 *
 * Returns the rooms actually reached, in chain order, so a caller can log them
 * without rebuilding the set.
 *
 * `event` est au SINGULIER, et c'en est la troisième propriété. Le paramètre a
 * été pluriel tant qu'un appelant dual-émettait l'accusé de lecture sous deux
 * noms (`read-status:updated` + `message:read-status-updated`) : la boucle
 * rejouait alors la MÊME chaîne de rooms pour chaque nom, soit exactement deux
 * fois les octets et deux réveils radio par socket destinataire. L'alias n'a
 * jamais eu de client (cycle 64), et une fois retiré les douze appelants
 * passaient tous un tableau d'UN élément — c'est-à-dire que le pluriel ne
 * servait plus qu'à rendre le doublement exprimable en un caractère, sur le
 * fan-out le plus fréquent de la messagerie. Un second nom se réintroduit
 * maintenant par un second appel, qui se voit en revue.
 */
export function emitToConversationParticipants<E extends ServerEventName>(params: {
  io: ConversationRoomEmitter | null | undefined;
  conversationId: string;
  participants: ReadonlyArray<ParticipantRoomTarget>;
  event: E;
  payload: ServerEventPayload<E>;
  /**
   * Salons a EXCLURE de la diffusion. Pluriel depuis le lot « effectif exact » :
   * un meme evenement peut devoir sauter PLUSIEURS salons — ceux des lecteurs qui
   * recoivent deja une variante du payload par une autre chaine.
   */
  exceptRooms?: ReadonlyArray<string> | null;
}): string[] {
  const { io, conversationId, participants, event, payload, exceptRooms } = params;
  if (!io) return [];

  const conversationRoom = ROOMS.conversation(conversationId);
  const excluded = new Set(exceptRooms ?? []);
  // Seeding with the conversation room makes it `rooms[0]` AND protects it from
  // being chained twice by a participant that somehow named it. It is already
  // on the emitter below, so the chain resumes at the personal rooms after it.
  // The exclusion can only ever remove a PERSONAL room — it is named after an
  // identity, never after a conversation — so `rooms[0]` survives the filter.
  const rooms = participantUserRooms(participants, [conversationRoom]).filter(
    (room) => !excluded.has(room)
  );

  let emitter = io.to(conversationRoom);
  for (const room of rooms.slice(1)) emitter = emitter.to(room);
  for (const room of excluded) emitter = emitter.except(room);

  emitServerEvent(emitter, event, payload);

  return rooms;
}
