/**
 * LE CATALOGUE DES STATISTIQUES D'UNE CONVERSATION (#7835) — les libellés
 * `conversationStats.*` de la section « Statistiques » de la feuille de
 * détails, dans les sept langues du produit, avec les mots d'iOS
 * (`dashboard.*`, `ConversationDashboardView.swift`). Même mécanique que
 * « Mes sons » (`i18n-sounds-mine-catalog.ts`) : un `import()` par langue,
 * chargé par la section (`conversation-stats-section.tsx`), elle-même chargée
 * à la demande — le catalogue d'interface est à son plafond (`budgets.json` ›
 * `interface_catalogs`), et seul le lecteur qui ouvre les détails en paie les
 * octets.
 *
 * Aucun repli : une clé absente d'une langue est une erreur de compilation
 * (`satisfies ConversationStatsCatalog`) et un témoin rouge
 * (`i18n-conversation-stats-catalog.test.ts`) ; un catalogue lu avant d'être
 * chargé lève.
 */
import type FrenchConversationStats from './interface-catalogs/catalog-conversation-stats-fr';
import type { InterfaceLanguage } from './interface-language';

type FrenchConversationStatsCatalog = typeof FrenchConversationStats;

export type ConversationStatsCatalogKey = keyof FrenchConversationStatsCatalog;

export type ConversationStatsCatalog = Readonly<Record<ConversationStatsCatalogKey, string>>;

type Placeholders<S extends string> = S extends `${string}{${infer Name}}${infer Rest}`
  ? Name | Placeholders<Rest>
  : never;

type TranslateConversationStatsArgs<K extends ConversationStatsCatalogKey> = [Placeholders<FrenchConversationStatsCatalog[K]>] extends [never]
  ? []
  : [params: Readonly<Record<Placeholders<FrenchConversationStatsCatalog[K]>, string>>];

type CatalogModule = { readonly default: ConversationStatsCatalog };

const LOADERS: Readonly<Record<InterfaceLanguage, () => Promise<CatalogModule>>> = {
  fr: () => import('./interface-catalogs/catalog-conversation-stats-fr'),
  en: () => import('./interface-catalogs/catalog-conversation-stats-en'),
  es: () => import('./interface-catalogs/catalog-conversation-stats-es'),
  pt: () => import('./interface-catalogs/catalog-conversation-stats-pt'),
  de: () => import('./interface-catalogs/catalog-conversation-stats-de'),
  it: () => import('./interface-catalogs/catalog-conversation-stats-it'),
  ar: () => import('./interface-catalogs/catalog-conversation-stats-ar'),
};

const loaded = new Map<InterfaceLanguage, ConversationStatsCatalog>();
const inFlight = new Map<InterfaceLanguage, Promise<ConversationStatsCatalog>>();

export const isConversationStatsCatalogLoaded = (language: InterfaceLanguage): boolean => loaded.has(language);

export function loadConversationStatsCatalog(language: InterfaceLanguage): Promise<ConversationStatsCatalog> {
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

export function translateConversationStats<K extends ConversationStatsCatalogKey>(
  language: InterfaceLanguage,
  key: K,
  ...params: TranslateConversationStatsArgs<K>
): string;
export function translateConversationStats(
  language: InterfaceLanguage,
  key: ConversationStatsCatalogKey,
  params?: Readonly<Record<string, string>>,
): string {
  const catalog = loaded.get(language);
  if (catalog === undefined) {
    throw new Error(`Catalogue des statistiques « ${language} » lu avant d'être chargé (loadConversationStatsCatalog).`);
  }
  const text = catalog[key];
  if (params === undefined) return text;
  return text.replace(PLACEHOLDER, (whole, name: string) => params[name] ?? whole);
}
