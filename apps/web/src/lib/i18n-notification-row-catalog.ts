/**
 * LE CATALOGUE DE CE QU'UNE NOTIFICATION DIT (#8727) — le pied de contexte
 * d'une ligne de la cloche, le palier nommé, les gestes d'un ami parrainé et
 * la bannière in-app, dans les sept langues du produit. Même mécanique que le
 * catalogue de l'enregistrement d'appel : un `import()` par langue, chargé
 * avec l'écran de la cloche (`routes/route-table.tsx`) et avec la bannière
 * (`components/shell.tsx`), jamais au démarrage. Le catalogue d'interface a
 * atteint son plafond (`budgets.json` › `interface_catalogs`).
 *
 * Aucun repli : une clé absente d'une langue est une erreur de compilation
 * (`satisfies NotificationRowCatalog`) et un témoin rouge
 * (`i18n-notification-row-catalog.test.ts`) ; un catalogue lu avant d'être chargé lève.
 */
import type FrenchNotificationRow from './interface-catalogs/catalog-notification-row-fr';
import type { InterfaceLanguage } from './interface-language';

type FrenchNotificationRowCatalog = typeof FrenchNotificationRow;

export type NotificationRowCatalogKey = keyof FrenchNotificationRowCatalog;

export type NotificationRowCatalog = Readonly<Record<NotificationRowCatalogKey, string>>;

type Placeholders<S extends string> = S extends `${string}{${infer Name}}${infer Rest}`
  ? Name | Placeholders<Rest>
  : never;

type TranslateArgs<K extends NotificationRowCatalogKey> = [Placeholders<FrenchNotificationRowCatalog[K]>] extends [never]
  ? []
  : [params: Readonly<Record<Placeholders<FrenchNotificationRowCatalog[K]>, string>>];

type CatalogModule = { readonly default: NotificationRowCatalog };

const LOADERS: Readonly<Record<InterfaceLanguage, () => Promise<CatalogModule>>> = {
  fr: () => import('./interface-catalogs/catalog-notification-row-fr'),
  en: () => import('./interface-catalogs/catalog-notification-row-en'),
  es: () => import('./interface-catalogs/catalog-notification-row-es'),
  pt: () => import('./interface-catalogs/catalog-notification-row-pt'),
  de: () => import('./interface-catalogs/catalog-notification-row-de'),
  it: () => import('./interface-catalogs/catalog-notification-row-it'),
  ar: () => import('./interface-catalogs/catalog-notification-row-ar'),
};

const loaded = new Map<InterfaceLanguage, NotificationRowCatalog>();
const inFlight = new Map<InterfaceLanguage, Promise<NotificationRowCatalog>>();

export function loadNotificationRowCatalog(language: InterfaceLanguage): Promise<NotificationRowCatalog> {
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

export function translateNotificationRow<K extends NotificationRowCatalogKey>(
  language: InterfaceLanguage,
  key: K,
  ...params: TranslateArgs<K>
): string;
export function translateNotificationRow(
  language: InterfaceLanguage,
  key: NotificationRowCatalogKey,
  params?: Readonly<Record<string, string>>,
): string {
  const catalog = loaded.get(language);
  if (catalog === undefined) {
    throw new Error(`Catalogue des notifications « ${language} » lu avant d'être chargé (loadNotificationRowCatalog).`);
  }
  const text = catalog[key];
  if (params === undefined) return text;
  return text.replace(PLACEHOLDER, (whole, name: string) => params[name] ?? whole);
}
