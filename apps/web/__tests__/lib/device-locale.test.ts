/**
 * Tests for lib/device-locale.ts
 */

import {
  getDeviceLocale,
  getDeviceLocaleHeaders,
  DEVICE_LOCALE_HEADER,
} from '@/lib/device-locale';

const setNavigatorLanguage = (value: string) => {
  Object.defineProperty(navigator, 'language', {
    value,
    configurable: true,
    writable: true,
  });
};

// ─── DEVICE_LOCALE_HEADER ─────────────────────────────────────────────────────

describe('DEVICE_LOCALE_HEADER', () => {
  it('is the expected header name', () => {
    expect(DEVICE_LOCALE_HEADER).toBe('X-Device-Locale');
  });
});

// ─── getDeviceLocale ──────────────────────────────────────────────────────────

describe('getDeviceLocale', () => {
  it('returns the navigator language when available', () => {
    setNavigatorLanguage('fr-FR');
    expect(getDeviceLocale()).toBe('fr-FR');
  });

  it('returns null when navigator.language is an empty string', () => {
    setNavigatorLanguage('');
    expect(getDeviceLocale()).toBeNull();
  });

  it('returns multi-region locale tags unchanged', () => {
    setNavigatorLanguage('pt-BR');
    expect(getDeviceLocale()).toBe('pt-BR');
  });

  it('returns simple language codes unchanged', () => {
    setNavigatorLanguage('en');
    expect(getDeviceLocale()).toBe('en');
  });
});

// ─── getDeviceLocaleHeaders ───────────────────────────────────────────────────

describe('getDeviceLocaleHeaders', () => {
  it('returns an empty object when navigator.language is empty', () => {
    setNavigatorLanguage('');
    expect(getDeviceLocaleHeaders()).toEqual({});
  });

  it('returns the X-Device-Locale header with the locale value', () => {
    setNavigatorLanguage('en-US');
    expect(getDeviceLocaleHeaders()).toEqual({ 'X-Device-Locale': 'en-US' });
  });

  it('uses the DEVICE_LOCALE_HEADER constant as the header key', () => {
    setNavigatorLanguage('de');
    const headers = getDeviceLocaleHeaders();
    expect(headers[DEVICE_LOCALE_HEADER]).toBe('de');
  });
});
