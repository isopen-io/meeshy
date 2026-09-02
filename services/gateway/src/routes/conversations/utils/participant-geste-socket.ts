import type { ConversationRoomEmitter } from '../../../socketio/emitToConversationParticipants';
import type {
  DepartedMemberEphemeralState,
  MembershipRoomReader,
} from '../../../socketio/endConversationMembership';

/**
 * **La passerelle Socket.IO telle que les NOYAUX de gestes la voient** (#4713).
 *
 * Les quatre gestes diffusent, et diffuser était jusqu'ici une raison
 * suffisante de connaître Fastify : `fastify.socketIOHandler` était lu DANS le
 * gestionnaire, donc rien de ce qui décidait ne pouvait s'appeler sans monter
 * un serveur. Le contrat ci-dessous est ce qui remplace cette dépendance — la
 * PASSERELLE voyage en paramètre, exactement comme `reader` voyage jusqu'à
 * `chargerPostsProches` (`routes/posts/nearby.ts`, #4346).
 *
 * ─── Pourquoi la passerelle, et pas le gestionnaire déjà résolu ─────────────
 *
 * Les trois fichiers d'origine appellent `getManager()` à des INSTANTS
 * différents et pour de bonnes raisons : `ban.ts` capture la passerelle à
 * l'enregistrement de la route, les deux autres la lisent par requête, et le
 * geste des droits résout son gestionnaire APRÈS l'écriture, pas avant.
 * Remettre un `manager` déjà résolu au noyau aurait déplacé cet instant sans
 * que personne ne le voie — c'est le genre d'écart qu'une extraction ne doit
 * pas produire. Le noyau reçoit donc la passerelle et fait l'appel là où le
 * gestionnaire le faisait.
 *
 * ─── Une SEULE forme pour les trois noyaux ──────────────────────────────────
 *
 * Trois interfaces structurelles écrites séparément divergeraient au premier
 * verbe ajouté. Celle-ci réunit ce que les trois consomment : la diffusion en
 * salle (`ConversationRoomEmitter`), la lecture des sockets d'une salle
 * (`MembershipRoomReader`, dont `endConversationMembership` a besoin), l'état
 * éphémère par membre et les deux verbes d'appartenance. Le vrai
 * `MeeshySocketIOManager` les satisfait tous ; un noyau qui n'en emploie qu'un
 * n'est pas gêné d'en déclarer davantage.
 */
export interface GestionnaireDeConversation extends DepartedMemberEphemeralState {
  /**
   * NON nullable, et c'est mesuré : `MeeshySocketIOManager.getIO()` rend
   * toujours un serveur, et `participant-role-core` appelle `getIO().to(…)`
   * SANS garde — le déclarer faillible ici forcerait un `?.` qui, lui, change
   * le comportement (un `getIO()` nul y lèverait, donc rendrait 500 ; avec le
   * `?.` il ne se passerait rien et la route rendrait 200). Les noyaux qui
   * gardent (`rights`, `ban`) le font sur le GESTIONNAIRE, pas sur `getIO()`.
   */
  getIO(): ConversationRoomEmitter & MembershipRoomReader;
  joinUserToConversationRoom(userId: string, conversationId: string): Promise<void>;
}

export interface PasserelleSocketDeConversation {
  getManager(): GestionnaireDeConversation | null | undefined;
}
