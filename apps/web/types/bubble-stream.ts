/**
 * Interface pour les extensions de Message avec traductions
 * Utilisé dans les composants BubbleMessage et stream pages
 */
import type { User, MessageWithTranslations } from '@meeshy/shared/types';

export interface BubbleStreamMessage extends MessageWithTranslations {
  isTranslated: boolean;
  translatedFrom?: string;
}

// Alias pour compatibilité
export type { MessageWithTranslations as BubbleStreamMessageV2 };

export interface BubbleStreamPageProps {
  user: User;
  conversationId?: string;
  isAnonymousMode?: boolean;
  linkId?: string;
  initialParticipants?: User[];
  anonymousPermissionHints?: string[];
}

/**
 * Types pour les choix de langues utilisateur
 */
export interface LanguageChoice {
  code: string;
  name: string;
  description: string;
  flag: string;
  isDefault: boolean;
}

/**
 * Configuration linguistique de l'utilisateur pour le stream
 */
export interface UserLanguageConfig {
  systemLanguage: string;
  regionalLanguage: string;
  customDestinationLanguage?: string;
  autoTranslateEnabled: boolean;
}