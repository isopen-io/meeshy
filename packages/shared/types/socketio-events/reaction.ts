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
 * agrégés (emoji→count) de l'attachment APRÈS l'action. Le client met à jour les
 * comptes ; l'état « ma réaction » reste maintenu côté client via
 * `currentUserReactions` (optimiste + re-baké au cold-load REST), miroir des
 * réactions message-level.
 */
export interface AttachmentReactionUpdateEventData {
  readonly attachmentId: string;
  readonly messageId: string;
  readonly conversationId: string;
  readonly participantId: string;
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
