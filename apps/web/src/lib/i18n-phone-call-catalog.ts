/**
 * LE CATALOGUE D'« EN APPEL » (#18753, ACT-01) — les libellés `call.*` : annonces de la pastille de synchronisation,
 * « En appel depuis 14:00 » de l'en-tête, de la fiche et du profil, et réglages. Même mécanique que
 * `i18n-inactivity-catalog.ts` : un `import()` par langue, chargé SEULEMENT quand un état est servi ou qu'un réglage
 * s'ouvre — le catalogue d'interface est à son plafond (`budgets.json` › `interface_catalogs`), et une liste sans
 * appel n'en paie rien.
 *
 * Aucun repli : une clé absente d'une langue est une erreur de compilation (`satisfies PhoneCallCatalog`) et un
 * témoin rouge ; un catalogue lu avant d'être chargé lève.
 */
import { useEffect, useState } from 'react';

import type FrenchPhoneCall from './interface-catalogs/catalog-phone-call-fr';
import type { InterfaceLanguage } from './interface-language';

type FrenchPhoneCallCatalog = typeof FrenchPhoneCall;

export type PhoneCallCatalogKey = keyof FrenchPhoneCallCatalog;

export type PhoneCallCatalog = Readonly<Record<PhoneCallCatalogKey, string>>;

type Placeholders<S extends string> = S extends `${string}{${infer Name}}${infer Rest}` ? Name | Placeholders<Rest> : never;

type TranslateArgs<K extends PhoneCallCatalogKey> = [Placeholders<FrenchPhoneCallCatalog[K]>] extends [never]
  ? []
  : [params: Readonly<Record<Placeholders<FrenchPhoneCallCatalog[K]>, string>>];

type CatalogModule = { readonly default: PhoneCallCatalog };

const LOADERS: Readonly<Record<InterfaceLanguage, () => Promise<CatalogModule>>> = {
  fr: () => import('./interface-catalogs/catalog-phone-call-fr'),
  en: () => import('./interface-catalogs/catalog-phone-call-en'),
  es: () => import('./interface-catalogs/catalog-phone-call-es'),
  pt: () => import('./interface-catalogs/catalog-phone-call-pt'),
  de: () => import('./interface-catalogs/catalog-phone-call-de'),
  it: () => import('./interface-catalogs/catalog-phone-call-it'),
  ar: () => import('./interface-catalogs/catalog-phone-call-ar'),
};

const PLACEHOLDER = /\{(\w+)\}/g;

const loaded = new Map<InterfaceLanguage, PhoneCallCatalog>();
const inFlight = new Map<InterfaceLanguage, Promise<PhoneCallCatalog>>();

export const isPhoneCallCatalogLoaded = (language: InterfaceLanguage): boolean => loaded.has(language);

export function loadPhoneCallCatalog(language: InterfaceLanguage): Promise<PhoneCallCatalog> {
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

export function translatePhoneCall<K extends PhoneCallCatalogKey>(language: InterfaceLanguage, key: K, ...params: TranslateArgs<K>): string;
export function translatePhoneCall(language: InterfaceLanguage, key: PhoneCallCatalogKey, params?: Readonly<Record<string, string>>): string {
  const catalog = loaded.get(language);
  if (catalog === undefined) {
    throw new Error(`Catalogue d’« en appel » « ${language} » lu avant d'être chargé (loadPhoneCallCatalog).`);
  }
  const text = catalog[key];
  if (params === undefined) return text;
  return text.replace(PLACEHOLDER, (whole, name: string) => params[name] ?? whole);
}

/**
 * Le catalogue chargé à la demande : `false` tant qu'il n'est pas là, puis le rendu suivant le lit de façon
 * synchrone. `wanted` à `false` (aucun appel servi) : rien ne se charge.
 */
export function usePhoneCallCatalog(language: InterfaceLanguage, wanted = true): boolean {
  const [, setLoaded] = useState<InterfaceLanguage | null>(null);
  const ready = isPhoneCallCatalogLoaded(language);
  useEffect(() => {
    if (!wanted || ready) return undefined;
    let live = true;
    loadPhoneCallCatalog(language).then(
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
