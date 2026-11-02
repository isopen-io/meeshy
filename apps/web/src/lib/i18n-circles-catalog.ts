/**
 * LE CATALOGUE DE « MES CERCLES » (#13938) — les libellés `circles.*` de
 * l'onglet « Cercles » de Découvrir, de la fiche d'un lien et du rituel du
 * Sang, dans les sept langues du produit. Même mécanique que
 * `i18n-circle-notify-catalog.ts` : un `import()` par langue, chargé par
 * l'onglet (`routes/discover-circles.tsx`), jamais au démarrage — le catalogue
 * d'interface est à son plafond (`budgets.json` › `interface_catalogs`).
 *
 * Les noms des CERCLES ne sont pas ici : ils viennent de `@meeshy/shared`
 * (`RELATION_LEVEL_LABELS`), la table que la passerelle sert aussi
 * (`GET /relations/config`).
 *
 * Aucun repli : une clé absente d'une langue est une erreur de compilation
 * (`satisfies CirclesCatalog`) et un témoin rouge ; un catalogue lu avant
 * d'être chargé lève. Les paramètres se NOMMENT (`{name}`) et leur liste est
 * typée depuis la valeur française, comme `translate`.
 */
import type FrenchCircles from './interface-catalogs/catalog-circles-fr';
import type { InterfaceLanguage } from './interface-language';

type FrenchCirclesCatalog = typeof FrenchCircles;

export type CirclesCatalogKey = keyof FrenchCirclesCatalog;

export type CirclesCatalog = Readonly<Record<CirclesCatalogKey, string>>;

type Placeholders<S extends string> = S extends `${string}{${infer Name}}${infer Rest}` ? Name | Placeholders<Rest> : never;

type TranslateArgs<K extends CirclesCatalogKey> = [Placeholders<FrenchCirclesCatalog[K]>] extends [never]
  ? []
  : [params: Readonly<Record<Placeholders<FrenchCirclesCatalog[K]>, string>>];

type CatalogModule = { readonly default: CirclesCatalog };

const LOADERS: Readonly<Record<InterfaceLanguage, () => Promise<CatalogModule>>> = {
  fr: () => import('./interface-catalogs/catalog-circles-fr'),
  en: () => import('./interface-catalogs/catalog-circles-en'),
  es: () => import('./interface-catalogs/catalog-circles-es'),
  pt: () => import('./interface-catalogs/catalog-circles-pt'),
  de: () => import('./interface-catalogs/catalog-circles-de'),
  it: () => import('./interface-catalogs/catalog-circles-it'),
  ar: () => import('./interface-catalogs/catalog-circles-ar'),
};

const PLACEHOLDER = /\{(\w+)\}/g;

const loaded = new Map<InterfaceLanguage, CirclesCatalog>();
const inFlight = new Map<InterfaceLanguage, Promise<CirclesCatalog>>();

export const isCirclesCatalogLoaded = (language: InterfaceLanguage): boolean => loaded.has(language);

export function loadCirclesCatalog(language: InterfaceLanguage): Promise<CirclesCatalog> {
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

export function translateCircles<K extends CirclesCatalogKey>(language: InterfaceLanguage, key: K, ...params: TranslateArgs<K>): string;
export function translateCircles(language: InterfaceLanguage, key: CirclesCatalogKey, params?: Readonly<Record<string, string>>): string {
  const catalog = loaded.get(language);
  if (catalog === undefined) {
    throw new Error(`Catalogue « Mes cercles » « ${language} » lu avant d'être chargé (loadCirclesCatalog).`);
  }
  const text = catalog[key];
  if (params === undefined) return text;
  return text.replace(PLACEHOLDER, (whole, name: string) => params[name] ?? whole);
}
