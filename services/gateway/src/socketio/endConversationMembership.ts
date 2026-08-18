/**
 * Ce que la FIN D'UNE APPARTENANCE doit faire, en un seul endroit.
 *
 * ─── Pourquoi cette unité existe ─────────────────────────────────────────────
 *
 * Quatre chemins mettent fin à l'appartenance d'un membre à une conversation qui,
 * elle, CONTINUE de vivre — quitter (`leave.ts`), être banni (`ban.ts`), être
 * retiré par un modérateur (`participants.ts`), supprimer le fil pour soi
 * (`delete-for-me.ts`). Les quatre portaient ensuite la MÊME paire de gestes,
 * recopiée quatre fois et alignée à la main : sortir les sockets du partant de
 * la room de conversation, puis invalider son cache d'appartenance.
 *
 * Le dépôt a payé trois fois ce genre d'alignement — cycle 67 (`leave.ts` seul à
 * n'écrire qu'`isActive: false`), cycle 71 (une règle appliquée à un verbe quand
 * quatre l'exigeaient), cycle 73 (trois clôtures qui ANNONÇAIENT sans rien
 * éteindre). La leçon commune n'est pas « mieux relire » : une décision répétée
 * à N endroits diverge en N-1 endroits, et le remède est de n'avoir qu'un
 * endroit. **Sortir quelqu'un d'un fil n'est pas « le retirer d'une room » :
 * c'est éteindre ce qu'il y tenait de vivant, PUIS l'en sortir.**
 *
 * ─── La fin que les quatre chemins oubliaient ───────────────────────────────
 *
 * Le cycle 73 a couvert la mort du CONTENEUR. Il restait la fin qui ne tue pas
 * le conteneur mais en sort le partageur, et elle porte un coût que la clôture
 * n'a pas : le sortant perd en sortant le pouvoir même d'arrêter.
 * `LocationHandler.handleLiveLocationStop` commence par résoudre l'appartenance
 * (`isActive: true`) — la sortie fait donc taire le SEUL verbe capable de
 * retirer l'épingle, et il tombe en silence. La position réelle du sortant
 * restait affichée dans un groupe dont il ne fait plus partie, figée sur sa
 * dernière valeur connue, jusqu'à huit heures (`durationMinutes` ≤ 480). Sur une
 * fonction dont le contrat entier est « voici où je suis MAINTENANT », c'est un
 * défaut de sécurité avant d'être un défaut d'affichage — l'en-tête de
 * `LocationHandler` chiffre déjà exactement cette phrase pour la mort du socket.
 *
 * ─── L'ORDRE, et pourquoi il n'est pas indifférent ──────────────────────────
 *
 * L'extinction précède la sortie des rooms, et le témoin la tient. `location:
 * live-stopped` est diffusé à `ROOMS.conversation(...)` — toute la room,
 * partageur COMPRIS, parce qu'il porte une décision du SERVEUR et non le geste
 * d'un pair. C'est le seul point d'accroche par lequel l'appareil du sortant
 * apprend qu'il doit cesser d'émettre : évincé d'abord, il garderait son GPS
 * allumé pour un partage que plus personne ne reçoit.
 *
 * C'est le miroir exact de l'ordre imposé par `announceConversationClosed`, avec
 * l'autre raison : là, éteindre avant d'annoncer parce que les clients OUBLIENT
 * la conversation sur l'annonce ; ici, éteindre avant d'évincer parce que le
 * sortant QUITTE la room par laquelle on l'atteint.
 *
 * ─── Ce que cette unité ne fait PAS ─────────────────────────────────────────
 *
 * Elle n'ÉCRIT rien et n'annonce rien. Les quatre appelants committent leur
 * propre écriture (`leftAt`, `bannedAt`, `deletedForMe`) et diffusent leur
 * propre événement — `conversation:participant-left`,
 * `conversation:participant-banned`, `conversation:deleted` sont des faits
 * DIFFÉRENTS, avec des audiences et des charges utiles différentes. Ce qui
 * converge ici est le seul geste qu'ils ont en commun : la fin d'appartenance
 * elle-même.
 *
 * L'appel vient donc APRÈS l'annonce de chaque route, sauf là où l'ordre
 * historique plaçait déjà l'éviction avant : une annonce vise les rooms
 * personnelles autant que celle du fil, et ne dépend pas de l'appartenance.
 */

import { ROOMS } from '@meeshy/shared/types/socketio-events';

/** Un socket, réduit au seul verbe dont cette unité a besoin. */
interface LeavableSocket {
  leave(room: string): void | Promise<void>;
}

/**
 * L'accès aux sockets d'une room, en structural — pour que le vrai serveur
 * Socket.IO et un double de test soient tous deux acceptés.
 */
export interface MembershipRoomReader {
  in(room: string): { fetchSockets(): Promise<ReadonlyArray<LeavableSocket>> };
}

/**
 * L'état par membre que le gestionnaire porte. Les deux méthodes sont
 * OPTIONNELLES : `getManager()` rend un type que les routes traitent déjà comme
 * faillible, et une passerelle sans gestionnaire de sockets n'a par construction
 * ni partage en cours à éteindre ni cache à invalider.
 */
export interface DepartedMemberEphemeralState {
  endLiveLocationForDepartedMember?(conversationId: string, userId: string): void;
  invalidateParticipantCache?(userId: string, conversationId: string): void;
}

export interface ConversationMembershipEnd {
  readonly io: MembershipRoomReader | null | undefined;
  readonly manager: DepartedMemberEphemeralState | null | undefined;
  readonly conversationId: string;
  /**
   * L'identifiant qui NOMME la room personnelle du partant — `User.id` pour un
   * compte, `Participant.id` pour un invité de lien partagé. C'est la même clé
   * que celle du registre des partages (`SocketUser.id`), les deux se lisent
   * donc sans conversion.
   */
  readonly userId: string;
}

/** Éteint, puis sort, puis invalide. */
export async function endConversationMembership(
  params: ConversationMembershipEnd
): Promise<void> {
  const { io, manager, conversationId, userId } = params;

  // Éteint AVANT d'évincer (cf. l'en-tête), et indépendamment des sockets
  // présents : le registre des partages est un état SERVEUR, il ne se vide pas
  // parce que le partant n'a plus d'appareil connecté.
  manager?.endLiveLocationForDepartedMember?.(conversationId, userId);

  if (io) {
    const userSockets = await io.in(ROOMS.user(userId)).fetchSockets();
    await Promise.all(userSockets.map(socket => socket.leave(ROOMS.conversation(conversationId))));
  }

  // Le cache d'appartenance (5 min) laisserait sinon le partant écrire dans le
  // fil pendant toute sa fenêtre.
  manager?.invalidateParticipantCache?.(userId, conversationId);
}
