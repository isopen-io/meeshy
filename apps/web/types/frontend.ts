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
 * Langues d'interface proposées dans le sélecteur de langue.
 *
 * en / es / fr / pt disposent de bundles de traduction complets dans
 * /apps/web/locales/. de / it sont proposées comme langues d'interface mais
 * n'ont pas encore de bundle : `useTranslation` (hooks/use-i18n.ts) retombe
 * gracieusement sur la `fallbackLocale` ('en') pour leurs namespaces manquants,
 * donc l'UI s'affiche en anglais en attendant les fichiers locales/de & locales/it.
 * Le contenu des messages reste traduit via NLLB indépendamment de l'UI.
 *
 * En ajoutant les bundles locales/de et locales/it, aucune autre modification
 * n'est nécessaire ici — l'entrée existe déjà.
 */
export const INTERFACE_LANGUAGES: LanguageCode[] = [
  { code: 'en', name: 'English', flag: '🇺🇸', translateText: 'Translate to English' },
  { code: 'es', name: 'Español', flag: '🇪🇸', translateText: 'Traducir al español' },
  { code: 'fr', name: 'Français', flag: '🇫🇷', translateText: 'Traduire en français' },
  { code: 'pt', name: 'Português', flag: '🇵🇹', translateText: 'Traduzir para português' },
  { code: 'de', name: 'Deutsch', flag: '🇩🇪', translateText: 'Auf Deutsch übersetzen' },
  { code: 'it', name: 'Italiano', flag: '🇮🇹', translateText: 'Traduci in italiano' },
];
