/**
 * Types pour le système de mentions d'utilisateurs (@username)
 * @module shared/types/mention
 */

/**
 * Suggestion d'utilisateur pour l'autocomplete de mention
 */
export interface MentionSuggestion {
  readonly id: string;
  readonly username: string;
  readonly displayName: string | null;
  readonly avatar: string | null;
  readonly badge: 'conversation' | 'friend' | 'other';
  readonly inConversation: boolean;
  readonly isFriend: boolean;
}

/**
 * Données complètes d'une mention
 */
export interface MentionData {
  readonly id: string;
  readonly messageId: string;
  readonly mentionedUserId: string;
  readonly mentionedAt: Date;
  readonly mentionedUser?: {
    readonly id: string;
    readonly username: string;
    readonly displayName: string | null;
    readonly avatar: string | null;
  };
}

/**
 * Mention récente pour un utilisateur
 */
export interface RecentMention {
  readonly id: string;
  readonly messageId: string;
  readonly mentionedAt: Date;
  readonly message: {
    readonly id: string;
    readonly content: string;
    readonly conversationId: string;
    readonly senderId: string | null;
    readonly createdAt: Date;
    readonly sender: {
      readonly id: string;
      readonly username: string;
      readonly displayName: string | null;
      readonly avatar: string | null;
    } | null;
    readonly conversation: {
      readonly id: string;
      readonly title: string | null;
      readonly type: string;
    };
  };
}

/**
 * Résultat de validation des mentions
 */
export interface MentionValidationResult {
  readonly isValid: boolean;
  readonly validUserIds: readonly string[];
  readonly invalidUsernames: readonly string[];
  readonly errors: readonly string[];
}

/**
 * Requête pour obtenir des suggestions de mentions
 */
export interface MentionSuggestionsRequest {
  readonly conversationId: string;
  readonly query?: string;
}

/**
 * Réponse API pour les suggestions de mentions
 */
export interface MentionSuggestionsResponse {
  readonly success: boolean;
  readonly data?: readonly MentionSuggestion[];
  readonly error?: string;
}

/**
 * Réponse API pour les mentions d'un message
 */
export interface GetMessageMentionsResponse {
  readonly success: boolean;
  readonly data?: readonly MentionData[];
  readonly error?: string;
}

/**
 * Réponse API pour les mentions récentes d'un utilisateur
 */
export interface GetUserMentionsResponse {
  readonly success: boolean;
  readonly data?: readonly RecentMention[];
  readonly error?: string;
}

/**
 * Événement Socket.IO pour une nouvelle mention
 */
export interface MentionCreatedEvent {
  readonly messageId: string;
  readonly conversationId: string;
  readonly mentionedUserId: string;
  readonly senderId: string;
  readonly senderUsername: string;
  readonly senderAvatar: string | null;
  readonly messagePreview: string;
  readonly conversationTitle: string | null;
  readonly timestamp: Date;
}

/**
 * Payload pour créer une notification de mention
 */
export interface CreateMentionNotificationPayload {
  readonly mentionedUserId: string;
  readonly senderId: string;
  readonly senderUsername: string;
  readonly senderAvatar: string | null;
  readonly messageContent: string;
  readonly conversationId: string;
  readonly conversationTitle: string | null;
  readonly messageId: string;
  readonly isMemberOfConversation: boolean;
}

/**
 * Métadonnées de mention dans le contexte d'un message
 */
export interface MessageMentionContext {
  readonly mentionedUserIds: readonly string[];
  readonly mentionedUsernames: readonly string[];
  readonly hasMentions: boolean;
  readonly mentionCount: number;
}

/**
 * Options pour le hook useMentionAutocomplete
 */
export interface UseMentionAutocompleteOptions {
  readonly conversationId: string;
  readonly onMentionSelected?: (username: string) => void;
  readonly maxSuggestions?: number;
}

/**
 * Retour du hook useMentionAutocomplete
 */
export interface UseMentionAutocompleteReturn {
  readonly suggestions: readonly MentionSuggestion[];
  readonly isLoading: boolean;
  readonly error: string | null;
  readonly showSuggestions: boolean;
  readonly selectedIndex: number;
  readonly fetchSuggestions: (query: string) => Promise<void>;
  readonly selectSuggestion: (index: number) => void;
  readonly selectNext: () => void;
  readonly selectPrevious: () => void;
  readonly closeSuggestions: () => void;
}

/**
 * Position du curseur pour l'autocomplete
 */
export interface MentionCursorPosition {
  readonly start: number;
  readonly end: number;
  readonly query: string;
  readonly hasMention: boolean;
}

/**
 * Configuration pour le parsing des mentions
 */
export interface MentionParserConfig {
  readonly allowSpaces?: boolean;
  readonly caseSensitive?: boolean;
  readonly maxUsernameLength?: number;
}

/**
 * Extrait les mentions d'un texte
 * @param content - Le contenu à parser
 * @param config - Configuration optionnelle
 * @returns Array des usernames mentionnés (sans le @)
 */
export function extractMentions(
  content: string,
  config: MentionParserConfig = {}
): string[] {
  if (!content) return [];

  const {
    allowSpaces = false,
    caseSensitive = false,
    maxUsernameLength = 30
  } = config;

  // Regex: @ suivi de lettres, chiffres, underscore (et optionnellement espaces)
  const pattern = allowSpaces
    ? new RegExp(`@([\\w ]{1,${maxUsernameLength}})`, 'g')
    : new RegExp(`@(\\w{1,${maxUsernameLength}})`, 'g');

  const mentions = new Set<string>();
  const matches = content.matchAll(pattern);

  for (const match of matches) {
    if (match[1]) {
      const username = caseSensitive ? match[1] : match[1].toLowerCase();
      mentions.add(username.trim());
    }
  }

  return Array.from(mentions);
}

/**
 * Vérifie si un texte contient des mentions
 * @param content - Le contenu à vérifier
 * @returns true si au moins une mention est présente
 */
export function hasMentions(content: string): boolean {
  return /@\w+/.test(content);
}

/**
 * Remplace les mentions dans un texte par des liens
 * @param content - Le contenu original
 * @param linkTemplate - Template pour le lien (ex: "/u/{username}")
 * @param validUsernames - Liste des usernames validés à convertir en liens:
 *   - ["alice", "bob"]: seuls ces usernames deviennent cliquables
 *   - [] ou undefined: AUCUNE mention ne devient cliquable
 * @returns Contenu avec mentions validées transformées en liens
 *
 * @example
 * mentionsToLinks("Hello @alice @fakeuser", "/u/{username}", ["alice"])
 * // → "Hello [@alice](/u/alice) @fakeuser"
 */
export function mentionsToLinks(
  content: string,
  linkTemplate: string = '/u/{username}',
  validUsernames?: string[]
): string {
  return content.replace(/@(\w+)/g, (_match, username) => {
    // Vérifier si le username est dans la liste validée
    if (!validUsernames || !validUsernames.includes(username)) {
      // Username pas validé → texte plain
      return `@${username}`;
    }

    // Username validé → lien cliquable
    const link = linkTemplate.replace('{username}', username);
    return `[@${username}](${link})`;
  });
}

/**
 * Détecte la position du curseur dans une mention en cours de saisie
 * @param content - Le contenu du textarea
 * @param cursorPosition - Position du curseur
 * @returns Position et query de la mention, ou null
 */
export function detectMentionAtCursor(
  content: string,
  cursorPosition: number
): MentionCursorPosition | null {
  if (!content || cursorPosition < 0) return null;

  // Chercher le dernier @ avant le curseur
  const beforeCursor = content.substring(0, cursorPosition);
  const lastAtIndex = beforeCursor.lastIndexOf('@');

  if (lastAtIndex === -1) return null;

  // Vérifier qu'il n'y a pas d'espace entre @ et le curseur
  const afterAt = beforeCursor.substring(lastAtIndex + 1);
  if (afterAt.includes(' ') || afterAt.includes('\n')) return null;

  // Extraire la query (texte après @)
  const query = afterAt;

  return {
    start: lastAtIndex,
    end: cursorPosition,
    query,
    hasMention: true
  };
}

/**
 * Valide un username pour les mentions
 * @param username - Le username à valider
 * @returns true si le username est valide
 */
export function isValidMentionUsername(username: string): boolean {
  // Lettres, chiffres, underscore, 1-30 caractères
  return /^\w{1,30}$/.test(username);
}

/**
 * Tronque le contenu d'un message pour la notification de mention
 * @param content - Le contenu du message
 * @param wordLimit - Nombre de mots maximum (défaut: 20)
 * @returns Contenu tronqué avec "..." si nécessaire
 */
export function truncateMessageForNotification(
  content: string,
  wordLimit: number = 20
): string {
  if (!content) return '';

  const words = content.trim().split(/\s+/);

  if (words.length <= wordLimit) {
    return content;
  }

  return words.slice(0, wordLimit).join(' ') + '...';
}

/**
 * Constantes pour les mentions
 */
export const MENTION_CONSTANTS = {
  MAX_USERNAME_LENGTH: 30,
  MAX_SUGGESTIONS: 10,
  AUTOCOMPLETE_DEBOUNCE_MS: 300,
  NOTIFICATION_WORD_LIMIT: 20,
  MENTION_TRIGGER: '@',
  MENTION_REGEX: /@(\w+)/g
} as const;

/**
 * Types de badge pour les suggestions
 */
export type MentionBadge = 'conversation' | 'friend' | 'other';

/**
 * Type de notification de mention
 */
export const MENTION_NOTIFICATION_TYPE = 'user_mentioned' as const;
