/**
 * Tests for hooks/use-post-translation.ts
 */

const mockUseLanguageStore = jest.fn();
jest.mock('@/stores/language-store', () => ({
  useLanguageStore: (selector: (s: any) => any) =>
    mockUseLanguageStore(selector),
}));

import { renderHook } from '@testing-library/react';
import { usePostTranslation, usePreferredLanguage } from '@/hooks/use-post-translation';

const makeConfig = (overrides: Record<string, string> = {}) => ({
  systemLanguage: 'fr',
  regionalLanguage: 'en',
  customDestinationLanguage: '',
  ...overrides,
});

const makeTranslations = (entries: Record<string, string> = {}) =>
  Object.fromEntries(
    Object.entries(entries).map(([lang, text]) => [lang, { text }])
  );

beforeEach(() => {
  jest.clearAllMocks();
  mockUseLanguageStore.mockImplementation((sel: any) => sel({ userLanguageConfig: makeConfig() }));
});

// ─── initial / no content ─────────────────────────────────────────────────────

describe('no content', () => {
  it('displayContent is empty string when content is null', () => {
    const { result } = renderHook(() => usePostTranslation(null, 'fr', {}));
    expect(result.current.displayContent).toBe('');
  });

  it('displayContent is empty string when content is undefined', () => {
    const { result } = renderHook(() => usePostTranslation(undefined, 'fr', {}));
    expect(result.current.displayContent).toBe('');
  });

  it('isTranslated is false when content is null', () => {
    const { result } = renderHook(() => usePostTranslation(null, 'fr', {}));
    expect(result.current.isTranslated).toBe(false);
  });
});

// ─── same language — no translation needed ────────────────────────────────────

describe('original language matches preferred', () => {
  it('returns original content when originalLanguage equals preferredLanguage', () => {
    const { result } = renderHook(() =>
      usePostTranslation('Bonjour le monde', 'fr', makeTranslations({ en: 'Hello world' }))
    );
    expect(result.current.displayContent).toBe('Bonjour le monde');
    expect(result.current.isTranslated).toBe(false);
  });

  it('returns preferredLanguage as fr from config', () => {
    const { result } = renderHook(() => usePostTranslation('Hi', 'en', {}));
    expect(result.current.preferredLanguage).toBe('fr');
  });
});

// ─── translation found ────────────────────────────────────────────────────────

describe('translation found', () => {
  it('returns translated content when preferred language translation exists', () => {
    const { result } = renderHook(() =>
      usePostTranslation('Hello world', 'en', makeTranslations({ fr: 'Bonjour le monde' }))
    );
    expect(result.current.displayContent).toBe('Bonjour le monde');
    expect(result.current.isTranslated).toBe(true);
  });

  it('falls back to regionalLanguage (en) translation when systemLanguage translation absent', () => {
    mockUseLanguageStore.mockImplementation((sel: any) =>
      sel({ userLanguageConfig: makeConfig({ systemLanguage: 'de', regionalLanguage: 'en' }) })
    );
    const { result } = renderHook(() =>
      usePostTranslation('Hola', 'es', makeTranslations({ en: 'Hello' }))
    );
    expect(result.current.displayContent).toBe('Hello');
    expect(result.current.isTranslated).toBe(true);
  });

  it('returns originalLanguage in result', () => {
    const { result } = renderHook(() =>
      usePostTranslation('Hello', 'en', makeTranslations({ fr: 'Bonjour' }))
    );
    expect(result.current.originalLanguage).toBe('en');
  });

  it('originalLanguage is null when not provided', () => {
    const { result } = renderHook(() => usePostTranslation('Hello', null, {}));
    expect(result.current.originalLanguage).toBeNull();
  });
});

// ─── no translation match ─────────────────────────────────────────────────────

describe('no translation match', () => {
  it('returns original content when no translation matches preferred or regional language', () => {
    const { result } = renderHook(() =>
      usePostTranslation('Hola', 'es', makeTranslations({ pt: 'Olá' }))
    );
    expect(result.current.displayContent).toBe('Hola');
    expect(result.current.isTranslated).toBe(false);
  });

  it('returns original when translations is null', () => {
    const { result } = renderHook(() => usePostTranslation('text', 'en', null));
    expect(result.current.displayContent).toBe('text');
    expect(result.current.isTranslated).toBe(false);
  });

  it('returns original when translations is a non-object', () => {
    const { result } = renderHook(() => usePostTranslation('text', 'en', 'invalid'));
    expect(result.current.displayContent).toBe('text');
  });
});

// ─── language resolution priority ────────────────────────────────────────────

describe('preferredLanguage resolution', () => {
  it('uses systemLanguage first', () => {
    mockUseLanguageStore.mockImplementation((sel: any) =>
      sel({ userLanguageConfig: makeConfig({ systemLanguage: 'es', regionalLanguage: 'en' }) })
    );
    const { result } = renderHook(() => usePostTranslation('text', 'xx', {}));
    expect(result.current.preferredLanguage).toBe('es');
  });

  it('falls back to regionalLanguage when systemLanguage is empty', () => {
    mockUseLanguageStore.mockImplementation((sel: any) =>
      sel({ userLanguageConfig: makeConfig({ systemLanguage: '', regionalLanguage: 'pt' }) })
    );
    const { result } = renderHook(() => usePostTranslation('text', 'xx', {}));
    expect(result.current.preferredLanguage).toBe('pt');
  });

  it('falls back to customDestinationLanguage when system and regional are empty', () => {
    mockUseLanguageStore.mockImplementation((sel: any) =>
      sel({ userLanguageConfig: makeConfig({ systemLanguage: '', regionalLanguage: '', customDestinationLanguage: 'it' }) })
    );
    const { result } = renderHook(() => usePostTranslation('text', 'xx', {}));
    expect(result.current.preferredLanguage).toBe('it');
  });

  it('falls back to "fr" when all language fields are empty', () => {
    mockUseLanguageStore.mockImplementation((sel: any) =>
      sel({ userLanguageConfig: makeConfig({ systemLanguage: '', regionalLanguage: '', customDestinationLanguage: '' }) })
    );
    const { result } = renderHook(() => usePostTranslation('text', 'xx', {}));
    expect(result.current.preferredLanguage).toBe('fr');
  });
});

// ─── usePreferredLanguage ─────────────────────────────────────────────────────

describe('usePreferredLanguage', () => {
  it('returns the preferred language from config', () => {
    mockUseLanguageStore.mockImplementation((sel: any) =>
      sel({ userLanguageConfig: makeConfig({ systemLanguage: 'es' }) })
    );
    const { result } = renderHook(() => usePreferredLanguage());
    expect(result.current).toBe('es');
  });
});
