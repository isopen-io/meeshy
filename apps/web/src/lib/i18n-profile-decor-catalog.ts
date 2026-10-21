/**
 * LE CATALOGUE DU DÉCOR DE PROFIL (#10632) — les libellés `profileDecor.*` :
 * les entrées « Bannière » et « Contour » du profil, la feuille de choix et
 * ses refus, dans les sept langues du produit. Même mécanique que les packs de
 * stickers : un `import()` par langue, chargé avec la feuille
 * (`loadProfileDecorCatalog`), jamais au démarrage — les catalogues
 * d'interface ont atteint leur plafond de poids.
 *
 * Une clé absente d'une langue est une erreur de compilation
 * (`satisfies ProfileDecorCatalog`) et un témoin rouge
 * (`i18n-profile-decor-catalog.test.ts`).
 */
import type FrenchProfileDecor from './interface-catalogs/catalog-profile-decor-fr';
import type { InterfaceLanguage } from './interface-language';

export type ProfileDecorCatalogKey = keyof typeof FrenchProfileDecor;

export type ProfileDecorCatalog = Readonly<Record<ProfileDecorCatalogKey, string>>;

type CatalogModule = { readonly default: ProfileDecorCatalog };

const LOADERS: Readonly<Record<InterfaceLanguage, () => Promise<CatalogModule>>> = {
  fr: () => import('./interface-catalogs/catalog-profile-decor-fr'),
  en: () => import('./interface-catalogs/catalog-profile-decor-en'),
  es: () => import('./interface-catalogs/catalog-profile-decor-es'),
  pt: () => import('./interface-catalogs/catalog-profile-decor-pt'),
  de: () => import('./interface-catalogs/catalog-profile-decor-de'),
  it: () => import('./interface-catalogs/catalog-profile-decor-it'),
  ar: () => import('./interface-catalogs/catalog-profile-decor-ar'),
};

const loaded = new Map<InterfaceLanguage, ProfileDecorCatalog>();
const inFlight = new Map<InterfaceLanguage, Promise<ProfileDecorCatalog>>();

export function loadProfileDecorCatalog(language: InterfaceLanguage): Promise<ProfileDecorCatalog> {
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

/** Lu avant d'être chargé, il sert une langue DÉJÀ chargée et charge la demandée ; rien de chargé du tout lève. */
export function translateProfileDecor(language: InterfaceLanguage, key: ProfileDecorCatalogKey): string {
  const catalog = loaded.get(language) ?? loaded.values().next().value;
  if (catalog === undefined) throw new Error(`Catalogue du décor de profil « ${language} » lu avant d'être chargé (loadProfileDecorCatalog).`);
  if (!loaded.has(language)) void loadProfileDecorCatalog(language).catch(() => undefined);
  return catalog[key];
}
