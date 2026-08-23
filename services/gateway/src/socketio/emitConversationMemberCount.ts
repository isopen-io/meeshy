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
 * Le fanout d'un événement qui PORTE l'effectif de la conversation.
 *
 * Un broadcast unique ne pouvait porter qu'une seule présentation, et c'était
 * la plafonnée : sur un groupe de 250 personnes, l'admin qui venait de lire
 * l'effectif entier par REST le voyait retomber à « 199+ » au premier
 * départ — le canal partagé DÉGRADAIT ce que la règle produit accorde, et les
 * deux clients PERSISTENT cette valeur (cache disque iOS, `staleTime: Infinity`
 * web) jusqu'au prochain fetch.
 *
 * D'où deux chaînes disjointes, exactement la forme de `broadcastReadStatus` :
 *
 *  1. l'éventail PLAFONNÉ porte la room du fil et les rooms personnelles des
 *     non-autorisés, en EXCLUANT (`.except()`) les rooms des autorisés — sans
 *     quoi un autorisé qui a le fil ouvert recevrait la copie plafonnée par la
 *     room de conversation, en plus de la sienne ;
 *  2. la chaîne ENTIÈRE ne porte que les rooms personnelles des autorisés.
 *
 * La propriété « au plus une copie par socket » tient donc des deux côtés. Un
 * socket qui ne serait dans AUCUNE room personnelle reste servi par la room du
 * fil, plafonné : la dégradation est le comportement d'avant, jamais un silence.
 *
 * SOUS LE PLAFOND, la scission n'a rien à séparer : `presentMemberCount` rend
 * `{ memberCount }` à l'identique aux deux audiences, drapeau compris (absent).
 * Une conversation de douze personnes — l'immense majorité des fanouts — payait
 * alors deux parcours de la liste des participants, deux chaînes de rooms et
 * deux emits pour livrer deux fois le même octet. D'où le chemin rapide
 * ci-dessous : une chaîne UNIQUE, sans exclusion, exactement le fanout d'avant
 * ce lot. La borne est celle du plafond lui-même (`<=`), donc les deux formes
 * ne peuvent pas diverger sur une valeur.
 */
export function emitConversationMemberCountEvent<E extends ServerEventName>(params: {
  io: ConversationRoomEmitter | null | undefined;
  conversationId: string;
  participants: ReadonlyArray<MemberCountAudienceTarget>;
  /**
   * L'événement, contraint au CONTRAT partagé depuis que
   * `emitToConversationParticipants` est générique : une chaîne libre y
   * passerait un événement que personne ne déclare, et le client ne l'écouterait
   * jamais — sans que rien ne rougisse. Le générique propage simplement la
   * contrainte au lieu de la casser ici.
   */
  event: E;
  payload: Record<string, unknown>;
  memberCount: number;
}): void {
  const { io, conversationId, participants, event, payload, memberCount } = params;
  if (!io) return;

  if (memberCount <= MEMBER_COUNT_DISPLAY_CAP) {
    emitToConversationParticipants({
      io,
      conversationId,
      participants,
      event,
      payload: { ...payload, ...presentMemberCount(memberCount) } as ServerEventPayload<E>,
    });
    return;
  }

  const exactRooms = participantUserRooms(participants.filter(seesExactCount));

  emitToConversationParticipants({
    io,
    conversationId,
    participants: participants.filter((participant) => !seesExactCount(participant)),
    event,
    payload: { ...payload, ...presentMemberCount(memberCount) } as ServerEventPayload<E>,
    exceptRooms: exactRooms,
  });

  const [firstRoom, ...otherRooms] = exactRooms;
  if (!firstRoom) return;

  let emitter = io.to(firstRoom);
  for (const room of otherRooms) emitter = emitter.to(room);
  // Même porte que `emitToConversationParticipants` : `emitServerEvent` plutôt
  // qu'un `.emit()` nu, pour que l'événement et son payload restent liés par le
  // contrat partagé jusqu'au fil.
  emitServerEvent(emitter, event, {
    ...payload,
    ...presentMemberCount(memberCount, { viewerSeesExactCount: true }),
  } as ServerEventPayload<E>);
}
