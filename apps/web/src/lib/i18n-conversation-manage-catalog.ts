/**
 * LE CATALOGUE DE LA GESTION D'UNE CONVERSATION (#10613, #7836) — les libellés
 * `conversationManage.*` de la feuille de détails : gestes sur les membres,
 * ajout de membres, réglages du groupe (identité, permissions) et options du
 * lecteur, dans les sept langues du produit, avec les mots d'iOS
 * (`ConversationSettingsView.swift`, `ConversationPreferencesTab.swift`,
 * `AddParticipantSheet.swift`). Même mécanique que les statistiques
 * (`i18n-conversation-stats-catalog.ts`) : un `import()` par langue, chargé
 * par la feuille, elle-même chargée à la demande — le catalogue d'interface
 * est à son plafond (`budgets.json` › `interface_catalogs`).
 *
 * Aucun repli : une clé absente d'une langue est une erreur de compilation
 * (`satisfies ConversationManageCatalog`) et un témoin rouge
 * (`i18n-conversation-manage-catalog.test.ts`) ; un catalogue lu avant d'être
 * chargé lève.
 */
import type FrenchConversationManage from './interface-catalogs/catalog-conversation-manage-fr';
import type { InterfaceLanguage } from './interface-language';

type FrenchConversationManageCatalog = typeof FrenchConversationManage;

export type ConversationManageCatalogKey = keyof FrenchConversationManageCatalog;

export type ConversationManageCatalog = Readonly<Record<ConversationManageCatalogKey, string>>;

type Placeholders<S extends string> = S extends `${string}{${infer Name}}${infer Rest}`
  ? Name | Placeholders<Rest>
  : never;

type TranslateConversationManageArgs<K extends ConversationManageCatalogKey> = [Placeholders<FrenchConversationManageCatalog[K]>] extends [never]
  ? []
  : [params: Readonly<Record<Placeholders<FrenchConversationManageCatalog[K]>, string>>];

type CatalogModule = { readonly default: ConversationManageCatalog };

const LOADERS: Readonly<Record<InterfaceLanguage, () => Promise<CatalogModule>>> = {
  fr: () => import('./interface-catalogs/catalog-conversation-manage-fr'),
  en: () => import('./interface-catalogs/catalog-conversation-manage-en'),
  es: () => import('./interface-catalogs/catalog-conversation-manage-es'),
  pt: () => import('./interface-catalogs/catalog-conversation-manage-pt'),
  de: () => import('./interface-catalogs/catalog-conversation-manage-de'),
  it: () => import('./interface-catalogs/catalog-conversation-manage-it'),
  ar: () => import('./interface-catalogs/catalog-conversation-manage-ar'),
};

const loaded = new Map<InterfaceLanguage, ConversationManageCatalog>();
const inFlight = new Map<InterfaceLanguage, Promise<ConversationManageCatalog>>();

export const isConversationManageCatalogLoaded = (language: InterfaceLanguage): boolean => loaded.has(language);

export function loadConversationManageCatalog(language: InterfaceLanguage): Promise<ConversationManageCatalog> {
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

function lookup(language: InterfaceLanguage, key: ConversationManageCatalogKey, params?: Readonly<Record<string, string>>): string {
  const catalog = loaded.get(language);
  if (catalog === undefined) {
    throw new Error(`Catalogue de gestion de la conversation « ${language} » lu avant d'être chargé (loadConversationManageCatalog).`);
  }
  const text = catalog[key];
  if (params === undefined) return text;
  return text.replace(PLACEHOLDER, (whole, name: string) => params[name] ?? whole);
}

export function translateConversationManage<K extends ConversationManageCatalogKey>(
  language: InterfaceLanguage,
  key: K,
  ...params: TranslateConversationManageArgs<K>
): string {
  return lookup(language, key, params[0]);
}

/**
 * La même lecture pour une clé CALCULÉE (`ACTION_KEYS[kind]`) : les paramètres
 * ne s'y vérifient pas à la compilation, le témoin du catalogue les garde.
 */
export const manageText = (language: InterfaceLanguage, key: ConversationManageCatalogKey, params?: Readonly<Record<string, string>>): string =>
  lookup(language, key, params);
