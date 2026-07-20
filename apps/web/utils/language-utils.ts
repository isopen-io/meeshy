/**
 * Utilities pour la gestion des langues
 */

// Mapping des codes de langue vers les noms d'affichage
const LANGUAGE_NAMES: Record<string, string> = {
  'fr': 'Français',
  'en': 'English',
  'es': 'Español',
  'de': 'Deutsch',
  'it': 'Italiano',
  'pt': 'Português',
  'ru': 'Русский',
  'zh': '中文',
  'ja': '日本語',
  'ko': '한국어',
  'ar': 'العربية',
  'hi': 'हिन्दी',
  'tr': 'Türkçe',
  'pl': 'Polski',
  'nl': 'Nederlands',
  'sv': 'Svenska',
  'da': 'Dansk',
  'no': 'Norsk',
  'fi': 'Suomi',
  'cs': 'Čeština',
  'sk': 'Slovenčina',
  'hu': 'Magyar',
  'ro': 'Română',
  'bg': 'Български',
  'hr': 'Hrvatski',
  'sr': 'Српски',
  'sl': 'Slovenščina',
  'et': 'Eesti',
  'lv': 'Latviešu',
  'lt': 'Lietuvių',
  'uk': 'Українська',
  'he': 'עברית',
  'th': 'ไทย',
  'vi': 'Tiếng Việt',
  'id': 'Bahasa Indonesia',
  'ms': 'Bahasa Melayu',
  'tl': 'Filipino',
  'sw': 'Kiswahili',
  'am': 'አማርኛ',
  'bn': 'বাংলা',
  'ur': 'اردو',
  'fa': 'فارسی',
  'ta': 'தமிழ்',
  'te': 'తెలుగు',
  'ml': 'മലയാളം',
  'kn': 'ಕನ್ನಡ',
  'gu': 'ગુજરાતી',
  'pa': 'ਪੰਜਾਬੀ',
  'mr': 'मराठी',
  'ne': 'नेपाली',
  'si': 'සිංහල',
  'my': 'မြန်မာ',
  'km': 'ខ្មែរ',
  'lo': 'ລາວ',
  'ka': 'ქართული',
  'hy': 'Հայերեն',
  'az': 'Azərbaycan',
  'kk': 'Қазақ',
  'ky': 'Кыргыз',
  'uz': 'Oʻzbek',
  'tg': 'Тоҷикӣ',
  'mn': 'Монгол'
};

// Mapping des codes de langue vers les drapeaux emoji
const LANGUAGE_FLAGS: Record<string, string> = {
  'fr': '🇫🇷',
  'en': '🇺🇸',
  'es': '🇪🇸',
  'de': '🇩🇪',
  'it': '🇮🇹',
  'pt': '🇵🇹',
  'ru': '🇷🇺',
  'zh': '🇨🇳',
  'ja': '🇯🇵',
  'ko': '🇰🇷',
  'ar': '🇸🇦',
  'hi': '🇮🇳',
  'tr': '🇹🇷',
  'pl': '🇵🇱',
  'nl': '🇳🇱',
  'sv': '🇸🇪',
  'da': '🇩🇰',
  'no': '🇳🇴',
  'fi': '🇫🇮',
  'cs': '🇨🇿',
  'sk': '🇸🇰',
  'hu': '🇭🇺',
  'ro': '🇷🇴',
  'bg': '🇧🇬',
  'hr': '🇭🇷',
  'sr': '🇷🇸',
  'sl': '🇸🇮',
  'et': '🇪🇪',
  'lv': '🇱🇻',
  'lt': '🇱🇹',
  'uk': '🇺🇦',
  'he': '🇮🇱',
  'th': '🇹🇭',
  'vi': '🇻🇳',
  'id': '🇮🇩',
  'ms': '🇲🇾',
  'tl': '🇵🇭',
  'sw': '🇰🇪',
  'am': '🇪🇹',
  'bn': '🇧🇩',
  'ur': '🇵🇰',
  'fa': '🇮🇷',
  'ta': '🇮🇳',
  'te': '🇮🇳',
  'ml': '🇮🇳',
  'kn': '🇮🇳',
  'gu': '🇮🇳',
  'pa': '🇮🇳',
  'mr': '🇮🇳',
  'ne': '🇳🇵',
  'si': '🇱🇰',
  'my': '🇲🇲',
  'km': '🇰🇭',
  'lo': '🇱🇦',
  'ka': '🇬🇪',
  'hy': '🇦🇲',
  'az': '🇦🇿',
  'kk': '🇰🇿',
  'ky': '🇰🇬',
  'uz': '🇺🇿',
  'tg': '🇹🇯',
  'mn': '🇲🇳'
};

/**
 * Obtient le nom d'affichage d'une langue à partir de son code.
 *
 * Normalise `.toLowerCase().trim()` avant lookup — parité stricte avec la SSOT
 * `getLanguageInfo` de `packages/shared/utils/languages.ts`. Les préférences
 * in-app sont persistées verbatim (un `systemLanguage: 'EN'` stocké est un cas
 * réel, cf. `conversation-helpers.ts`), donc sans normalisation un code
 * non-lowercase retombait à tort sur le fallback code brut.
 */
export function getLanguageDisplayName(languageCode: string | null | undefined): string {
  if (!languageCode) return 'Français'; // Valeur par défaut
  const code = languageCode.toLowerCase().trim();
  return LANGUAGE_NAMES[code] || code.toUpperCase();
}

/**
 * Obtient le drapeau emoji d'une langue à partir de son code.
 *
 * Même normalisation `.toLowerCase().trim()` que {@link getLanguageDisplayName}
 * et que la SSOT shared : un `'EN'` stocké doit rendre 🇺🇸, pas le globe 🌐.
 */
export function getLanguageFlag(languageCode: string | null | undefined): string {
  if (!languageCode) return '🇫🇷'; // Drapeau français par défaut
  return LANGUAGE_FLAGS[languageCode.toLowerCase().trim()] || '🌐';
}

/**
 * Obtient les informations complètes d'une langue
 */
export function getLanguageInfo(languageCode: string) {
  return {
    code: languageCode,
    name: getLanguageDisplayName(languageCode),
    flag: getLanguageFlag(languageCode)
  };
}

/**
 * Vérifie si un code de langue est supporté
 * @deprecated Use SUPPORTED_LANGUAGES from @shared/types or language-detection.ts instead
 */
export function isSupportedLanguage(languageCode: string): boolean {
  if (!languageCode) return false;
  return languageCode.toLowerCase().trim() in LANGUAGE_NAMES;
}

/**
 * Obtient la liste de toutes les langues supportées
 */
export function getAllSupportedLanguages() {
  return Object.keys(LANGUAGE_NAMES).map(code => getLanguageInfo(code));
}

/**
 * Recherche des langues par nom ou code
 */
export function searchLanguages(query: string) {
  const lowerQuery = query.toLowerCase();
  return getAllSupportedLanguages().filter(lang => 
    lang.code.toLowerCase().includes(lowerQuery) ||
    lang.name.toLowerCase().includes(lowerQuery)
  );
}
