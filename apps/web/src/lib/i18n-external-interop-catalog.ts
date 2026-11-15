/**
 * LE CATALOGUE DE LA CONFORMITÉ DE L'INTEROPÉRABILITÉ (#17120, chantier #17007) — les libellés
 * `externalInterop.*` de l'écran d'information sur ce qui part chez Meta (`components/external-interop-notice.tsx`)
 * et de la feuille de signalement d'un contenu WhatsApp (`components/external-content-report-sheet.tsx`), dans les
 * sept langues du produit. Un `import()` par langue, chargé par ces écrans et SEULEMENT là où l'entrée
 * WhatsApp existe (staging, équipe) : la production ne le télécharge jamais, et le catalogue d'interface, à son
 * plafond (`budgets.json` › `interface_catalogs`), n'en porte rien.
 *
 * Aucun repli : une clé absente d'une langue est une erreur de compilation (`satisfies ExternalInteropCatalog`)
 * et un témoin rouge (`i18n-external-interop-catalog.test.ts`) ; un catalogue lu avant d'être chargé lève.
 */
import type FrenchExternalInterop from './interface-catalogs/catalog-external-interop-fr';
import type { InterfaceLanguage } from './interface-language';

type FrenchExternalInteropCatalog = typeof FrenchExternalInterop;

export type ExternalInteropCatalogKey = keyof FrenchExternalInteropCatalog;

export type ExternalInteropCatalog = Readonly<Record<ExternalInteropCatalogKey, string>>;

type Placeholders<S extends string> = S extends `${string}{${infer Name}}${infer Rest}` ? Name | Placeholders<Rest> : never;

type TranslateExternalInteropArgs<K extends ExternalInteropCatalogKey> = [Placeholders<FrenchExternalInteropCatalog[K]>] extends [never]
  ? []
  : [params: Readonly<Record<Placeholders<FrenchExternalInteropCatalog[K]>, string>>];

type CatalogModule = { readonly default: ExternalInteropCatalog };

const LOADERS: Readonly<Record<InterfaceLanguage, () => Promise<CatalogModule>>> = {
  fr: () => import('./interface-catalogs/catalog-external-interop-fr'),
  en: () => import('./interface-catalogs/catalog-external-interop-en'),
  es: () => import('./interface-catalogs/catalog-external-interop-es'),
  pt: () => import('./interface-catalogs/catalog-external-interop-pt'),
  de: () => import('./interface-catalogs/catalog-external-interop-de'),
  it: () => import('./interface-catalogs/catalog-external-interop-it'),
  ar: () => import('./interface-catalogs/catalog-external-interop-ar'),
};

const loaded = new Map<InterfaceLanguage, ExternalInteropCatalog>();
const inFlight = new Map<InterfaceLanguage, Promise<ExternalInteropCatalog>>();

export function loadExternalInteropCatalog(language: InterfaceLanguage): Promise<ExternalInteropCatalog> {
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

export const isExternalInteropCatalogLoaded = (language: InterfaceLanguage): boolean => loaded.has(language);

const PLACEHOLDER = /\{(\w+)\}/g;

export function translateExternalInterop<K extends ExternalInteropCatalogKey>(language: InterfaceLanguage, key: K, ...params: TranslateExternalInteropArgs<K>): string;
export function translateExternalInterop(language: InterfaceLanguage, key: ExternalInteropCatalogKey, params?: Readonly<Record<string, string>>): string {
  const catalog = loaded.get(language);
  if (catalog === undefined) {
    throw new Error(`Catalogue de l’interopérabilité WhatsApp « ${language} » lu avant d'être chargé (loadExternalInteropCatalog).`);
  }
  const text = catalog[key];
  if (params === undefined) return text;
  return text.replace(PLACEHOLDER, (whole, name: string) => params[name] ?? whole);
}
