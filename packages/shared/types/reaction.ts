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
  readonly userId?: string;
  readonly anonymousUserId?: string;
  readonly emoji: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/**
 * Agrégation des réactions par emoji pour un message
 * Optimisé pour l'affichage et les performances
 */
export interface ReactionAggregation {
  readonly emoji: string;
  readonly count: number;
  readonly userIds: readonly string[];        // IDs des utilisateurs ayant réagi
  readonly anonymousUserIds: readonly string[]; // IDs des utilisateurs anonymes ayant réagi
  readonly hasCurrentUser: boolean;           // L'utilisateur actuel a-t-il réagi avec cet emoji?
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
  readonly userId?: string;
  readonly anonymousUserId?: string;
  readonly emoji: string;
  readonly action: 'add' | 'remove';
  readonly aggregation: ReactionAggregation;  // État après l'action pour cet emoji
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

/**
 * Options pour le hook useMessageReactions
 */
export interface UseMessageReactionsOptions {
  readonly messageId: string;
  readonly currentUserId?: string;
  readonly isAnonymous?: boolean;
  readonly onReactionAdded?: (event: ReactionUpdateEvent) => void;
  readonly onReactionRemoved?: (event: ReactionUpdateEvent) => void;
}

/**
 * Retour du hook useMessageReactions
 */
export interface UseMessageReactionsReturn {
  readonly reactions: ReactionAggregation[];
  readonly isLoading: boolean;
  readonly error: string | null;
  readonly addReaction: (emoji: string) => Promise<void>;
  readonly removeReaction: (emoji: string) => Promise<void>;
  readonly toggleReaction: (emoji: string) => Promise<void>;
  readonly hasReacted: (emoji: string) => boolean;
  readonly totalCount: number;
}

/**
 * Validation d'un emoji
 * Vérifie si le string est un emoji unicode valide
 */
export function isValidEmoji(emoji: string): boolean {
  // Regex pour détecter les emojis unicode
  const emojiRegex = /^(\p{Emoji_Presentation}|\p{Emoji}\uFE0F)$/u;
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
