/**
 * Shared, framework-agnostic locale configuration.
 *
 * This module is intentionally free of any `next/headers`, `server-only` or
 * browser-only dependency so it can be imported from both the server (metadata
 * generation, `<html lang>`) and the client (language store cookie sync) and be
 * unit-tested in isolation.
 *
 * Source of truth for the list of interface languages stays `types/frontend.ts`
 * (`INTERFACE_LANGUAGES`); this file mirrors only what SSR needs (codes + the
 * Open Graph locale mapping) to avoid pulling React types into server metadata.
 */

export const SUPPORTED_INTERFACE_LOCALES = ['en', 'fr', 'es', 'pt', 'de', 'it'] as const;

export type InterfaceLocale = (typeof SUPPORTED_INTERFACE_LOCALES)[number];

/**
 * Default interface locale used when no cookie and no usable `Accept-Language`
 * is available. English matches both the rendered UI default and the browser
 * detection fallback in `language-store.ts` / `detectBrowserLanguage()`.
 */
export const DEFAULT_INTERFACE_LOCALE: InterfaceLocale = 'en';

/** Name of the cookie the client writes and the server reads. */
export const LOCALE_COOKIE_NAME = 'meeshy-interface-language';

/** One year, in seconds — matches the persistence intent of the language store. */
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/**
 * Maps an interface locale to its canonical Open Graph / `<meta>` locale value
 * (BCP-47 `language_TERRITORY`). Falls back to the default for unknown input.
 */
const OG_LOCALE: Record<InterfaceLocale, string> = {
  en: 'en_US',
  fr: 'fr_FR',
  es: 'es_ES',
  pt: 'pt_PT',
  de: 'de_DE',
  it: 'it_IT',
};

export function isSupportedLocale(value: string | undefined | null): value is InterfaceLocale {
  return typeof value === 'string' && (SUPPORTED_INTERFACE_LOCALES as readonly string[]).includes(value);
}

export function ogLocale(locale: string | undefined | null): string {
  return isSupportedLocale(locale) ? OG_LOCALE[locale] : OG_LOCALE[DEFAULT_INTERFACE_LOCALE];
}

/**
 * Parses a standard HTTP `Accept-Language` header and returns the first base
 * language tag (e.g. `fr` from `fr-CA`) that is a supported interface locale,
 * honouring quality weights. Returns `null` when nothing matches.
 */
export function parseAcceptLanguage(header: string | undefined | null): InterfaceLocale | null {
  if (!header) return null;

  const ranked = header
    .split(',')
    .map((part) => {
      const [tag, ...params] = part.trim().split(';');
      const qParam = params.find((p) => p.trim().startsWith('q='));
      const q = qParam ? Number.parseFloat(qParam.trim().slice(2)) : 1;
      return { base: tag.trim().toLowerCase().split('-')[0], q: Number.isNaN(q) ? 0 : q };
    })
    .filter((entry) => entry.base.length > 0 && entry.q > 0)
    .sort((a, b) => b.q - a.q);

  const match = ranked.find((entry) => isSupportedLocale(entry.base));
  return match ? (match.base as InterfaceLocale) : null;
}

/**
 * Resolves the interface locale from the available signals, in priority order:
 *   1. explicit cookie (the user's persisted choice)
 *   2. `Accept-Language` header (first-visit best guess, good for crawlers)
 *   3. the default locale
 */
export function resolveInterfaceLocale(opts: {
  cookie?: string | null;
  acceptLanguage?: string | null;
}): InterfaceLocale {
  if (isSupportedLocale(opts.cookie)) return opts.cookie;
  return parseAcceptLanguage(opts.acceptLanguage) ?? DEFAULT_INTERFACE_LOCALE;
}

/**
 * Replaces `{name}` placeholders in a template with the matching param value.
 * Mirrors the substitution semantics of `useI18n().t(key, params)` so dynamic
 * metadata strings behave like the rest of the i18n system.
 */
export function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    const value = params[key];
    return value === undefined || value === null ? match : String(value);
  });
}
