/**
 * LE CATALOGUE DU COMPOSER D'EXPORT EN IMAGE (#8667) — les libellés
 * `export.card.*` et `export.announce.*` de la feuille d'export, dans les sept
 * langues du produit. Même mécanique que le catalogue de l'enregistrement
 * d'appel : un `import()` par langue, chargé avec la feuille
 * (`routes/thread-sheets.tsx`) au premier « Exporter en image », jamais au
 * démarrage. Le catalogue d'interface a atteint son plafond (`budgets.json` ›
 * `interface_catalogs`) : il ne porte que les deux entrées du menu du message,
 * visibles avant que le composer ne soit chargé.
 *
 * Aucun repli : une clé absente d'une langue est une erreur de compilation
 * (`satisfies ExportCardCatalog`) et un témoin rouge
 * (`i18n-export-card-catalog.test.ts`) ; un catalogue lu avant d'être chargé lève.
 */
import type FrenchExportCard from './interface-catalogs/catalog-export-card-fr';
import type { InterfaceLanguage } from './interface-language';

type FrenchExportCardCatalog = typeof FrenchExportCard;

export type ExportCardCatalogKey = keyof FrenchExportCardCatalog;

export type ExportCardCatalog = Readonly<Record<ExportCardCatalogKey, string>>;

type Placeholders<S extends string> = S extends `${string}{${infer Name}}${infer Rest}`
  ? Name | Placeholders<Rest>
  : never;

type TranslateExportCardArgs<K extends ExportCardCatalogKey> = [Placeholders<FrenchExportCardCatalog[K]>] extends [never]
  ? []
  : [params: Readonly<Record<Placeholders<FrenchExportCardCatalog[K]>, string>>];

type CatalogModule = { readonly default: ExportCardCatalog };

const LOADERS: Readonly<Record<InterfaceLanguage, () => Promise<CatalogModule>>> = {
  fr: () => import('./interface-catalogs/catalog-export-card-fr'),
  en: () => import('./interface-catalogs/catalog-export-card-en'),
  es: () => import('./interface-catalogs/catalog-export-card-es'),
  pt: () => import('./interface-catalogs/catalog-export-card-pt'),
  de: () => import('./interface-catalogs/catalog-export-card-de'),
  it: () => import('./interface-catalogs/catalog-export-card-it'),
  ar: () => import('./interface-catalogs/catalog-export-card-ar'),
};

const loaded = new Map<InterfaceLanguage, ExportCardCatalog>();
const inFlight = new Map<InterfaceLanguage, Promise<ExportCardCatalog>>();

export const isExportCardCatalogLoaded = (language: InterfaceLanguage): boolean => loaded.has(language);

export function loadExportCardCatalog(language: InterfaceLanguage): Promise<ExportCardCatalog> {
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

export function translateExportCard<K extends ExportCardCatalogKey>(
  language: InterfaceLanguage,
  key: K,
  ...params: TranslateExportCardArgs<K>
): string;
export function translateExportCard(
  language: InterfaceLanguage,
  key: ExportCardCatalogKey,
  params?: Readonly<Record<string, string>>,
): string {
  const catalog = loaded.get(language);
  if (catalog === undefined) {
    throw new Error(`Catalogue du composer d'export « ${language} » lu avant d'être chargé (loadExportCardCatalog).`);
  }
  const text = catalog[key];
  if (params === undefined) return text;
  return text.replace(PLACEHOLDER, (whole, name: string) => params[name] ?? whole);
}
