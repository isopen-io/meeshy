/**
 * Types pour le système de réactions emoji sur les messages
 * @module shared/types/reaction
 */

/**
 * Payload pour ajouter ou retirer une réaction
 */
export interface ReactionPayload {
  readonly messageId: string;
  readonly emoji: string;
}

/**
 * Données complètes d'une réaction
 */
export interface ReactionData {
  readonly id: string;
  readonly messageId: string;
  readonly participantId: string;
  readonly emoji: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/**
 * Agrégation des réactions par emoji, dans la forme qu'elle peut prendre sur une
 * DIFFUSION — c'est-à-dire sans aucune réponse par-lecteur.
 *
 * Une diffusion de room n'a pas de lecteur : le même objet part vers tous les
 * participants. Un champ dont la valeur dépend de « qui regarde » n'y a donc
 * aucune valeur juste, et le calculer quand même ne peut le calculer que pour
 * l'ACTEUR. Les deux familles de réaction écrites APRÈS celle-ci l'énoncent
 * déjà — `PostReactionAggregation` (« NO userIds, NO hasCurrentUser ») et
 * `AttachmentReactionUpdateEventData.reactionSummary` (des comptes, l'état
 * « ma réaction » restant maintenu côté client).
 *
 * Ce que le lecteur peut en dériver lui-même est ici : `count` est absolu,
 * `participantIds` est la liste des réacteurs, et l'événement porteur nomme
 * l'acteur (`participantId` + `userId`).
 */
export interface ReactionBroadcastAggregation {
  readonly emoji: string;
  readonly count: number;
  readonly participantIds: readonly string[];
}

/**
 * La même agrégation, résolue POUR UN LECTEUR donné.
 *
 * `hasCurrentUser` n'est calculable qu'à un endroit où l'on sait à qui l'on
 * répond : la lecture REST (`getMessageReactions`, `getEmojiAggregation` avec
 * son `currentParticipantId`) et la reconstruction locale d'un client. Jamais
 * une diffusion — d'où la séparation en deux types plutôt qu'un champ optionnel,
 * qui aurait laissé chaque site décider seul s'il a le droit de le remplir.
 */
export interface ReactionAggregation extends ReactionBroadcastAggregation {
  readonly hasCurrentUser: boolean;
}

/**
 * État synchronisé des réactions d'un message
 * Envoyé lors de la synchronisation initiale ou sur demande
 */
export interface ReactionSync {
  readonly messageId: string;
  readonly reactions: readonly ReactionAggregation[];  // Groupées par emoji
  readonly totalCount: number;
  readonly userReactions: readonly string[];  // Emojis utilisés par l'utilisateur actuel
}

/**
 * Événement de mise à jour de réaction (WebSocket)
 * Diffusé en temps réel à tous les participants
 */
export interface ReactionUpdateEvent {
  readonly messageId: string;
  readonly conversationId: string;
  readonly participantId: string;
  /**
   * User.id du réacteur (distinct de `participantId`, qui est un Participant.id
   * scopé à la conversation). Permet à un autre appareil du MÊME utilisateur de
   * reconnaître sa propre réaction dans l'écho temps-réel : comparer
   * `participantId` à un User.id échoue toujours (ObjectIds de collections
   * différentes, jamais égaux). Toujours émis par la gateway ; optionnel dans le
   * type pour la compat descendante des payloads persistés/rejoués hors-ligne.
   */
  readonly userId?: string;
  readonly emoji: string;
  readonly action: 'add' | 'remove';
  /**
   * L'état ABSOLU de cet emoji après la mutation, sans réponse par-lecteur —
   * cf. `ReactionBroadcastAggregation`. Un client dérive « ma réaction » de
   * `userId` (le User.id de l'acteur) confronté au sien, jamais d'un drapeau
   * porté par l'agrégat : celui-ci décrirait l'acteur, pas lui.
   */
  readonly aggregation: ReactionBroadcastAggregation;
  readonly timestamp: Date;
}

/**
 * Réponse API pour l'ajout d'une réaction
 */
export interface AddReactionResponse {
  readonly success: boolean;
  readonly data?: ReactionData;
  readonly error?: string;
}

/**
 * Réponse API pour la suppression d'une réaction
 */
export interface RemoveReactionResponse {
  readonly success: boolean;
  readonly message?: string;
  readonly error?: string;
}

/**
 * Réponse API pour récupérer les réactions d'un message
 */
export interface GetReactionsResponse {
  readonly success: boolean;
  readonly data?: ReactionSync;
  readonly error?: string;
}

/**
 * Réponse API pour récupérer les réactions d'un utilisateur
 */
export interface GetUserReactionsResponse {
  readonly success: boolean;
  readonly data?: ReactionData[];
  readonly error?: string;
}

// `UseMessageReactionsOptions` / `UseMessageReactionsReturn` ont été retirées
// avec le hook web qu'elles nommaient (`apps/web/hooks/use-message-reactions.ts`,
// supprimé au cycle 68). Elles n'avaient AUCUN lecteur, pas même lui : il
// redéclarait localement les deux mêmes formes. Le hook vivant
// (`hooks/queries/use-reactions-query.ts`) porte les siennes, dérivées de
// React Query, et n'a jamais lu celles-ci.

/**
 * Validation d'un emoji
 * Vérifie si le string est un emoji unicode valide
 */
export function isValidEmoji(emoji: string): boolean {
  // Un emoji valide est UN seul grapheme emoji RGI (Recommended for General
  // Interchange) : la définition exacte qu'un emoji-picker moderne présente.
  // `\p{RGI_Emoji}` (propriété de STRING, donc drapeau `v` obligatoire, ES2024)
  // matche en un seul jeton les séquences multi-code-points — modificateur de
  // teint (`👍🏽`), ZWJ (`👩‍💻`), drapeaux régionaux (`🇫🇷`), keycaps (`#️⃣`) —
  // que l'ancienne regex mono-code-point rejetait toutes, bloquant au portillon
  // de réaction les emojis les plus courants. Elle refuse aussi enfin les faux
  // positifs de l'ancienne branche `\p{Emoji}️` : un chiffre ou `*` suivi
  // d'un sélecteur de variante (`'1️'`, `'*️'`) n'est PAS un emoji
  // autonome — seule la séquence keycap complète (`'1️⃣'`) l'est.
  //
  // Construit via `new RegExp(..., 'v')` plutôt qu'un littéral : la cible tsc du
  // package est ES2020 (TS1501 refuse le drapeau `v` en littéral), mais les
  // SEULS consommateurs de cette fonction sont les services gateway
  // (Node 22 + bun CI), dont le runtime supporte `v`. Aucun appel côté client.
  const emojiRegex = new RegExp('^\\p{RGI_Emoji}$', 'v');
  return emojiRegex.test(emoji.trim());
}

/**
 * Nettoie et valide un emoji
 * Retourne l'emoji nettoyé ou null si invalide
 */
export function sanitizeEmoji(emoji: string): string | null {
  const trimmed = emoji.trim();
  return isValidEmoji(trimmed) ? trimmed : null;
}

/**
 * Constantes pour les emojis les plus populaires
 * Utilisé pour les suggestions rapides
 */
export const POPULAR_EMOJIS = [
  '⭐', // Star (compatibilité avec fonctionnalité existante)
  '❤️', // Heart
  '👍', // Thumbs up
  '🎉', // Party
  '🔥', // Fire
  '😂', // Laugh
  '🤔', // Thinking
  '💯', // 100
  '👏', // Clap
  '🚀', // Rocket
] as const;

/**
 * Type pour les emojis populaires
 */
export type PopularEmoji = typeof POPULAR_EMOJIS[number];
