/**
 * LE CATALOGUE DE LA FEUILLE « VUES » ENRICHIE (#9727) — les libellés
 * `viewerEngagement.*` (ce que chaque personne a fait sur une story, un post
 * ou un réel) dans les sept langues du produit. Même mécanique que le
 * catalogue du composer d'export : un `import()` par langue, chargé AVEC la
 * feuille (`publication-viewers-sheet-lazy.tsx`), jamais au démarrage — le
 * catalogue d'interface a atteint son plafond (`budgets.json` ›
 * `interface_catalogs`).
 *
 * Aucun repli : une clé absente d'une langue est une erreur de compilation
 * (`satisfies ViewerEngagementCatalog`) et un témoin rouge
 * (`i18n-viewer-engagement-catalog.test.ts`) ; un catalogue lu avant d'être
 * chargé lève.
 */
import type FrenchViewerEngagement from './interface-catalogs/catalog-viewer-engagement-fr';
import type { InterfaceLanguage } from './interface-language';

type FrenchViewerEngagementCatalog = typeof FrenchViewerEngagement;

export type ViewerEngagementCatalogKey = keyof FrenchViewerEngagementCatalog;

export type ViewerEngagementCatalog = Readonly<Record<ViewerEngagementCatalogKey, string>>;

type Placeholders<S extends string> = S extends `${string}{${infer Name}}${infer Rest}`
  ? Name | Placeholders<Rest>
  : never;

/** Les clés sans paramètre — celles qu'on traduit d'un seul argument. */
export type PlainViewerEngagementKey = { [K in ViewerEngagementCatalogKey]: [Placeholders<FrenchViewerEngagementCatalog[K]>] extends [never] ? K : never }[ViewerEngagementCatalogKey];

type TranslateViewerEngagementArgs<K extends ViewerEngagementCatalogKey> = [Placeholders<FrenchViewerEngagementCatalog[K]>] extends [never]
  ? []
  : [params: Readonly<Record<Placeholders<FrenchViewerEngagementCatalog[K]>, string>>];

type CatalogModule = { readonly default: ViewerEngagementCatalog };

const LOADERS: Readonly<Record<InterfaceLanguage, () => Promise<CatalogModule>>> = {
  fr: () => import('./interface-catalogs/catalog-viewer-engagement-fr'),
  en: () => import('./interface-catalogs/catalog-viewer-engagement-en'),
  es: () => import('./interface-catalogs/catalog-viewer-engagement-es'),
  pt: () => import('./interface-catalogs/catalog-viewer-engagement-pt'),
  de: () => import('./interface-catalogs/catalog-viewer-engagement-de'),
  it: () => import('./interface-catalogs/catalog-viewer-engagement-it'),
  ar: () => import('./interface-catalogs/catalog-viewer-engagement-ar'),
};

const loaded = new Map<InterfaceLanguage, ViewerEngagementCatalog>();
const inFlight = new Map<InterfaceLanguage, Promise<ViewerEngagementCatalog>>();

export const isViewerEngagementCatalogLoaded = (language: InterfaceLanguage): boolean => loaded.has(language);

export function loadViewerEngagementCatalog(language: InterfaceLanguage): Promise<ViewerEngagementCatalog> {
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

export function translateViewerEngagement<K extends ViewerEngagementCatalogKey>(
  language: InterfaceLanguage,
  key: K,
  ...params: TranslateViewerEngagementArgs<K>
): string;
export function translateViewerEngagement(
  language: InterfaceLanguage,
  key: ViewerEngagementCatalogKey,
  params?: Readonly<Record<string, string>>,
): string {
  const catalog = loaded.get(language);
  if (catalog === undefined) {
    throw new Error(`Catalogue de la feuille « Vues » « ${language} » lu avant d'être chargé (loadViewerEngagementCatalog).`);
  }
  const text = catalog[key];
  if (params === undefined) return text;
  return text.replace(PLACEHOLDER, (whole, name: string) => params[name] ?? whole);
}
