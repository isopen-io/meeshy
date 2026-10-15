import {
  MEMBER_COUNT_DISPLAY_CAP,
  canViewExactMemberCount,
  presentMemberCount,
} from '@meeshy/shared/utils/member-visibility';
import {
  emitToConversationParticipants,
  participantUserRooms,
  type ConversationRoomEmitter,
  type ParticipantRoomTarget,
} from './emitToConversationParticipants';
import { emitServerEvent, type ServerEventName, type ServerEventPayload } from './serverEmit';
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';

/**
 * Un destinataire du fanout d'effectif, avec les DEUX titres qui ouvrent la
 * valeur entière : `role` est le rôle dans la conversation (creator/admin),
 * `user.role` le rôle plateforme (MODERATOR et au-dessus). Tous deux optionnels
 * — un `select` qui les oublie fait retomber le destinataire du côté plafonné,
 * c'est-à-dire sur le comportement d'avant.
 */
export type MemberCountAudienceTarget = ParticipantRoomTarget & {
  readonly role?: string | null;
  readonly user?: { readonly role?: string | null } | null;
};

const seesExactCount = (participant: MemberCountAudienceTarget): boolean =>
  canViewExactMemberCount({
    platformRole: participant.user?.role ?? null,
    conversationRole: participant.role ?? null,
  });

/**
 * Les événements dont le SUJET (`payload.userId`) cesse d'être participant :
 * ses appareils apprennent le départ, jamais l'effectif d'une conversation
 * qui n'est plus la sienne.
 */
const DEPARTURE_EVENTS: ReadonlySet<string> = new Set([
  SERVER_EVENTS.CONVERSATION_PARTICIPANT_LEFT,
  SERVER_EVENTS.CONVERSATION_PARTICIPANT_BANNED,
]);

function emitToRooms<E extends ServerEventName>(
  io: ConversationRoomEmitter,
  rooms: readonly string[],
  event: E,
  payload: ServerEventPayload<E>,
): void {
  const [firstRoom, ...otherRooms] = rooms;
  if (!firstRoom) return;
  let emitter = io.to(firstRoom);
  for (const room of otherRooms) emitter = emitter.to(room);
  // Même porte que `emitToConversationParticipants` : `emitServerEvent` lie
  // l'événement et son payload par le contrat partagé jusqu'au fil.
  emitServerEvent(emitter, event, payload);
}

/**
 * Le fanout d'un événement qui PORTE l'effectif de la conversation.
 *
 * #10205, FAIL-CLOSED — l'audience de l'effectif se RÉSOUT au moment de
 * l'émission, depuis les participants que l'appelant vient de relire : les
 * seuls COMPTES (`userId` posé) encore participants, adressés par leur room
 * PERSONNELLE `user:<User.id>`, que seules leurs sockets authentifiées par JWT
 * rejoignent. La room du FIL n'est JAMAIS nommée dans une chaîne qui porte
 * l'effectif : un invité y siège (#10205), et une socket peut y rester après
 * un départ, le temps que l'éviction asynchrone la retire. Elle reçoit une
 * copie SANS effectif, qui EXCLUT toutes les rooms déjà servies — une copie
 * par socket, jamais deux.
 *
 * Deux présentations de l'effectif, comme `broadcastReadStatus` : PLAFONNÉE
 * (« 199+ ») pour les comptes ordinaires, ENTIÈRE pour ceux que
 * `canViewExactMemberCount` autorise ; sous le plafond, elles sont identiques et
 * partent dans une chaîne unique.
 *
 * Le sujet d'un départ (`DEPARTURE_EVENTS`) n'est plus participant : ses
 * appareils reçoivent la copie sans effectif, par sa room personnelle.
 */
export function emitConversationMemberCountEvent<E extends ServerEventName>(params: {
  io: ConversationRoomEmitter | null | undefined;
  conversationId: string;
  participants: ReadonlyArray<MemberCountAudienceTarget>;
  /**
   * L'événement, contraint au CONTRAT partagé : une chaîne libre y passerait un
   * événement que personne ne déclare, et le client ne l'écouterait jamais.
   */
  event: E;
  payload: Record<string, unknown>;
  memberCount: number;
}): void {
  const { io, conversationId, participants, event, payload, memberCount } = params;
  if (!io) return;

  const departedUserId = DEPARTURE_EVENTS.has(event) && typeof payload.userId === 'string' ? payload.userId : null;
  const isCountedAccount = (participant: MemberCountAudienceTarget): boolean =>
    Boolean(participant.userId) && participant.userId !== departedUserId;
  const accounts = participants.filter(isCountedAccount);

  const allRooms = participantUserRooms(accounts);
  const exactRooms = memberCount <= MEMBER_COUNT_DISPLAY_CAP ? [] : participantUserRooms(accounts.filter(seesExactCount));
  const cappedRooms = allRooms.filter((room) => !exactRooms.includes(room));

  emitToRooms(io, cappedRooms, event, { ...payload, ...presentMemberCount(memberCount) } as ServerEventPayload<E>);
  emitToRooms(io, exactRooms, event, {
    ...payload,
    ...presentMemberCount(memberCount, { viewerSeesExactCount: true }),
  } as ServerEventPayload<E>);

  emitToConversationParticipants({
    io,
    conversationId,
    participants: participants.filter((participant) => !isCountedAccount(participant)),
    event,
    payload: payload as ServerEventPayload<E>,
    exceptRooms: allRooms,
  });
}
