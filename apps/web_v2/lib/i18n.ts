/**
 * I18n Compatibility Layer
 * Provides backward compatibility for old i18n functions
 */

export type Locale = 'fr' | 'en' | 'pt' | 'es' | 'zh';

export const translatedLanguages = [
  { code: 'fr', nativeName: 'Français', translatedName: 'French' },
  { code: 'en', nativeName: 'English', translatedName: 'Anglais' },
  { code: 'pt', nativeName: 'Português', translatedName: 'Portugais' },
  { code: 'es', nativeName: 'Español', translatedName: 'Espagnol' },
  { code: 'zh', nativeName: '中文', translatedName: 'Chinois' },
];

export function getNativeNameForLanguage(code: string): string {
  const lang = translatedLanguages.find(l => l.code === code);
  return lang?.nativeName || code.toUpperCase();
}

export function getBestMatchingLocale(preferredLocales: string[]): Locale {
  for (const locale of preferredLocales) {
    const langCode = locale.split('-')[0];
    if (['fr', 'en', 'pt', 'es', 'zh'].includes(langCode)) {
      return langCode as Locale;
    }
  }
  return 'en';
}

export function detectUserPreferredLocale(): Locale {
  if (typeof window === 'undefined') return 'en';
  
  const browserLang = navigator.language.split('-')[0];
  if (['fr', 'en', 'pt', 'es', 'zh'].includes(browserLang)) {
    return browserLang as Locale;
  }
  return 'en';
}


