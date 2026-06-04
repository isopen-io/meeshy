import {
  DEFAULT_INTERFACE_LOCALE,
  SUPPORTED_INTERFACE_LOCALES,
  interpolate,
  isSupportedLocale,
  ogLocale,
  parseAcceptLanguage,
  resolveInterfaceLocale,
} from '@/lib/i18n/locale-config';

describe('isSupportedLocale', () => {
  it('accepts every declared interface locale', () => {
    SUPPORTED_INTERFACE_LOCALES.forEach((locale) => {
      expect(isSupportedLocale(locale)).toBe(true);
    });
  });

  it('rejects unknown, empty or nullish values', () => {
    expect(isSupportedLocale('zz')).toBe(false);
    expect(isSupportedLocale('en-US')).toBe(false);
    expect(isSupportedLocale('')).toBe(false);
    expect(isSupportedLocale(undefined)).toBe(false);
    expect(isSupportedLocale(null)).toBe(false);
  });
});

describe('ogLocale', () => {
  it('maps interface locales to their canonical Open Graph locale', () => {
    expect(ogLocale('en')).toBe('en_US');
    expect(ogLocale('fr')).toBe('fr_FR');
    expect(ogLocale('es')).toBe('es_ES');
    expect(ogLocale('pt')).toBe('pt_PT');
    expect(ogLocale('de')).toBe('de_DE');
    expect(ogLocale('it')).toBe('it_IT');
  });

  it('falls back to the default locale mapping for unknown input', () => {
    expect(ogLocale('zz')).toBe('en_US');
    expect(ogLocale(null)).toBe('en_US');
  });
});

describe('parseAcceptLanguage', () => {
  it('returns the first supported base language', () => {
    expect(parseAcceptLanguage('fr-CA,fr;q=0.9,en;q=0.8')).toBe('fr');
  });

  it('honours quality weights over document order', () => {
    expect(parseAcceptLanguage('en;q=0.5,pt;q=0.9')).toBe('pt');
  });

  it('skips unsupported languages and keeps the first supported one', () => {
    expect(parseAcceptLanguage('zh-CN,ja;q=0.9,es;q=0.5')).toBe('es');
  });

  it('returns null when nothing matches or header is absent', () => {
    expect(parseAcceptLanguage('zh-CN,ja;q=0.9')).toBeNull();
    expect(parseAcceptLanguage('')).toBeNull();
    expect(parseAcceptLanguage(null)).toBeNull();
    expect(parseAcceptLanguage(undefined)).toBeNull();
  });
});

describe('resolveInterfaceLocale', () => {
  it('prefers a valid cookie over the Accept-Language header', () => {
    expect(resolveInterfaceLocale({ cookie: 'es', acceptLanguage: 'fr-FR' })).toBe('es');
  });

  it('falls back to Accept-Language when the cookie is missing or invalid', () => {
    expect(resolveInterfaceLocale({ cookie: undefined, acceptLanguage: 'pt-BR,pt;q=0.9' })).toBe('pt');
    expect(resolveInterfaceLocale({ cookie: 'zz', acceptLanguage: 'fr' })).toBe('fr');
  });

  it('falls back to the default locale when nothing is usable', () => {
    expect(resolveInterfaceLocale({})).toBe(DEFAULT_INTERFACE_LOCALE);
    expect(resolveInterfaceLocale({ cookie: null, acceptLanguage: 'zh' })).toBe(DEFAULT_INTERFACE_LOCALE);
  });
});

describe('interpolate', () => {
  it('replaces named placeholders with their values', () => {
    expect(interpolate('{name} (@{username})', { name: 'Ada', username: 'ada' })).toBe('Ada (@ada)');
  });

  it('coerces numbers and leaves unknown placeholders untouched', () => {
    expect(interpolate('{count} participants', { count: 3 })).toBe('3 participants');
    expect(interpolate('hello {missing}', { name: 'x' })).toBe('hello {missing}');
  });

  it('returns the template unchanged when no params are provided', () => {
    expect(interpolate('plain text')).toBe('plain text');
  });
});
