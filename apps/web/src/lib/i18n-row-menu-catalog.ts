/**
 * LE CATALOGUE DU MENU D'UNE LIGNE ET DES PUCES DE LA LISTE (#10593) — Détails,
 * Renommer, Favori, Déplacer vers…, Bloquer, la confirmation du blocage, la
 * fenêtre de renommage et les libellés des filtres, dans les sept langues. Un
 * `import()` par langue, chargé AVEC l'écran de la liste
 * (`routes/route-table.tsx`, route `list` — le cadre partagé du grand écran
 * passe par le même chargeur), jamais au démarrage : les catalogues
 * d'interface sont à leur plafond de poids (189,85 Ko pour 190).
 *
 * Mots repris d'iOS (`context.*`, `block.confirm.*`, `conversation.rename.*`,
 * `conversation.filter.*`, `Localizable.xcstrings`). Une clé absente d'une
 * langue est une erreur de compilation (`satisfies RowMenuCatalog`) et un
 * témoin rouge (`i18n-row-menu-catalog.test.ts`). Lu dans une langue pas encore
 * chargée, il sert une langue DÉJÀ chargée et charge la demandée. Rien de
 * chargé du tout lève.
 */
import type FrenchRowMenu from './interface-catalogs/catalog-row-menu-fr';
import type { InterfaceLanguage } from './interface-language';

export type RowMenuCatalogKey = keyof typeof FrenchRowMenu;

export type RowMenuCatalog = Readonly<Record<RowMenuCatalogKey, string>>;

type CatalogModule = { readonly default: RowMenuCatalog };

const LOADERS: Readonly<Record<InterfaceLanguage, () => Promise<CatalogModule>>> = {
  fr: () => import('./interface-catalogs/catalog-row-menu-fr'),
  en: () => import('./interface-catalogs/catalog-row-menu-en'),
  es: () => import('./interface-catalogs/catalog-row-menu-es'),
  pt: () => import('./interface-catalogs/catalog-row-menu-pt'),
  de: () => import('./interface-catalogs/catalog-row-menu-de'),
  it: () => import('./interface-catalogs/catalog-row-menu-it'),
  ar: () => import('./interface-catalogs/catalog-row-menu-ar'),
};

const loaded = new Map<InterfaceLanguage, RowMenuCatalog>();
const inFlight = new Map<InterfaceLanguage, Promise<RowMenuCatalog>>();

export function loadRowMenuCatalog(language: InterfaceLanguage): Promise<RowMenuCatalog> {
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

export function rowMenuText(language: InterfaceLanguage, key: RowMenuCatalogKey): string {
  const catalog = loaded.get(language) ?? loaded.values().next().value;
  if (catalog === undefined) {
    throw new Error(`Catalogue du menu d'une ligne « ${language} » lu avant d'être chargé (loadRowMenuCatalog).`);
  }
  if (!loaded.has(language)) void loadRowMenuCatalog(language).catch(() => undefined);
  return catalog[key];
}
