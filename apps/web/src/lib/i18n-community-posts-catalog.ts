/**
 * LE CATALOGUE DES PUBLICATIONS D'UNE COMMUNAUTÉ (#6379) — les libellés
 * `community.posts.*` des onglets du détail et de l'onglet Publications
 * (`routes/community-tabs.tsx`, `routes/community-posts.tsx`), dans les sept
 * langues. Un `import()` par langue, chargé AVEC le détail
 * (`routes/route-table.tsx`), jamais au démarrage : le catalogue d'interface
 * est à son plafond, et celui de l'adhésion aussi (`budgets.json`).
 *
 * Aucun repli : une clé absente d'une langue est une erreur de compilation
 * (`satisfies CommunityPostsCatalog`) ; un catalogue lu avant d'être
 * chargé lève.
 */
import type FrenchPosts from './interface-catalogs/catalog-community-posts-fr';
import type { InterfaceLanguage } from './interface-language';

type FrenchPostsCatalog = typeof FrenchPosts;

export type CommunityPostsCatalogKey = keyof FrenchPostsCatalog;

export type CommunityPostsCatalog = Readonly<Record<CommunityPostsCatalogKey, string>>;

type Placeholders<S extends string> = S extends `${string}{${infer Name}}${infer Rest}` ? Name | Placeholders<Rest> : never;

type TranslatePostsArgs<K extends CommunityPostsCatalogKey> = [Placeholders<FrenchPostsCatalog[K]>] extends [never]
  ? []
  : [params: Readonly<Record<Placeholders<FrenchPostsCatalog[K]>, string>>];

type CatalogModule = { readonly default: CommunityPostsCatalog };

const LOADERS: Readonly<Record<InterfaceLanguage, () => Promise<CatalogModule>>> = {
  fr: () => import('./interface-catalogs/catalog-community-posts-fr'),
  en: () => import('./interface-catalogs/catalog-community-posts-en'),
  es: () => import('./interface-catalogs/catalog-community-posts-es'),
  pt: () => import('./interface-catalogs/catalog-community-posts-pt'),
  de: () => import('./interface-catalogs/catalog-community-posts-de'),
  it: () => import('./interface-catalogs/catalog-community-posts-it'),
  ar: () => import('./interface-catalogs/catalog-community-posts-ar'),
};

const loaded = new Map<InterfaceLanguage, CommunityPostsCatalog>();
const inFlight = new Map<InterfaceLanguage, Promise<CommunityPostsCatalog>>();

export function loadCommunityPostsCatalog(language: InterfaceLanguage): Promise<CommunityPostsCatalog> {
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

export const isCommunityPostsCatalogLoaded = (language: InterfaceLanguage): boolean => loaded.has(language);

const PLACEHOLDER = /\{(\w+)\}/g;

export function translateCommunityPosts<K extends CommunityPostsCatalogKey>(language: InterfaceLanguage, key: K, ...params: TranslatePostsArgs<K>): string;
export function translateCommunityPosts(language: InterfaceLanguage, key: CommunityPostsCatalogKey, params?: Readonly<Record<string, string>>): string {
  const catalog = loaded.get(language);
  if (catalog === undefined) {
    throw new Error(`Catalogue des publications d'une communauté « ${language} » lu avant d'être chargé (loadCommunityPostsCatalog).`);
  }
  const text = catalog[key];
  if (params === undefined) return text;
  return text.replace(PLACEHOLDER, (whole, name: string) => params[name] ?? whole);
}
