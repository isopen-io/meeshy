/**
 * LE CATALOGUE DE LA FICHE D'UN PARTICIPANT DE WORLD WIDE (#10102) — les
 * libellés `worldCard.*` dans les sept langues du produit. Même mécanique que
 * le catalogue de la feuille « Vues » : un `import()` par langue, chargé pour
 * l'ÉQUIPE seulement, quand le fil de World Wide lui ouvre les fiches
 * (`components/world-participant-card-host.tsx`) — jamais au démarrage, et
 * jamais pour un lecteur à qui rien ne s'ouvre. Le catalogue d'interface a
 * atteint son plafond (`budgets.json` › `interface_catalogs`).
 *
 * Aucun repli : une clé absente d'une langue est une erreur de compilation
 * (`satisfies WorldParticipantCardCatalog`) et un témoin rouge
 * (`i18n-world-participant-card-catalog.test.ts`) ; un catalogue lu avant
 * d'être chargé lève.
 */
import type FrenchWorldParticipantCard from './interface-catalogs/catalog-world-participant-card-fr';
import type { InterfaceLanguage } from './interface-language';

type FrenchWorldParticipantCardCatalog = typeof FrenchWorldParticipantCard;

export type WorldParticipantCardCatalogKey = keyof FrenchWorldParticipantCardCatalog;

export type WorldParticipantCardCatalog = Readonly<Record<WorldParticipantCardCatalogKey, string>>;

type Placeholders<S extends string> = S extends `${string}{${infer Name}}${infer Rest}`
  ? Name | Placeholders<Rest>
  : never;

/** Les clés sans paramètre — celles qu'on traduit d'un seul argument. */
export type PlainWorldParticipantCardKey = { [K in WorldParticipantCardCatalogKey]: [Placeholders<FrenchWorldParticipantCardCatalog[K]>] extends [never] ? K : never }[WorldParticipantCardCatalogKey];

type TranslateWorldParticipantCardArgs<K extends WorldParticipantCardCatalogKey> = [Placeholders<FrenchWorldParticipantCardCatalog[K]>] extends [never]
  ? []
  : [params: Readonly<Record<Placeholders<FrenchWorldParticipantCardCatalog[K]>, string>>];

type CatalogModule = { readonly default: WorldParticipantCardCatalog };

const LOADERS: Readonly<Record<InterfaceLanguage, () => Promise<CatalogModule>>> = {
  fr: () => import('./interface-catalogs/catalog-world-participant-card-fr'),
  en: () => import('./interface-catalogs/catalog-world-participant-card-en'),
  es: () => import('./interface-catalogs/catalog-world-participant-card-es'),
  pt: () => import('./interface-catalogs/catalog-world-participant-card-pt'),
  de: () => import('./interface-catalogs/catalog-world-participant-card-de'),
  it: () => import('./interface-catalogs/catalog-world-participant-card-it'),
  ar: () => import('./interface-catalogs/catalog-world-participant-card-ar'),
};

const loaded = new Map<InterfaceLanguage, WorldParticipantCardCatalog>();
const inFlight = new Map<InterfaceLanguage, Promise<WorldParticipantCardCatalog>>();

export const isWorldParticipantCardCatalogLoaded = (language: InterfaceLanguage): boolean => loaded.has(language);

export function loadWorldParticipantCardCatalog(language: InterfaceLanguage): Promise<WorldParticipantCardCatalog> {
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

export function translateWorldParticipantCard<K extends WorldParticipantCardCatalogKey>(
  language: InterfaceLanguage,
  key: K,
  ...params: TranslateWorldParticipantCardArgs<K>
): string;
export function translateWorldParticipantCard(
  language: InterfaceLanguage,
  key: WorldParticipantCardCatalogKey,
  params?: Readonly<Record<string, string>>,
): string {
  const catalog = loaded.get(language);
  if (catalog === undefined) {
    throw new Error(`Catalogue de la fiche d’un participant de World Wide « ${language} » lu avant d'être chargé (loadWorldParticipantCardCatalog).`);
  }
  const text = catalog[key];
  if (params === undefined) return text;
  return text.replace(PLACEHOLDER, (whole, name: string) => params[name] ?? whole);
}
