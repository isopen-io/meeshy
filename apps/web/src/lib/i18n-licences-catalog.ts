/**
 * LE CATALOGUE DE L'ÉCRAN LICENCES (#14628) — les libellés `licences.*` de la
 * ligne de Réglages › À propos et du volet `?volet=licences`, dans les sept
 * langues du produit. Même mécanique que `i18n-circle-notify-catalog.ts` : un
 * `import()` par langue, jamais au démarrage — le catalogue d'interface est à
 * son plafond (`budgets.json` › `interface_catalogs`).
 *
 * Aucun repli : une clé absente d'une langue est une erreur de compilation
 * (`satisfies LicencesCatalog`) et un témoin rouge ; un catalogue lu avant
 * d'être chargé lève.
 */
import type FrenchLicences from './interface-catalogs/catalog-licences-fr';
import type { InterfaceLanguage } from './interface-language';

export type LicencesCatalogKey = keyof typeof FrenchLicences;

export type LicencesCatalog = Readonly<Record<LicencesCatalogKey, string>>;

type CatalogModule = { readonly default: LicencesCatalog };

const LOADERS: Readonly<Record<InterfaceLanguage, () => Promise<CatalogModule>>> = {
  fr: () => import('./interface-catalogs/catalog-licences-fr'),
  en: () => import('./interface-catalogs/catalog-licences-en'),
  es: () => import('./interface-catalogs/catalog-licences-es'),
  pt: () => import('./interface-catalogs/catalog-licences-pt'),
  de: () => import('./interface-catalogs/catalog-licences-de'),
  it: () => import('./interface-catalogs/catalog-licences-it'),
  ar: () => import('./interface-catalogs/catalog-licences-ar'),
};

const loaded = new Map<InterfaceLanguage, LicencesCatalog>();
const inFlight = new Map<InterfaceLanguage, Promise<LicencesCatalog>>();

export const isLicencesCatalogLoaded = (language: InterfaceLanguage): boolean => loaded.has(language);

export function loadLicencesCatalog(language: InterfaceLanguage): Promise<LicencesCatalog> {
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

export function translateLicences(language: InterfaceLanguage, key: LicencesCatalogKey): string {
  const catalog = loaded.get(language);
  if (catalog === undefined) {
    throw new Error(`Catalogue « Licences » « ${language} » lu avant d'être chargé (loadLicencesCatalog).`);
  }
  return catalog[key];
}
