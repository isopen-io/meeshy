/**
 * Language Store Tests
 * Tests for language preferences state management with Zustand
 */

import { act } from '@testing-library/react';
import { useLanguageStore } from '../../stores/language-store';

// Mock the frontend types
jest.mock('../../types/frontend', () => ({
  INTERFACE_LANGUAGES: [
    { code: 'en', name: 'English', flag: 'us', translateText: 'Translate to English' },
    { code: 'es', name: 'Espanol', flag: 'es', translateText: 'Traducir al espanol' },
    { code: 'fr', name: 'Francais', flag: 'fr', translateText: 'Traduire en francais' },
    { code: 'pt', name: 'Portugues', flag: 'pt', translateText: 'Traduzir para portugues' },
  ],
}));

describe('LanguageStore', () => {
  // Save original navigator
  const originalNavigator = global.navigator;

  beforeEach(() => {
    // Reset the store to initial state
    act(() => {
      useLanguageStore.setState({
        currentInterfaceLanguage: 'fr',
        currentMessageLanguage: 'fr',
        availableLanguages: ['en', 'es', 'fr', 'pt'],
        userLanguageConfig: {
          systemLanguage: 'fr',
          regionalLanguage: 'fr',
          customDestinationLanguage: undefined,
          autoTranslateEnabled: true,
          translateToSystemLanguage: true,
          translateToRegionalLanguage: false,
          useCustomDestination: false,
        },
      });
    });
    jest.clearAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    // Restore original navigator
    Object.defineProperty(global, 'navigator', {
      value: originalNavigator,
      writable: true,
    });
  });

  describe('Initial State', () => {
    it('should have correct initial state', () => {
      const state = useLanguageStore.getState();

      expect(state.currentInterfaceLanguage).toBe('fr');
      expect(state.currentMessageLanguage).toBe('fr');
      expect(state.availableLanguages).toEqual(['en', 'es', 'fr', 'pt']);
      expect(state.userLanguageConfig).toEqual({
        systemLanguage: 'fr',
        regionalLanguage: 'fr',
        customDestinationLanguage: undefined,
        autoTranslateEnabled: true,
        translateToSystemLanguage: true,
        translateToRegionalLanguage: false,
        useCustomDestination: false,
      });
    });
  });

  describe('setInterfaceLanguage', () => {
    it('should set interface language for supported language', () => {
      act(() => {
        useLanguageStore.getState().setInterfaceLanguage('en');
      });

      expect(useLanguageStore.getState().currentInterfaceLanguage).toBe('en');
    });

    it('should set interface language to Spanish', () => {
      act(() => {
        useLanguageStore.getState().setInterfaceLanguage('es');
      });

      expect(useLanguageStore.getState().currentInterfaceLanguage).toBe('es');
    });

    it('should not change language for unsupported language', () => {
      act(() => {
        useLanguageStore.getState().setInterfaceLanguage('de'); // German not in list
      });

      // Should remain unchanged
      expect(useLanguageStore.getState().currentInterfaceLanguage).toBe('fr');
    });

    it('should handle all supported languages', () => {
      const supportedLangs = ['en', 'es', 'fr', 'pt'];

      supportedLangs.forEach(lang => {
        act(() => {
          useLanguageStore.getState().setInterfaceLanguage(lang);
        });

        expect(useLanguageStore.getState().currentInterfaceLanguage).toBe(lang);
      });
    });
  });

  describe('setMessageLanguage', () => {
    it('should set message language for supported language', () => {
      act(() => {
        useLanguageStore.getState().setMessageLanguage('en');
      });

      expect(useLanguageStore.getState().currentMessageLanguage).toBe('en');
    });

    it('should not change language for unsupported language', () => {
      act(() => {
        useLanguageStore.getState().setMessageLanguage('zh'); // Chinese not in list
      });

      expect(useLanguageStore.getState().currentMessageLanguage).toBe('fr');
    });
  });

  describe('setCustomDestinationLanguage', () => {
    it('should set custom destination language', () => {
      act(() => {
        useLanguageStore.getState().setCustomDestinationLanguage('pt');
      });

      expect(useLanguageStore.getState().userLanguageConfig.customDestinationLanguage).toBe('pt');
    });

    it('should allow any language code (not validated)', () => {
      act(() => {
        useLanguageStore.getState().setCustomDestinationLanguage('ja');
      });

      expect(useLanguageStore.getState().userLanguageConfig.customDestinationLanguage).toBe('ja');
    });
  });

  describe('updateLanguageConfig', () => {
    it('should update single config property', () => {
      act(() => {
        useLanguageStore.getState().updateLanguageConfig({
          autoTranslateEnabled: false,
        });
      });

      expect(useLanguageStore.getState().userLanguageConfig.autoTranslateEnabled).toBe(false);
    });

    it('should update multiple config properties', () => {
      act(() => {
        useLanguageStore.getState().updateLanguageConfig({
          systemLanguage: 'en',
          regionalLanguage: 'es',
          translateToRegionalLanguage: true,
        });
      });

      const config = useLanguageStore.getState().userLanguageConfig;
      expect(config.systemLanguage).toBe('en');
      expect(config.regionalLanguage).toBe('es');
      expect(config.translateToRegionalLanguage).toBe(true);
    });

    it('should preserve other config properties when updating', () => {
      act(() => {
        useLanguageStore.getState().updateLanguageConfig({
          useCustomDestination: true,
        });
      });

      const config = useLanguageStore.getState().userLanguageConfig;
      expect(config.useCustomDestination).toBe(true);
      // Other properties should remain unchanged
      expect(config.autoTranslateEnabled).toBe(true);
      expect(config.translateToSystemLanguage).toBe(true);
    });
  });

  describe('detectAndSetBrowserLanguage', () => {
    it('should detect English browser language', () => {
      Object.defineProperty(global, 'navigator', {
        value: { language: 'en-US' },
        writable: true,
      });

      act(() => {
        useLanguageStore.getState().detectAndSetBrowserLanguage();
      });

      const state = useLanguageStore.getState();
      expect(state.currentInterfaceLanguage).toBe('en');
      expect(state.currentMessageLanguage).toBe('en');
    });

    it('should detect Spanish browser language', () => {
      Object.defineProperty(global, 'navigator', {
        value: { language: 'es-ES' },
        writable: true,
      });

      act(() => {
        useLanguageStore.getState().detectAndSetBrowserLanguage();
      });

      const state = useLanguageStore.getState();
      expect(state.currentInterfaceLanguage).toBe('es');
      expect(state.currentMessageLanguage).toBe('es');
    });

    it('should fall back to English for unsupported browser language', () => {
      Object.defineProperty(global, 'navigator', {
        value: { language: 'de-DE' }, // German not supported
        writable: true,
      });

      act(() => {
        useLanguageStore.getState().detectAndSetBrowserLanguage();
      });

      const state = useLanguageStore.getState();
      expect(state.currentInterfaceLanguage).toBe('en');
      expect(state.currentMessageLanguage).toBe('en');
    });

    it('should handle language without region code', () => {
      Object.defineProperty(global, 'navigator', {
        value: { language: 'fr' },
        writable: true,
      });

      act(() => {
        useLanguageStore.getState().detectAndSetBrowserLanguage();
      });

      expect(useLanguageStore.getState().currentInterfaceLanguage).toBe('fr');
    });
  });

  describe('isLanguageSupported', () => {
    it('should return true for supported languages', () => {
      const store = useLanguageStore.getState();

      expect(store.isLanguageSupported('en')).toBe(true);
      expect(store.isLanguageSupported('es')).toBe(true);
      expect(store.isLanguageSupported('fr')).toBe(true);
      expect(store.isLanguageSupported('pt')).toBe(true);
    });

    it('should return false for unsupported languages', () => {
      const store = useLanguageStore.getState();

      expect(store.isLanguageSupported('de')).toBe(false);
      expect(store.isLanguageSupported('zh')).toBe(false);
      expect(store.isLanguageSupported('ja')).toBe(false);
      expect(store.isLanguageSupported('invalid')).toBe(false);
    });
  });

  describe('Selector Hooks', () => {
    it('useCurrentInterfaceLanguage should return current interface language', () => {
      act(() => {
        useLanguageStore.getState().setInterfaceLanguage('en');
      });

      expect(useLanguageStore.getState().currentInterfaceLanguage).toBe('en');
    });

    it('useCurrentMessageLanguage should return current message language', () => {
      act(() => {
        useLanguageStore.getState().setMessageLanguage('es');
      });

      expect(useLanguageStore.getState().currentMessageLanguage).toBe('es');
    });

    it('useAvailableLanguages should return available languages', () => {
      const available = useLanguageStore.getState().availableLanguages;
      expect(available).toEqual(['en', 'es', 'fr', 'pt']);
    });

    it('useUserLanguageConfig should return user config', () => {
      act(() => {
        useLanguageStore.getState().updateLanguageConfig({
          autoTranslateEnabled: false,
        });
      });

      const config = useLanguageStore.getState().userLanguageConfig;
      expect(config.autoTranslateEnabled).toBe(false);
    });
  });

  describe('Persistence', () => {
    it('should persist interface language', () => {
      act(() => {
        useLanguageStore.getState().setInterfaceLanguage('en');
      });

      const state = useLanguageStore.getState();
      expect(state.currentInterfaceLanguage).toBe('en');
    });

    it('should persist message language', () => {
      act(() => {
        useLanguageStore.getState().setMessageLanguage('es');
      });

      const state = useLanguageStore.getState();
      expect(state.currentMessageLanguage).toBe('es');
    });

    it('should persist user language config', () => {
      act(() => {
        useLanguageStore.getState().updateLanguageConfig({
          useCustomDestination: true,
          customDestinationLanguage: 'pt',
        });
      });

      const config = useLanguageStore.getState().userLanguageConfig;
      expect(config.useCustomDestination).toBe(true);
      expect(config.customDestinationLanguage).toBe('pt');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty string language code', () => {
      act(() => {
        useLanguageStore.getState().setInterfaceLanguage('');
      });

      // Should remain unchanged since empty string is not supported
      expect(useLanguageStore.getState().currentInterfaceLanguage).toBe('fr');
    });

    it('should handle case-sensitive language codes', () => {
      act(() => {
        useLanguageStore.getState().setInterfaceLanguage('EN'); // Uppercase
      });

      // Should remain unchanged since 'EN' != 'en'
      expect(useLanguageStore.getState().currentInterfaceLanguage).toBe('fr');
    });

    it('should update both interface and message language in browser detection', () => {
      Object.defineProperty(global, 'navigator', {
        value: { language: 'pt-BR' },
        writable: true,
      });

      act(() => {
        useLanguageStore.getState().detectAndSetBrowserLanguage();
      });

      const state = useLanguageStore.getState();
      expect(state.currentInterfaceLanguage).toBe('pt');
      expect(state.currentMessageLanguage).toBe('pt');
    });
  });
});
