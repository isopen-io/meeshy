/**
 * Tests for hooks/compatibility-hooks.ts
 */

const mockUser = { id: 'u1', username: 'alice' };
const mockSetUser = jest.fn();
const mockLogout = jest.fn();
const mockCurrentInterfaceLanguage = 'fr';
const mockUserLanguageConfig = { systemLanguage: 'fr', regionalLanguage: 'en' };
const mockSetInterfaceLanguage = jest.fn();
const mockSetCustomDestinationLanguage = jest.fn();
const mockIsLanguageSupported = jest.fn(() => true);

jest.mock('@/stores', () => ({
  useUser: () => mockUser,
  useAuthActions: () => ({ setUser: mockSetUser, logout: mockLogout }),
  useCurrentInterfaceLanguage: () => mockCurrentInterfaceLanguage,
  useUserLanguageConfig: () => mockUserLanguageConfig,
  useLanguageActions: () => ({
    setInterfaceLanguage: mockSetInterfaceLanguage,
    setCustomDestinationLanguage: mockSetCustomDestinationLanguage,
    isLanguageSupported: mockIsLanguageSupported,
  }),
}));

jest.mock('@/types/frontend', () => ({
  INTERFACE_LANGUAGES: [
    { code: 'fr', name: 'Français' },
    { code: 'en', name: 'English' },
    { code: 'es', name: 'Español' },
  ],
}));

import { renderHook } from '@testing-library/react';
import { useUser, useLanguage } from '@/hooks/compatibility-hooks';

beforeEach(() => {
  jest.clearAllMocks();
});

// ─── useUser ──────────────────────────────────────────────────────────────────

describe('useUser', () => {
  it('returns user from store', () => {
    const { result } = renderHook(() => useUser());
    expect(result.current.user).toBe(mockUser);
  });

  it('exposes setUser action', () => {
    const { result } = renderHook(() => useUser());
    result.current.setUser({ id: 'u2' } as any);
    expect(mockSetUser).toHaveBeenCalledWith({ id: 'u2' });
  });

  it('exposes logout action', () => {
    const { result } = renderHook(() => useUser());
    result.current.logout();
    expect(mockLogout).toHaveBeenCalled();
  });

  it('isAuthChecking is always false', () => {
    const { result } = renderHook(() => useUser());
    expect(result.current.isAuthChecking).toBe(false);
  });
});

// ─── useLanguage ──────────────────────────────────────────────────────────────

describe('useLanguage', () => {
  it('returns currentInterfaceLanguage from store', () => {
    const { result } = renderHook(() => useLanguage());
    expect(result.current.currentInterfaceLanguage).toBe('fr');
  });

  it('returns userLanguageConfig from store', () => {
    const { result } = renderHook(() => useLanguage());
    expect(result.current.userLanguageConfig).toBe(mockUserLanguageConfig);
  });

  it('exposes setInterfaceLanguage action', () => {
    const { result } = renderHook(() => useLanguage());
    result.current.setInterfaceLanguage('es');
    expect(mockSetInterfaceLanguage).toHaveBeenCalledWith('es');
  });

  it('exposes setCustomDestinationLanguage action', () => {
    const { result } = renderHook(() => useLanguage());
    result.current.setCustomDestinationLanguage('pt');
    expect(mockSetCustomDestinationLanguage).toHaveBeenCalledWith('pt');
  });

  it('exposes isLanguageSupported action', () => {
    const { result } = renderHook(() => useLanguage());
    result.current.isLanguageSupported('fr');
    expect(mockIsLanguageSupported).toHaveBeenCalledWith('fr');
  });

  it('getSupportedLanguages returns mapped languages', () => {
    const { result } = renderHook(() => useLanguage());
    const langs = result.current.getSupportedLanguages();
    expect(langs).toHaveLength(3);
    expect(langs[0]).toEqual({ code: 'fr', name: 'Français', nativeName: 'Français' });
    expect(langs[1]).toEqual({ code: 'en', name: 'English', nativeName: 'English' });
  });

  it('getSupportedLanguages includes code, name, nativeName for each language', () => {
    const { result } = renderHook(() => useLanguage());
    const langs = result.current.getSupportedLanguages();
    for (const lang of langs) {
      expect(lang).toHaveProperty('code');
      expect(lang).toHaveProperty('name');
      expect(lang).toHaveProperty('nativeName');
    }
  });
});
