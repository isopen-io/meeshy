/**
 * LE CATALOGUE DE L'ACCUEIL POST-INSCRIPTION (#7729) — les libellés
 * `onboarding.*` des cinq cartes et de leur récapitulatif, dans les sept
 * langues du produit. Même mécanique que le catalogue d'administration
 * (`i18n-admin-catalog.ts`) : un `import()` par langue, chargé à l'entrée de
 * `/onboarding` seulement (`routes/route-table.tsx`), jamais au démarrage —
 * un compte ne voit ce parcours qu'une fois, aucun autre lecteur ne doit en
 * payer les octets. Et `catalog-fr.ts` a déjà passé le budget de taille : on
 * n'y ajoute rien.
 *
 * Aucun repli : une clé absente d'une langue est une erreur de compilation
 * (`satisfies OnboardingCatalog`) et un témoin rouge
 * (`i18n-onboarding-catalog.test.ts`) ; un catalogue lu avant d'être chargé
 * lève.
 */
import type FrenchOnboarding from './interface-catalogs/catalog-onboarding-fr';
import type { InterfaceLanguage } from './interface-language';

type FrenchOnboardingCatalog = typeof FrenchOnboarding;

export type OnboardingCatalogKey = keyof FrenchOnboardingCatalog;

export type OnboardingCatalog = Readonly<Record<OnboardingCatalogKey, string>>;

type Placeholders<S extends string> = S extends `${string}{${infer Name}}${infer Rest}`
  ? Name | Placeholders<Rest>
  : never;

type TranslateOnboardingArgs<K extends OnboardingCatalogKey> = [Placeholders<FrenchOnboardingCatalog[K]>] extends [never]
  ? []
  : [params: Readonly<Record<Placeholders<FrenchOnboardingCatalog[K]>, string>>];

type CatalogModule = { readonly default: OnboardingCatalog };

const LOADERS: Readonly<Record<InterfaceLanguage, () => Promise<CatalogModule>>> = {
  fr: () => import('./interface-catalogs/catalog-onboarding-fr'),
  en: () => import('./interface-catalogs/catalog-onboarding-en'),
  es: () => import('./interface-catalogs/catalog-onboarding-es'),
  pt: () => import('./interface-catalogs/catalog-onboarding-pt'),
  de: () => import('./interface-catalogs/catalog-onboarding-de'),
  it: () => import('./interface-catalogs/catalog-onboarding-it'),
  ar: () => import('./interface-catalogs/catalog-onboarding-ar'),
};

const loaded = new Map<InterfaceLanguage, OnboardingCatalog>();
const inFlight = new Map<InterfaceLanguage, Promise<OnboardingCatalog>>();

export function loadOnboardingCatalog(language: InterfaceLanguage): Promise<OnboardingCatalog> {
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

const PLACEHOLDER = /\{(\w+)\}/g;

export function translateOnboarding<K extends OnboardingCatalogKey>(
  language: InterfaceLanguage,
  key: K,
  ...params: TranslateOnboardingArgs<K>
): string;
export function translateOnboarding(
  language: InterfaceLanguage,
  key: OnboardingCatalogKey,
  params?: Readonly<Record<string, string>>,
): string {
  const catalog = loaded.get(language);
  if (catalog === undefined) {
    throw new Error(`Catalogue d'accueil « ${language} » lu avant d'être chargé (loadOnboardingCatalog).`);
  }
  const text = catalog[key];
  if (params === undefined) return text;
  return text.replace(PLACEHOLDER, (whole, name: string) => params[name] ?? whole);
}
