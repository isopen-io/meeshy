/**
 * LE CATALOGUE DU MENU D'UNE PIÈCE (#9907, #9908) — les libellés
 * `message.piece.*` (répondre à une pièce, l'enregistrer, la transférer, la
 * supprimer, son défilement « Photo 3 sur 7 ») dans les sept langues du
 * produit. Même mécanique que la feuille « Vues » : un `import()` par langue,
 * chargé avec le fil (`useMessageMenu`), jamais au démarrage — le catalogue
 * d'interface a atteint son plafond (`budgets.json` › `interface_catalogs`).
 *
 * Aucun repli : une clé absente d'une langue est une erreur de compilation
 * (`satisfies MessagePiecesCatalog`) et un témoin rouge ; un catalogue lu
 * avant d'être chargé lève. Tant qu'il n'est pas chargé, l'appui long sur une
 * tuile ouvre le menu du message entier (`useMessageMenu`).
 */
import type FrenchMessagePieces from './interface-catalogs/catalog-message-pieces-fr';
import type { InterfaceLanguage } from './interface-language';

type FrenchMessagePiecesCatalog = typeof FrenchMessagePieces;

export type MessagePiecesCatalogKey = keyof FrenchMessagePiecesCatalog;

export type MessagePiecesCatalog = Readonly<Record<MessagePiecesCatalogKey, string>>;

type Placeholders<S extends string> = S extends `${string}{${infer Name}}${infer Rest}`
  ? Name | Placeholders<Rest>
  : never;

/** Les clés sans paramètre — celles qu'on traduit d'un seul argument. */
export type PlainMessagePiecesKey = { [K in MessagePiecesCatalogKey]: [Placeholders<FrenchMessagePiecesCatalog[K]>] extends [never] ? K : never }[MessagePiecesCatalogKey];

type TranslateMessagePiecesArgs<K extends MessagePiecesCatalogKey> = [Placeholders<FrenchMessagePiecesCatalog[K]>] extends [never]
  ? []
  : [params: Readonly<Record<Placeholders<FrenchMessagePiecesCatalog[K]>, string>>];

type CatalogModule = { readonly default: MessagePiecesCatalog };

const LOADERS: Readonly<Record<InterfaceLanguage, () => Promise<CatalogModule>>> = {
  fr: () => import('./interface-catalogs/catalog-message-pieces-fr'),
  en: () => import('./interface-catalogs/catalog-message-pieces-en'),
  es: () => import('./interface-catalogs/catalog-message-pieces-es'),
  pt: () => import('./interface-catalogs/catalog-message-pieces-pt'),
  de: () => import('./interface-catalogs/catalog-message-pieces-de'),
  it: () => import('./interface-catalogs/catalog-message-pieces-it'),
  ar: () => import('./interface-catalogs/catalog-message-pieces-ar'),
};

const loaded = new Map<InterfaceLanguage, MessagePiecesCatalog>();
const inFlight = new Map<InterfaceLanguage, Promise<MessagePiecesCatalog>>();

export const isMessagePiecesCatalogLoaded = (language: InterfaceLanguage): boolean => loaded.has(language);

export function loadMessagePiecesCatalog(language: InterfaceLanguage): Promise<MessagePiecesCatalog> {
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

export function translateMessagePieces<K extends MessagePiecesCatalogKey>(
  language: InterfaceLanguage,
  key: K,
  ...params: TranslateMessagePiecesArgs<K>
): string;
export function translateMessagePieces(
  language: InterfaceLanguage,
  key: MessagePiecesCatalogKey,
  params?: Readonly<Record<string, string>>,
): string {
  const catalog = loaded.get(language);
  if (catalog === undefined) {
    throw new Error(`Catalogue des pièces d'un message « ${language} » lu avant d'être chargé (loadMessagePiecesCatalog).`);
  }
  const text = catalog[key];
  if (params === undefined) return text;
  return text.replace(PLACEHOLDER, (whole, name: string) => params[name] ?? whole);
}
