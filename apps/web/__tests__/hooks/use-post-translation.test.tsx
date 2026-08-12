import { renderHook } from '@testing-library/react';
import { usePostTranslation, usePreferredLanguage } from '@/hooks/use-post-translation';

const mockConfig: {
  systemLanguage: string;
  regionalLanguage: string;
  customDestinationLanguage: string | undefined;
  autoTranslateEnabled: boolean;
} = {
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

describe('resolvePreferredLanguage fallbacks', () => {
  const saved = { ...mockConfig };
  const originalLanguage = navigator.language;

  function setNavigatorLanguage(value: string) {
    Object.defineProperty(navigator, 'language', { value, configurable: true });
  }

  afterEach(() => {
    Object.assign(mockConfig, saved);
    setNavigatorLanguage(originalLanguage);
  });

  it('uses regionalLanguage when systemLanguage is empty', () => {
    mockConfig.systemLanguage = '';

    const { result } = renderHook(() => usePostTranslation('hello', 'es', {}));

    expect(result.current.preferredLanguage).toBe('en');
    expect(result.current.displayContent).toBe('hello');
    expect(result.current.isTranslated).toBe(false);
  });

  it('uses customDestinationLanguage when both systemLanguage and regionalLanguage are empty', () => {
    mockConfig.systemLanguage = '';
    mockConfig.regionalLanguage = '';
    mockConfig.customDestinationLanguage = 'pt';

    const { result } = renderHook(() => usePostTranslation('hello', 'es', {}));

    expect(result.current.preferredLanguage).toBe('pt');
  });

  // Prisme étendu 2026-05-26 — deviceLocale intervient en 4e priorité, jamais
  // en remplacement des préférences in-app. Aligné sur la résolution des
  // messages (resolveUserPreferredLanguage) via la source de vérité partagée.
  it('uses the device locale (4th priority) when no in-app preference is set', () => {
    mockConfig.systemLanguage = '';
    mockConfig.regionalLanguage = '';
    mockConfig.customDestinationLanguage = undefined;
    setNavigatorLanguage('pt-BR');

    const { result } = renderHook(() => usePostTranslation('hello', 'es', {}));

    expect(result.current.preferredLanguage).toBe('pt');
  });

  it('never lets the device locale override an in-app systemLanguage', () => {
    mockConfig.systemLanguage = 'fr';
    setNavigatorLanguage('en-US');

    const { result } = renderHook(() => usePostTranslation('hello', 'es', {}));

    expect(result.current.preferredLanguage).toBe('fr');
  });

  it('falls back to fr when all preferences and the device locale are absent', () => {
    mockConfig.systemLanguage = '';
    mockConfig.regionalLanguage = '';
    mockConfig.customDestinationLanguage = undefined;
    setNavigatorLanguage('');

    const { result } = renderHook(() => usePostTranslation('hello', 'es', {}));

    expect(result.current.preferredLanguage).toBe('fr');
  });
});

describe('findTranslation edge cases', () => {
  it('does not use translation with empty text', () => {
    const translations = { fr: { text: '' } };

    const { result } = renderHook(() =>
      usePostTranslation('Hola', 'es', translations),
    );

    // text is falsy → no match → fall back to original
    expect(result.current.displayContent).toBe('Hola');
    expect(result.current.isTranslated).toBe(false);
  });
});
