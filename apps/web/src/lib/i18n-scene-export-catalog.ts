/**
 * LE CATALOGUE DE L'EXPORT DES PUBLICATIONS À SCÈNE (#13873) — « Sauvegarder »
 * et « Imager » du menu d'une publication, le choix de longueur (1/4 · 2/4 ·
 * 3/4 · 4/4) et le bandeau des exports en cours, dans les sept langues du
 * produit. Un `import()` par langue, chargé avec le panneau du menu et avec le
 * bandeau, jamais au démarrage : le catalogue d'interface est à son plafond
 * (`budgets.json` › `interface_catalogs`).
 *
 * Aucun repli : une clé absente d'une langue est une erreur de compilation
 * (`satisfies SceneExportCatalog`) et un témoin rouge
 * (`i18n-scene-export-catalog.test.ts`) ; un catalogue lu avant d'être chargé lève.
 */
import type FrenchSceneExport from './interface-catalogs/catalog-scene-export-fr';
import type { InterfaceLanguage } from './interface-language';

type FrenchSceneExportCatalog = typeof FrenchSceneExport;

export type SceneExportCatalogKey = keyof FrenchSceneExportCatalog;

export type SceneExportCatalog = Readonly<Record<SceneExportCatalogKey, string>>;

type Placeholders<S extends string> = S extends `${string}{${infer Name}}${infer Rest}`
  ? Name | Placeholders<Rest>
  : never;

/** Les clés sans paramètre — celles qu'on traduit d'un seul argument. */
export type PlainSceneExportKey = { [K in SceneExportCatalogKey]: [Placeholders<FrenchSceneExportCatalog[K]>] extends [never] ? K : never }[SceneExportCatalogKey];

type TranslateSceneExportArgs<K extends SceneExportCatalogKey> = [Placeholders<FrenchSceneExportCatalog[K]>] extends [never]
  ? []
  : [params: Readonly<Record<Placeholders<FrenchSceneExportCatalog[K]>, string>>];

type CatalogModule = { readonly default: SceneExportCatalog };

const LOADERS: Readonly<Record<InterfaceLanguage, () => Promise<CatalogModule>>> = {
  fr: () => import('./interface-catalogs/catalog-scene-export-fr'),
  en: () => import('./interface-catalogs/catalog-scene-export-en'),
  es: () => import('./interface-catalogs/catalog-scene-export-es'),
  pt: () => import('./interface-catalogs/catalog-scene-export-pt'),
  de: () => import('./interface-catalogs/catalog-scene-export-de'),
  it: () => import('./interface-catalogs/catalog-scene-export-it'),
  ar: () => import('./interface-catalogs/catalog-scene-export-ar'),
};

const loaded = new Map<InterfaceLanguage, SceneExportCatalog>();
const inFlight = new Map<InterfaceLanguage, Promise<SceneExportCatalog>>();

export const isSceneExportCatalogLoaded = (language: InterfaceLanguage): boolean => loaded.has(language);

export function loadSceneExportCatalog(language: InterfaceLanguage): Promise<SceneExportCatalog> {
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

export function translateSceneExport<K extends SceneExportCatalogKey>(
  language: InterfaceLanguage,
  key: K,
  ...params: TranslateSceneExportArgs<K>
): string;
export function translateSceneExport(
  language: InterfaceLanguage,
  key: SceneExportCatalogKey,
  params?: Readonly<Record<string, string>>,
): string {
  const catalog = loaded.get(language);
  if (catalog === undefined) {
    throw new Error(`Catalogue de l'export des publications « ${language} » lu avant d'être chargé (loadSceneExportCatalog).`);
  }
  const text = catalog[key];
  if (params === undefined) return text;
  return text.replace(PLACEHOLDER, (whole, name: string) => params[name] ?? whole);
}
