/**
 * LE CATALOGUE DE L'ADHÉSION À UNE COMMUNAUTÉ (#6378) — les libellés
 * `community.membership.*` de « Rejoindre » / « Quitter la communauté »
 * (`routes/community-membership.tsx`), et les `community.posts.*` des onglets
 * et de l'onglet « Publications » (#6379 — dans ce catalogue plutôt qu'un
 * catalogue propre : un fichier de chunk de plus allonge la carte des
 * préchargements de l'index, donc le premier affichage), dans les sept langues, repris d'iOS
 * (`CommunityDetailScreen.swift`). Un `import()` par langue, chargé AVEC le
 * détail d'une communauté (`routes/route-table.tsx`), jamais au démarrage : le
 * catalogue d'interface est à son plafond (`budgets.json` ›
 * `interface_catalogs`).
 *
 * Aucun repli : une clé absente d'une langue est une erreur de compilation
 * (`satisfies CommunityMembershipCatalog`) ; un catalogue lu avant d'être
 * chargé lève.
 */
import type FrenchMembership from './interface-catalogs/catalog-community-membership-fr';
import type { InterfaceLanguage } from './interface-language';

type FrenchMembershipCatalog = typeof FrenchMembership;

export type CommunityMembershipCatalogKey = keyof FrenchMembershipCatalog;

export type CommunityMembershipCatalog = Readonly<Record<CommunityMembershipCatalogKey, string>>;

type Placeholders<S extends string> = S extends `${string}{${infer Name}}${infer Rest}` ? Name | Placeholders<Rest> : never;

type TranslateMembershipArgs<K extends CommunityMembershipCatalogKey> = [Placeholders<FrenchMembershipCatalog[K]>] extends [never]
  ? []
  : [params: Readonly<Record<Placeholders<FrenchMembershipCatalog[K]>, string>>];

type CatalogModule = { readonly default: CommunityMembershipCatalog };

const LOADERS: Readonly<Record<InterfaceLanguage, () => Promise<CatalogModule>>> = {
  fr: () => import('./interface-catalogs/catalog-community-membership-fr'),
  en: () => import('./interface-catalogs/catalog-community-membership-en'),
  es: () => import('./interface-catalogs/catalog-community-membership-es'),
  pt: () => import('./interface-catalogs/catalog-community-membership-pt'),
  de: () => import('./interface-catalogs/catalog-community-membership-de'),
  it: () => import('./interface-catalogs/catalog-community-membership-it'),
  ar: () => import('./interface-catalogs/catalog-community-membership-ar'),
};

const loaded = new Map<InterfaceLanguage, CommunityMembershipCatalog>();
const inFlight = new Map<InterfaceLanguage, Promise<CommunityMembershipCatalog>>();

export function loadCommunityMembershipCatalog(language: InterfaceLanguage): Promise<CommunityMembershipCatalog> {
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

export const isCommunityMembershipCatalogLoaded = (language: InterfaceLanguage): boolean => loaded.has(language);

const PLACEHOLDER = /\{(\w+)\}/g;

export function translateMembership<K extends CommunityMembershipCatalogKey>(language: InterfaceLanguage, key: K, ...params: TranslateMembershipArgs<K>): string;
export function translateMembership(language: InterfaceLanguage, key: CommunityMembershipCatalogKey, params?: Readonly<Record<string, string>>): string {
  const catalog = loaded.get(language);
  if (catalog === undefined) {
    throw new Error(`Catalogue de l'adhésion à une communauté « ${language} » lu avant d'être chargé (loadCommunityMembershipCatalog).`);
  }
  const text = catalog[key];
  if (params === undefined) return text;
  return text.replace(PLACEHOLDER, (whole, name: string) => params[name] ?? whole);
}
