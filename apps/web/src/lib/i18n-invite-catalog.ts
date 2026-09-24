/**
 * LE CATALOGUE DES INVITATIONS (#7796, #7797) — les libellés `invite.*` de la
 * page d'accueil d'un lien (`/chat/:link`) et `linkDetail.*` de la page du
 * créateur (`/links/share/:link`), dans les sept langues du produit. Même
 * mécanique que les catalogues d'administration et d'accueil : un `import()`
 * par langue, chargé à l'entrée de ces deux écrans seulement
 * (`routes/route-table.tsx`), jamais au démarrage. `catalog-fr.ts` a déjà
 * passé le budget de taille : on n'y ajoute rien.
 *
 * Aucun repli : une clé absente d'une langue est une erreur de compilation
 * (`satisfies InviteCatalog`) et un témoin rouge
 * (`i18n-invite-catalog.test.ts`) ; un catalogue lu avant d'être chargé lève.
 */
import type FrenchInvite from './interface-catalogs/catalog-invite-fr';
import type { InterfaceLanguage } from './interface-language';

type FrenchInviteCatalog = typeof FrenchInvite;

export type InviteCatalogKey = keyof FrenchInviteCatalog;

export type InviteCatalog = Readonly<Record<InviteCatalogKey, string>>;

type Placeholders<S extends string> = S extends `${string}{${infer Name}}${infer Rest}`
  ? Name | Placeholders<Rest>
  : never;

type TranslateInviteArgs<K extends InviteCatalogKey> = [Placeholders<FrenchInviteCatalog[K]>] extends [never]
  ? []
  : [params: Readonly<Record<Placeholders<FrenchInviteCatalog[K]>, string>>];

type CatalogModule = { readonly default: InviteCatalog };

const LOADERS: Readonly<Record<InterfaceLanguage, () => Promise<CatalogModule>>> = {
  fr: () => import('./interface-catalogs/catalog-invite-fr'),
  en: () => import('./interface-catalogs/catalog-invite-en'),
  es: () => import('./interface-catalogs/catalog-invite-es'),
  pt: () => import('./interface-catalogs/catalog-invite-pt'),
  de: () => import('./interface-catalogs/catalog-invite-de'),
  it: () => import('./interface-catalogs/catalog-invite-it'),
  ar: () => import('./interface-catalogs/catalog-invite-ar'),
};

const loaded = new Map<InterfaceLanguage, InviteCatalog>();
const inFlight = new Map<InterfaceLanguage, Promise<InviteCatalog>>();

export function loadInviteCatalog(language: InterfaceLanguage): Promise<InviteCatalog> {
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

export function translateInvite<K extends InviteCatalogKey>(
  language: InterfaceLanguage,
  key: K,
  ...params: TranslateInviteArgs<K>
): string;
export function translateInvite(
  language: InterfaceLanguage,
  key: InviteCatalogKey,
  params?: Readonly<Record<string, string>>,
): string {
  const catalog = loaded.get(language);
  if (catalog === undefined) {
    throw new Error(`Catalogue des invitations « ${language} » lu avant d'être chargé (loadInviteCatalog).`);
  }
  const text = catalog[key];
  if (params === undefined) return text;
  return text.replace(PLACEHOLDER, (whole, name: string) => params[name] ?? whole);
}
