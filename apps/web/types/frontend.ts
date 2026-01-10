/**
 * Types Frontend Meeshy - Types spécifiques au frontend
 *
 * IMPORTANT: Ce fichier ne doit contenir QUE des types spécifiques au frontend.
 * Tous les types partagés doivent être importés de @meeshy/shared/types
 */

// Import des types partagés nécessaires
import type {
  User,
  Conversation,
  Message,
  LanguageCode
} from '@meeshy/shared/types';

// ===== TYPES SPÉCIFIQUES AU FRONTEND =====

/**
 * DTO pour création d'utilisateur via lien de conversation
 */
export interface CreateUserDto {
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber: string;
  spokenLanguage: string;
  receiveLanguage: string;
  conversationLinkId: string;
}

/**
 * Réponse lors de la jointure d'une conversation
 */
export interface JoinConversationResponse {
  user: User;
  conversation: Conversation;
  isNewUser: boolean;
  existingUserFound?: boolean;
}

/**
 * État global de l'application frontend
 */
export interface AppState {
  currentUser?: User;
  conversations: Conversation[];
  currentConversation?: Conversation;
  isAuthenticated: boolean;
}

/**
 * Room de chat pour Socket.IO (frontend-specific)
 */
export interface ChatRoom {
  id: string;
  participantIds: string[];
  messages: Message[];
  createdAt: Date;
}

// ===== CONSTANTES FRONTEND =====

/**
 * Langues d'interface supportées (avec traductions complètes dans /apps/web/locales/)
 * IMPORTANT: Cette liste doit correspondre exactement aux dossiers dans /apps/web/locales/
 * Ne jamais ajouter de langue ici sans avoir les fichiers de traduction complets dans locales/
 */
export const INTERFACE_LANGUAGES: LanguageCode[] = [
  { code: 'en', name: 'English', flag: '🇺🇸', translateText: 'Translate to English' },
  { code: 'es', name: 'Español', flag: '🇪🇸', translateText: 'Traducir al español' },
  { code: 'fr', name: 'Français', flag: '🇫🇷', translateText: 'Traduire en français' },
  { code: 'pt', name: 'Português', flag: '🇵🇹', translateText: 'Traduzir para português' },
];
