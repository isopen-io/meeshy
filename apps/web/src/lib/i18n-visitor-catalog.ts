/**
 * LE CATALOGUE DE L'INVITATION DU VISITEUR (#9149) — les libellés `visitor.*`
 * de la modale posée par-dessus un contenu partagé qu'un visiteur sans compte
 * ouvre (`components/visitor-invitation.tsx`), dans les sept langues du
 * produit. Même mécanique que le catalogue des invitations : un `import()` par
 * langue, chargé SEULEMENT pour un visiteur — un lecteur connecté ne le
 * télécharge jamais, et les catalogues d'interface (budget
 * `interface_catalogs`) n'en portent rien.
 *
 * Aucun repli : une clé absente d'une langue est une erreur de compilation
 * (`satisfies VisitorCatalog`) et un témoin rouge (`i18n-visitor-catalog.test.ts`) ;
 * un catalogue lu avant d'être chargé lève.
 */
import type FrenchVisitor from './interface-catalogs/catalog-visitor-fr';
import type { InterfaceLanguage } from './interface-language';

type FrenchVisitorCatalog = typeof FrenchVisitor;

export type VisitorCatalogKey = keyof FrenchVisitorCatalog;

export type VisitorCatalog = Readonly<Record<VisitorCatalogKey, string>>;

type Placeholders<S extends string> = S extends `${string}{${infer Name}}${infer Rest}` ? Name | Placeholders<Rest> : never;

type TranslateVisitorArgs<K extends VisitorCatalogKey> = [Placeholders<FrenchVisitorCatalog[K]>] extends [never]
  ? []
  : [params: Readonly<Record<Placeholders<FrenchVisitorCatalog[K]>, string>>];

type CatalogModule = { readonly default: VisitorCatalog };

const LOADERS: Readonly<Record<InterfaceLanguage, () => Promise<CatalogModule>>> = {
  fr: () => import('./interface-catalogs/catalog-visitor-fr'),
  en: () => import('./interface-catalogs/catalog-visitor-en'),
  es: () => import('./interface-catalogs/catalog-visitor-es'),
  pt: () => import('./interface-catalogs/catalog-visitor-pt'),
  de: () => import('./interface-catalogs/catalog-visitor-de'),
  it: () => import('./interface-catalogs/catalog-visitor-it'),
  ar: () => import('./interface-catalogs/catalog-visitor-ar'),
};

const loaded = new Map<InterfaceLanguage, VisitorCatalog>();
const inFlight = new Map<InterfaceLanguage, Promise<VisitorCatalog>>();

export function loadVisitorCatalog(language: InterfaceLanguage): Promise<VisitorCatalog> {
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

export const isVisitorCatalogLoaded = (language: InterfaceLanguage): boolean => loaded.has(language);

const PLACEHOLDER = /\{(\w+)\}/g;

export function translateVisitor<K extends VisitorCatalogKey>(language: InterfaceLanguage, key: K, ...params: TranslateVisitorArgs<K>): string;
export function translateVisitor(language: InterfaceLanguage, key: VisitorCatalogKey, params?: Readonly<Record<string, string>>): string {
  const catalog = loaded.get(language);
  if (catalog === undefined) {
    throw new Error(`Catalogue du visiteur « ${language} » lu avant d'être chargé (loadVisitorCatalog).`);
  }
  const text = catalog[key];
  if (params === undefined) return text;
  return text.replace(PLACEHOLDER, (whole, name: string) => params[name] ?? whole);
}
