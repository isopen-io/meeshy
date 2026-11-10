/**
 * LE CATALOGUE DE « ÉCRIRE À UN AMI WHATSAPP » (#17118) — les libellés `externalConversation.*` de l'entrée de la
 * nouvelle conversation (`components/external-conversation-entry.tsx`). Un `import()` par langue, chargé par
 * l'entrée elle-même et SEULEMENT là où elle est visible (staging, équipe) : la production ne le télécharge
 * jamais, et le catalogue d'interface, à son plafond (`budgets.json` › `interface_catalogs`), n'en porte rien.
 *
 * Aucun repli : une clé absente d'une langue est une erreur de compilation (`satisfies ExternalConversationCatalog`)
 * et un témoin rouge (`i18n-external-conversation-catalog.test.ts`) ; un catalogue lu avant d'être chargé lève.
 */
import type FrenchExternalConversation from './interface-catalogs/catalog-external-conversation-fr';
import type { InterfaceLanguage } from './interface-language';

export type ExternalConversationCatalogKey = keyof typeof FrenchExternalConversation;

export type ExternalConversationCatalog = Readonly<Record<ExternalConversationCatalogKey, string>>;

type CatalogModule = { readonly default: ExternalConversationCatalog };

const LOADERS: Readonly<Record<InterfaceLanguage, () => Promise<CatalogModule>>> = {
  fr: () => import('./interface-catalogs/catalog-external-conversation-fr'),
  en: () => import('./interface-catalogs/catalog-external-conversation-en'),
  es: () => import('./interface-catalogs/catalog-external-conversation-es'),
  pt: () => import('./interface-catalogs/catalog-external-conversation-pt'),
  de: () => import('./interface-catalogs/catalog-external-conversation-de'),
  it: () => import('./interface-catalogs/catalog-external-conversation-it'),
  ar: () => import('./interface-catalogs/catalog-external-conversation-ar'),
};

const loaded = new Map<InterfaceLanguage, ExternalConversationCatalog>();
const inFlight = new Map<InterfaceLanguage, Promise<ExternalConversationCatalog>>();

export function loadExternalConversationCatalog(language: InterfaceLanguage): Promise<ExternalConversationCatalog> {
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

export const isExternalConversationCatalogLoaded = (language: InterfaceLanguage): boolean => loaded.has(language);

export function translateExternalConversation(language: InterfaceLanguage, key: ExternalConversationCatalogKey): string {
  const catalog = loaded.get(language);
  if (catalog === undefined) {
    throw new Error(`Catalogue « écrire à un ami WhatsApp » « ${language} » lu avant d'être chargé (loadExternalConversationCatalog).`);
  }
  return catalog[key];
}
