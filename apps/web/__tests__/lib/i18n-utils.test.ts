/**
 * Tests for i18n-utils module
 * Tests internationalization utility functions
 */

import {
  interpolate,
  getNestedValue,
  flattenTranslations,
  pluralize,
  detectBrowserLanguage,
  isLanguageSupported,
  getTranslationWithFallback,
  I18N_STORAGE_KEY,
  saveLanguagePreference,
  loadLanguagePreference,
} from '../../lib/i18n-utils';
import type { TranslationModule, SupportedLanguage } from '@/types/i18n';

describe('I18n Utils Module', () => {
  describe('interpolate', () => {
    it('should replace single placeholder', () => {
      const result = interpolate('Hello {name}!', { name: 'John' });
      expect(result).toBe('Hello John!');
    });

    it('should replace multiple placeholders', () => {
      const result = interpolate('{greeting} {name}!', {
        greeting: 'Hello',
        name: 'John',
      });
      expect(result).toBe('Hello John!');
    });

    it('should handle numeric values', () => {
      const result = interpolate('You have {count} messages', { count: 5 });
      expect(result).toBe('You have 5 messages');
    });

    it('should return original text if no params', () => {
      const result = interpolate('Hello World!');
      expect(result).toBe('Hello World!');
    });

    it('should return original text if params is undefined', () => {
      const result = interpolate('Hello World!', undefined);
      expect(result).toBe('Hello World!');
    });

    it('should keep unmatched placeholders', () => {
      const result = interpolate('Hello {name} and {friend}!', { name: 'John' });
      expect(result).toBe('Hello John and {friend}!');
    });

    it('should handle empty params object', () => {
      const result = interpolate('Hello {name}!', {});
      expect(result).toBe('Hello {name}!');
    });

    it('should return text as-is if not a string', () => {
      const result = interpolate(null as any, { name: 'John' });
      expect(result).toBeNull();
    });

    it('should handle zero values', () => {
      const result = interpolate('You have {count} messages', { count: 0 });
      expect(result).toBe('You have 0 messages');
    });
  });

  describe('getNestedValue', () => {
    const testObj: TranslationModule = {
      user: {
        name: 'John',
        profile: {
          email: 'john@example.com',
        },
      },
      greeting: 'Hello',
    };

    it('should get top-level value', () => {
      const result = getNestedValue(testObj, 'greeting');
      expect(result).toBe('Hello');
    });

    it('should get nested value with dot notation', () => {
      const result = getNestedValue(testObj, 'user.name');
      expect(result).toBe('John');
    });

    it('should get deeply nested value', () => {
      const result = getNestedValue(testObj, 'user.profile.email');
      expect(result).toBe('john@example.com');
    });

    it('should return undefined for non-existent path', () => {
      const result = getNestedValue(testObj, 'user.nonexistent');
      expect(result).toBeUndefined();
    });

    it('should return undefined for invalid deep path', () => {
      const result = getNestedValue(testObj, 'user.name.invalid');
      expect(result).toBeUndefined();
    });

    it('should return undefined for undefined object', () => {
      const result = getNestedValue(undefined, 'any.path');
      expect(result).toBeUndefined();
    });

    it('should handle object values', () => {
      const result = getNestedValue(testObj, 'user.profile');
      expect(result).toEqual({ email: 'john@example.com' });
    });
  });

  describe('flattenTranslations', () => {
    it('should flatten nested object', () => {
      const input: TranslationModule = {
        user: {
          name: 'Name',
          email: 'Email',
        },
      };

      const result = flattenTranslations(input);
      expect(result).toEqual({
        'user.name': 'Name',
        'user.email': 'Email',
      });
    });

    it('should handle top-level strings', () => {
      const input: TranslationModule = {
        greeting: 'Hello',
        farewell: 'Goodbye',
      };

      const result = flattenTranslations(input);
      expect(result).toEqual({
        greeting: 'Hello',
        farewell: 'Goodbye',
      });
    });

    it('should handle deeply nested objects', () => {
      const input: TranslationModule = {
        app: {
          settings: {
            theme: {
              dark: 'Dark Mode',
            },
          },
        },
      };

      const result = flattenTranslations(input);
      expect(result).toEqual({
        'app.settings.theme.dark': 'Dark Mode',
      });
    });

    it('should handle arrays as JSON strings', () => {
      const input: TranslationModule = {
        items: ['one', 'two', 'three'],
      };

      const result = flattenTranslations(input);
      expect(result).toEqual({
        items: '["one","two","three"]',
      });
    });

    it('should handle empty object', () => {
      const result = flattenTranslations({});
      expect(result).toEqual({});
    });

    it('should handle prefix parameter', () => {
      const input: TranslationModule = {
        name: 'John',
      };

      const result = flattenTranslations(input, 'user');
      expect(result).toEqual({
        'user.name': 'John',
      });
    });

    it('should handle mixed nested and flat structure', () => {
      const input: TranslationModule = {
        title: 'Page Title',
        user: {
          name: 'Name',
        },
      };

      const result = flattenTranslations(input);
      expect(result).toEqual({
        title: 'Page Title',
        'user.name': 'Name',
      });
    });
  });

  describe('pluralize', () => {
    it('should return singular for count of 1', () => {
      const result = pluralize(1, 'message', 'messages');
      expect(result).toBe('message');
    });

    it('should return plural for count of 0', () => {
      const result = pluralize(0, 'message', 'messages');
      expect(result).toBe('messages');
    });

    it('should return plural for count greater than 1', () => {
      const result = pluralize(5, 'message', 'messages');
      expect(result).toBe('messages');
    });

    it('should return plural for negative numbers', () => {
      const result = pluralize(-1, 'message', 'messages');
      expect(result).toBe('messages');
    });

    it('should handle large numbers', () => {
      const result = pluralize(1000000, 'item', 'items');
      expect(result).toBe('items');
    });
  });

  describe('detectBrowserLanguage', () => {
    const originalNavigator = global.navigator;
    const supportedLanguages: SupportedLanguage[] = ['fr', 'en', 'pt', 'es', 'zh'];

    afterEach(() => {
      Object.defineProperty(global, 'navigator', {
        value: originalNavigator,
        configurable: true,
      });
    });

    it('should return en for SSR (window undefined)', () => {
      const originalWindow = global.window;
      // @ts-ignore
      delete global.window;

      const result = detectBrowserLanguage(supportedLanguages);
      expect(result).toBe('en');

      global.window = originalWindow;
    });

    it('should detect supported browser language', () => {
      Object.defineProperty(global, 'navigator', {
        value: { language: 'fr-FR' },
        configurable: true,
      });

      const result = detectBrowserLanguage(supportedLanguages);
      expect(result).toBe('fr');
    });

    it('should return en for unsupported browser language', () => {
      Object.defineProperty(global, 'navigator', {
        value: { language: 'de-DE' },
        configurable: true,
      });

      const result = detectBrowserLanguage(supportedLanguages);
      expect(result).toBe('en');
    });

    it('should extract language code from locale', () => {
      Object.defineProperty(global, 'navigator', {
        value: { language: 'pt-BR' },
        configurable: true,
      });

      const result = detectBrowserLanguage(supportedLanguages);
      expect(result).toBe('pt');
    });
  });

  describe('isLanguageSupported', () => {
    const supportedLanguages: SupportedLanguage[] = ['fr', 'en', 'pt', 'es', 'zh'];

    it('should return true for supported language', () => {
      expect(isLanguageSupported('fr', supportedLanguages)).toBe(true);
      expect(isLanguageSupported('en', supportedLanguages)).toBe(true);
    });

    it('should return false for unsupported language', () => {
      expect(isLanguageSupported('de', supportedLanguages)).toBe(false);
      expect(isLanguageSupported('it', supportedLanguages)).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(isLanguageSupported('', supportedLanguages)).toBe(false);
    });
  });

  describe('getTranslationWithFallback', () => {
    const loadedModules: Record<string, Record<string, TranslationModule>> = {
      fr: {
        common: {
          greeting: 'Bonjour',
          nested: {
            value: 'Valeur',
          },
        },
      },
      en: {
        common: {
          greeting: 'Hello',
          nested: {
            value: 'Value',
          },
          onlyEnglish: 'English only',
        },
      },
    };

    it('should return translation for current language', () => {
      const result = getTranslationWithFallback('greeting', 'fr', loadedModules, 'common');
      expect(result).toBe('Bonjour');
    });

    it('should return nested translation', () => {
      const result = getTranslationWithFallback('nested.value', 'fr', loadedModules, 'common');
      expect(result).toBe('Valeur');
    });

    it('should fallback to English when translation missing', () => {
      const result = getTranslationWithFallback('onlyEnglish', 'fr', loadedModules, 'common');
      expect(result).toBe('English only');
    });

    it('should return key when translation not found in any language', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      const result = getTranslationWithFallback('nonexistent', 'fr', loadedModules, 'common');
      expect(result).toBe('common.nonexistent');

      consoleSpy.mockRestore();
    });

    it('should handle missing module', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      const result = getTranslationWithFallback('greeting', 'fr', loadedModules, 'unknown');
      expect(result).toBe('unknown.greeting');

      consoleSpy.mockRestore();
    });

    it('should work without module prefix', () => {
      const result = getTranslationWithFallback('common.greeting', 'fr', loadedModules);
      expect(result).toBe('Bonjour');
    });
  });

  describe('I18N_STORAGE_KEY', () => {
    it('should be defined', () => {
      expect(I18N_STORAGE_KEY).toBe('meeshy-i18n-language');
    });
  });

  describe('saveLanguagePreference', () => {
    const originalLocalStorage = global.localStorage;

    beforeEach(() => {
      const store: { [key: string]: string } = {};
      Object.defineProperty(global, 'localStorage', {
        value: {
          getItem: jest.fn((key: string) => store[key] || null),
          setItem: jest.fn((key: string, value: string) => {
            store[key] = value;
          }),
          removeItem: jest.fn((key: string) => {
            delete store[key];
          }),
          clear: jest.fn(() => {
            Object.keys(store).forEach((key) => delete store[key]);
          }),
        },
        configurable: true,
      });
    });

    afterEach(() => {
      Object.defineProperty(global, 'localStorage', {
        value: originalLocalStorage,
        configurable: true,
      });
    });

    it('should save language preference to localStorage', () => {
      saveLanguagePreference('fr');
      expect(localStorage.setItem).toHaveBeenCalledWith('meeshy-i18n-language', 'fr');
    });

    it('should handle localStorage errors gracefully', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      (localStorage.setItem as jest.Mock).mockImplementation(() => {
        throw new Error('Storage full');
      });

      expect(() => saveLanguagePreference('fr')).not.toThrow();
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  describe('loadLanguagePreference', () => {
    const originalLocalStorage = global.localStorage;

    beforeEach(() => {
      const store: { [key: string]: string } = {};
      Object.defineProperty(global, 'localStorage', {
        value: {
          getItem: jest.fn((key: string) => store[key] || null),
          setItem: jest.fn((key: string, value: string) => {
            store[key] = value;
          }),
        },
        configurable: true,
      });
    });

    afterEach(() => {
      Object.defineProperty(global, 'localStorage', {
        value: originalLocalStorage,
        configurable: true,
      });
    });

    it('should load language preference from localStorage', () => {
      (localStorage.getItem as jest.Mock).mockReturnValue('fr');

      const result = loadLanguagePreference();
      expect(result).toBe('fr');
      expect(localStorage.getItem).toHaveBeenCalledWith('meeshy-i18n-language');
    });

    it('should return null when no preference saved', () => {
      (localStorage.getItem as jest.Mock).mockReturnValue(null);

      const result = loadLanguagePreference();
      expect(result).toBeNull();
    });

    it('should handle localStorage errors gracefully', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      (localStorage.getItem as jest.Mock).mockImplementation(() => {
        throw new Error('Storage error');
      });

      const result = loadLanguagePreference();
      expect(result).toBeNull();
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });
});
