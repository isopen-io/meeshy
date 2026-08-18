/**
 * Ce que la CLÔTURE d'une conversation doit faire, en un seul endroit.
 *
 * ─── Pourquoi cette unité existe ─────────────────────────────────────────────
 *
 * Trois chemins ferment une conversation — `DELETE /conversations/:id`
 * (`core.ts`), le départ du dernier membre (`leave.ts`), et la suppression pour
 * soi qui emporte le fil (`delete-for-me.ts`). Les trois écrivaient
 * `{ isActive: false, closedAt, closedBy }` puis diffusaient `conversation:closed`
 * par une copie chacun du MÊME appel, alignées à la main et alignées trois fois.
 *
 * Le cycle 67 a payé cet alignement une première fois : `leave.ts` n'écrivait
 * qu'`isActive: false` là où ses deux jumeaux posaient les trois champs, et
 * l'écart a tenu trente-sept cycles. Le cycle 71 a payé le même prix sous une
 * autre forme — une règle appliquée à UN verbe quand quatre l'exigeaient.
 *
 * La leçon commune n'est pas « mieux relire » : c'est qu'une décision répétée à
 * N endroits diverge en N-1 endroits, et que le remède est de n'avoir qu'un
 * endroit. **Fermer un fil n'est pas « émettre un événement » : c'est éteindre
 * ce que le fil portait de vivant, PUIS l'annoncer.** Le prochain chemin de
 * clôture héritera des deux parce qu'il n'y a plus qu'une façon d'annoncer.
 *
 * ─── L'ORDRE, et pourquoi il n'est pas indifférent ──────────────────────────
 *
 * L'extinction précède l'annonce. Les clients RETIRENT la conversation de leur
 * cache en recevant `conversation:closed` (web `use-socket-cache-sync`, iOS
 * `SocialSocketManager`) : un `location:live-stopped` émis après tomberait sur
 * un fil qu'ils ne connaissent plus, et l'épingle resterait à l'écran — ou pire,
 * dans un état dont plus aucun écran ne permet de sortir.
 *
 * ─── Ce que cette unité ne fait PAS ─────────────────────────────────────────
 *
 * Elle n'ÉCRIT rien et ne décide rien : les trois appelants commettent leur
 * clôture dans leur propre transaction, chacune ayant ses règles (ownership,
 * audience, masquage), et l'appellent APRÈS — une annonce ne précède jamais la
 * durabilité du fait qu'elle annonce.
 *
 * Elle ne termine pas les APPELS en cours du fil. C'est une décision produit
 * ouverte (cycle 72, § 6, piste 1) et non un oubli : raccrocher au nez de gens
 * qui se parlent serait une régression, là où une épingle de position figée dans
 * un fil mort est le défaut de sécurité que `LocationHandler` documente déjà.
 *
 * Elle ne couvre pas non plus la fin d'APPARTENANCE — le membre qui sort d'un
 * fil qui, lui, continue de vivre. C'est une fin distincte, ni celle de l'objet
 * ni celle du conteneur mais celle du LIEN entre les deux, et elle a son propre
 * point de convergence : `endConversationMembership.ts`, unité jumelle de
 * celle-ci, dont l'ordre est contraint pour l'autre raison.
 */

import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import {
  emitToConversationParticipants,
  type ConversationRoomEmitter,
  type ParticipantRoomTarget,
} from './emitToConversationParticipants';

/**
 * L'état éphémère par conversation que le gestionnaire porte, en structural —
 * pour que le vrai `MeeshySocketIOManager`, sa forme nullable rendue par
 * `getManager()`, et un double de test soient tous acceptés sans import
 * circulaire.
 *
 * La méthode est OPTIONNELLE : `getManager()` rend un type que les routes
 * traitent déjà comme faillible, et une passerelle sans gestionnaire de sockets
 * n'a par construction aucun partage en cours à éteindre.
 */
export interface ClosedConversationEphemeralState {
  endLiveLocationsForClosedConversation?(conversationId: string): void;
}

export interface ConversationClosureAnnouncement {
  readonly io: ConversationRoomEmitter | null | undefined;
  readonly manager: ClosedConversationEphemeralState | null | undefined;
  readonly conversationId: string;
  /** Les membres à prévenir — ceux que l'appelant tenait pour ACTIFS à l'écriture. */
  readonly participants: ReadonlyArray<ParticipantRoomTarget>;
  readonly closedBy: string;
  readonly closedAt: Date;
}

/**
 * Éteint puis annonce. Rend les rooms effectivement servies, comme
 * `emitToConversationParticipants`, pour qu'un appelant puisse les journaliser
 * sans reconstruire l'ensemble.
 */
export function announceConversationClosed(
  params: ConversationClosureAnnouncement
): string[] {
  const { io, manager, conversationId, participants, closedBy, closedAt } = params;

  // Éteint AVANT d'annoncer (cf. l'en-tête), et indépendamment de l'audience :
  // le registre des partages est un état SERVEUR, il ne se vide pas parce qu'il
  // ne reste personne à prévenir.
  manager?.endLiveLocationsForClosedConversation?.(conversationId);

  // Une audience vide ne diffuse rien : c'est la garde que deux des trois
  // appelants portaient déjà en propre, et l'annonce n'a pas de destinataire
  // hors des membres actifs.
  if (participants.length === 0) return [];

  return emitToConversationParticipants({
    io,
    conversationId,
    participants,
    event: SERVER_EVENTS.CONVERSATION_CLOSED,
    payload: { conversationId, closedBy, closedAt: closedAt.toISOString() },
  });
}
