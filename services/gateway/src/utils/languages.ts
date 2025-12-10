/**
 * Utilitaires unifiés pour la gestion des langues dans Meeshy Gateway
 * Version gateway du module partagé
 */

/**
 * Interface complète pour une langue supportée
 */
export interface SupportedLanguageInfo {
  code: string;
  name: string;
  flag: string;
  color?: string;
  translateText?: string;
}

/**
 * Liste complète des langues supportées avec toutes les propriétés
 * Fusion de toutes les versions existantes pour préserver la plus longue liste
 */
export const SUPPORTED_LANGUAGES: SupportedLanguageInfo[] = [
  { 
    code: 'fr', 
    name: 'Français', 
    flag: '🇫🇷', 
    color: 'bg-blue-500',
    translateText: 'Traduire ce message en français' 
  },
  { 
    code: 'en', 
    name: 'English', 
    flag: '🇬🇧', 
    color: 'bg-red-500',
    translateText: 'Translate this message to English' 
  },
  { 
    code: 'es', 
    name: 'Español', 
    flag: '🇪🇸', 
    color: 'bg-yellow-500',
    translateText: 'Traducir este mensaje al español' 
  },
  { 
    code: 'de', 
    name: 'Deutsch', 
    flag: '🇩🇪', 
    color: 'bg-gray-800',
    translateText: 'Diese Nachricht ins Deutsche übersetzen' 
  },
  { 
    code: 'pt', 
    name: 'Português', 
    flag: '🇵🇹', 
    color: 'bg-green-500',
    translateText: 'Traduzir esta mensagem para português' 
  },
  { 
    code: 'zh', 
    name: '中文', 
    flag: '🇨🇳', 
    color: 'bg-red-600',
    translateText: '将此消息翻译成中文' 
  },
  { 
    code: 'ja', 
    name: '日本語', 
    flag: '🇯🇵', 
    color: 'bg-white border',
    translateText: 'このメッセージを日本語に翻訳' 
  },
  { 
    code: 'ar', 
    name: 'العربية', 
    flag: '🇸🇦', 
    color: 'bg-green-600',
    translateText: 'ترجمة هذه الرسالة إلى العربية' 
  },
] as const;

/**
 * Type pour les codes de langue supportés
 */
export type SupportedLanguageCode = typeof SUPPORTED_LANGUAGES[number]['code'];

/**
 * Cache pour améliorer les performances des recherches répétées
 */
const languageCache = new Map<string, SupportedLanguageInfo>();

/**
 * Initialise le cache des langues
 */
function initializeLanguageCache() {
  if (languageCache.size === 0) {
    SUPPORTED_LANGUAGES.forEach(lang => {
      languageCache.set(lang.code, lang);
    });
  }
}

/**
 * Obtient les informations complètes d'une langue par son code
 * Version optimisée avec cache et fallback robuste
 */
export function getLanguageInfo(code: string | undefined): SupportedLanguageInfo {
  // Initialiser le cache si nécessaire
  initializeLanguageCache();
  
  // Gérer les cas edge
  if (!code || code.trim() === '' || code === 'unknown') {
    return { 
      code: 'fr', 
      name: 'Français', 
      flag: '🇫🇷', 
      color: 'bg-blue-500',
      translateText: 'Traduire ce message en français' 
    };
  }
  
  // Normaliser le code (minuscules, trim)
  const normalizedCode = code.toLowerCase().trim();
  
  // Recherche dans le cache
  const found = languageCache.get(normalizedCode);
  if (found) {
    return found;
  }
  
  // Fallback: créer un objet pour langues non supportées
  return { 
    code: normalizedCode, 
    name: normalizedCode.toUpperCase(), 
    flag: '🌐',
    color: 'bg-gray-500',
    translateText: `Translate this message to ${normalizedCode}`
  };
}

/**
 * Obtient le nom d'une langue par son code
 */
export function getLanguageName(code: string | undefined): string {
  const lang = getLanguageInfo(code);
  return lang.name;
}

/**
 * Obtient le drapeau d'une langue par son code
 */
export function getLanguageFlag(code: string | undefined): string {
  const lang = getLanguageInfo(code);
  return lang.flag;
}

/**
 * Obtient la couleur d'une langue par son code
 */
export function getLanguageColor(code: string | undefined): string {
  const lang = getLanguageInfo(code);
  return lang.color || 'bg-gray-500';
}

/**
 * Obtient le texte de traduction d'une langue par son code
 */
export function getLanguageTranslateText(code: string | undefined): string {
  const lang = getLanguageInfo(code);
  return lang.translateText || `Translate this message to ${lang.name}`;
}

/**
 * Vérifie si un code de langue est supporté
 */
export function isSupportedLanguage(code: string | undefined): boolean {
  if (!code) return false;
  initializeLanguageCache();
  return languageCache.has(code.toLowerCase().trim());
}

/**
 * Obtient tous les codes de langue supportés
 */
export function getSupportedLanguageCodes(): string[] {
  return SUPPORTED_LANGUAGES.map(lang => lang.code);
}

/**
 * Filtre les langues supportées selon un critère
 */
export function filterSupportedLanguages(
  predicate: (lang: SupportedLanguageInfo) => boolean
): SupportedLanguageInfo[] {
  return SUPPORTED_LANGUAGES.filter(predicate);
}

/**
 * Interface pour les statistiques de langues (compatibilité)
 */
export interface LanguageStats {
  language: string;
  flag: string;
  count: number;
  color: string;
}