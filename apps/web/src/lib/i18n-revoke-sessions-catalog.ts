/**
 * LE CATALOGUE DU LIEN « CE N'ÉTAIT PAS MOI » — les libellés `revokeSessions.*` de `/auth/revoke-sessions`
 * (`routes/revoke-sessions.tsx`). Un `import()` par langue, chargé AVEC cette route (`routes/route-table.tsx`) et jamais
 * au démarrage : le catalogue d'interface est à son plafond (`budgets.json` › `interface_catalogs`).
 *
 * Aucun repli : une clé absente d'une langue est une erreur de compilation (`satisfies RevokeSessionsCatalog`) et un
 * témoin rouge (`i18n-revoke-sessions-catalog.test.ts`) ; un catalogue lu avant d'être chargé lève.
 */
import type FrenchRevokeSessions from './interface-catalogs/catalog-revoke-sessions-fr';
import type { InterfaceLanguage } from './interface-language';

type FrenchRevokeSessionsCatalog = typeof FrenchRevokeSessions;

export type RevokeSessionsCatalogKey = keyof FrenchRevokeSessionsCatalog;

export type RevokeSessionsCatalog = Readonly<Record<RevokeSessionsCatalogKey, string>>;

type Placeholders<S extends string> = S extends `${string}{${infer Name}}${infer Rest}` ? Name | Placeholders<Rest> : never;

type TranslateRevokeSessionsArgs<K extends RevokeSessionsCatalogKey> = [Placeholders<FrenchRevokeSessionsCatalog[K]>] extends [never]
  ? []
  : [params: Readonly<Record<Placeholders<FrenchRevokeSessionsCatalog[K]>, string>>];

type CatalogModule = { readonly default: RevokeSessionsCatalog };

const LOADERS: Readonly<Record<InterfaceLanguage, () => Promise<CatalogModule>>> = {
  fr: () => import('./interface-catalogs/catalog-revoke-sessions-fr'),
  en: () => import('./interface-catalogs/catalog-revoke-sessions-en'),
  es: () => import('./interface-catalogs/catalog-revoke-sessions-es'),
  pt: () => import('./interface-catalogs/catalog-revoke-sessions-pt'),
  de: () => import('./interface-catalogs/catalog-revoke-sessions-de'),
  it: () => import('./interface-catalogs/catalog-revoke-sessions-it'),
  ar: () => import('./interface-catalogs/catalog-revoke-sessions-ar'),
};

const loaded = new Map<InterfaceLanguage, RevokeSessionsCatalog>();
const inFlight = new Map<InterfaceLanguage, Promise<RevokeSessionsCatalog>>();

export function loadRevokeSessionsCatalog(language: InterfaceLanguage): Promise<RevokeSessionsCatalog> {
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

export const isRevokeSessionsCatalogLoaded = (language: InterfaceLanguage): boolean => loaded.has(language);

const PLACEHOLDER = /\{(\w+)\}/g;

export function translateRevokeSessions<K extends RevokeSessionsCatalogKey>(language: InterfaceLanguage, key: K, ...params: TranslateRevokeSessionsArgs<K>): string;
export function translateRevokeSessions(language: InterfaceLanguage, key: RevokeSessionsCatalogKey, params?: Readonly<Record<string, string>>): string {
  const catalog = loaded.get(language);
  if (catalog === undefined) {
    throw new Error(`Catalogue de le lien « ce n'était pas moi » « ${language} » lu avant d'être chargé (loadRevokeSessionsCatalog).`);
  }
  const text = catalog[key];
  if (params === undefined) return text;
  return text.replace(PLACEHOLDER, (whole, name: string) => params[name] ?? whole);
}
