/**
 * DEPRECATED: Ce fichier est conservé pour la compatibilité.
 * Utilisez directement @meeshy/shared/utils/languages
 *
 * Re-exporte toutes les fonctions et types depuis le module partagé.
 */

export {
  // Types
  type SupportedLanguageInfo,
  type SupportedLanguageCode,
  type LanguageStats,
  type TTSEngine,
  type STTEngine,
  type LanguageRegion,

  // Liste des langues
  SUPPORTED_LANGUAGES,

  // Fonctions de recherche
  getLanguageInfo,
  getLanguageName,
  getLanguageFlag,
  getLanguageColor,
  getLanguageTranslateText,
  isSupportedLanguage,
  getSupportedLanguageCodes,

  // Fonctions de filtrage par capacité
  filterSupportedLanguages,
  getLanguagesWithTTS,
  getLanguagesWithSTT,
  getLanguagesWithVoiceCloning,
  getLanguagesWithTranslation,
  getLanguagesByRegion,
  getAfricanLanguages,
  getMMSTTSLanguages,

  // Statistiques
  getLanguageStats,

  // Constantes
  MAX_MESSAGE_LENGTH,
  TOAST_SHORT_DURATION,
  TOAST_LONG_DURATION,
  TOAST_ERROR_DURATION,
  TYPING_CANCELATION_DELAY,
} from '@meeshy/shared/utils/languages';

// Alias pour compatibilité arrière
export type SupportedLanguage = import('@meeshy/shared/utils/languages').SupportedLanguageInfo;

// Constante supplémentaire pour les modérateurs (spécifique au frontend)
export const MAX_MESSAGE_LENGTH_MODERATOR = 4000;

/**
 * Obtient la limite de caractères pour un utilisateur en fonction de son rôle
 * Limite uniforme de 4000 caractères pour tous les rôles
 * Au-delà, un fichier .txt est automatiquement créé
 */
export function getMaxMessageLength(userRole?: string): number {
  return MAX_MESSAGE_LENGTH_MODERATOR; // Limite uniforme de 4000 caractères
}
