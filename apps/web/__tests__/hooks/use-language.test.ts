/**
 * Tests for hooks/use-language.ts
 */

const mockT = jest.fn((key: string) => key);
jest.mock('@/hooks/useI18n', () => ({
  useI18n: (_ns: string) => ({ t: (key: string) => mockT(key) }),
}));

const mockDetectBestInterfaceLanguage = jest.fn(() => 'en');
const mockGetUserPreferredLanguage = jest.fn(async () => 'en');
jest.mock('@/utils/language-detection', () => ({
  detectBestInterfaceLanguage: () => mockDetectBestInterfaceLanguage(),
  getUserPreferredLanguage: () => mockGetUserPreferredLanguage(),
}));

jest.mock('@/lib/i18n', () => ({
  getBestMatchingLocale: jest.fn(),
  detectUserPreferredLocale: jest.fn(),
}));

jest.mock('@/types/frontend', () => ({
  INTERFACE_LANGUAGES: [
    { code: 'en', name: 'English' },
    { code: 'fr', name: 'Français' },
    { code: 'es', name: 'Español' },
  ],
}));

import { renderHook, waitFor } from '@testing-library/react';
import { useLanguage } from '@/hooks/use-language';

beforeEach(() => {
  jest.clearAllMocks();
  mockT.mockImplementation((key: string) => key);
  mockDetectBestInterfaceLanguage.mockReturnValue('en');
  mockGetUserPreferredLanguage.mockResolvedValue('en');

  Object.defineProperty(navigator, 'languages', {
    writable: true,
    configurable: true,
    value: ['en-US', 'en'],
  });
  Object.defineProperty(navigator, 'language', {
    writable: true,
    configurable: true,
    value: 'en-US',
  });
});

// ─── translatedLanguages ──────────────────────────────────────────────────────

describe('translatedLanguages', () => {
  it('contains one entry per INTERFACE_LANGUAGES entry', () => {
    const { result } = renderHook(() => useLanguage());
    expect(result.current.translatedLanguages).toHaveLength(3);
  });

  it('each entry has code, name, nativeName, translatedName', () => {
    const { result } = renderHook(() => useLanguage());
    for (const lang of result.current.translatedLanguages) {
      expect(lang).toHaveProperty('code');
      expect(lang).toHaveProperty('name');
      expect(lang).toHaveProperty('nativeName');
      expect(lang).toHaveProperty('translatedName');
    }
  });

  it('uses t() for translatedName', () => {
    mockT.mockImplementation((key: string) =>
      key === 'languageNames.en' ? 'English (translated)' : key
    );
    const { result } = renderHook(() => useLanguage());
    const en = result.current.translatedLanguages.find(l => l.code === 'en');
    expect(en?.translatedName).toBe('English (translated)');
  });

  it('falls back to name when t() returns empty string', () => {
    mockT.mockImplementation(() => '');
    const { result } = renderHook(() => useLanguage());
    const en = result.current.translatedLanguages.find(l => l.code === 'en');
    expect(en?.translatedName).toBe('English');
  });
});

// ─── getTranslatedLanguageName ────────────────────────────────────────────────

describe('getTranslatedLanguageName', () => {
  it('returns translatedName for a known code', () => {
    mockT.mockImplementation((key: string) =>
      key === 'languageNames.fr' ? 'Français (FR)' : key
    );
    const { result } = renderHook(() => useLanguage());
    expect(result.current.getTranslatedLanguageName('fr')).toBe('Français (FR)');
  });

  it('returns the code itself for unknown language', () => {
    const { result } = renderHook(() => useLanguage());
    expect(result.current.getTranslatedLanguageName('zz')).toBe('zz');
  });
});

// ─── getLanguageInfo ──────────────────────────────────────────────────────────

describe('getLanguageInfo', () => {
  it('returns the full language object for a known code', () => {
    const { result } = renderHook(() => useLanguage());
    const info = result.current.getLanguageInfo('es');
    expect(info?.code).toBe('es');
    expect(info?.name).toBe('Español');
  });

  it('returns undefined for an unknown code', () => {
    const { result } = renderHook(() => useLanguage());
    expect(result.current.getLanguageInfo('zz')).toBeUndefined();
  });
});

// ─── isLanguageSupported ──────────────────────────────────────────────────────

describe('isLanguageSupported', () => {
  it('returns true for a supported language', () => {
    const { result } = renderHook(() => useLanguage());
    expect(result.current.isLanguageSupported('en')).toBe(true);
    expect(result.current.isLanguageSupported('fr')).toBe(true);
  });

  it('returns false for an unsupported language', () => {
    const { result } = renderHook(() => useLanguage());
    expect(result.current.isLanguageSupported('zh')).toBe(false);
  });
});

// ─── supportedLanguages ───────────────────────────────────────────────────────

describe('supportedLanguages', () => {
  it('contains all supported language codes', () => {
    const { result } = renderHook(() => useLanguage());
    expect(result.current.supportedLanguages).toEqual(['en', 'fr', 'es']);
  });
});

// ─── browser language detection ───────────────────────────────────────────────

describe('browser language detection', () => {
  it('detectedSystemLanguage comes from navigator.language', async () => {
    Object.defineProperty(navigator, 'language', {
      writable: true,
      configurable: true,
      value: 'fr-FR',
    });
    const { result } = renderHook(() => useLanguage());
    await waitFor(() => expect(result.current.isDetectionComplete).toBe(true));
    expect(result.current.detectedSystemLanguage).toBe('fr-FR');
  });

  it('browserLanguages comes from navigator.languages', async () => {
    Object.defineProperty(navigator, 'languages', {
      writable: true,
      configurable: true,
      value: ['fr', 'en'],
    });
    const { result } = renderHook(() => useLanguage());
    await waitFor(() => expect(result.current.isDetectionComplete).toBe(true));
    expect(result.current.browserLanguages).toEqual(['fr', 'en']);
  });

  it('detectedInterfaceLanguage comes from detectBestInterfaceLanguage', async () => {
    mockDetectBestInterfaceLanguage.mockReturnValue('fr');
    const { result } = renderHook(() => useLanguage());
    await waitFor(() => expect(result.current.isDetectionComplete).toBe(true));
    expect(result.current.detectedInterfaceLanguage).toBe('fr');
  });

  it('isDetectionComplete becomes true after effect runs', async () => {
    const { result } = renderHook(() => useLanguage());
    await waitFor(() => expect(result.current.isDetectionComplete).toBe(true));
  });
});

// ─── detectUserLanguage ───────────────────────────────────────────────────────

describe('detectUserLanguage', () => {
  it('returns bestInterfaceLanguage from detectBestInterfaceLanguage', async () => {
    mockDetectBestInterfaceLanguage.mockReturnValue('es');
    const { result } = renderHook(() => useLanguage());
    const lang = await result.current.detectUserLanguage();
    expect(lang).toBe('es');
  });

  it('falls back to en when detection throws', async () => {
    mockDetectBestInterfaceLanguage.mockImplementation(() => {
      throw new Error('detection failed');
    });
    const { result } = renderHook(() => useLanguage());
    const lang = await result.current.detectUserLanguage();
    expect(lang).toBe('en');
  });
});
