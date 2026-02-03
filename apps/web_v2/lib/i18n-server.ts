/**
 * Server-side i18n utilities for Server Components
 * Loads translations synchronously for use in RSC
 */

import { headers, cookies } from 'next/headers';

// Type for translation function
export type TFunction = (key: string, params?: Record<string, string | number>) => string;
export type TArrayFunction = (key: string) => string[];

// Supported locales
export const SUPPORTED_LOCALES = ['en', 'fr'] as const;
export type SupportedLocale = typeof SUPPORTED_LOCALES[number];
export const DEFAULT_LOCALE: SupportedLocale = 'fr';

/**
 * Get the current locale from cookies or Accept-Language header
 */
export async function getLocale(): Promise<SupportedLocale> {
  try {
    // Try to get from cookie first
    const cookieStore = await cookies();
    const localeCookie = cookieStore.get('locale')?.value;

    if (localeCookie && SUPPORTED_LOCALES.includes(localeCookie as SupportedLocale)) {
      return localeCookie as SupportedLocale;
    }

    // Fall back to Accept-Language header
    const headersList = await headers();
    const acceptLanguage = headersList.get('accept-language');

    if (acceptLanguage) {
      // Parse Accept-Language header (e.g., "fr-FR,fr;q=0.9,en;q=0.8")
      const languages = acceptLanguage.split(',').map(lang => {
        const [code] = lang.trim().split(';');
        return code.split('-')[0].toLowerCase();
      });

      for (const lang of languages) {
        if (SUPPORTED_LOCALES.includes(lang as SupportedLocale)) {
          return lang as SupportedLocale;
        }
      }
    }
  } catch {
    // If headers/cookies not available (e.g., during build), use default
  }

  return DEFAULT_LOCALE;
}

/**
 * Load translations for a namespace
 * Uses dynamic import with caching
 */
const translationsCache = new Map<string, Record<string, unknown>>();

export async function loadTranslations(
  locale: SupportedLocale,
  namespace: string
): Promise<Record<string, unknown>> {
  const cacheKey = `${locale}-${namespace}`;

  // Check cache first (for production performance)
  if (process.env.NODE_ENV === 'production' && translationsCache.has(cacheKey)) {
    return translationsCache.get(cacheKey)!;
  }

  try {
    // Dynamic import of JSON file
    const data = await import(`@/locales/${locale}/${namespace}.json`);
    const translations = data.default || data;

    // Cache in production
    if (process.env.NODE_ENV === 'production') {
      translationsCache.set(cacheKey, translations);
    }

    return translations;
  } catch (error) {
    console.error(`[i18n-server] Failed to load ${locale}/${namespace}:`, error);

    // Try fallback locale
    if (locale !== DEFAULT_LOCALE) {
      try {
        const fallbackData = await import(`@/locales/${DEFAULT_LOCALE}/${namespace}.json`);
        return fallbackData.default || fallbackData;
      } catch {
        return {};
      }
    }

    return {};
  }
}

/**
 * Get nested value from object using dot notation
 */
function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce((current: unknown, key) => {
    if (current && typeof current === 'object' && key in (current as Record<string, unknown>)) {
      return (current as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

/**
 * Replace parameters in translation string
 */
function interpolate(str: string, params?: Record<string, string | number>): string {
  if (!params) return str;

  return Object.entries(params).reduce((result, [key, value]) => {
    return result.replace(new RegExp(`{{${key}}}`, 'g'), String(value));
  }, str);
}

/**
 * Create translation functions for a namespace
 * For use in Server Components
 */
export async function getTranslations(namespace: string) {
  const locale = await getLocale();
  const loadedTranslations = await loadTranslations(locale, namespace);

  // Extract namespace key if it exists (e.g., { "about": { ... } } -> { ... })
  // This allows both flat and nested JSON structures
  const translations = (loadedTranslations[namespace] as Record<string, unknown>) || loadedTranslations;

  const t: TFunction = (key: string, params?: Record<string, string | number>) => {
    const value = getNestedValue(translations, key);

    if (typeof value === 'string') {
      return interpolate(value, params);
    }

    // Return key if translation not found (helpful for debugging)
    return key;
  };

  const tArray: TArrayFunction = (key: string) => {
    const value = getNestedValue(translations, key);

    if (Array.isArray(value)) {
      return value as string[];
    }

    return [];
  };

  return { t, tArray, locale };
}

/**
 * Type-safe translation getter for specific namespaces
 */
export async function getAboutTranslations() {
  return getTranslations('about');
}

export async function getPrivacyTranslations() {
  return getTranslations('privacy');
}

export async function getTermsTranslations() {
  return getTranslations('terms');
}

export async function getContactTranslations() {
  return getTranslations('contact');
}

export async function getPartnersTranslations() {
  return getTranslations('partners');
}
