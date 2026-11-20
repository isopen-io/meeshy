/**
 * LE CATALOGUE DE LA CHUTE DÉTECTÉE (#18748, SAN-01) — les libellés `fall.*` : annonces de la pastille de
 * synchronisation, « Chute détectée à 16:42 » de l'en-tête, de la fiche et du profil, et réglages. Même mécanique que
 * `i18n-inactivity-catalog.ts` : un `import()` par langue, chargé SEULEMENT quand une alerte est servie ou qu'un
 * réglage s'ouvre — le catalogue d'interface est à son plafond (`budgets.json` › `interface_catalogs`), et une liste
 * sans alerte n'en paie rien.
 *
 * Aucun repli : une clé absente d'une langue est une erreur de compilation (`satisfies FallCatalog`) et un
 * témoin rouge ; un catalogue lu avant d'être chargé lève.
 */
import { useEffect, useState } from 'react';

import type FrenchFall from './interface-catalogs/catalog-fall-fr';
import type { InterfaceLanguage } from './interface-language';

type FrenchFallCatalog = typeof FrenchFall;

export type FallCatalogKey = keyof FrenchFallCatalog;

export type FallCatalog = Readonly<Record<FallCatalogKey, string>>;

type Placeholders<S extends string> = S extends `${string}{${infer Name}}${infer Rest}` ? Name | Placeholders<Rest> : never;

type TranslateArgs<K extends FallCatalogKey> = [Placeholders<FrenchFallCatalog[K]>] extends [never]
  ? []
  : [params: Readonly<Record<Placeholders<FrenchFallCatalog[K]>, string>>];

type CatalogModule = { readonly default: FallCatalog };

const LOADERS: Readonly<Record<InterfaceLanguage, () => Promise<CatalogModule>>> = {
  fr: () => import('./interface-catalogs/catalog-fall-fr'),
  en: () => import('./interface-catalogs/catalog-fall-en'),
  es: () => import('./interface-catalogs/catalog-fall-es'),
  pt: () => import('./interface-catalogs/catalog-fall-pt'),
  de: () => import('./interface-catalogs/catalog-fall-de'),
  it: () => import('./interface-catalogs/catalog-fall-it'),
  ar: () => import('./interface-catalogs/catalog-fall-ar'),
};

const PLACEHOLDER = /\{(\w+)\}/g;

const loaded = new Map<InterfaceLanguage, FallCatalog>();
const inFlight = new Map<InterfaceLanguage, Promise<FallCatalog>>();

export const isFallCatalogLoaded = (language: InterfaceLanguage): boolean => loaded.has(language);

export function loadFallCatalog(language: InterfaceLanguage): Promise<FallCatalog> {
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

export function translateFall<K extends FallCatalogKey>(language: InterfaceLanguage, key: K, ...params: TranslateArgs<K>): string;
export function translateFall(language: InterfaceLanguage, key: FallCatalogKey, params?: Readonly<Record<string, string>>): string {
  const catalog = loaded.get(language);
  if (catalog === undefined) {
    throw new Error(`Catalogue de la chute détectée « ${language} » lu avant d'être chargé (loadFallCatalog).`);
  }
  const text = catalog[key];
  if (params === undefined) return text;
  return text.replace(PLACEHOLDER, (whole, name: string) => params[name] ?? whole);
}

/**
 * Le catalogue chargé à la demande : `false` tant qu'il n'est pas là, puis le rendu suivant le lit de façon
 * synchrone. `wanted` à `false` (aucune alerte servie) : rien ne se charge.
 */
export function useFallCatalog(language: InterfaceLanguage, wanted = true): boolean {
  const [, setLoaded] = useState<InterfaceLanguage | null>(null);
  const ready = isFallCatalogLoaded(language);
  useEffect(() => {
    if (!wanted || ready) return undefined;
    let live = true;
    loadFallCatalog(language).then(
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
