/**
 * Tests for Language Utilities
 */
import { describe, it, expect } from 'vitest';
import {
  SUPPORTED_LANGUAGES,
  getLanguageInfo,
  getLanguageName,
  getLanguageFlag,
  getLanguageColor,
  getLanguageTranslateText,
  isSupportedLanguage,
  getSupportedLanguageCodes,
  filterSupportedLanguages,
  MAX_MESSAGE_LENGTH,
  TOAST_SHORT_DURATION,
  TOAST_LONG_DURATION,
  TOAST_ERROR_DURATION,
  TYPING_CANCELATION_DELAY,
} from '../utils/languages';

describe('SUPPORTED_LANGUAGES', () => {
  it('should have at least 30 languages', () => {
    expect(SUPPORTED_LANGUAGES.length).toBeGreaterThanOrEqual(30);
  });

  it('should include common languages', () => {
    const codes = SUPPORTED_LANGUAGES.map(l => l.code);
    expect(codes).toContain('en');
    expect(codes).toContain('fr');
    expect(codes).toContain('de');
    expect(codes).toContain('es');
    expect(codes).toContain('zh');
  });

  it('should have required properties for each language', () => {
    SUPPORTED_LANGUAGES.forEach(lang => {
      expect(lang.code).toBeDefined();
      expect(lang.name).toBeDefined();
      expect(lang.flag).toBeDefined();
    });
  });
});

describe('getLanguageInfo', () => {
  it('should return correct info for supported language', () => {
    const info = getLanguageInfo('fr');
    expect(info.code).toBe('fr');
    expect(info.name).toBe('Français');
    expect(info.flag).toBe('🇫🇷');
    expect(info.color).toBe('bg-blue-500');
  });

  it('should return French as default for undefined', () => {
    const info = getLanguageInfo(undefined);
    expect(info.code).toBe('fr');
    expect(info.name).toBe('Français');
  });

  it('should return French as default for empty string', () => {
    const info = getLanguageInfo('');
    expect(info.code).toBe('fr');
  });

  it('should return French as default for "unknown"', () => {
    const info = getLanguageInfo('unknown');
    expect(info.code).toBe('fr');
  });

  it('should handle case insensitivity', () => {
    const info = getLanguageInfo('FR');
    expect(info.code).toBe('fr');
    expect(info.name).toBe('Français');
  });

  it('should trim whitespace', () => {
    const info = getLanguageInfo('  en  ');
    expect(info.code).toBe('en');
    expect(info.name).toBe('English');
  });

  it('should return fallback for unsupported language', () => {
    const info = getLanguageInfo('xyz');
    expect(info.code).toBe('xyz');
    expect(info.name).toBe('XYZ');
    expect(info.flag).toBe('🌐');
    expect(info.color).toBe('bg-gray-500');
    expect(info.translateText).toBe('Translate this message to xyz');
  });
});

describe('getLanguageName', () => {
  it('should return language name for supported code', () => {
    expect(getLanguageName('en')).toBe('English');
    expect(getLanguageName('fr')).toBe('Français');
    expect(getLanguageName('de')).toBe('Deutsch');
  });

  it('should return uppercase code for unsupported language', () => {
    expect(getLanguageName('xyz')).toBe('XYZ');
  });

  it('should return Français for undefined', () => {
    expect(getLanguageName(undefined)).toBe('Français');
  });
});

describe('getLanguageFlag', () => {
  it('should return flag emoji for supported code', () => {
    expect(getLanguageFlag('en')).toBe('🇬🇧');
    expect(getLanguageFlag('fr')).toBe('🇫🇷');
    expect(getLanguageFlag('de')).toBe('🇩🇪');
    expect(getLanguageFlag('es')).toBe('🇪🇸');
  });

  it('should return globe emoji for unsupported language', () => {
    expect(getLanguageFlag('xyz')).toBe('🌐');
  });

  it('should return French flag for undefined', () => {
    expect(getLanguageFlag(undefined)).toBe('🇫🇷');
  });
});

describe('getLanguageColor', () => {
  it('should return color class for supported code', () => {
    expect(getLanguageColor('fr')).toBe('bg-blue-500');
    expect(getLanguageColor('de')).toBe('bg-gray-800');
  });

  it('should return gray for unsupported language', () => {
    expect(getLanguageColor('xyz')).toBe('bg-gray-500');
  });

  it('should return French color for undefined', () => {
    expect(getLanguageColor(undefined)).toBe('bg-blue-500');
  });
});

describe('getLanguageTranslateText', () => {
  it('should return translate text for supported code', () => {
    expect(getLanguageTranslateText('fr')).toBe('Traduire ce message en français');
    expect(getLanguageTranslateText('en')).toBe('Translate this message to English');
  });

  it('should return generic text for unsupported language', () => {
    // Code uses lowercase for unsupported languages
    expect(getLanguageTranslateText('xyz')).toBe('Translate this message to xyz');
  });

  it('should return French text for undefined', () => {
    expect(getLanguageTranslateText(undefined)).toBe('Traduire ce message en français');
  });
});

describe('isSupportedLanguage', () => {
  it('should return true for supported languages', () => {
    expect(isSupportedLanguage('en')).toBe(true);
    expect(isSupportedLanguage('fr')).toBe(true);
    expect(isSupportedLanguage('zh')).toBe(true);
  });

  it('should return false for unsupported languages', () => {
    expect(isSupportedLanguage('xyz')).toBe(false);
    expect(isSupportedLanguage('abc')).toBe(false);
  });

  it('should return false for undefined/null', () => {
    expect(isSupportedLanguage(undefined)).toBe(false);
  });

  it('should handle case insensitivity', () => {
    expect(isSupportedLanguage('EN')).toBe(true);
    expect(isSupportedLanguage('Fr')).toBe(true);
  });

  it('should trim whitespace', () => {
    expect(isSupportedLanguage('  fr  ')).toBe(true);
  });
});

describe('getSupportedLanguageCodes', () => {
  it('should return array of language codes', () => {
    const codes = getSupportedLanguageCodes();
    expect(Array.isArray(codes)).toBe(true);
    expect(codes).toContain('en');
    expect(codes).toContain('fr');
    expect(codes.length).toBe(SUPPORTED_LANGUAGES.length);
  });
});

describe('filterSupportedLanguages', () => {
  it('should filter languages by predicate', () => {
    const europeanLanguages = filterSupportedLanguages(lang =>
      ['fr', 'de', 'es', 'it', 'nl'].includes(lang.code)
    );
    expect(europeanLanguages.length).toBe(5);
    expect(europeanLanguages.map(l => l.code)).toContain('fr');
    expect(europeanLanguages.map(l => l.code)).toContain('de');
  });

  it('should return empty array if no match', () => {
    const result = filterSupportedLanguages(() => false);
    expect(result).toEqual([]);
  });

  it('should return all languages if predicate always true', () => {
    const result = filterSupportedLanguages(() => true);
    expect(result.length).toBe(SUPPORTED_LANGUAGES.length);
  });
});

describe('Constants', () => {
  it('should have correct values', () => {
    expect(MAX_MESSAGE_LENGTH).toBe(2000);
    expect(TOAST_SHORT_DURATION).toBe(2000);
    expect(TOAST_LONG_DURATION).toBe(3000);
    expect(TOAST_ERROR_DURATION).toBe(5000);
    expect(TYPING_CANCELATION_DELAY).toBe(2000);
  });
});
