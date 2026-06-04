import { renderHook } from '@testing-library/react';
import { useLanguage } from '@/hooks/compatibility-hooks';
import { INTERFACE_LANGUAGES } from '@/types/frontend';

// Mock the Zustand store entry points the hook depends on. getSupportedLanguages
// is a pure derivation, so the store values just need to be present.
jest.mock('@/stores', () => ({
  useUser: () => null,
  useAuthActions: () => ({ setUser: jest.fn(), logout: jest.fn() }),
  useCurrentInterfaceLanguage: () => 'fr',
  useUserLanguageConfig: () => ({}),
  useLanguageActions: () => ({
    setInterfaceLanguage: jest.fn(),
    setCustomDestinationLanguage: jest.fn(),
    isLanguageSupported: jest.fn(),
  }),
}));

describe('useLanguage().getSupportedLanguages', () => {
  it('returns every interface language offered in the picker', () => {
    const { result } = renderHook(() => useLanguage());

    const codes = result.current.getSupportedLanguages().map((l) => l.code);

    // en/es/fr/pt ship full locale bundles; de/it are offered and fall back to
    // English UI until their bundles land (content stays NLLB-translated).
    expect(codes).toEqual(['en', 'es', 'fr', 'pt', 'de', 'it']);
  });

  it('stays in sync with the canonical INTERFACE_LANGUAGES source', () => {
    const { result } = renderHook(() => useLanguage());

    const languages = result.current.getSupportedLanguages();

    expect(languages).toEqual(
      INTERFACE_LANGUAGES.map(({ code, name }) => ({ code, name, nativeName: name }))
    );
  });

  it('exposes a { code, name, nativeName } shape for each language', () => {
    const { result } = renderHook(() => useLanguage());

    for (const language of result.current.getSupportedLanguages()) {
      expect(language).toEqual({
        code: expect.any(String),
        name: expect.any(String),
        nativeName: expect.any(String),
      });
    }
  });
});
