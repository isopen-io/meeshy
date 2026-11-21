/**
 * LE CATALOGUE DE LA VÉRIFICATION D'INACTIVITÉ (#18738, TEL-02) — les libellés `inactivity.*` : annonces de la
 * pastille de synchronisation, « Aucune activité depuis 8:00 » de l'en-tête, de la fiche et du profil, et réglages.
 * Même mécanique que `i18n-phone-reachability-catalog.ts` : un `import()` par langue, chargé SEULEMENT quand une
 * alerte est servie ou qu'un réglage s'ouvre — le catalogue d'interface est à son plafond (`budgets.json` ›
 * `interface_catalogs`), et une liste sans alerte n'en paie rien.
 *
 * Aucun repli : une clé absente d'une langue est une erreur de compilation (`satisfies InactivityCatalog`) et un
 * témoin rouge ; un catalogue lu avant d'être chargé lève.
 */
import { useEffect, useState } from 'react';

import type FrenchInactivity from './interface-catalogs/catalog-inactivity-fr';
import type { InterfaceLanguage } from './interface-language';

type FrenchInactivityCatalog = typeof FrenchInactivity;

export type InactivityCatalogKey = keyof FrenchInactivityCatalog;

export type InactivityCatalog = Readonly<Record<InactivityCatalogKey, string>>;

type Placeholders<S extends string> = S extends `${string}{${infer Name}}${infer Rest}` ? Name | Placeholders<Rest> : never;

type TranslateArgs<K extends InactivityCatalogKey> = [Placeholders<FrenchInactivityCatalog[K]>] extends [never]
  ? []
  : [params: Readonly<Record<Placeholders<FrenchInactivityCatalog[K]>, string>>];

type CatalogModule = { readonly default: InactivityCatalog };

const LOADERS: Readonly<Record<InterfaceLanguage, () => Promise<CatalogModule>>> = {
  fr: () => import('./interface-catalogs/catalog-inactivity-fr'),
  en: () => import('./interface-catalogs/catalog-inactivity-en'),
  es: () => import('./interface-catalogs/catalog-inactivity-es'),
  pt: () => import('./interface-catalogs/catalog-inactivity-pt'),
  de: () => import('./interface-catalogs/catalog-inactivity-de'),
  it: () => import('./interface-catalogs/catalog-inactivity-it'),
  ar: () => import('./interface-catalogs/catalog-inactivity-ar'),
};

const PLACEHOLDER = /\{(\w+)\}/g;

const loaded = new Map<InterfaceLanguage, InactivityCatalog>();
const inFlight = new Map<InterfaceLanguage, Promise<InactivityCatalog>>();

export const isInactivityCatalogLoaded = (language: InterfaceLanguage): boolean => loaded.has(language);

export function loadInactivityCatalog(language: InterfaceLanguage): Promise<InactivityCatalog> {
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

export function translateInactivity<K extends InactivityCatalogKey>(language: InterfaceLanguage, key: K, ...params: TranslateArgs<K>): string;
export function translateInactivity(language: InterfaceLanguage, key: InactivityCatalogKey, params?: Readonly<Record<string, string>>): string {
  const catalog = loaded.get(language);
  if (catalog === undefined) {
    throw new Error(`Catalogue de la vérification d'inactivité « ${language} » lu avant d'être chargé (loadInactivityCatalog).`);
  }
  const text = catalog[key];
  if (params === undefined) return text;
  return text.replace(PLACEHOLDER, (whole, name: string) => params[name] ?? whole);
}

/**
 * Le catalogue chargé à la demande : `false` tant qu'il n'est pas là, puis le rendu suivant le lit de façon
 * synchrone. `wanted` à `false` (aucune alerte servie) : rien ne se charge.
 */
export function useInactivityCatalog(language: InterfaceLanguage, wanted = true): boolean {
  const [, setLoaded] = useState<InterfaceLanguage | null>(null);
  const ready = isInactivityCatalogLoaded(language);
  useEffect(() => {
    if (!wanted || ready) return undefined;
    let live = true;
    loadInactivityCatalog(language).then(
      () => {
        if (live) setLoaded(language);
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [wanted, ready, language]);
  return ready;
}
