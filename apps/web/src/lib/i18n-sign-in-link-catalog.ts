/**
 * LE CATALOGUE DE LA CONFIRMATION D'UN LIEN DE CONNEXION (8da83d255f) — les libellés `signInLink.confirm.*` de
 * « Se connecter en tant que @x ? » (`components/link-sign-in-confirmation.tsx`), montrée par le lien magique et la
 * vérification d'adresse. Un `import()` par langue, chargé AVEC ces routes (`routes/route-table.tsx`) et jamais au
 * démarrage : le catalogue d'interface est à son plafond (`budgets.json` › `interface_catalogs`, 211,48 Ko pour 211
 * avec ces cinq clés au cœur). Elle porte aussi les `verifyEmail.*` propres à `/auth/verify-email` (`components/verify-email-flow.tsx`, `arrival-celebration.tsx`). Ce que l'écran partage avec la bascule de compte (`signInLink.switchAccount.*`) reste
 * au catalogue d'interface.
 *
 * Aucun repli : une clé absente d'une langue est une erreur de compilation (`satisfies SignInLinkCatalog`) et un
 * témoin rouge (`i18n-sign-in-link-catalog.test.ts`) ; un catalogue lu avant d'être chargé lève.
 */
import type FrenchSignInLink from './interface-catalogs/catalog-sign-in-link-fr';
import type { InterfaceLanguage } from './interface-language';

type FrenchSignInLinkCatalog = typeof FrenchSignInLink;

export type SignInLinkCatalogKey = keyof FrenchSignInLinkCatalog;

export type SignInLinkCatalog = Readonly<Record<SignInLinkCatalogKey, string>>;

type Placeholders<S extends string> = S extends `${string}{${infer Name}}${infer Rest}` ? Name | Placeholders<Rest> : never;

type TranslateSignInLinkArgs<K extends SignInLinkCatalogKey> = [Placeholders<FrenchSignInLinkCatalog[K]>] extends [never]
  ? []
  : [params: Readonly<Record<Placeholders<FrenchSignInLinkCatalog[K]>, string>>];

type CatalogModule = { readonly default: SignInLinkCatalog };

const LOADERS: Readonly<Record<InterfaceLanguage, () => Promise<CatalogModule>>> = {
  fr: () => import('./interface-catalogs/catalog-sign-in-link-fr'),
  en: () => import('./interface-catalogs/catalog-sign-in-link-en'),
  es: () => import('./interface-catalogs/catalog-sign-in-link-es'),
  pt: () => import('./interface-catalogs/catalog-sign-in-link-pt'),
  de: () => import('./interface-catalogs/catalog-sign-in-link-de'),
  it: () => import('./interface-catalogs/catalog-sign-in-link-it'),
  ar: () => import('./interface-catalogs/catalog-sign-in-link-ar'),
};

const loaded = new Map<InterfaceLanguage, SignInLinkCatalog>();
const inFlight = new Map<InterfaceLanguage, Promise<SignInLinkCatalog>>();

export function loadSignInLinkCatalog(language: InterfaceLanguage): Promise<SignInLinkCatalog> {
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

export const isSignInLinkCatalogLoaded = (language: InterfaceLanguage): boolean => loaded.has(language);

const PLACEHOLDER = /\{(\w+)\}/g;

export function translateSignInLink<K extends SignInLinkCatalogKey>(language: InterfaceLanguage, key: K, ...params: TranslateSignInLinkArgs<K>): string;
export function translateSignInLink(language: InterfaceLanguage, key: SignInLinkCatalogKey, params?: Readonly<Record<string, string>>): string {
  const catalog = loaded.get(language);
  if (catalog === undefined) {
    throw new Error(`Catalogue de la confirmation d'un lien de connexion « ${language} » lu avant d'être chargé (loadSignInLinkCatalog).`);
  }
  const text = catalog[key];
  if (params === undefined) return text;
  return text.replace(PLACEHOLDER, (whole, name: string) => params[name] ?? whole);
}
