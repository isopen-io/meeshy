/**
 * LE CATALOGUE DE LA RECHERCHE GÉNÉRALE (#14619, #14620) — la section
 * « Messages » de la recherche de la liste et l'écran `/search` (onglets
 * Messages, Posts, Personnes), dans les sept langues. Un `import()` par langue,
 * chargé par les écrans qui le lisent (`useGlobalSearchCatalog`), jamais au
 * démarrage ni par la table des routes : la première peinture est à son plafond.
 *
 * Mots repris d'iOS (`GlobalSearchView`, `Localizable.xcstrings`). Une clé
 * absente d'une langue est une erreur de compilation
 * (`satisfies GlobalSearchCatalog`) et un témoin rouge
 * (`i18n-global-search-catalog.test.ts`). Lu dans une langue pas encore
 * chargée, il sert une langue DÉJÀ chargée et charge la demandée.
 */
import { useEffect, useState } from 'react';

import type FrenchGlobalSearch from './interface-catalogs/catalog-global-search-fr';
import type { InterfaceLanguage } from './interface-language';

export type GlobalSearchCatalogKey = keyof typeof FrenchGlobalSearch;

export type GlobalSearchCatalog = Readonly<Record<GlobalSearchCatalogKey, string>>;

type CatalogModule = { readonly default: GlobalSearchCatalog };

const LOADERS: Readonly<Record<InterfaceLanguage, () => Promise<CatalogModule>>> = {
  fr: () => import('./interface-catalogs/catalog-global-search-fr'),
  en: () => import('./interface-catalogs/catalog-global-search-en'),
  es: () => import('./interface-catalogs/catalog-global-search-es'),
  pt: () => import('./interface-catalogs/catalog-global-search-pt'),
  de: () => import('./interface-catalogs/catalog-global-search-de'),
  it: () => import('./interface-catalogs/catalog-global-search-it'),
  ar: () => import('./interface-catalogs/catalog-global-search-ar'),
};

const loaded = new Map<InterfaceLanguage, GlobalSearchCatalog>();
const inFlight = new Map<InterfaceLanguage, Promise<GlobalSearchCatalog>>();

export function loadGlobalSearchCatalog(language: InterfaceLanguage): Promise<GlobalSearchCatalog> {
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

export function globalSearchText(language: InterfaceLanguage, key: GlobalSearchCatalogKey): string {
  const catalog = loaded.get(language) ?? loaded.values().next().value;
  if (catalog === undefined) {
    throw new Error(`Catalogue de la recherche générale « ${language} » lu avant d'être chargé (loadGlobalSearchCatalog).`);
  }
  if (!loaded.has(language)) void loadGlobalSearchCatalog(language).catch(() => undefined);
  return catalog[key];
}

/** Vrai quand le catalogue de la langue est chargé ; le charge sinon. L'hôte ne peint rien avant. */
export function useGlobalSearchCatalog(language: InterfaceLanguage): boolean {
  const [ready, setReady] = useState(() => loaded.has(language));
  useEffect(() => {
    if (loaded.has(language)) {
      setReady(true);
      return undefined;
    }
    let alive = true;
    loadGlobalSearchCatalog(language).then(
      () => alive && setReady(true),
      () => undefined,
    );
    return () => {
      alive = false;
    };
  }, [language]);
  return ready;
}
