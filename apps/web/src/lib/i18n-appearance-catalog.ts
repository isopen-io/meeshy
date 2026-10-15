/**
 * LE CATALOGUE DU SÉLECTEUR « FOND ET COULEUR » (#10631) — les libellés
 * `appearance.*`, dans les sept langues du produit. Même mécanique que la
 * gestion d'une conversation (`i18n-conversation-manage-catalog.ts`) : un
 * `import()` par langue, chargé par la feuille elle-même chargée à la demande —
 * le catalogue d'interface est à son plafond (`budgets.json` › `interface_catalogs`).
 *
 * Aucun repli : une clé absente d'une langue est une erreur de compilation
 * (`satisfies AppearanceCatalog`) et un témoin rouge ; un catalogue lu avant
 * d'être chargé lève.
 */
import type FrenchAppearance from './interface-catalogs/catalog-appearance-fr';
import type { InterfaceLanguage } from './interface-language';

type FrenchAppearanceCatalog = typeof FrenchAppearance;

export type AppearanceCatalogKey = keyof FrenchAppearanceCatalog;

export type AppearanceCatalog = Readonly<Record<AppearanceCatalogKey, string>>;

type CatalogModule = { readonly default: AppearanceCatalog };

const LOADERS: Readonly<Record<InterfaceLanguage, () => Promise<CatalogModule>>> = {
  fr: () => import('./interface-catalogs/catalog-appearance-fr'),
  en: () => import('./interface-catalogs/catalog-appearance-en'),
  es: () => import('./interface-catalogs/catalog-appearance-es'),
  pt: () => import('./interface-catalogs/catalog-appearance-pt'),
  de: () => import('./interface-catalogs/catalog-appearance-de'),
  it: () => import('./interface-catalogs/catalog-appearance-it'),
  ar: () => import('./interface-catalogs/catalog-appearance-ar'),
};

const loaded = new Map<InterfaceLanguage, AppearanceCatalog>();
const inFlight = new Map<InterfaceLanguage, Promise<AppearanceCatalog>>();

export const isAppearanceCatalogLoaded = (language: InterfaceLanguage): boolean => loaded.has(language);

export function loadAppearanceCatalog(language: InterfaceLanguage): Promise<AppearanceCatalog> {
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

export function appearanceText(language: InterfaceLanguage, key: AppearanceCatalogKey, params?: Readonly<Record<string, string>>): string {
  const catalog = loaded.get(language);
  if (catalog === undefined) throw new Error(`Catalogue du fond « ${language} » lu avant d'être chargé (loadAppearanceCatalog).`);
  const text = catalog[key];
  return params === undefined ? text : text.replace(PLACEHOLDER, (whole, name: string) => params[name] ?? whole);
}
