/**
 * LE CATALOGUE DU CHIFFREMENT D'UNE CONVERSATION (#12880) — les textes
 * `conversationEncryption.*` de la section « Chiffrement » de la feuille de
 * détails, dans les sept langues du produit, avec les mots de la fiche
 * Chiffrement d'iOS. Même mécanique que les statistiques
 * (`i18n-conversation-stats-catalog.ts`) : un `import()` par langue, chargé par
 * la section (`conversation-encryption-section.tsx`) — le catalogue d'interface
 * est à son plafond, et seul le lecteur qui ouvre les détails en paie les octets.
 *
 * Aucun repli : une clé absente d'une langue est une erreur de compilation
 * (`satisfies ConversationEncryptionCatalog`) et un témoin rouge
 * (`i18n-conversation-encryption-catalog.test.ts`) ; un catalogue lu avant
 * d'être chargé lève.
 */
import type FrenchConversationEncryption from './interface-catalogs/catalog-conversation-encryption-fr';
import type { InterfaceLanguage } from './interface-language';

export type ConversationEncryptionCatalogKey = keyof typeof FrenchConversationEncryption;

export type ConversationEncryptionCatalog = Readonly<Record<ConversationEncryptionCatalogKey, string>>;

type CatalogModule = { readonly default: ConversationEncryptionCatalog };

const LOADERS: Readonly<Record<InterfaceLanguage, () => Promise<CatalogModule>>> = {
  fr: () => import('./interface-catalogs/catalog-conversation-encryption-fr'),
  en: () => import('./interface-catalogs/catalog-conversation-encryption-en'),
  es: () => import('./interface-catalogs/catalog-conversation-encryption-es'),
  pt: () => import('./interface-catalogs/catalog-conversation-encryption-pt'),
  de: () => import('./interface-catalogs/catalog-conversation-encryption-de'),
  it: () => import('./interface-catalogs/catalog-conversation-encryption-it'),
  ar: () => import('./interface-catalogs/catalog-conversation-encryption-ar'),
};

const loaded = new Map<InterfaceLanguage, ConversationEncryptionCatalog>();
const inFlight = new Map<InterfaceLanguage, Promise<ConversationEncryptionCatalog>>();

export const isConversationEncryptionCatalogLoaded = (language: InterfaceLanguage): boolean => loaded.has(language);

export function loadConversationEncryptionCatalog(language: InterfaceLanguage): Promise<ConversationEncryptionCatalog> {
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

export function translateConversationEncryption(
  language: InterfaceLanguage,
  key: ConversationEncryptionCatalogKey,
  params: Readonly<Record<string, string>> = {},
): string {
  const catalog = loaded.get(language);
  if (catalog === undefined) {
    throw new Error(`Catalogue du chiffrement « ${language} » lu avant d'être chargé (loadConversationEncryptionCatalog).`);
  }
  return Object.entries(params).reduce((text, [name, value]) => text.replaceAll(`{${name}}`, value), catalog[key]);
}
