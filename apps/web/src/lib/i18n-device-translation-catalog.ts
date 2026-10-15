/**
 * LE CATALOGUE DE LA TRADUCTION SUR L'APPAREIL (#9898) — la rangée de Réglages
 * qui l'active et sa légende, dans les sept langues du produit. Même mécanique
 * que « Mes sons » (`i18n-sounds-mine-catalog.ts`) : un `import()` par langue,
 * chargé par la rangée (`routes/settings-sections.tsx`), jamais au démarrage —
 * le catalogue d'interface est à son plafond (`budgets.json` ›
 * `interface_catalogs`), et la légende pèse à elle seule ~1,6 Ko pour les sept.
 *
 * Aucun repli : une clé absente d'une langue est une erreur de compilation
 * (`satisfies DeviceTranslationCatalog`) et un témoin rouge
 * (`i18n-device-translation-catalog.test.ts`) ; un catalogue lu avant d'être
 * chargé lève.
 */
import type FrenchDeviceTranslation from './interface-catalogs/catalog-device-translation-fr';
import type { InterfaceLanguage } from './interface-language';

export type DeviceTranslationCatalogKey = keyof typeof FrenchDeviceTranslation;

export type DeviceTranslationCatalog = Readonly<Record<DeviceTranslationCatalogKey, string>>;

type CatalogModule = { readonly default: DeviceTranslationCatalog };

const LOADERS: Readonly<Record<InterfaceLanguage, () => Promise<CatalogModule>>> = {
  fr: () => import('./interface-catalogs/catalog-device-translation-fr'),
  en: () => import('./interface-catalogs/catalog-device-translation-en'),
  es: () => import('./interface-catalogs/catalog-device-translation-es'),
  pt: () => import('./interface-catalogs/catalog-device-translation-pt'),
  de: () => import('./interface-catalogs/catalog-device-translation-de'),
  it: () => import('./interface-catalogs/catalog-device-translation-it'),
  ar: () => import('./interface-catalogs/catalog-device-translation-ar'),
};

const loaded = new Map<InterfaceLanguage, DeviceTranslationCatalog>();
const inFlight = new Map<InterfaceLanguage, Promise<DeviceTranslationCatalog>>();

export const isDeviceTranslationCatalogLoaded = (language: InterfaceLanguage): boolean => loaded.has(language);

export function loadDeviceTranslationCatalog(language: InterfaceLanguage): Promise<DeviceTranslationCatalog> {
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

export function translateDeviceTranslation(language: InterfaceLanguage, key: DeviceTranslationCatalogKey): string {
  const catalog = loaded.get(language);
  if (catalog === undefined) {
    throw new Error(`Catalogue de la traduction sur l'appareil « ${language} » lu avant d'être chargé (loadDeviceTranslationCatalog).`);
  }
  return catalog[key];
}
