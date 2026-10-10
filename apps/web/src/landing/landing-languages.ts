import {
  DEFAULT_INTERFACE_LANGUAGE,
  SUPPORTED_INTERFACE_LANGUAGES,
  interfaceDirection,
} from '../lib/inline-interface-language-bootstrap.js';

/**
 * LES SEPT LANDINGS (#10002) — une par langue d'interface, jamais une de plus :
 * la liste EST celle du produit (`SUPPORTED_INTERFACE_LANGUAGES`), importée et
 * pas recopiée, pour qu'une huitième langue d'interface fasse rougir le témoin
 * des copies au lieu d'être oubliée par le prérendu.
 *
 * Le français est la langue de la racine (`/`, aussi `x-default`) : c'est la
 * langue par défaut de l'interface. Les six autres vivent sous `/<code>`.
 */
export type LandingLanguage = (typeof SUPPORTED_INTERFACE_LANGUAGES)[number];

export const LANDING_LANGUAGES: readonly LandingLanguage[] = SUPPORTED_INTERFACE_LANGUAGES;

export const ROOT_LANDING_LANGUAGE: LandingLanguage = DEFAULT_INTERFACE_LANGUAGE;

export function isLandingLanguage(code: string): code is LandingLanguage {
  return (LANDING_LANGUAGES as readonly string[]).includes(code);
}

/** L'adresse publique d'une landing : `/` pour la langue racine, `/<code>` sinon. */
export function landingPath(language: LandingLanguage): string {
  return language === ROOT_LANDING_LANGUAGE ? '/' : `/${language}`;
}

/**
 * LA LISTE DES CONVERSATIONS (`href('list')`), où l'application INSTALLÉE ouvre
 * quand elle démarre encore sur `/`. Une chaîne et non `href` : le prérendu ne
 * charge pas la table des routes (écrans à la demande, globales de build). Son
 * témoin la confronte à `href('list')` (`landing-routes.test.ts`).
 */
export const LANDING_APP_PATH = '/chats';

/** Toutes les adresses, par langue — ce que le sélecteur et le script de la page suivent. */
export function landingPaths(): Readonly<Record<LandingLanguage, string>> {
  return {
    fr: landingPath('fr'),
    en: landingPath('en'),
    es: landingPath('es'),
    pt: landingPath('pt'),
    de: landingPath('de'),
    it: landingPath('it'),
    ar: landingPath('ar'),
  };
}

/**
 * Le fichier ÉCRIT par le prérendu pour une landing. La racine ne peut pas être
 * `index.html` : ce nom est la coquille de l'application, que nginx sert en
 * repli à toute adresse de l'application (`/chats`, `/c/…`). `nginx.conf` sert
 * donc `landing.html` sur `location = /`.
 */
export function landingFiles(language: LandingLanguage): readonly string[] {
  return language === ROOT_LANDING_LANGUAGE ? ['landing.html'] : [`${language}.html`, `${language}/index.html`];
}

/** Les landings hors racine, en motif ancré — le refus du repli du service worker. */
export const LANDING_SUBPATH_PATTERN = new RegExp(
  `^/(?:${LANDING_LANGUAGES.filter((language) => language !== ROOT_LANDING_LANGUAGE).join('|')})/?$`,
);

export function landingDirection(language: LandingLanguage): 'ltr' | 'rtl' {
  return interfaceDirection(language) === 'rtl' ? 'rtl' : 'ltr';
}

/** `og:locale` — la langue ET une région, que le protocole Open Graph exige. */
export const OG_LOCALES: Readonly<Record<LandingLanguage, string>> = {
  fr: 'fr_FR',
  en: 'en_US',
  es: 'es_ES',
  pt: 'pt_BR',
  de: 'de_DE',
  it: 'it_IT',
  ar: 'ar_AR',
};

/** Le nom de chaque langue DANS cette langue — le sélecteur ne se traduit pas. */
export const LANGUAGE_AUTONYMS: Readonly<Record<LandingLanguage, string>> = {
  fr: 'Français',
  en: 'English',
  es: 'Español',
  pt: 'Português',
  de: 'Deutsch',
  it: 'Italiano',
  ar: 'العربية',
};
