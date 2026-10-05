/**
 * LE CATALOGUE DE LA FEUILLE D'ENVOI (#8884) — les libellés `sendSheet.*` de la
 * feuille unique de transfert et de partage (envoyer à une ou plusieurs
 * personnes, à un groupe, ou publier en post, story ou réel) et
 * `shareLinkSheet.*` (les textes de la feuille « Créer un lien de partage »),
 * dans les sept langues du produit. Même mécanique que les catalogues des
 * contrôles d'appel et des invitations : un `import()` par langue, chargé à
 * l'OUVERTURE de la feuille (`loadSendSheetCatalog`), jamais au démarrage.
 * `catalog-fr.ts` a déjà passé le budget de taille : on n'y ajoute rien.
 *
 * Une clé absente d'une langue est une erreur de compilation
 * (`satisfies SendSheetCatalog`) et un témoin rouge
 * (`i18n-send-sheet-catalog.test.ts`). Lu dans une langue pas encore chargée
 * (l'interface a changé de langue feuille ouverte), il sert une langue DÉJÀ
 * chargée et charge la demandée : une feuille ne tombe pas pour un libellé.
 * Rien de chargé du tout lève.
 */
import type FrenchSendSheet from './interface-catalogs/catalog-send-sheet-fr';
import type { InterfaceLanguage } from './interface-language';

type FrenchSendSheetCatalog = typeof FrenchSendSheet;

export type SendSheetCatalogKey = keyof FrenchSendSheetCatalog;

export type SendSheetCatalog = Readonly<Record<SendSheetCatalogKey, string>>;

type Placeholders<S extends string> = S extends `${string}{${infer Name}}${infer Rest}`
  ? Name | Placeholders<Rest>
  : never;

type TranslateSendSheetArgs<K extends SendSheetCatalogKey> = [Placeholders<FrenchSendSheetCatalog[K]>] extends [never]
  ? []
  : [params: Readonly<Record<Placeholders<FrenchSendSheetCatalog[K]>, string>>];

type CatalogModule = { readonly default: SendSheetCatalog };

const LOADERS: Readonly<Record<InterfaceLanguage, () => Promise<CatalogModule>>> = {
  fr: () => import('./interface-catalogs/catalog-send-sheet-fr'),
  en: () => import('./interface-catalogs/catalog-send-sheet-en'),
  es: () => import('./interface-catalogs/catalog-send-sheet-es'),
  pt: () => import('./interface-catalogs/catalog-send-sheet-pt'),
  de: () => import('./interface-catalogs/catalog-send-sheet-de'),
  it: () => import('./interface-catalogs/catalog-send-sheet-it'),
  ar: () => import('./interface-catalogs/catalog-send-sheet-ar'),
};

const loaded = new Map<InterfaceLanguage, SendSheetCatalog>();
const inFlight = new Map<InterfaceLanguage, Promise<SendSheetCatalog>>();

export function loadSendSheetCatalog(language: InterfaceLanguage): Promise<SendSheetCatalog> {
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

export function translateSendSheet<K extends SendSheetCatalogKey>(
  language: InterfaceLanguage,
  key: K,
  ...params: TranslateSendSheetArgs<K>
): string;
export function translateSendSheet(
  language: InterfaceLanguage,
  key: SendSheetCatalogKey,
  params?: Readonly<Record<string, string>>,
): string {
  const catalog = loaded.get(language) ?? loaded.values().next().value;
  if (catalog === undefined) {
    throw new Error(`Catalogue de la feuille d'envoi « ${language} » lu avant d'être chargé (loadSendSheetCatalog).`);
  }
  if (!loaded.has(language)) void loadSendSheetCatalog(language).catch(() => undefined);
  const text = catalog[key];
  if (params === undefined) return text;
  return text.replace(PLACEHOLDER, (whole, name: string) => params[name] ?? whole);
}
