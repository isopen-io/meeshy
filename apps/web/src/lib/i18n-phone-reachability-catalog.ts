/**
 * LE CATALOGUE DU TÉLÉPHONE INJOIGNABLE DES PROCHES ET DES SANGS (#18737, TEL-01) — les libellés `phone.*` : annonces de la
 * pastille de synchronisation, glyphe de l'avatar, détail de la fiche et du profil, réglages. Même mécanique que
 * `i18n-battery-catalog.ts` : un `import()` par langue, chargé SEULEMENT quand un téléphone injoignable est servi
 * ou qu'un réglage s'ouvre — le catalogue d'interface est à son plafond (`budgets.json` ›
 * `interface_catalogs`), et une liste sans épisode n'en paie rien.
 *
 * Aucun repli : une clé absente d'une langue est une erreur de compilation (`satisfies PhoneReachabilityCatalog`) et un
 * témoin rouge ; un catalogue lu avant d'être chargé lève.
 */
import { useEffect, useState } from 'react';

import type FrenchPhoneReachability from './interface-catalogs/catalog-phone-reachability-fr';
import type { InterfaceLanguage } from './interface-language';

type FrenchPhoneReachabilityCatalog = typeof FrenchPhoneReachability;

export type PhoneReachabilityCatalogKey = keyof FrenchPhoneReachabilityCatalog;

export type PhoneReachabilityCatalog = Readonly<Record<PhoneReachabilityCatalogKey, string>>;

type Placeholders<S extends string> = S extends `${string}{${infer Name}}${infer Rest}` ? Name | Placeholders<Rest> : never;

type TranslateArgs<K extends PhoneReachabilityCatalogKey> = [Placeholders<FrenchPhoneReachabilityCatalog[K]>] extends [never]
  ? []
  : [params: Readonly<Record<Placeholders<FrenchPhoneReachabilityCatalog[K]>, string>>];

type CatalogModule = { readonly default: PhoneReachabilityCatalog };

const LOADERS: Readonly<Record<InterfaceLanguage, () => Promise<CatalogModule>>> = {
  fr: () => import('./interface-catalogs/catalog-phone-reachability-fr'),
  en: () => import('./interface-catalogs/catalog-phone-reachability-en'),
  es: () => import('./interface-catalogs/catalog-phone-reachability-es'),
  pt: () => import('./interface-catalogs/catalog-phone-reachability-pt'),
  de: () => import('./interface-catalogs/catalog-phone-reachability-de'),
  it: () => import('./interface-catalogs/catalog-phone-reachability-it'),
  ar: () => import('./interface-catalogs/catalog-phone-reachability-ar'),
};

const PLACEHOLDER = /\{(\w+)\}/g;

const loaded = new Map<InterfaceLanguage, PhoneReachabilityCatalog>();
const inFlight = new Map<InterfaceLanguage, Promise<PhoneReachabilityCatalog>>();

export const isPhoneReachabilityCatalogLoaded = (language: InterfaceLanguage): boolean => loaded.has(language);

export function loadPhoneReachabilityCatalog(language: InterfaceLanguage): Promise<PhoneReachabilityCatalog> {
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
export function phoneReachabilityTemplate(language: InterfaceLanguage, key: PhoneReachabilityCatalogKey): string {
  const catalog = loaded.get(language);
  if (catalog === undefined) {
    throw new Error(`Catalogue du téléphone injoignable « ${language} » lu avant d'être chargé (loadPhoneReachabilityCatalog).`);
  }
  return catalog[key];
}

export function translatePhoneReachability<K extends PhoneReachabilityCatalogKey>(language: InterfaceLanguage, key: K, ...params: TranslateArgs<K>): string;
export function translatePhoneReachability(language: InterfaceLanguage, key: PhoneReachabilityCatalogKey, params?: Readonly<Record<string, string>>): string {
  const catalog = loaded.get(language);
  if (catalog === undefined) {
    throw new Error(`Catalogue du téléphone injoignable « ${language} » lu avant d'être chargé (loadPhoneReachabilityCatalog).`);
  }
  const text = catalog[key];
  if (params === undefined) return text;
  return text.replace(PLACEHOLDER, (whole, name: string) => params[name] ?? whole);
}

/**
 * Le catalogue chargé à la demande : `false` tant qu'il n'est pas là, puis le rendu suivant le lit de façon
 * synchrone. `wanted` à `false` (aucun téléphone injoignable servi) : rien ne se charge.
 */
export function usePhoneReachabilityCatalog(language: InterfaceLanguage, wanted = true): boolean {
  const [, setLoaded] = useState<InterfaceLanguage | null>(null);
  const ready = isPhoneReachabilityCatalogLoaded(language);
  useEffect(() => {
    if (!wanted || ready) return undefined;
    let live = true;
    loadPhoneReachabilityCatalog(language).then(
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
