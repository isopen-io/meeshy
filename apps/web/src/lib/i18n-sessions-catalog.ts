/**
 * LE CATALOGUE DES SESSIONS (#6720, #9613) — l'écran Sécurité > Sessions et
 * l'explication d'une session fermée, dans les sept langues du produit. Un
 * `import()` par langue, chargé avec l'écran ou avec l'explication, jamais au
 * démarrage : le catalogue d'interface est à son plafond (`budgets.json` ›
 * `interface_catalogs`), et seul le libellé de la rangée « Sécurité » des
 * réglages y vit (`settings.security.title`).
 *
 * Aucun repli : une clé absente d'une langue est une erreur de compilation
 * (`satisfies SessionsCatalog`) et un témoin rouge
 * (`i18n-sessions-catalog.test.ts`) ; un catalogue lu avant d'être chargé lève.
 */
import type FrenchSessions from './interface-catalogs/catalog-sessions-fr';
import type { InterfaceLanguage } from './interface-language';

type FrenchSessionsCatalog = typeof FrenchSessions;

export type SessionsCatalogKey = keyof FrenchSessionsCatalog;

export type SessionsCatalog = Readonly<Record<SessionsCatalogKey, string>>;

type Placeholders<S extends string> = S extends `${string}{${infer Name}}${infer Rest}`
  ? Name | Placeholders<Rest>
  : never;

type TranslateSessionsArgs<K extends SessionsCatalogKey> = [Placeholders<FrenchSessionsCatalog[K]>] extends [never]
  ? []
  : [params: Readonly<Record<Placeholders<FrenchSessionsCatalog[K]>, string>>];

type CatalogModule = { readonly default: SessionsCatalog };

const LOADERS: Readonly<Record<InterfaceLanguage, () => Promise<CatalogModule>>> = {
  fr: () => import('./interface-catalogs/catalog-sessions-fr'),
  en: () => import('./interface-catalogs/catalog-sessions-en'),
  es: () => import('./interface-catalogs/catalog-sessions-es'),
  pt: () => import('./interface-catalogs/catalog-sessions-pt'),
  de: () => import('./interface-catalogs/catalog-sessions-de'),
  it: () => import('./interface-catalogs/catalog-sessions-it'),
  ar: () => import('./interface-catalogs/catalog-sessions-ar'),
};

const loaded = new Map<InterfaceLanguage, SessionsCatalog>();
const inFlight = new Map<InterfaceLanguage, Promise<SessionsCatalog>>();

export const isSessionsCatalogLoaded = (language: InterfaceLanguage): boolean => loaded.has(language);

export function loadSessionsCatalog(language: InterfaceLanguage): Promise<SessionsCatalog> {
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

function render(language: InterfaceLanguage, key: SessionsCatalogKey, params?: Readonly<Record<string, string>>): string {
  const catalog = loaded.get(language);
  if (catalog === undefined) {
    throw new Error(`Catalogue des sessions « ${language} » lu avant d'être chargé (loadSessionsCatalog).`);
  }
  const text = catalog[key];
  if (params === undefined) return text;
  return text.replace(PLACEHOLDER, (whole, name: string) => params[name] ?? whole);
}

export function translateSessions<K extends SessionsCatalogKey>(
  language: InterfaceLanguage,
  key: K,
  ...params: TranslateSessionsArgs<K>
): string;
export function translateSessions(language: InterfaceLanguage, key: SessionsCatalogKey, params?: Readonly<Record<string, string>>): string {
  return render(language, key, params);
}

/** Le traducteur d'UNE langue, sans surcharge — ce que reçoivent les projections pures (`view/sessions.ts`). */
export type SessionsText = (key: SessionsCatalogKey, params?: Readonly<Record<string, string>>) => string;

export function sessionsTextOf(language: InterfaceLanguage): SessionsText {
  return (key, params) => render(language, key, params);
}
