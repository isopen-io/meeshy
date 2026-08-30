/**
 * `lang` et `dir` du document — le SITE UNIQUE nomme par le § 3 de la conception
 * (`lib/a11y/ lang-attr, RTL_LOCALES, focus utils`).
 *
 * AVANCE SUR L0, issue #4415. Ce module existe des L-0.5 parce que la coquille racine ecrit le
 * SEUL `<html>` de la zone : les 44 ecrans en heritent, et un litteral `'fr'` pose
 * la n'a plus de proprietaire. Le gate B (§ 9.5) prend `<html lang>` pour
 * REFERENCE — « `lang="xx"` sur chaque noeud dont le texte a ete resolu par le
 * Prisme dans une langue ≠ `<html lang>` » —, donc une reference figee inverse le
 * gate pour tout lecteur non francophone.
 *
 * Copie explicite de `apps/web/lib/i18n/locale-config.ts` (`apps/web` n'est pas un
 * workspace importable — § 1 de la conception). MEME nom de cookie, donc meme
 * origine ⇒ le choix de langue d'interface SUIT a travers la frontiere de zone
 * (§ 4.9, point de vigilance), exactement comme le theme.
 *
 * `RTL_LOCALES` et `dir` sont poses des maintenant : arbitrage de la question
 * ouverte n° 7 (« RTL pose des L0, cout nul sans locale `ar` »). `ar` n'est pas
 * peuplee, donc `SUPPORTED_LOCALES` ne la contient pas encore — le jour ou elle
 * l'est, `documentDir` rend deja `rtl` sans qu'une ligne bouge.
 */

export const SUPPORTED_LOCALES = ['en', 'fr', 'es', 'pt', 'de', 'it'] as const;

export type InterfaceLocale = (typeof SUPPORTED_LOCALES)[number];

/**
 * Meme defaut que `apps/web` (`DEFAULT_INTERFACE_LOCALE = 'en'`) : la v3 remplace
 * le legacy, elle ne doit pas changer la langue servie a un visiteur sans signal.
 */
export const DEFAULT_LOCALE: InterfaceLocale = 'en';

/** Ecrit par le legacy, lu par les deux zones. */
export const LOCALE_COOKIE_NAME = 'meeshy-interface-language';

export const RTL_LOCALES: ReadonlySet<string> = new Set(['ar', 'he', 'fa', 'ur']);

export function isSupportedLocale(value: string | null | undefined): value is InterfaceLocale {
  return typeof value === 'string' && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

/**
 * Premiere langue de base (`fr` depuis `fr-CA`) supportee, ponderee par `q`.
 */
export function parseAcceptLanguage(header: string | null | undefined): InterfaceLocale | null {
  if (!header) return null;

  const ranked = header
    .split(',')
    .map((part) => {
      const [tag, ...params] = part.trim().split(';');
      const quality = params.find((param) => param.trim().startsWith('q='));
      const weight = quality ? Number.parseFloat(quality.trim().slice(2)) : 1;
      return {
        base: (tag ?? '').trim().toLowerCase().split('-')[0] ?? '',
        weight: Number.isNaN(weight) ? 0 : weight,
      };
    })
    .filter((entry) => entry.base.length > 0 && entry.weight > 0)
    .sort((a, b) => b.weight - a.weight);

  const match = ranked.find((entry) => isSupportedLocale(entry.base));
  return match ? (match.base as InterfaceLocale) : null;
}

/**
 * Descente ORDONNEE : choix persiste, puis negociation du navigateur, puis defaut.
 */
export function resolveDocumentLocale(signals: {
  readonly cookie?: string | null;
  readonly acceptLanguage?: string | null;
}): InterfaceLocale {
  if (isSupportedLocale(signals.cookie)) return signals.cookie;
  return parseAcceptLanguage(signals.acceptLanguage) ?? DEFAULT_LOCALE;
}

export function documentDir(locale: string): 'ltr' | 'rtl' {
  return RTL_LOCALES.has(locale) ? 'rtl' : 'ltr';
}
