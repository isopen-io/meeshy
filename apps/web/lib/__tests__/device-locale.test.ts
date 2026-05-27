/**
 * @jest-environment jsdom
 */
import {
  DEVICE_LOCALE_HEADER,
  getDeviceLocale,
  getDeviceLocaleHeaders,
} from '../device-locale';

describe('device-locale', () => {
  let originalLanguageDescriptor: PropertyDescriptor | undefined;

  beforeEach(() => {
    originalLanguageDescriptor = Object.getOwnPropertyDescriptor(
      navigator,
      'language'
    );
  });

  afterEach(() => {
    if (originalLanguageDescriptor) {
      Object.defineProperty(navigator, 'language', originalLanguageDescriptor);
    }
  });

  function stubLanguage(value: unknown) {
    Object.defineProperty(navigator, 'language', {
      configurable: true,
      get: () => value,
    });
  }

  describe('DEVICE_LOCALE_HEADER', () => {
    it('uses the canonical X-Device-Locale name', () => {
      expect(DEVICE_LOCALE_HEADER).toBe('X-Device-Locale');
    });
  });

  describe('getDeviceLocale', () => {
    it('returns the raw BCP 47 navigator.language value (region-aware)', () => {
      stubLanguage('fr-FR');
      expect(getDeviceLocale()).toBe('fr-FR');
    });

    it('preserves three-subtag locale identifiers', () => {
      stubLanguage('zh-Hant-HK');
      expect(getDeviceLocale()).toBe('zh-Hant-HK');
    });

    it('returns null when navigator.language is an empty string', () => {
      stubLanguage('');
      expect(getDeviceLocale()).toBeNull();
    });

    it('returns null when navigator.language is not a string', () => {
      stubLanguage(undefined);
      expect(getDeviceLocale()).toBeNull();
    });
  });

  describe('getDeviceLocaleHeaders', () => {
    it('returns the header object with the resolved locale', () => {
      stubLanguage('pt-BR');
      expect(getDeviceLocaleHeaders()).toEqual({ 'X-Device-Locale': 'pt-BR' });
    });

    it('returns an empty object when locale is unavailable so spreading is a no-op', () => {
      stubLanguage('');
      expect(getDeviceLocaleHeaders()).toEqual({});
    });
  });
});
