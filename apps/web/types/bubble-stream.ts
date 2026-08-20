/**
 * Interface pour les extensions de Message avec traductions
 * Utilisé dans les composants BubbleMessage et stream pages
 */
import type { User, MessageWithTranslations } from '@meeshy/shared/types';
import type { StreamVariant } from '@/lib/conversations/stream-variant';

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
  /** Autorisations d'envoi de la personne dans CETTE conversation (lien
   *  partagé). Absentes = tout est permis (conversations ordinaires). */
  attachmentPermissions?: { canSendImages: boolean; canSendFiles: boolean };
  /**
   * `stream` (défaut) — le feed d'accueil, récent en haut, inchangé.
   * `thread` — la conversation partagée `/chat/:linkId` : géométrie de
   * messagerie (récent en bas), en-tête d'identité, Lentille des modes de
   * lecture. Voir `lib/conversations/stream-variant.ts`.
   */
  variant?: StreamVariant;
  conversationTitle?: string;
  conversationType?: string;
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