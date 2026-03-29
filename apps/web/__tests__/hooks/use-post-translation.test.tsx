import { renderHook } from '@testing-library/react';
import { usePostTranslation, usePreferredLanguage } from '@/hooks/use-post-translation';

const mockConfig = {
  systemLanguage: 'fr',
  regionalLanguage: 'en',
  customDestinationLanguage: undefined,
  autoTranslateEnabled: true,
};

jest.mock('@/stores/language-store', () => ({
  useLanguageStore: (selector: (s: unknown) => unknown) =>
    selector({ userLanguageConfig: mockConfig }),
}));

describe('usePostTranslation', () => {
  it('returns original content when language matches', () => {
    const { result } = renderHook(() =>
      usePostTranslation('Bonjour', 'fr', {}),
    );

    expect(result.current.displayContent).toBe('Bonjour');
    expect(result.current.isTranslated).toBe(false);
    expect(result.current.preferredLanguage).toBe('fr');
  });

  it('returns translation when available for preferred language', () => {
    const translations = {
      fr: { text: 'Bonjour le monde', translationModel: 'nllb', createdAt: '2026-01-01' },
    };

    const { result } = renderHook(() =>
      usePostTranslation('Hello world', 'en', translations),
    );

    expect(result.current.displayContent).toBe('Bonjour le monde');
    expect(result.current.isTranslated).toBe(true);
  });

  it('falls back to regional language translation', () => {
    const translations = {
      en: { text: 'Hello world', translationModel: 'nllb', createdAt: '2026-01-01' },
    };

    const { result } = renderHook(() =>
      usePostTranslation('Hola mundo', 'es', translations),
    );

    expect(result.current.displayContent).toBe('Hello world');
    expect(result.current.isTranslated).toBe(true);
  });

  it('returns original when no translation matches', () => {
    const translations = {
      ja: { text: 'こんにちは', translationModel: 'nllb' },
    };

    const { result } = renderHook(() =>
      usePostTranslation('Hola mundo', 'es', translations),
    );

    expect(result.current.displayContent).toBe('Hola mundo');
    expect(result.current.isTranslated).toBe(false);
  });

  it('handles null/undefined content gracefully', () => {
    const { result } = renderHook(() =>
      usePostTranslation(null, null, null),
    );

    expect(result.current.displayContent).toBe('');
    expect(result.current.isTranslated).toBe(false);
  });

  it('handles empty translations object', () => {
    const { result } = renderHook(() =>
      usePostTranslation('Hello', 'en', {}),
    );

    expect(result.current.displayContent).toBe('Hello');
    expect(result.current.isTranslated).toBe(false);
  });
});

describe('usePreferredLanguage', () => {
  it('returns systemLanguage', () => {
    const { result } = renderHook(() => usePreferredLanguage());
    expect(result.current).toBe('fr');
  });
});
