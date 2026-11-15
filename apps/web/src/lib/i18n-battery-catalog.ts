/**
 * LE CATALOGUE DE LA BATTERIE DES PROCHES ET DES SANGS (#14147) — les libellés `battery.*` : annonces de la
 * pastille de synchronisation, icône de l'avatar, détail de la fiche, relevé à la demande, réglages. Même
 * mécanique que `i18n-circles-catalog.ts` : un `import()` par langue, chargé SEULEMENT quand une batterie est
 * servie ou qu'un réglage s'ouvre — le catalogue d'interface est à son plafond (`budgets.json` ›
 * `interface_catalogs`), et une liste sans épisode n'en paie rien.
 *
 * Aucun repli : une clé absente d'une langue est une erreur de compilation (`satisfies BatteryCatalog`) et un
 * témoin rouge ; un catalogue lu avant d'être chargé lève.
 */
import { useEffect, useState } from 'react';

import type FrenchBattery from './interface-catalogs/catalog-battery-fr';
import type { InterfaceLanguage } from './interface-language';

type FrenchBatteryCatalog = typeof FrenchBattery;

export type BatteryCatalogKey = keyof FrenchBatteryCatalog;

export type BatteryCatalog = Readonly<Record<BatteryCatalogKey, string>>;

type Placeholders<S extends string> = S extends `${string}{${infer Name}}${infer Rest}` ? Name | Placeholders<Rest> : never;

type TranslateArgs<K extends BatteryCatalogKey> = [Placeholders<FrenchBatteryCatalog[K]>] extends [never]
  ? []
  : [params: Readonly<Record<Placeholders<FrenchBatteryCatalog[K]>, string>>];

type CatalogModule = { readonly default: BatteryCatalog };

const LOADERS: Readonly<Record<InterfaceLanguage, () => Promise<CatalogModule>>> = {
  fr: () => import('./interface-catalogs/catalog-battery-fr'),
  en: () => import('./interface-catalogs/catalog-battery-en'),
  es: () => import('./interface-catalogs/catalog-battery-es'),
  pt: () => import('./interface-catalogs/catalog-battery-pt'),
  de: () => import('./interface-catalogs/catalog-battery-de'),
  it: () => import('./interface-catalogs/catalog-battery-it'),
  ar: () => import('./interface-catalogs/catalog-battery-ar'),
};

const PLACEHOLDER = /\{(\w+)\}/g;

const loaded = new Map<InterfaceLanguage, BatteryCatalog>();
const inFlight = new Map<InterfaceLanguage, Promise<BatteryCatalog>>();

export const isBatteryCatalogLoaded = (language: InterfaceLanguage): boolean => loaded.has(language);

export function loadBatteryCatalog(language: InterfaceLanguage): Promise<BatteryCatalog> {
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

/** Le gabarit brut d'une clé, ses `{marques}` intactes : pour un appelant qui choisit sa clé parmi plusieurs. */
export function batteryTemplate(language: InterfaceLanguage, key: BatteryCatalogKey): string {
  const catalog = loaded.get(language);
  if (catalog === undefined) {
    throw new Error(`Catalogue de la batterie « ${language} » lu avant d'être chargé (loadBatteryCatalog).`);
  }
  return catalog[key];
}

export function translateBattery<K extends BatteryCatalogKey>(language: InterfaceLanguage, key: K, ...params: TranslateArgs<K>): string;
export function translateBattery(language: InterfaceLanguage, key: BatteryCatalogKey, params?: Readonly<Record<string, string>>): string {
  const catalog = loaded.get(language);
  if (catalog === undefined) {
    throw new Error(`Catalogue de la batterie « ${language} » lu avant d'être chargé (loadBatteryCatalog).`);
  }
  const text = catalog[key];
  if (params === undefined) return text;
  return text.replace(PLACEHOLDER, (whole, name: string) => params[name] ?? whole);
}

/**
 * Le catalogue chargé à la demande : `false` tant qu'il n'est pas là, puis le rendu suivant le lit de façon
 * synchrone. `wanted` à `false` (aucune batterie servie) : rien ne se charge.
 */
export function useBatteryCatalog(language: InterfaceLanguage, wanted = true): boolean {
  const [, setLoaded] = useState<InterfaceLanguage | null>(null);
  const ready = isBatteryCatalogLoaded(language);
  useEffect(() => {
    if (!wanted || ready) return undefined;
    let live = true;
    loadBatteryCatalog(language).then(
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
