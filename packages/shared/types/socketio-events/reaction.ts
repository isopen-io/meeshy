/**
 * Le domaine REACTION : mise à jour incrémentale, instantané de
 * réconciliation, réactions de pièce jointe, et les charges client.
 *
 * @see ../socketio-events.ts — la façade qui garde l'adresse historique.
 */

// La ligne de réaction persistée — ce que l'accusé de `reaction:add` porte.
import type { ReactionUpdateEvent } from '../reaction.js';

/**
 * Données pour l'événement de mise à jour de réaction.
 *
 * C'est `ReactionUpdateEvent` (`./reaction`), pas une seconde déclaration : les
 * deux ont vécu comme jumelles structurelles dans deux fichiers qui ne se citent
 * pas, avec le risque de DÉRIVE que ça porte — `ReactionService.createUpdateEvent`
 * rend l'une, le contrat de diffusion déclarait l'autre, et rien n'obligeait les
 * deux à rester d'accord. Un alias supprime la question.
 */
export type ReactionUpdateEventData = ReactionUpdateEvent;

/**
 * Données pour l'événement de synchronisation des réactions
 */
export interface ReactionSyncEventData {
  readonly messageId: string;
  readonly reactions: readonly {
    readonly emoji: string;
    readonly count: number;
    readonly participantIds: readonly string[];
    readonly hasCurrentUser: boolean;
  }[];
  readonly totalCount: number;
  readonly userReactions: readonly string[];
}

/**
 * BUG2 A' — delta de réaction par-image. `reactionSummary` porte les comptes
 * agrégés (emoji→count) de l'attachment APRÈS l'action. Le client met à jour
 * les comptes ; il dérive « ma réaction » de `userId`, comme sur la jumelle
 * message-level (`ReactionUpdateEvent`).
 *
 * **Ce doc-comment affirmait l'inverse jusqu'à #18124** — « l'état *ma
 * réaction* reste maintenu côté client via `currentUserReactions` (optimiste
 * + re-baké au cold-load REST) ». C'était vrai de l'appareil qui RÉAGIT, et
 * faux de tous les autres : un optimisme local ne peut pas reconnaître la
 * réaction qu'on vient de poser depuis un SECOND appareil, et le re-bake REST
 * n'a lieu qu'au chargement complet. C'est exactement la raison pour laquelle
 * la jumelle message-level porte `userId` — la phrase qui exemptait celle-ci
 * ne disait pas pourquoi elle s'en passerait.
 */
export interface AttachmentReactionUpdateEventData {
  readonly attachmentId: string;
  readonly messageId: string;
  readonly conversationId: string;
  readonly participantId: string;
  /**
   * `User.id` du réacteur — la clé par laquelle un AUTRE appareil du MÊME
   * compte reconnaît sa propre réaction dans l'écho temps réel. Même rôle, et
   * même raison, que `ReactionUpdateEvent.userId` : comparer `participantId`
   * à un `User.id` échoue TOUJOURS (ObjectIds de deux collections, jamais
   * égaux).
   *
   * **`null` pour un invité de lien partagé**, qui n'a pas de ligne `User` :
   * y recopier sa clé de participant publierait un `Participant.id` sous un
   * champ qui déclare un `User.id`, et c'est précisément la confusion que ce
   * champ existe pour éviter. Un invité garde donc le comportement d'avant ce
   * lot — son optimisme local, et rien de plus.
   *
   * Optionnel au TYPE pour la compatibilité descendante : une entrée de file
   * hors ligne écrite avant #18124 est rejouée telle qu'elle a été stockée, et
   * un serveur d'avant ce lot ne le sert pas. Tout émetteur le pose.
   */
  readonly userId?: string | null;
  readonly emoji: string;
  readonly action: 'add' | 'remove';
  readonly reactionSummary: Readonly<Record<string, number>>;
  readonly timestamp: string;
}

/**
 * Données pour ajouter une réaction
 */
export interface ReactionAddData {
  readonly messageId: string;
  readonly emoji: string;
}

/**
 * Données pour retirer une réaction
 */
export interface ReactionRemoveData {
  readonly messageId: string;
  readonly emoji: string;
}
