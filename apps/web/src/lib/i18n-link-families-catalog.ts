/**
 * LE CATALOGUE DES TROIS AUTRES FAMILLES DE « MES LIENS » (#6408, #6409,
 * #6410) — les libellés `linkFamilies.*` des listes, détails et créations des
 * liens de suivi, de parrainage et de communauté, dans les sept langues. Même
 * mécanique que la feuille d'envoi : un `import()` par langue, chargé avec
 * l'écran qui le lit (`route-table.tsx`), jamais au démarrage — le catalogue
 * principal a atteint son plafond, et cette famille entière (110 clés) passe le
 * seuil où un chunk à la demande paie sa requête.
 *
 * Lu dans une langue pas encore chargée, il sert une langue DÉJÀ chargée et
 * charge la demandée ; rien de chargé du tout lève.
 */
import type FrenchLinkFamilies from './interface-catalogs/catalog-link-families-fr';
import type { InterfaceLanguage } from './interface-language';

type FrenchLinkFamiliesCatalog = typeof FrenchLinkFamilies;

export type LinkFamiliesCatalogKey = keyof FrenchLinkFamiliesCatalog;

export type LinkFamiliesCatalog = Readonly<Record<LinkFamiliesCatalogKey, string>>;

type Placeholders<S extends string> = S extends `${string}{${infer Name}}${infer Rest}`
  ? Name | Placeholders<Rest>
  : never;

type TranslateLinkFamiliesArgs<K extends LinkFamiliesCatalogKey> = [Placeholders<FrenchLinkFamiliesCatalog[K]>] extends [never]
  ? []
  : [params: Readonly<Record<Placeholders<FrenchLinkFamiliesCatalog[K]>, string>>];

export type PlainLinkFamiliesKey = {
  [K in LinkFamiliesCatalogKey]: TranslateLinkFamiliesArgs<K> extends [] ? K : never;
}[LinkFamiliesCatalogKey];

type CatalogModule = { readonly default: LinkFamiliesCatalog };

const LOADERS: Readonly<Record<InterfaceLanguage, () => Promise<CatalogModule>>> = {
  fr: () => import('./interface-catalogs/catalog-link-families-fr'),
  en: () => import('./interface-catalogs/catalog-link-families-en'),
  es: () => import('./interface-catalogs/catalog-link-families-es'),
  pt: () => import('./interface-catalogs/catalog-link-families-pt'),
  de: () => import('./interface-catalogs/catalog-link-families-de'),
  it: () => import('./interface-catalogs/catalog-link-families-it'),
  ar: () => import('./interface-catalogs/catalog-link-families-ar'),
};

const loaded = new Map<InterfaceLanguage, LinkFamiliesCatalog>();
const inFlight = new Map<InterfaceLanguage, Promise<LinkFamiliesCatalog>>();

export function loadLinkFamiliesCatalog(language: InterfaceLanguage): Promise<LinkFamiliesCatalog> {
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

export function translateLinkFamilies<K extends LinkFamiliesCatalogKey>(
  language: InterfaceLanguage,
  key: K,
  ...params: TranslateLinkFamiliesArgs<K>
): string;
export function translateLinkFamilies(
  language: InterfaceLanguage,
  key: LinkFamiliesCatalogKey,
  params?: Readonly<Record<string, string>>,
): string {
  const catalog = loaded.get(language) ?? loaded.values().next().value;
  if (catalog === undefined) {
    throw new Error(`Catalogue des familles de liens « ${language} » lu avant d'être chargé (loadLinkFamiliesCatalog).`);
  }
  if (!loaded.has(language)) void loadLinkFamiliesCatalog(language).catch(() => undefined);
  const text = catalog[key];
  if (params === undefined) return text;
  return text.replace(PLACEHOLDER, (whole, name: string) => params[name] ?? whole);
}
