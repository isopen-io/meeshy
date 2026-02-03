/**
 * I18n Utilities - Helper functions for internationalization
 */

import { TranslationParams, TranslationModule, SupportedLanguage } from '@/types/i18n';

/**
 * Interpolate parameters in a translation string
 * Example: "Hello {name}!" with params {name: "John"} => "Hello John!"
 */
export function interpolate(text: string, params?: TranslationParams): string {
  if (!params || typeof text !== 'string') {
    return text;
  }

  return text.replace(/\{(\w+)\}/g, (match, key) => {
    const value = params[key];
    return value !== undefined ? String(value) : match;
  });
}

/**
 * Get nested value from object using dot notation
 * Example: get(obj, 'user.name') => obj.user.name
 */
export function getNestedValue(
  obj: TranslationModule | undefined,
  path: string
): string | TranslationModule | string[] | undefined {
  if (!obj) return undefined;

  const keys = path.split('.');
  let current: any = obj;

  for (const key of keys) {
    if (current === null || current === undefined) {
      return undefined;
    }
    current = current[key];
  }

  return current;
}

/**
 * Flatten nested translation object to flat key-value pairs
 * Example: {user: {name: "Name"}} => {"user.name": "Name"}
 */
export function flattenTranslations(
  obj: TranslationModule,
  prefix = ''
): Record<string, string> {
  const result: Record<string, string> = {};

  for (const key in obj) {
    const value = obj[key];
    const newKey = prefix ? `${prefix}.${key}` : key;

    if (typeof value === 'string') {
      result[newKey] = value;
    } else if (Array.isArray(value)) {
      // Store arrays as JSON strings
      result[newKey] = JSON.stringify(value);
    } else if (typeof value === 'object' && value !== null) {
      Object.assign(result, flattenTranslations(value as TranslationModule, newKey));
    }
  }

  return result;
}

/**
 * Simple pluralization helper
 * Returns appropriate form based on count
 */
export function pluralize(
  count: number,
  singular: string,
  plural: string
): string {
  return count === 1 ? singular : plural;
}

/**
 * Detect browser language with fallback
 */
export function detectBrowserLanguage(
  supportedLanguages: SupportedLanguage[]
): SupportedLanguage {
  if (typeof window === 'undefined') {
    return 'en';
  }

  // Get browser language (e.g., "fr-FR" => "fr")
  const browserLang = navigator.language.split('-')[0] as SupportedLanguage;

  // Check if browser language is supported
  if (supportedLanguages.includes(browserLang)) {
    return browserLang;
  }

  // Fallback to English
  return 'en';
}

/**
 * Validate if a language code is supported
 */
export function isLanguageSupported(
  language: string,
  supportedLanguages: SupportedLanguage[]
): language is SupportedLanguage {
  return supportedLanguages.includes(language as SupportedLanguage);
}

/**
 * Get translation with fallback chain: current lang -> en -> key
 */
export function getTranslationWithFallback(
  key: string,
  currentLang: SupportedLanguage,
  loadedModules: Record<string, Record<string, TranslationModule>>,
  module?: string
): string {
  // Build full key with module prefix if provided
  const fullKey = module ? `${module}.${key}` : key;
  const [moduleName, ...pathParts] = fullKey.split('.');
  const path = pathParts.join('.');

  // Try current language
  const currentTranslations = loadedModules[currentLang]?.[moduleName];
  if (currentTranslations) {
    const value = getNestedValue(currentTranslations, path);
    if (typeof value === 'string') {
      return value;
    }
  }

  // Fallback to English if not current language
  if (currentLang !== 'en') {
    const enTranslations = loadedModules['en']?.[moduleName];
    if (enTranslations) {
      const value = getNestedValue(enTranslations, path);
      if (typeof value === 'string') {
        return value;
      }
    }
  }

  // Final fallback: return the key itself
  console.warn(`[I18N] Translation not found for key: ${fullKey}`);
  return fullKey;
}

/**
 * Load translation module dynamically
 */
export async function loadTranslationModule(
  language: SupportedLanguage,
  module: string
): Promise<TranslationModule> {
  try {
    // Dynamic import of translation file
    const translations = await import(`@/locales/${language}/${module}.json`);
    return translations.default || translations;
  } catch (error) {
    console.error(`[I18N] Failed to load module ${module} for language ${language}:`, error);
    
    // Fallback to English if not already trying English
    if (language !== 'en') {
      try {
        const enTranslations = await import(`@/locales/en/${module}.json`);
        return enTranslations.default || enTranslations;
      } catch (enError) {
        console.error(`[I18N] Failed to load fallback EN module ${module}:`, enError);
      }
    }
    
    throw error;
  }
}

/**
 * Cache key for localStorage persistence
 */
export const I18N_STORAGE_KEY = 'meeshy-i18n-language';

/**
 * Save language preference to localStorage
 */
export function saveLanguagePreference(language: SupportedLanguage): void {
  try {
    localStorage.setItem(I18N_STORAGE_KEY, language);
  } catch (error) {
    console.error('[I18N] Failed to save language preference:', error);
  }
}

/**
 * Load language preference from localStorage
 */
export function loadLanguagePreference(): SupportedLanguage | null {
  try {
    const saved = localStorage.getItem(I18N_STORAGE_KEY);
    return saved as SupportedLanguage | null;
  } catch (error) {
    console.error('[I18N] Failed to load language preference:', error);
    return null;
  }
}

