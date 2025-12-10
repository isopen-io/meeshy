/**
 * Constants et utilitaires pour les langues supportées dans Meeshy
 * Module centralisé pour être réutilisé partout
 */

export const SUPPORTED_LANGUAGES = [
  { code: 'fr', name: 'Français', flag: '🇫🇷', color: 'bg-blue-500' },
  { code: 'en', name: 'English', flag: '🇬🇧', color: 'bg-red-500' },
  { code: 'es', name: 'Español', flag: '🇪🇸', color: 'bg-yellow-500' },
  { code: 'de', name: 'Deutsch', flag: '🇩🇪', color: 'bg-gray-800' },
  { code: 'pt', name: 'Português', flag: '🇵🇹', color: 'bg-green-500' },
  { code: 'zh', name: '中文', flag: '🇨🇳', color: 'bg-red-600' },
  { code: 'ja', name: '日本語', flag: '🇯🇵', color: 'bg-white border' },
  { code: 'ar', name: 'العربية', flag: '🇸🇦', color: 'bg-green-600' },
] as const;

export const MAX_MESSAGE_LENGTH = 2000;
export const MAX_MESSAGE_LENGTH_MODERATOR = 4000; // Limite pour modérateurs et au-dessus
export const TOAST_SHORT_DURATION = 2000;
export const TOAST_LONG_DURATION = 3000;
export const TOAST_ERROR_DURATION = 5000;
export const TYPING_CANCELATION_DELAY = 2000; // Délai avant d'annuler l'indicateur de frappe

/**
 * Obtient la limite de caractères pour un utilisateur en fonction de son rôle
 * MODERATOR et au-dessus (ADMIN, BIGBOSS, AUDIT, ANALYST) ont 4000 caractères
 * USER a 2000 caractères
 */
export function getMaxMessageLength(userRole?: string): number {
  const moderatorRoles = ['MODERATOR', 'MODO', 'ADMIN', 'BIGBOSS', 'AUDIT', 'ANALYST'];
  
  if (userRole && moderatorRoles.includes(userRole.toUpperCase())) {
    return MAX_MESSAGE_LENGTH_MODERATOR;
  }
  
  return MAX_MESSAGE_LENGTH;
}

/**
 * Interface pour les statistiques de langues
 */
export interface LanguageStats {
  language: string;
  flag: string;
  count: number;
  color: string;
}

/**
 * Type pour une langue supportée
 */
export type SupportedLanguage = typeof SUPPORTED_LANGUAGES[number];

/**
 * Obtient les informations d'une langue par son code
 */
export function getLanguageInfo(code: string): SupportedLanguage | undefined {
  return SUPPORTED_LANGUAGES.find(lang => lang.code === code);
}

/**
 * Obtient le nom d'une langue par son code
 */
export function getLanguageName(code: string): string {
  const lang = getLanguageInfo(code);
  return lang?.name || code;
}

/**
 * Obtient le drapeau d'une langue par son code
 */
export function getLanguageFlag(code: string): string {
  const lang = getLanguageInfo(code);
  return lang?.flag || '🌐';
}

/**
 * Obtient la couleur d'une langue par son code
 */
export function getLanguageColor(code: string): string {
  const lang = getLanguageInfo(code);
  return lang?.color || 'bg-gray-500';
}
