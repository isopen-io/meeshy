import { useEffect, useState } from 'react';

import type FrenchPackPreview from './interface-catalogs/catalog-pack-preview-fr';
import type { InterfaceLanguage } from './interface-language';

/**
 * **LE CATALOGUE DE LA FICHE ET DU PLEIN ÉCRAN D'UNE DÉCORATION** (#16267) —
 * sept langues, un `import()` par langue, chargé au premier toucher d'une
 * rangée de décor : la boutique, elle, ne paie que ses propres libellés
 * (plafond `interface_catalogs_sticker_packs`). Une clé absente d'une langue
 * est une erreur de compilation (`satisfies PackPreviewCatalog`) et un témoin
 * rouge (`i18n-pack-preview-catalog.test.ts`).
 */

type FrenchCatalog = typeof FrenchPackPreview;

export type PackPreviewCatalogKey = keyof FrenchCatalog;

export type PackPreviewCatalog = Readonly<Record<PackPreviewCatalogKey, string>>;

type Placeholders<S extends string> = S extends `${string}{${infer Name}}${infer Rest}` ? Name | Placeholders<Rest> : never;

type TranslateArgs<K extends PackPreviewCatalogKey> = [Placeholders<FrenchCatalog[K]>] extends [never] ? [] : [params: Readonly<Record<Placeholders<FrenchCatalog[K]>, string>>];

type CatalogModule = { readonly default: PackPreviewCatalog };

const LOADERS: Readonly<Record<InterfaceLanguage, () => Promise<CatalogModule>>> = {
  fr: () => import('./interface-catalogs/catalog-pack-preview-fr'),
  en: () => import('./interface-catalogs/catalog-pack-preview-en'),
  es: () => import('./interface-catalogs/catalog-pack-preview-es'),
  pt: () => import('./interface-catalogs/catalog-pack-preview-pt'),
  de: () => import('./interface-catalogs/catalog-pack-preview-de'),
  it: () => import('./interface-catalogs/catalog-pack-preview-it'),
  ar: () => import('./interface-catalogs/catalog-pack-preview-ar'),
};

const loaded = new Map<InterfaceLanguage, PackPreviewCatalog>();
const inFlight = new Map<InterfaceLanguage, Promise<PackPreviewCatalog>>();

export function loadPackPreviewCatalog(language: InterfaceLanguage): Promise<PackPreviewCatalog> {
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

export const isPackPreviewCatalogLoaded = (language: InterfaceLanguage): boolean => loaded.has(language);

/** `true` dès que le catalogue de la langue est là : l'hôte ne monte la fiche ou le plein écran qu'à ce moment. */
export function usePackPreviewCatalog(language: InterfaceLanguage): boolean {
  const [ready, setReady] = useState(() => loaded.has(language));
  useEffect(() => {
    if (loaded.has(language)) {
      setReady(true);
      return undefined;
    }
    let live = true;
    setReady(false);
    void loadPackPreviewCatalog(language).then(
      () => live && setReady(true),
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [language]);
  return ready;
}

const PLACEHOLDER = /\{(\w+)\}/g;

export function translatePackPreview<K extends PackPreviewCatalogKey>(language: InterfaceLanguage, key: K, ...params: TranslateArgs<K>): string;
export function translatePackPreview(language: InterfaceLanguage, key: PackPreviewCatalogKey, params?: Readonly<Record<string, string>>): string {
  const catalog = loaded.get(language) ?? loaded.values().next().value;
  if (catalog === undefined) throw new Error(`Catalogue de l'aperçu des décorations « ${language} » lu avant d'être chargé (loadPackPreviewCatalog).`);
  if (!loaded.has(language)) void loadPackPreviewCatalog(language).catch(() => undefined);
  const text = catalog[key];
  if (params === undefined) return text;
  return text.replace(PLACEHOLDER, (whole, name: string) => params[name] ?? whole);
}
