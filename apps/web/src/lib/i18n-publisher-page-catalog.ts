/**
 * LE CATALOGUE DE LA PAGE ÉDITEUR (#16440) — les libellés `publisherPage.*`
 * de la section de Réglages qui laisse un éditeur nommer son compte Meeshy sur
 * sa page éditeur, dans les sept langues du produit. Même mécanique que
 * `i18n-circle-notify-catalog.ts` : un `import()` par langue, chargé par la
 * section (`routes/settings-publisher-page.tsx`), jamais au démarrage — le
 * catalogue d'interface est à son plafond (`budgets.json` ›
 * `interface_catalogs`).
 *
 * Aucun repli : une clé absente d'une langue est une erreur de compilation
 * (`satisfies PublisherPageCatalog`) et un témoin rouge ; un catalogue lu avant
 * d'être chargé lève.
 */
import type FrenchPublisherPage from './interface-catalogs/catalog-publisher-page-fr';
import type { InterfaceLanguage } from './interface-language';

export type PublisherPageCatalogKey = keyof typeof FrenchPublisherPage;

export type PublisherPageCatalog = Readonly<Record<PublisherPageCatalogKey, string>>;

type CatalogModule = { readonly default: PublisherPageCatalog };

const LOADERS: Readonly<Record<InterfaceLanguage, () => Promise<CatalogModule>>> = {
  fr: () => import('./interface-catalogs/catalog-publisher-page-fr'),
  en: () => import('./interface-catalogs/catalog-publisher-page-en'),
  es: () => import('./interface-catalogs/catalog-publisher-page-es'),
  pt: () => import('./interface-catalogs/catalog-publisher-page-pt'),
  de: () => import('./interface-catalogs/catalog-publisher-page-de'),
  it: () => import('./interface-catalogs/catalog-publisher-page-it'),
  ar: () => import('./interface-catalogs/catalog-publisher-page-ar'),
};

const loaded = new Map<InterfaceLanguage, PublisherPageCatalog>();
const inFlight = new Map<InterfaceLanguage, Promise<PublisherPageCatalog>>();

export const isPublisherPageCatalogLoaded = (language: InterfaceLanguage): boolean => loaded.has(language);

export function loadPublisherPageCatalog(language: InterfaceLanguage): Promise<PublisherPageCatalog> {
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

export function translatePublisherPage(language: InterfaceLanguage, key: PublisherPageCatalogKey): string {
  const catalog = loaded.get(language);
  if (catalog === undefined) {
    throw new Error(`Catalogue « Page éditeur » « ${language} » lu avant d'être chargé (loadPublisherPageCatalog).`);
  }
  return catalog[key];
}
