/**
 * Tests for i18n module
 * Tests internationalization compatibility layer
 */

import {
  translatedLanguages,
  getNativeNameForLanguage,
  getBestMatchingLocale,
  detectUserPreferredLocale,
  type Locale,
} from '../../lib/i18n';

describe('I18n Module', () => {
  describe('translatedLanguages constant', () => {
    it('should contain French language', () => {
      const french = translatedLanguages.find((l) => l.code === 'fr');
      expect(french).toBeDefined();
      expect(french?.nativeName).toBe('Français');
      expect(french?.translatedName).toBe('French');
    });

    it('should contain English language', () => {
      const english = translatedLanguages.find((l) => l.code === 'en');
      expect(english).toBeDefined();
      expect(english?.nativeName).toBe('English');
      expect(english?.translatedName).toBe('Anglais');
    });

    it('should contain Portuguese language', () => {
      const portuguese = translatedLanguages.find((l) => l.code === 'pt');
      expect(portuguese).toBeDefined();
      expect(portuguese?.nativeName).toBe('Português');
      expect(portuguese?.translatedName).toBe('Portugais');
    });

    it('should contain Spanish language', () => {
      const spanish = translatedLanguages.find((l) => l.code === 'es');
      expect(spanish).toBeDefined();
      expect(spanish?.nativeName).toBe('Español');
      expect(spanish?.translatedName).toBe('Espagnol');
    });

    it('should contain Chinese language', () => {
      const chinese = translatedLanguages.find((l) => l.code === 'zh');
      expect(chinese).toBeDefined();
      expect(chinese?.translatedName).toBe('Chinois');
    });

    it('should have 5 supported languages', () => {
      expect(translatedLanguages).toHaveLength(5);
    });

    it('should have required properties for all languages', () => {
      translatedLanguages.forEach((lang) => {
        expect(lang).toHaveProperty('code');
        expect(lang).toHaveProperty('nativeName');
        expect(lang).toHaveProperty('translatedName');
        expect(typeof lang.code).toBe('string');
        expect(typeof lang.nativeName).toBe('string');
        expect(typeof lang.translatedName).toBe('string');
      });
    });
  });

  describe('getNativeNameForLanguage', () => {
    it('should return French native name', () => {
      expect(getNativeNameForLanguage('fr')).toBe('Français');
    });

    it('should return English native name', () => {
      expect(getNativeNameForLanguage('en')).toBe('English');
    });

    it('should return Portuguese native name', () => {
      expect(getNativeNameForLanguage('pt')).toBe('Português');
    });

    it('should return Spanish native name', () => {
      expect(getNativeNameForLanguage('es')).toBe('Español');
    });

    it('should return uppercase code for unknown language', () => {
      expect(getNativeNameForLanguage('xyz')).toBe('XYZ');
    });

    it('should return uppercase code for empty string', () => {
      expect(getNativeNameForLanguage('')).toBe('');
    });

    it('should handle case sensitivity', () => {
      // The function looks for exact match, so uppercase won't find it
      expect(getNativeNameForLanguage('FR')).toBe('FR');
    });
  });

  describe('getBestMatchingLocale', () => {
    it('should return fr for French preferences', () => {
      const result = getBestMatchingLocale(['fr-FR', 'en-US']);
      expect(result).toBe('fr');
    });

    it('should return en for English preferences', () => {
      const result = getBestMatchingLocale(['en-US', 'fr-FR']);
      expect(result).toBe('en');
    });

    it('should return pt for Portuguese preferences', () => {
      const result = getBestMatchingLocale(['pt-BR', 'en-US']);
      expect(result).toBe('pt');
    });

    it('should return es for Spanish preferences', () => {
      const result = getBestMatchingLocale(['es-ES', 'en-US']);
      expect(result).toBe('es');
    });

    it('should return zh for Chinese preferences', () => {
      const result = getBestMatchingLocale(['zh-CN', 'en-US']);
      expect(result).toBe('zh');
    });

    it('should return en as default for unsupported languages', () => {
      const result = getBestMatchingLocale(['de-DE', 'it-IT']);
      expect(result).toBe('en');
    });

    it('should return en for empty preferences array', () => {
      const result = getBestMatchingLocale([]);
      expect(result).toBe('en');
    });

    it('should match first supported language in list', () => {
      const result = getBestMatchingLocale(['de-DE', 'pt-BR', 'fr-FR']);
      expect(result).toBe('pt');
    });

    it('should extract language code from locale string', () => {
      const result = getBestMatchingLocale(['fr-CA']);
      expect(result).toBe('fr');
    });

    it('should handle locale without country code', () => {
      const result = getBestMatchingLocale(['es']);
      expect(result).toBe('es');
    });
  });

  describe('detectUserPreferredLocale', () => {
    const originalNavigator = global.navigator;

    afterEach(() => {
      // Restore original navigator
      Object.defineProperty(global, 'navigator', {
        value: originalNavigator,
        configurable: true,
      });
    });

    it('should return en when window is undefined (SSR)', () => {
      // Simulate SSR environment
      const originalWindow = global.window;
      // @ts-ignore
      delete global.window;

      const result = detectUserPreferredLocale();
      expect(result).toBe('en');

      global.window = originalWindow;
    });

    it('should detect French browser language', () => {
      Object.defineProperty(global, 'navigator', {
        value: { language: 'fr-FR' },
        configurable: true,
      });

      const result = detectUserPreferredLocale();
      expect(result).toBe('fr');
    });

    it('should detect English browser language', () => {
      Object.defineProperty(global, 'navigator', {
        value: { language: 'en-US' },
        configurable: true,
      });

      const result = detectUserPreferredLocale();
      expect(result).toBe('en');
    });

    it('should detect Portuguese browser language', () => {
      Object.defineProperty(global, 'navigator', {
        value: { language: 'pt-BR' },
        configurable: true,
      });

      const result = detectUserPreferredLocale();
      expect(result).toBe('pt');
    });

    it('should detect Spanish browser language', () => {
      Object.defineProperty(global, 'navigator', {
        value: { language: 'es-ES' },
        configurable: true,
      });

      const result = detectUserPreferredLocale();
      expect(result).toBe('es');
    });

    it('should detect Chinese browser language', () => {
      Object.defineProperty(global, 'navigator', {
        value: { language: 'zh-CN' },
        configurable: true,
      });

      const result = detectUserPreferredLocale();
      expect(result).toBe('zh');
    });

    it('should return en for unsupported browser language', () => {
      Object.defineProperty(global, 'navigator', {
        value: { language: 'de-DE' },
        configurable: true,
      });

      const result = detectUserPreferredLocale();
      expect(result).toBe('en');
    });
  });

  describe('Locale type', () => {
    it('should accept valid locale values', () => {
      const locales: Locale[] = ['fr', 'en', 'pt', 'es', 'zh'];
      expect(locales).toHaveLength(5);
    });
  });
});
