/**
 * Languages Utility Comprehensive Unit Tests
 *
 * This test suite provides thorough coverage of the languages utility module including:
 * - SUPPORTED_LANGUAGES constant validation
 * - Language info retrieval with caching
 * - Language name, flag, color, and translate text retrieval
 * - Language code validation and normalization
 * - Supported language code list retrieval
 * - Language filtering functionality
 * - Edge cases and error handling
 *
 * Coverage target: > 65%
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import {
  SUPPORTED_LANGUAGES,
  SupportedLanguageInfo,
  getLanguageInfo,
  getLanguageName,
  getLanguageFlag,
  getLanguageColor,
  getLanguageTranslateText,
  isSupportedLanguage,
  getSupportedLanguageCodes,
  filterSupportedLanguages,
  LanguageStats,
} from '../../../utils/languages';

describe('Languages Utility Module', () => {
  // ==============================================
  // SUPPORTED_LANGUAGES CONSTANT TESTS
  // ==============================================

  describe('SUPPORTED_LANGUAGES', () => {
    it('should be defined as an array', () => {
      expect(SUPPORTED_LANGUAGES).toBeDefined();
      expect(Array.isArray(SUPPORTED_LANGUAGES)).toBe(true);
    });

    it('should contain at least 8 languages', () => {
      expect(SUPPORTED_LANGUAGES.length).toBeGreaterThanOrEqual(8);
    });

    it('should contain French as the first language', () => {
      const french = SUPPORTED_LANGUAGES[0];
      expect(french.code).toBe('fr');
      expect(french.name).toBe('Français');
    });

    it('should contain English', () => {
      const english = SUPPORTED_LANGUAGES.find(lang => lang.code === 'en');
      expect(english).toBeDefined();
      expect(english!.name).toBe('English');
      expect(english!.flag).toBe('\uD83C\uDDEC\uD83C\uDDE7'); // British flag emoji
    });

    it('should contain all required properties for each language', () => {
      SUPPORTED_LANGUAGES.forEach(lang => {
        expect(lang).toHaveProperty('code');
        expect(lang).toHaveProperty('name');
        expect(lang).toHaveProperty('flag');
        expect(typeof lang.code).toBe('string');
        expect(typeof lang.name).toBe('string');
        expect(typeof lang.flag).toBe('string');
      });
    });

    it('should have unique language codes', () => {
      const codes = SUPPORTED_LANGUAGES.map(lang => lang.code);
      const uniqueCodes = new Set(codes);
      expect(uniqueCodes.size).toBe(codes.length);
    });

    it('should have color property for all languages', () => {
      SUPPORTED_LANGUAGES.forEach(lang => {
        expect(lang).toHaveProperty('color');
        expect(typeof lang.color).toBe('string');
        expect(lang.color!.startsWith('bg-')).toBe(true);
      });
    });

    it('should have translateText property for all languages', () => {
      SUPPORTED_LANGUAGES.forEach(lang => {
        expect(lang).toHaveProperty('translateText');
        expect(typeof lang.translateText).toBe('string');
        expect(lang.translateText!.length).toBeGreaterThan(0);
      });
    });

    it('should contain Spanish', () => {
      const spanish = SUPPORTED_LANGUAGES.find(lang => lang.code === 'es');
      expect(spanish).toBeDefined();
      expect(spanish!.name).toBe('Español');
    });

    it('should contain German', () => {
      const german = SUPPORTED_LANGUAGES.find(lang => lang.code === 'de');
      expect(german).toBeDefined();
      expect(german!.name).toBe('Deutsch');
    });

    it('should contain Portuguese', () => {
      const portuguese = SUPPORTED_LANGUAGES.find(lang => lang.code === 'pt');
      expect(portuguese).toBeDefined();
      expect(portuguese!.name).toBe('Português');
    });

    it('should contain Chinese', () => {
      const chinese = SUPPORTED_LANGUAGES.find(lang => lang.code === 'zh');
      expect(chinese).toBeDefined();
      expect(chinese!.flag).toBe('\uD83C\uDDE8\uD83C\uDDF3'); // Chinese flag emoji
    });

    it('should contain Japanese', () => {
      const japanese = SUPPORTED_LANGUAGES.find(lang => lang.code === 'ja');
      expect(japanese).toBeDefined();
      expect(japanese!.flag).toBe('\uD83C\uDDEF\uD83C\uDDF5'); // Japanese flag emoji
    });

    it('should contain Arabic', () => {
      const arabic = SUPPORTED_LANGUAGES.find(lang => lang.code === 'ar');
      expect(arabic).toBeDefined();
      expect(arabic!.flag).toBe('\uD83C\uDDF8\uD83C\uDDE6'); // Saudi flag emoji
    });
  });

  // ==============================================
  // getLanguageInfo TESTS
  // ==============================================

  describe('getLanguageInfo', () => {
    it('should return French info for "fr" code', () => {
      const result = getLanguageInfo('fr');
      expect(result.code).toBe('fr');
      expect(result.name).toBe('Français');
      expect(result.flag).toBe('\uD83C\uDDEB\uD83C\uDDF7');
    });

    it('should return English info for "en" code', () => {
      const result = getLanguageInfo('en');
      expect(result.code).toBe('en');
      expect(result.name).toBe('English');
    });

    it('should handle uppercase language codes', () => {
      const result = getLanguageInfo('EN');
      expect(result.code).toBe('en');
      expect(result.name).toBe('English');
    });

    it('should handle mixed case language codes', () => {
      const result = getLanguageInfo('Fr');
      expect(result.code).toBe('fr');
      expect(result.name).toBe('Français');
    });

    it('should handle codes with whitespace', () => {
      const result = getLanguageInfo('  en  ');
      expect(result.code).toBe('en');
      expect(result.name).toBe('English');
    });

    it('should return French as default for undefined code', () => {
      const result = getLanguageInfo(undefined);
      expect(result.code).toBe('fr');
      expect(result.name).toBe('Français');
    });

    it('should return French as default for empty string', () => {
      const result = getLanguageInfo('');
      expect(result.code).toBe('fr');
      expect(result.name).toBe('Français');
    });

    it('should return French as default for whitespace-only string', () => {
      const result = getLanguageInfo('   ');
      expect(result.code).toBe('fr');
      expect(result.name).toBe('Français');
    });

    it('should return French as default for "unknown" code', () => {
      const result = getLanguageInfo('unknown');
      expect(result.code).toBe('fr');
      expect(result.name).toBe('Français');
    });

    it('should return fallback object for unsupported language code', () => {
      const result = getLanguageInfo('xx');
      expect(result.code).toBe('xx');
      expect(result.name).toBe('XX');
      expect(result.flag).toBe('\uD83C\uDF10'); // Globe emoji
      expect(result.color).toBe('bg-gray-500');
      expect(result.translateText).toBe('Translate this message to xx');
    });

    it('should return fallback object for long unsupported code', () => {
      const result = getLanguageInfo('unknown-lang');
      expect(result.code).toBe('unknown-lang');
      expect(result.name).toBe('UNKNOWN-LANG');
      expect(result.flag).toBe('\uD83C\uDF10');
    });

    it('should include all properties in returned object', () => {
      const result = getLanguageInfo('es');
      expect(result).toHaveProperty('code');
      expect(result).toHaveProperty('name');
      expect(result).toHaveProperty('flag');
      expect(result).toHaveProperty('color');
      expect(result).toHaveProperty('translateText');
    });

    it('should return consistent results for same code (cache test)', () => {
      const result1 = getLanguageInfo('de');
      const result2 = getLanguageInfo('de');
      expect(result1).toEqual(result2);
    });

    it('should return same object reference for cached languages', () => {
      const result1 = getLanguageInfo('pt');
      const result2 = getLanguageInfo('pt');
      // Should be same reference since it comes from cache
      expect(result1).toBe(result2);
    });
  });

  // ==============================================
  // getLanguageName TESTS
  // ==============================================

  describe('getLanguageName', () => {
    it('should return "Français" for "fr"', () => {
      expect(getLanguageName('fr')).toBe('Français');
    });

    it('should return "English" for "en"', () => {
      expect(getLanguageName('en')).toBe('English');
    });

    it('should return "Español" for "es"', () => {
      expect(getLanguageName('es')).toBe('Español');
    });

    it('should return "Deutsch" for "de"', () => {
      expect(getLanguageName('de')).toBe('Deutsch');
    });

    it('should return default name for undefined', () => {
      expect(getLanguageName(undefined)).toBe('Français');
    });

    it('should return uppercase code for unsupported language', () => {
      expect(getLanguageName('xyz')).toBe('XYZ');
    });

    it('should handle case insensitive codes', () => {
      expect(getLanguageName('EN')).toBe('English');
      expect(getLanguageName('JA')).toBe('\u65E5\u672C\u8A9E'); // Japanese name
    });
  });

  // ==============================================
  // getLanguageFlag TESTS
  // ==============================================

  describe('getLanguageFlag', () => {
    it('should return French flag for "fr"', () => {
      expect(getLanguageFlag('fr')).toBe('\uD83C\uDDEB\uD83C\uDDF7');
    });

    it('should return British flag for "en"', () => {
      expect(getLanguageFlag('en')).toBe('\uD83C\uDDEC\uD83C\uDDE7');
    });

    it('should return Spanish flag for "es"', () => {
      expect(getLanguageFlag('es')).toBe('\uD83C\uDDEA\uD83C\uDDF8');
    });

    it('should return German flag for "de"', () => {
      expect(getLanguageFlag('de')).toBe('\uD83C\uDDE9\uD83C\uDDEA');
    });

    it('should return Portuguese flag for "pt"', () => {
      expect(getLanguageFlag('pt')).toBe('\uD83C\uDDF5\uD83C\uDDF9');
    });

    it('should return Chinese flag for "zh"', () => {
      expect(getLanguageFlag('zh')).toBe('\uD83C\uDDE8\uD83C\uDDF3');
    });

    it('should return Japanese flag for "ja"', () => {
      expect(getLanguageFlag('ja')).toBe('\uD83C\uDDEF\uD83C\uDDF5');
    });

    it('should return Saudi flag for "ar"', () => {
      expect(getLanguageFlag('ar')).toBe('\uD83C\uDDF8\uD83C\uDDE6');
    });

    it('should return globe emoji for unsupported language', () => {
      expect(getLanguageFlag('xyz')).toBe('\uD83C\uDF10');
    });

    it('should return default flag for undefined', () => {
      expect(getLanguageFlag(undefined)).toBe('\uD83C\uDDEB\uD83C\uDDF7');
    });
  });

  // ==============================================
  // getLanguageColor TESTS
  // ==============================================

  describe('getLanguageColor', () => {
    it('should return blue color for French', () => {
      expect(getLanguageColor('fr')).toBe('bg-blue-500');
    });

    it('should return red color for English', () => {
      expect(getLanguageColor('en')).toBe('bg-red-500');
    });

    it('should return yellow color for Spanish', () => {
      expect(getLanguageColor('es')).toBe('bg-yellow-500');
    });

    it('should return gray-800 for German', () => {
      expect(getLanguageColor('de')).toBe('bg-gray-800');
    });

    it('should return green-500 for Portuguese', () => {
      expect(getLanguageColor('pt')).toBe('bg-green-500');
    });

    it('should return red-600 for Chinese', () => {
      expect(getLanguageColor('zh')).toBe('bg-red-600');
    });

    it('should return gray-500 for unsupported language', () => {
      expect(getLanguageColor('xyz')).toBe('bg-gray-500');
    });

    it('should return default color for undefined', () => {
      expect(getLanguageColor(undefined)).toBe('bg-blue-500');
    });

    it('should handle case insensitivity', () => {
      expect(getLanguageColor('FR')).toBe('bg-blue-500');
    });
  });

  // ==============================================
  // getLanguageTranslateText TESTS
  // ==============================================

  describe('getLanguageTranslateText', () => {
    it('should return French translate text', () => {
      expect(getLanguageTranslateText('fr')).toBe('Traduire ce message en français');
    });

    it('should return English translate text', () => {
      expect(getLanguageTranslateText('en')).toBe('Translate this message to English');
    });

    it('should return Spanish translate text', () => {
      expect(getLanguageTranslateText('es')).toBe('Traducir este mensaje al español');
    });

    it('should return German translate text', () => {
      expect(getLanguageTranslateText('de')).toBe('Diese Nachricht ins Deutsche übersetzen');
    });

    it('should return Portuguese translate text', () => {
      expect(getLanguageTranslateText('pt')).toBe('Traduzir esta mensagem para português');
    });

    it('should return Chinese translate text', () => {
      expect(getLanguageTranslateText('zh')).toContain('\u4E2D\u6587'); // Contains Chinese characters
    });

    it('should return Japanese translate text', () => {
      expect(getLanguageTranslateText('ja')).toContain('\u65E5\u672C\u8A9E'); // Contains Japanese characters
    });

    it('should return Arabic translate text', () => {
      expect(getLanguageTranslateText('ar')).toContain('\u0627\u0644\u0639\u0631\u0628\u064A\u0629'); // Contains Arabic characters
    });

    it('should return fallback translate text for unsupported language', () => {
      const result = getLanguageTranslateText('xyz');
      // Fallback uses the language name which is uppercase code
      expect(result).toContain('xyz');
    });

    it('should return default translate text for undefined', () => {
      expect(getLanguageTranslateText(undefined)).toBe('Traduire ce message en français');
    });
  });

  // ==============================================
  // isSupportedLanguage TESTS
  // ==============================================

  describe('isSupportedLanguage', () => {
    it('should return true for French', () => {
      expect(isSupportedLanguage('fr')).toBe(true);
    });

    it('should return true for English', () => {
      expect(isSupportedLanguage('en')).toBe(true);
    });

    it('should return true for Spanish', () => {
      expect(isSupportedLanguage('es')).toBe(true);
    });

    it('should return true for German', () => {
      expect(isSupportedLanguage('de')).toBe(true);
    });

    it('should return true for Portuguese', () => {
      expect(isSupportedLanguage('pt')).toBe(true);
    });

    it('should return true for Chinese', () => {
      expect(isSupportedLanguage('zh')).toBe(true);
    });

    it('should return true for Japanese', () => {
      expect(isSupportedLanguage('ja')).toBe(true);
    });

    it('should return true for Arabic', () => {
      expect(isSupportedLanguage('ar')).toBe(true);
    });

    it('should return false for unsupported language', () => {
      expect(isSupportedLanguage('xyz')).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(isSupportedLanguage(undefined)).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(isSupportedLanguage('')).toBe(false);
    });

    it('should handle case insensitivity', () => {
      expect(isSupportedLanguage('EN')).toBe(true);
      expect(isSupportedLanguage('Fr')).toBe(true);
      expect(isSupportedLanguage('ES')).toBe(true);
    });

    it('should handle whitespace', () => {
      expect(isSupportedLanguage('  en  ')).toBe(true);
      expect(isSupportedLanguage('  fr  ')).toBe(true);
    });

    it('should return false for null-like values', () => {
      expect(isSupportedLanguage(null as unknown as string)).toBe(false);
    });
  });

  // ==============================================
  // getSupportedLanguageCodes TESTS
  // ==============================================

  describe('getSupportedLanguageCodes', () => {
    it('should return an array of strings', () => {
      const codes = getSupportedLanguageCodes();
      expect(Array.isArray(codes)).toBe(true);
      codes.forEach(code => {
        expect(typeof code).toBe('string');
      });
    });

    it('should return at least 8 codes', () => {
      const codes = getSupportedLanguageCodes();
      expect(codes.length).toBeGreaterThanOrEqual(8);
    });

    it('should include French', () => {
      const codes = getSupportedLanguageCodes();
      expect(codes).toContain('fr');
    });

    it('should include English', () => {
      const codes = getSupportedLanguageCodes();
      expect(codes).toContain('en');
    });

    it('should include all supported languages', () => {
      const codes = getSupportedLanguageCodes();
      expect(codes).toContain('fr');
      expect(codes).toContain('en');
      expect(codes).toContain('es');
      expect(codes).toContain('de');
      expect(codes).toContain('pt');
      expect(codes).toContain('zh');
      expect(codes).toContain('ja');
      expect(codes).toContain('ar');
    });

    it('should have same length as SUPPORTED_LANGUAGES', () => {
      const codes = getSupportedLanguageCodes();
      expect(codes.length).toBe(SUPPORTED_LANGUAGES.length);
    });

    it('should return unique codes', () => {
      const codes = getSupportedLanguageCodes();
      const uniqueCodes = new Set(codes);
      expect(uniqueCodes.size).toBe(codes.length);
    });
  });

  // ==============================================
  // filterSupportedLanguages TESTS
  // ==============================================

  describe('filterSupportedLanguages', () => {
    it('should filter languages by code pattern', () => {
      const result = filterSupportedLanguages(lang => lang.code.startsWith('e'));
      expect(result.length).toBeGreaterThanOrEqual(1);
      result.forEach(lang => {
        expect(lang.code.startsWith('e')).toBe(true);
      });
    });

    it('should filter languages by color', () => {
      const result = filterSupportedLanguages(lang => lang.color === 'bg-blue-500');
      expect(result.length).toBeGreaterThanOrEqual(1);
      expect(result.some(lang => lang.code === 'fr')).toBe(true);
    });

    it('should filter languages with specific flag', () => {
      const result = filterSupportedLanguages(lang => lang.flag === '\uD83C\uDDEB\uD83C\uDDF7');
      expect(result.length).toBe(1);
      expect(result[0].code).toBe('fr');
    });

    it('should return empty array when no matches', () => {
      const result = filterSupportedLanguages(lang => lang.code === 'nonexistent');
      expect(result).toEqual([]);
    });

    it('should return all languages when predicate always returns true', () => {
      const result = filterSupportedLanguages(() => true);
      expect(result.length).toBe(SUPPORTED_LANGUAGES.length);
    });

    it('should return empty array when predicate always returns false', () => {
      const result = filterSupportedLanguages(() => false);
      expect(result.length).toBe(0);
    });

    it('should filter by name containing substring', () => {
      const result = filterSupportedLanguages(lang =>
        lang.name.toLowerCase().includes('a')
      );
      expect(result.length).toBeGreaterThanOrEqual(1);
    });

    it('should filter by translateText content', () => {
      const result = filterSupportedLanguages(lang =>
        lang.translateText?.includes('Translate') ?? false
      );
      expect(result.length).toBeGreaterThanOrEqual(1);
    });

    it('should preserve language object structure', () => {
      const result = filterSupportedLanguages(lang => lang.code === 'en');
      expect(result.length).toBe(1);
      expect(result[0]).toHaveProperty('code');
      expect(result[0]).toHaveProperty('name');
      expect(result[0]).toHaveProperty('flag');
      expect(result[0]).toHaveProperty('color');
      expect(result[0]).toHaveProperty('translateText');
    });

    it('should filter European languages', () => {
      const europeanCodes = ['fr', 'en', 'es', 'de', 'pt'];
      const result = filterSupportedLanguages(lang =>
        europeanCodes.includes(lang.code)
      );
      expect(result.length).toBe(5);
    });

    it('should filter Asian languages', () => {
      const asianCodes = ['zh', 'ja'];
      const result = filterSupportedLanguages(lang =>
        asianCodes.includes(lang.code)
      );
      expect(result.length).toBe(2);
    });
  });

  // ==============================================
  // SupportedLanguageInfo INTERFACE TESTS
  // ==============================================

  describe('SupportedLanguageInfo interface', () => {
    it('should have required code property', () => {
      const lang: SupportedLanguageInfo = {
        code: 'test',
        name: 'Test',
        flag: '\uD83C\uDF10',
      };
      expect(lang.code).toBe('test');
    });

    it('should have required name property', () => {
      const lang: SupportedLanguageInfo = {
        code: 'test',
        name: 'Test Language',
        flag: '\uD83C\uDF10',
      };
      expect(lang.name).toBe('Test Language');
    });

    it('should have required flag property', () => {
      const lang: SupportedLanguageInfo = {
        code: 'test',
        name: 'Test',
        flag: '\uD83C\uDF10',
      };
      expect(lang.flag).toBe('\uD83C\uDF10');
    });

    it('should allow optional color property', () => {
      const lang: SupportedLanguageInfo = {
        code: 'test',
        name: 'Test',
        flag: '\uD83C\uDF10',
        color: 'bg-purple-500',
      };
      expect(lang.color).toBe('bg-purple-500');
    });

    it('should allow optional translateText property', () => {
      const lang: SupportedLanguageInfo = {
        code: 'test',
        name: 'Test',
        flag: '\uD83C\uDF10',
        translateText: 'Translate to Test',
      };
      expect(lang.translateText).toBe('Translate to Test');
    });
  });

  // ==============================================
  // LanguageStats INTERFACE TESTS
  // ==============================================

  describe('LanguageStats interface', () => {
    it('should have required properties', () => {
      const stats: LanguageStats = {
        language: 'fr',
        flag: '\uD83C\uDDEB\uD83C\uDDF7',
        count: 100,
        color: 'bg-blue-500',
      };
      expect(stats.language).toBe('fr');
      expect(stats.flag).toBe('\uD83C\uDDEB\uD83C\uDDF7');
      expect(stats.count).toBe(100);
      expect(stats.color).toBe('bg-blue-500');
    });

    it('should allow zero count', () => {
      const stats: LanguageStats = {
        language: 'en',
        flag: '\uD83C\uDDEC\uD83C\uDDE7',
        count: 0,
        color: 'bg-red-500',
      };
      expect(stats.count).toBe(0);
    });
  });

  // ==============================================
  // EDGE CASES AND ERROR HANDLING
  // ==============================================

  describe('Edge Cases', () => {
    it('should handle very long language code', () => {
      const longCode = 'a'.repeat(100);
      const result = getLanguageInfo(longCode);
      expect(result.code).toBe(longCode);
      expect(result.name).toBe(longCode.toUpperCase());
    });

    it('should handle special characters in code', () => {
      const result = getLanguageInfo('en-US');
      expect(result.code).toBe('en-us');
      expect(result.flag).toBe('\uD83C\uDF10');
    });

    it('should handle numeric code', () => {
      const result = getLanguageInfo('123');
      expect(result.code).toBe('123');
      expect(result.name).toBe('123');
    });

    it('should handle code with newlines', () => {
      const result = getLanguageInfo('en\n');
      expect(result.code).toBe('en');
    });

    it('should handle code with tabs', () => {
      const result = getLanguageInfo('\ten\t');
      expect(result.code).toBe('en');
    });

    it('should return correct info after multiple calls to different languages', () => {
      // Ensure cache doesn't interfere
      const fr = getLanguageInfo('fr');
      const en = getLanguageInfo('en');
      const es = getLanguageInfo('es');
      const frAgain = getLanguageInfo('fr');

      expect(fr.code).toBe('fr');
      expect(en.code).toBe('en');
      expect(es.code).toBe('es');
      expect(frAgain).toBe(fr); // Should be same reference
    });
  });

  // ==============================================
  // CACHE BEHAVIOR TESTS
  // ==============================================

  describe('Cache Behavior', () => {
    it('should initialize cache on first call', () => {
      // First call should initialize cache
      const result = getLanguageInfo('en');
      expect(result).toBeDefined();
    });

    it('should return cached value on subsequent calls', () => {
      const first = getLanguageInfo('de');
      const second = getLanguageInfo('de');
      expect(first).toBe(second);
    });

    it('should cache all supported languages', () => {
      // Call each language once
      SUPPORTED_LANGUAGES.forEach(lang => {
        const result = getLanguageInfo(lang.code);
        expect(result.code).toBe(lang.code);
      });

      // Verify cache hit returns same objects
      SUPPORTED_LANGUAGES.forEach(lang => {
        const cached = getLanguageInfo(lang.code);
        expect(cached.code).toBe(lang.code);
      });
    });

    it('should not cache unsupported languages', () => {
      const first = getLanguageInfo('unsupported1');
      const second = getLanguageInfo('unsupported2');
      expect(first.code).toBe('unsupported1');
      expect(second.code).toBe('unsupported2');
      expect(first).not.toBe(second);
    });
  });

  // ==============================================
  // PERFORMANCE CHARACTERISTICS
  // ==============================================

  describe('Performance', () => {
    it('should handle many lookups efficiently', () => {
      const startTime = Date.now();
      for (let i = 0; i < 1000; i++) {
        getLanguageInfo('en');
        getLanguageInfo('fr');
        getLanguageInfo('es');
      }
      const endTime = Date.now();
      const duration = endTime - startTime;
      // Should complete 3000 lookups in under 100ms
      expect(duration).toBeLessThan(100);
    });

    it('should handle getSupportedLanguageCodes multiple times', () => {
      for (let i = 0; i < 100; i++) {
        const codes = getSupportedLanguageCodes();
        expect(codes.length).toBeGreaterThanOrEqual(8);
      }
    });

    it('should handle filterSupportedLanguages multiple times', () => {
      for (let i = 0; i < 100; i++) {
        const filtered = filterSupportedLanguages(lang => lang.code === 'en');
        expect(filtered.length).toBe(1);
      }
    });
  });
});
