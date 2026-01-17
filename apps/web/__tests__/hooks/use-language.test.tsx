/**
 * Tests for useLanguage hook
 *
 * Tests cover:
 * - Browser language detection
 * - Translated language names
 * - Language info lookup
 * - Supported language checking
 * - User language detection
 */

import { renderHook, waitFor } from '@testing-library/react';
import { useLanguage } from '@/hooks/use-language';

// Mock useI18n
const mockT = jest.fn((key: string) => {
  const translations: Record<string, string> = {
    'languageNames.en': 'English',
    'languageNames.fr': 'French',
    'languageNames.es': 'Spanish',
    'languageNames.pt': 'Portuguese',
  };
  return translations[key] || key;
});

jest.mock('@/hooks/useI18n', () => ({
  useI18n: () => ({
    t: mockT,
    isLoading: false,
    locale: 'en',
  }),
}));

// Mock language detection utilities
const mockDetectBestInterfaceLanguage = jest.fn(() => 'en');
const mockGetUserPreferredLanguage = jest.fn(() => Promise.resolve('en'));
const mockDetectUserPreferredLocale = jest.fn(() => 'en');

jest.mock('@/utils/language-detection', () => ({
  detectBestInterfaceLanguage: () => mockDetectBestInterfaceLanguage(),
  getUserPreferredLanguage: () => mockGetUserPreferredLanguage(),
}));

jest.mock('@/lib/i18n', () => ({
  getBestMatchingLocale: jest.fn(() => 'en'),
  detectUserPreferredLocale: () => mockDetectUserPreferredLocale(),
}));

// Mock INTERFACE_LANGUAGES - inline to avoid hoisting issues
jest.mock('@/types/frontend', () => ({
  INTERFACE_LANGUAGES: [
    { code: 'en', name: 'English' },
    { code: 'fr', name: 'French' },
    { code: 'es', name: 'Spanish' },
    { code: 'pt', name: 'Portuguese' },
  ],
}));

// Mock navigator
const mockNavigator = {
  languages: ['en-US', 'en', 'fr'],
  language: 'en-US',
};

Object.defineProperty(global, 'navigator', {
  value: mockNavigator,
  writable: true,
});

describe('useLanguage', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Suppress console warnings
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Initial State', () => {
    it('should return detectedInterfaceLanguage', () => {
      const { result } = renderHook(() => useLanguage());

      expect(result.current.detectedInterfaceLanguage).toBeDefined();
    });

    it('should return detectedSystemLanguage', () => {
      const { result } = renderHook(() => useLanguage());

      expect(result.current.detectedSystemLanguage).toBeDefined();
    });

    it('should return supportedLanguages array', () => {
      const { result } = renderHook(() => useLanguage());

      expect(Array.isArray(result.current.supportedLanguages)).toBe(true);
      expect(result.current.supportedLanguages).toEqual(['en', 'fr', 'es', 'pt']);
    });

    it('should return browserLanguages array', () => {
      const { result } = renderHook(() => useLanguage());

      expect(Array.isArray(result.current.browserLanguages)).toBe(true);
    });

    it('should return translatedLanguages array', () => {
      const { result } = renderHook(() => useLanguage());

      expect(Array.isArray(result.current.translatedLanguages)).toBe(true);
    });
  });

  describe('Translated Languages', () => {
    it('should return translated language objects with correct structure', () => {
      const { result } = renderHook(() => useLanguage());

      result.current.translatedLanguages.forEach(lang => {
        expect(lang).toHaveProperty('code');
        expect(lang).toHaveProperty('name');
        expect(lang).toHaveProperty('nativeName');
        expect(lang).toHaveProperty('translatedName');
      });
    });

    it('should use translations for language names', () => {
      const { result } = renderHook(() => useLanguage());

      const english = result.current.translatedLanguages.find(l => l.code === 'en');
      expect(english?.translatedName).toBe('English');
    });

    it('should fallback to name if translation not found', () => {
      mockT.mockImplementation((key: string) => key);

      const { result } = renderHook(() => useLanguage());

      const english = result.current.translatedLanguages.find(l => l.code === 'en');
      // Will return key if no translation, then fallback to name
      expect(english?.translatedName).toBeDefined();
    });
  });

  describe('getTranslatedLanguageName', () => {
    it('should return translated name for valid language code', () => {
      // Reset mockT to provide translations
      mockT.mockImplementation((key: string) => {
        const translations: Record<string, string> = {
          'languageNames.en': 'English',
          'languageNames.fr': 'French',
          'languageNames.es': 'Spanish',
          'languageNames.pt': 'Portuguese',
        };
        return translations[key] || key;
      });

      const { result } = renderHook(() => useLanguage());

      const name = result.current.getTranslatedLanguageName('en');
      expect(name).toBe('English');
    });

    it('should return code for unknown language', () => {
      const { result } = renderHook(() => useLanguage());

      const name = result.current.getTranslatedLanguageName('unknown');
      expect(name).toBe('unknown');
    });
  });

  describe('getLanguageInfo', () => {
    it('should return language info for valid code', () => {
      const { result } = renderHook(() => useLanguage());

      const info = result.current.getLanguageInfo('en');

      expect(info).toBeDefined();
      expect(info?.code).toBe('en');
      expect(info?.name).toBe('English');
    });

    it('should return undefined for unknown code', () => {
      const { result } = renderHook(() => useLanguage());

      const info = result.current.getLanguageInfo('unknown');

      expect(info).toBeUndefined();
    });
  });

  describe('isLanguageSupported', () => {
    it('should return true for supported language', () => {
      const { result } = renderHook(() => useLanguage());

      expect(result.current.isLanguageSupported('en')).toBe(true);
      expect(result.current.isLanguageSupported('fr')).toBe(true);
      expect(result.current.isLanguageSupported('es')).toBe(true);
    });

    it('should return false for unsupported language', () => {
      const { result } = renderHook(() => useLanguage());

      expect(result.current.isLanguageSupported('zh')).toBe(false);
      expect(result.current.isLanguageSupported('de')).toBe(false);
    });
  });

  describe('detectUserLanguage', () => {
    it('should detect user preferred language', async () => {
      mockDetectBestInterfaceLanguage.mockReturnValue('fr');
      mockGetUserPreferredLanguage.mockResolvedValue('fr');

      const { result } = renderHook(() => useLanguage());

      let detected: string = '';
      detected = await result.current.detectUserLanguage();

      expect(detected).toBe('fr');
    });

    it('should fallback to en on error', async () => {
      mockGetUserPreferredLanguage.mockRejectedValue(new Error('Detection failed'));

      const { result } = renderHook(() => useLanguage());

      let detected: string = '';
      detected = await result.current.detectUserLanguage();

      expect(detected).toBe('en');
    });
  });

  describe('Browser Detection', () => {
    it('should detect browser languages', async () => {
      const { result } = renderHook(() => useLanguage());

      await waitFor(() => {
        expect(result.current.browserLanguages.length).toBeGreaterThan(0);
      });
    });

    it('should detect system language from navigator', async () => {
      const { result } = renderHook(() => useLanguage());

      await waitFor(() => {
        expect(result.current.detectedSystemLanguage).toBe('en-US');
      });
    });

    it('should mark detection as complete', async () => {
      const { result } = renderHook(() => useLanguage());

      await waitFor(() => {
        expect(result.current.isDetectionComplete).toBe(true);
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle detection error gracefully', async () => {
      mockDetectBestInterfaceLanguage.mockImplementation(() => {
        throw new Error('Detection failed');
      });

      const { result } = renderHook(() => useLanguage());

      await waitFor(() => {
        // Should fallback to 'en'
        expect(result.current.detectedInterfaceLanguage).toBe('en');
        expect(result.current.isDetectionComplete).toBe(true);
      });
    });
  });

  describe('Memoization', () => {
    it('should memoize getTranslatedLanguageName', () => {
      const { result, rerender } = renderHook(() => useLanguage());

      const firstFn = result.current.getTranslatedLanguageName;

      rerender();

      expect(result.current.getTranslatedLanguageName).toBe(firstFn);
    });

    it('should memoize getLanguageInfo', () => {
      const { result, rerender } = renderHook(() => useLanguage());

      const firstFn = result.current.getLanguageInfo;

      rerender();

      expect(result.current.getLanguageInfo).toBe(firstFn);
    });

    it('should memoize isLanguageSupported', () => {
      const { result, rerender } = renderHook(() => useLanguage());

      const firstFn = result.current.isLanguageSupported;

      rerender();

      expect(result.current.isLanguageSupported).toBe(firstFn);
    });

    it('should memoize detectUserLanguage', () => {
      const { result, rerender } = renderHook(() => useLanguage());

      const firstFn = result.current.detectUserLanguage;

      rerender();

      expect(result.current.detectUserLanguage).toBe(firstFn);
    });
  });
});
