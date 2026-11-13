/**
 * LE CATALOGUE DE « MONTRE-TOI » (#17237) — les libellés `onboarding.profile.*`
 * de la carte facultative de l'accueil (`routes/onboarding-profile.tsx`). Un
 * `import()` par langue, chargé AVEC la carte (son chunk paresseux) et jamais
 * avec le reste du parcours : le catalogue de l'accueil est à son plafond
 * (`budgets.json` › `interface_catalogs_onboarding`).
 *
 * Aucun repli : une clé absente d'une langue est une erreur de compilation
 * (`satisfies OnboardingProfileCatalog`) et un témoin rouge
 * (`i18n-onboarding-profile-catalog.test.ts`) ; un catalogue lu avant d'être
 * chargé lève.
 */
import type FrenchOnboardingProfile from './interface-catalogs/catalog-onboarding-profile-fr';
import type { InterfaceLanguage } from './interface-language';

type FrenchOnboardingProfileCatalog = typeof FrenchOnboardingProfile;

export type OnboardingProfileCatalogKey = keyof FrenchOnboardingProfileCatalog;

export type OnboardingProfileCatalog = Readonly<Record<OnboardingProfileCatalogKey, string>>;

type Placeholders<S extends string> = S extends `${string}{${infer Name}}${infer Rest}` ? Name | Placeholders<Rest> : never;

type TranslateOnboardingProfileArgs<K extends OnboardingProfileCatalogKey> = [Placeholders<FrenchOnboardingProfileCatalog[K]>] extends [never]
  ? []
  : [params: Readonly<Record<Placeholders<FrenchOnboardingProfileCatalog[K]>, string>>];

type CatalogModule = { readonly default: OnboardingProfileCatalog };

const LOADERS: Readonly<Record<InterfaceLanguage, () => Promise<CatalogModule>>> = {
  fr: () => import('./interface-catalogs/catalog-onboarding-profile-fr'),
  en: () => import('./interface-catalogs/catalog-onboarding-profile-en'),
  es: () => import('./interface-catalogs/catalog-onboarding-profile-es'),
  pt: () => import('./interface-catalogs/catalog-onboarding-profile-pt'),
  de: () => import('./interface-catalogs/catalog-onboarding-profile-de'),
  it: () => import('./interface-catalogs/catalog-onboarding-profile-it'),
  ar: () => import('./interface-catalogs/catalog-onboarding-profile-ar'),
};

const loaded = new Map<InterfaceLanguage, OnboardingProfileCatalog>();
const inFlight = new Map<InterfaceLanguage, Promise<OnboardingProfileCatalog>>();

export function loadOnboardingProfileCatalog(language: InterfaceLanguage): Promise<OnboardingProfileCatalog> {
  const ready = loaded.get(language);
  if (ready !== undefined) return Promise.resolve(ready);
  const pending = inFlight.get(language);
  if (pending !== undefined) return pending;

  const request = LOADERS[language]().then(
    ({ default: catalog }) => {
      loaded.set(language, catalog);
      inFlight.delete(language);
      return catalog;
    },
    (error: unknown) => {
      inFlight.delete(language);
      throw error;
    },
  );
  inFlight.set(language, request);
  return request;
}

export const isOnboardingProfileCatalogLoaded = (language: InterfaceLanguage): boolean => loaded.has(language);

const PLACEHOLDER = /\{(\w+)\}/g;

export function translateOnboardingProfile<K extends OnboardingProfileCatalogKey>(language: InterfaceLanguage, key: K, ...params: TranslateOnboardingProfileArgs<K>): string;
export function translateOnboardingProfile(language: InterfaceLanguage, key: OnboardingProfileCatalogKey, params?: Readonly<Record<string, string>>): string {
  const catalog = loaded.get(language);
  if (catalog === undefined) {
    throw new Error(`Catalogue de « Montre-toi » « ${language} » lu avant d'être chargé (loadOnboardingProfileCatalog).`);
  }
  const text = catalog[key];
  if (params === undefined) return text;
  return text.replace(PLACEHOLDER, (whole, name: string) => params[name] ?? whole);
}
