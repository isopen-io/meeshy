/**
 * Utilitaires unifiés pour la gestion des langues dans Meeshy
 * Module partagé entre Gateway, Frontend, et Translator
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
  nativeName?: string;
}

/**
 * Liste complète des langues supportées avec toutes les propriétés
 * Fusion de toutes les versions existantes pour préserver la plus longue liste
 */
export const SUPPORTED_LANGUAGES: SupportedLanguageInfo[] = [
  { code: 'af', name: 'Afrikaans', flag: '🇿🇦', color: 'bg-green-600', translateText: 'Vertaal hierdie boodskap na Afrikaans' },
  { code: 'ar', name: 'العربية', flag: '🇸🇦', color: 'bg-green-600', translateText: 'ترجمة هذه الرسالة إلى العربية' },
  { code: 'bg', name: 'Български', flag: '🇧🇬', color: 'bg-red-600', translateText: 'Преведете това съобщение на български' },
  { code: 'bn', name: 'বাংলা', flag: '🇧🇩', color: 'bg-green-500', translateText: 'এই বার্তাটি বাংলায় অনুবাদ করুন' },
  { code: 'cs', name: 'Čeština', flag: '🇨🇿', color: 'bg-blue-600', translateText: 'Přeložit tuto zprávu do češtiny' },
  { code: 'da', name: 'Dansk', flag: '🇩🇰', color: 'bg-red-500', translateText: 'Oversæt denne besked til dansk' },
  { code: 'de', name: 'Deutsch', flag: '🇩🇪', color: 'bg-gray-800', translateText: 'Diese Nachricht ins Deutsche übersetzen' },
  { code: 'el', name: 'Ελληνικά', flag: '🇬🇷', color: 'bg-blue-500', translateText: 'Μετάφραση αυτού του μηνύματος στα ελληνικά' },
  { code: 'en', name: 'English', flag: '🇬🇧', color: 'bg-red-500', translateText: 'Translate this message to English' },
  { code: 'es', name: 'Español', flag: '🇪🇸', color: 'bg-yellow-500', translateText: 'Traducir este mensaje al español' },
  { code: 'fa', name: 'فارسی', flag: '🇮🇷', color: 'bg-green-700', translateText: 'ترجمه این پیام به فارسی' },
  { code: 'fi', name: 'Suomi', flag: '🇫🇮', color: 'bg-blue-600', translateText: 'Käännä tämä viesti suomeksi' },
  { code: 'fr', name: 'Français', flag: '🇫🇷', color: 'bg-blue-500', translateText: 'Traduire ce message en français' },
  { code: 'he', name: 'עברית', flag: '🇮🇱', color: 'bg-blue-400', translateText: 'תרגם הודעה זו לעברית' },
  { code: 'hi', name: 'हिन्दी', flag: '🇮🇳', color: 'bg-orange-500', translateText: 'इस संदेश का हिंदी में अनुवाद करें' },
  { code: 'hr', name: 'Hrvatski', flag: '🇭🇷', color: 'bg-red-600', translateText: 'Prevedi ovu poruku na hrvatski' },
  { code: 'hu', name: 'Magyar', flag: '🇭🇺', color: 'bg-red-600', translateText: 'Fordítsa le ezt az üzenetet magyarra' },
  { code: 'hy', name: 'Հայերեն', flag: '🇦🇲', color: 'bg-red-500', translateText: 'Թարգմանել այս հաղորդագրությունը հայերեն' },
  { code: 'id', name: 'Bahasa Indonesia', flag: '🇮🇩', color: 'bg-red-600', translateText: 'Terjemahkan pesan ini ke Bahasa Indonesia' },
  { code: 'ig', name: 'Igbo', flag: '🇳🇬', color: 'bg-green-600', translateText: 'Tụgharịa ozi a n\'Igbo' },
  { code: 'it', name: 'Italiano', flag: '🇮🇹', color: 'bg-green-600', translateText: 'Traduci questo messaggio in italiano' },
  { code: 'ja', name: '日本語', flag: '🇯🇵', color: 'bg-white border', translateText: 'このメッセージを日本語に翻訳' },
  { code: 'ko', name: '한국어', flag: '🇰🇷', color: 'bg-blue-600', translateText: '이 메시지를 한국어로 번역' },
  { code: 'ln', name: 'Lingala', flag: '🇨🇩', color: 'bg-blue-500', translateText: 'Kobongola nsango oyo na Lingala' },
  { code: 'lt', name: 'Lietuvių', flag: '🇱🇹', color: 'bg-yellow-500', translateText: 'Išversti šį pranešimą į lietuvių kalbą' },
  { code: 'ms', name: 'Bahasa Melayu', flag: '🇲🇾', color: 'bg-red-600', translateText: 'Terjemahkan mesej ini ke Bahasa Melayu' },
  { code: 'nl', name: 'Nederlands', flag: '🇳🇱', color: 'bg-orange-600', translateText: 'Vertaal dit bericht naar het Nederlands' },
  { code: 'no', name: 'Norsk', flag: '🇳🇴', color: 'bg-blue-600', translateText: 'Oversett denne meldingen til norsk' },
  { code: 'pl', name: 'Polski', flag: '🇵🇱', color: 'bg-red-600', translateText: 'Przetłumacz tę wiadomość na polski' },
  { code: 'pt', name: 'Português', flag: '🇵🇹', color: 'bg-green-500', translateText: 'Traduzir esta mensagem para português' },
  { code: 'ro', name: 'Română', flag: '🇷🇴', color: 'bg-yellow-500', translateText: 'Traduceți acest mesaj în română' },
  { code: 'ru', name: 'Русский', flag: '🇷🇺', color: 'bg-blue-600', translateText: 'Перевести это сообщение на русский' },
  { code: 'sv', name: 'Svenska', flag: '🇸🇪', color: 'bg-blue-500', translateText: 'Översätt det här meddelandet till svenska' },
  { code: 'sw', name: 'Kiswahili', flag: '🇰🇪', color: 'bg-green-600', translateText: 'Tafsiri ujumbe huu kwa Kiswahili' },
  { code: 'th', name: 'ไทย', flag: '🇹🇭', color: 'bg-red-600', translateText: 'แปลข้อความนี้เป็นภาษาไทย' },
  { code: 'tr', name: 'Türkçe', flag: '🇹🇷', color: 'bg-red-600', translateText: 'Bu mesajı Türkçe\'ye çevir' },
  { code: 'uk', name: 'Українська', flag: '🇺🇦', color: 'bg-blue-500', translateText: 'Перекласти це повідомлення українською' },
  { code: 'ur', name: 'اردو', flag: '🇵🇰', color: 'bg-green-600', translateText: 'اس پیغام کا اردو میں ترجمہ کریں' },
  { code: 'vi', name: 'Tiếng Việt', flag: '🇻🇳', color: 'bg-red-600', translateText: 'Dịch tin nhắn này sang tiếng Việt' },
  { code: 'zh', name: '中文', flag: '🇨🇳', color: 'bg-red-600', translateText: '将此消息翻译成中文' },
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

// Constants pour compatibilité avec les versions précédentes
export const MAX_MESSAGE_LENGTH = 2000;
export const TOAST_SHORT_DURATION = 2000;
export const TOAST_LONG_DURATION = 3000;
export const TOAST_ERROR_DURATION = 5000;
export const TYPING_CANCELATION_DELAY = 2000;