/**
 * Tests for useI18n hook
 *
 * Tests cover:
 * - Initial loading state
 * - Translation function (t) with nested keys
 * - Parameter substitution
 * - Fallback values
 * - Array translations (tArray)
 * - Locale changes
 * - Cache behavior
 * - Error handling with fallback locale
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { useI18n, clearTranslationsCache } from '@/hooks/use-i18n';

// Mock the language store
const mockSetInterfaceLanguage = jest.fn();
let mockCurrentInterfaceLanguage = 'en';

jest.mock('@/stores', () => ({
  useLanguageStore: (selector: (state: any) => any) => {
    const state = {
      currentInterfaceLanguage: mockCurrentInterfaceLanguage,
      setInterfaceLanguage: mockSetInterfaceLanguage,
    };
    return selector(state);
  },
}));

// Mock translation files
const mockTranslations = {
  en: {
    common: {
      greeting: 'Hello',
      welcome: 'Welcome, {name}!',
      nested: {
        deep: {
          value: 'Deep nested value',
        },
      },
      items: ['Item 1', 'Item 2', 'Item 3'],
      notArray: 'This is not an array',
    },
    auth: {
      login: 'Log In',
      logout: 'Log Out',
      errors: {
        invalidCredentials: 'Invalid username or password',
      },
    },
  },
  fr: {
    common: {
      greeting: 'Bonjour',
      welcome: 'Bienvenue, {name}!',
      nested: {
        deep: {
          value: 'Valeur imbriquee profonde',
        },
      },
      items: ['Element 1', 'Element 2', 'Element 3'],
    },
  },
  es: {
    common: {
      greeting: 'Hola',
    },
  },
};

// Mock dynamic imports for translation files
jest.mock(
  '@/locales/en/common.json',
  () => mockTranslations.en.common,
  { virtual: true }
);

jest.mock(
  '@/locales/en/auth.json',
  () => mockTranslations.en.auth,
  { virtual: true }
);

jest.mock(
  '@/locales/fr/common.json',
  () => mockTranslations.fr.common,
  { virtual: true }
);

jest.mock(
  '@/locales/es/common.json',
  () => mockTranslations.es.common,
  { virtual: true }
);

describe('useI18n', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearTranslationsCache();
    mockCurrentInterfaceLanguage = 'en';
    // Suppress console warnings in tests
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Initial State', () => {
    it('should return isLoading true initially', () => {
      const { result } = renderHook(() => useI18n('common'));

      // Initial state should be loading
      expect(result.current.isLoading).toBe(true);
    });

    it('should return the current locale from store', () => {
      const { result } = renderHook(() => useI18n('common'));

      expect(result.current.locale).toBe('en');
      expect(result.current.currentLanguage).toBe('en');
    });

    it('should provide setLocale function', () => {
      const { result } = renderHook(() => useI18n('common'));

      expect(typeof result.current.setLocale).toBe('function');
    });
  });

  describe('Translation Function (t)', () => {
    it('should translate simple keys after loading', async () => {
      const { result } = renderHook(() => useI18n('common'));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.t('greeting')).toBe('Hello');
    });

    it('should translate nested keys using dot notation', async () => {
      const { result } = renderHook(() => useI18n('common'));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.t('nested.deep.value')).toBe('Deep nested value');
    });

    it('should substitute parameters in translations', async () => {
      const { result } = renderHook(() => useI18n('common'));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.t('welcome', { name: 'John' })).toBe('Welcome, John!');
    });

    it('should return key when translation not found', async () => {
      const { result } = renderHook(() => useI18n('common'));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.t('nonexistent.key')).toBe('nonexistent.key');
    });

    it('should return fallback string when provided and key not found', async () => {
      const { result } = renderHook(() => useI18n('common'));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.t('nonexistent.key', 'Fallback text')).toBe('Fallback text');
    });

    it('should keep unmatched parameters in template', async () => {
      const { result } = renderHook(() => useI18n('common'));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Missing 'name' parameter should keep {name} in the string
      expect(result.current.t('welcome', {})).toBe('Welcome, {name}!');
    });

    it('should return key when value is not a string', async () => {
      const { result } = renderHook(() => useI18n('common'));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // 'nested' is an object, not a string
      expect(result.current.t('nested')).toBe('nested');
    });
  });

  describe('Array Translation Function (tArray)', () => {
    it('should return array translations', async () => {
      const { result } = renderHook(() => useI18n('common'));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const items = result.current.tArray('items');
      expect(items).toEqual(['Item 1', 'Item 2', 'Item 3']);
    });

    it('should return empty array for non-existent key', async () => {
      const { result } = renderHook(() => useI18n('common'));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.tArray('nonexistent.array')).toEqual([]);
    });

    it('should return empty array when value is not an array', async () => {
      const { result } = renderHook(() => useI18n('common'));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.tArray('notArray')).toEqual([]);
    });
  });

  describe('Namespace Support', () => {
    it('should load translations for different namespaces', async () => {
      const { result } = renderHook(() => useI18n('auth'));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.t('login')).toBe('Log In');
      expect(result.current.t('errors.invalidCredentials')).toBe('Invalid username or password');
    });

    it('should default to common namespace', async () => {
      const { result } = renderHook(() => useI18n());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.t('greeting')).toBe('Hello');
    });
  });

  describe('Locale Changes', () => {
    it('should call setLanguage when setLocale is invoked', async () => {
      const { result } = renderHook(() => useI18n('common'));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      act(() => {
        result.current.setLocale('fr');
      });

      expect(mockSetInterfaceLanguage).toHaveBeenCalledWith('fr');
    });

    it('should reload translations when locale changes', async () => {
      const { result, rerender } = renderHook(() => useI18n('common'));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.t('greeting')).toBe('Hello');

      // Simulate locale change
      mockCurrentInterfaceLanguage = 'fr';
      rerender();

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.t('greeting')).toBe('Bonjour');
    });
  });

  describe('Fallback Locale', () => {
    it('should use custom fallback locale option', async () => {
      const { result } = renderHook(() => useI18n('common', { fallbackLocale: 'fr' }));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Default locale is 'en', so should use English translations
      expect(result.current.t('greeting')).toBe('Hello');
    });

    it('should use default fallback locale of en', async () => {
      const { result } = renderHook(() => useI18n('common'));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Default fallbackLocale should be 'en'
      expect(result.current.t('greeting')).toBe('Hello');
    });
  });

  describe('Cache Behavior', () => {
    it('should clear cache when clearTranslationsCache is called', async () => {
      const { result } = renderHook(() => useI18n('common'));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Clear cache
      clearTranslationsCache();

      // This should not throw or cause issues
      expect(() => clearTranslationsCache()).not.toThrow();
    });
  });

  describe('Memoization', () => {
    it('should return stable t function reference when translations dont change', async () => {
      const { result, rerender } = renderHook(() => useI18n('common'));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const firstT = result.current.t;
      rerender();
      const secondT = result.current.t;

      // t function should be stable when dependencies haven't changed
      expect(firstT).toBe(secondT);
    });

    it('should return stable tArray function reference', async () => {
      const { result, rerender } = renderHook(() => useI18n('common'));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const firstTArray = result.current.tArray;
      rerender();
      const secondTArray = result.current.tArray;

      expect(firstTArray).toBe(secondTArray);
    });
  });

  describe('Cleanup', () => {
    it('should handle unmount during loading gracefully', async () => {
      const { unmount } = renderHook(() => useI18n('common'));

      // Unmount immediately while still loading
      unmount();

      // Should not throw or cause memory leaks
      // Wait a bit to ensure any pending state updates would have occurred
      await new Promise(resolve => setTimeout(resolve, 100));
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty translation object', async () => {
      const { result } = renderHook(() => useI18n('common'));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Before translations load, should return key
      expect(result.current.t('nonexistent')).toBe('nonexistent');
    });

    it('should handle numeric parameter values', async () => {
      const { result } = renderHook(() => useI18n('common'));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.t('welcome', { name: 123 })).toBe('Welcome, 123!');
    });

    it('should handle deeply nested missing keys', async () => {
      const { result } = renderHook(() => useI18n('common'));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.t('a.b.c.d.e.f')).toBe('a.b.c.d.e.f');
    });
  });
});
