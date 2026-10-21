/**
 * LE CATALOGUE DE LA CRÉATION D'UNE HUMEUR (#10527) — la porte vers les autres
 * emojis et la question « sans un petit mot ? », dans les sept langues. Un
 * `import()` par langue, chargé AVEC l'écran `/status/new`
 * (`routes/route-table.tsx`), jamais au démarrage : les catalogues d'interface
 * sont à leur plafond de poids (189,85 Ko pour 190).
 *
 * Une clé absente d'une langue est une erreur de compilation
 * (`satisfies MoodComposeCatalog`) et un témoin rouge
 * (`i18n-mood-compose-catalog.test.ts`). Lu dans une langue pas encore
 * chargée, il sert une langue DÉJÀ chargée et charge la demandée. Rien de
 * chargé du tout lève.
 */
import type FrenchMoodCompose from './interface-catalogs/catalog-mood-compose-fr';
import type { InterfaceLanguage } from './interface-language';

export type MoodComposeCatalogKey = keyof typeof FrenchMoodCompose;

export type MoodComposeCatalog = Readonly<Record<MoodComposeCatalogKey, string>>;

type CatalogModule = { readonly default: MoodComposeCatalog };

const LOADERS: Readonly<Record<InterfaceLanguage, () => Promise<CatalogModule>>> = {
  fr: () => import('./interface-catalogs/catalog-mood-compose-fr'),
  en: () => import('./interface-catalogs/catalog-mood-compose-en'),
  es: () => import('./interface-catalogs/catalog-mood-compose-es'),
  pt: () => import('./interface-catalogs/catalog-mood-compose-pt'),
  de: () => import('./interface-catalogs/catalog-mood-compose-de'),
  it: () => import('./interface-catalogs/catalog-mood-compose-it'),
  ar: () => import('./interface-catalogs/catalog-mood-compose-ar'),
};

const loaded = new Map<InterfaceLanguage, MoodComposeCatalog>();
const inFlight = new Map<InterfaceLanguage, Promise<MoodComposeCatalog>>();

export function loadMoodComposeCatalog(language: InterfaceLanguage): Promise<MoodComposeCatalog> {
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

export function moodComposeText(language: InterfaceLanguage, key: MoodComposeCatalogKey): string {
  const catalog = loaded.get(language) ?? loaded.values().next().value;
  if (catalog === undefined) {
    throw new Error(`Catalogue de la création d'une humeur « ${language} » lu avant d'être chargé (loadMoodComposeCatalog).`);
  }
  if (!loaded.has(language)) void loadMoodComposeCatalog(language).catch(() => undefined);
  return catalog[key];
}
