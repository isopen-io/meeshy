/**
 * LE CATALOGUE DES PACKS DE STICKERS (#9141) — les libellés `stickerPacks.*`
 * de la boutique, de l'onglet d'un pack de tiers et de l'éditeur de
 * proposition, dans les sept langues du produit. Même mécanique que la
 * feuille d'envoi : un `import()` par langue, chargé avec la boutique ou
 * l'onglet d'un pack (`loadStickerPacksCatalog`), jamais au démarrage — les
 * catalogues d'interface ont atteint leur plafond de poids.
 *
 * Une clé absente d'une langue est une erreur de compilation
 * (`satisfies StickerPacksCatalog`) et un témoin rouge
 * (`i18n-sticker-packs-catalog.test.ts`).
 */
import type FrenchStickerPacks from './interface-catalogs/catalog-sticker-packs-fr';
import type { InterfaceLanguage } from './interface-language';

type FrenchStickerPacksCatalog = typeof FrenchStickerPacks;

export type StickerPacksCatalogKey = keyof FrenchStickerPacksCatalog;

export type StickerPacksCatalog = Readonly<Record<StickerPacksCatalogKey, string>>;

type Placeholders<S extends string> = S extends `${string}{${infer Name}}${infer Rest}`
  ? Name | Placeholders<Rest>
  : never;

type TranslateStickerPacksArgs<K extends StickerPacksCatalogKey> = [Placeholders<FrenchStickerPacksCatalog[K]>] extends [never]
  ? []
  : [params: Readonly<Record<Placeholders<FrenchStickerPacksCatalog[K]>, string>>];

/** Une clé sans paramètre — ce qu'une table de libellés (genre, statut, refus) peut désigner. */
export type PlainStickerPacksKey = {
  [K in StickerPacksCatalogKey]: [Placeholders<FrenchStickerPacksCatalog[K]>] extends [never] ? K : never;
}[StickerPacksCatalogKey];

type CatalogModule = { readonly default: StickerPacksCatalog };

const LOADERS: Readonly<Record<InterfaceLanguage, () => Promise<CatalogModule>>> = {
  fr: () => import('./interface-catalogs/catalog-sticker-packs-fr'),
  en: () => import('./interface-catalogs/catalog-sticker-packs-en'),
  es: () => import('./interface-catalogs/catalog-sticker-packs-es'),
  pt: () => import('./interface-catalogs/catalog-sticker-packs-pt'),
  de: () => import('./interface-catalogs/catalog-sticker-packs-de'),
  it: () => import('./interface-catalogs/catalog-sticker-packs-it'),
  ar: () => import('./interface-catalogs/catalog-sticker-packs-ar'),
};

const loaded = new Map<InterfaceLanguage, StickerPacksCatalog>();
const inFlight = new Map<InterfaceLanguage, Promise<StickerPacksCatalog>>();

export function loadStickerPacksCatalog(language: InterfaceLanguage): Promise<StickerPacksCatalog> {
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

export function translateStickerPacks<K extends StickerPacksCatalogKey>(
  language: InterfaceLanguage,
  key: K,
  ...params: TranslateStickerPacksArgs<K>
): string;
export function translateStickerPacks(
  language: InterfaceLanguage,
  key: StickerPacksCatalogKey,
  params?: Readonly<Record<string, string>>,
): string {
  const catalog = loaded.get(language) ?? loaded.values().next().value;
  if (catalog === undefined) {
    throw new Error(`Catalogue des packs de stickers « ${language} » lu avant d'être chargé (loadStickerPacksCatalog).`);
  }
  if (!loaded.has(language)) void loadStickerPacksCatalog(language).catch(() => undefined);
  const text = catalog[key];
  if (params === undefined) return text;
  return text.replace(PLACEHOLDER, (whole, name: string) => params[name] ?? whole);
}
