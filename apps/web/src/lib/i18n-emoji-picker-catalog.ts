/**
 * LE CATALOGUE DE LA FEUILLE D'EMOJIS (#10531) — les noms des catégories, la
 * recherche et ses états, dans les sept langues. Un `import()` par langue,
 * chargé AVEC la feuille (`prepareEmojiPickerSheet`, `emoji-picker-sheet.tsx`),
 * jamais au démarrage : les catalogues d'interface sont à leur plafond de poids
 * (189,85 Ko pour 190).
 *
 * Une clé absente d'une langue est une erreur de compilation
 * (`satisfies EmojiPickerCatalog`) et un témoin rouge
 * (`i18n-emoji-picker-catalog.test.ts`). Lu dans une langue pas encore
 * chargée, il sert une langue DÉJÀ chargée et charge la demandée. Rien de
 * chargé du tout lève.
 */
import type FrenchEmojiPicker from './interface-catalogs/catalog-emoji-picker-fr';
import type { InterfaceLanguage } from './interface-language';

export type EmojiPickerCatalogKey = keyof typeof FrenchEmojiPicker;

export type EmojiPickerCatalog = Readonly<Record<EmojiPickerCatalogKey, string>>;

type CatalogModule = { readonly default: EmojiPickerCatalog };

const LOADERS: Readonly<Record<InterfaceLanguage, () => Promise<CatalogModule>>> = {
  fr: () => import('./interface-catalogs/catalog-emoji-picker-fr'),
  en: () => import('./interface-catalogs/catalog-emoji-picker-en'),
  es: () => import('./interface-catalogs/catalog-emoji-picker-es'),
  pt: () => import('./interface-catalogs/catalog-emoji-picker-pt'),
  de: () => import('./interface-catalogs/catalog-emoji-picker-de'),
  it: () => import('./interface-catalogs/catalog-emoji-picker-it'),
  ar: () => import('./interface-catalogs/catalog-emoji-picker-ar'),
};

const loaded = new Map<InterfaceLanguage, EmojiPickerCatalog>();
const inFlight = new Map<InterfaceLanguage, Promise<EmojiPickerCatalog>>();

export function loadEmojiPickerCatalog(language: InterfaceLanguage): Promise<EmojiPickerCatalog> {
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

export function emojiPickerText(language: InterfaceLanguage, key: EmojiPickerCatalogKey): string {
  const catalog = loaded.get(language) ?? loaded.values().next().value;
  if (catalog === undefined) {
    throw new Error(`Catalogue de la feuille d'emojis « ${language} » lu avant d'être chargé (loadEmojiPickerCatalog).`);
  }
  if (!loaded.has(language)) void loadEmojiPickerCatalog(language).catch(() => undefined);
  return catalog[key];
}
