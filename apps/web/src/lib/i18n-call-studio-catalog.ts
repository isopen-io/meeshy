/**
 * LE CATALOGUE DU STUDIO D'UN APPEL VIDÉO (#8551, #8552) — les effets de
 * visage (lissage, crapaud, ange, démon, éruption), les montages et la
 * capture, dans les sept langues du produit. Même mécanique que le catalogue
 * des contrôles d'appel : un `import()` par langue — mais chargé avec le
 * PANNEAU qui s'en sert (effets ou capture), jamais avec l'écran d'appel : un
 * appel où personne n'ouvre ces panneaux ne le télécharge pas.
 *
 * Une clé absente d'une langue est une erreur de compilation
 * (`satisfies CallStudioCatalog`) et un témoin rouge
 * (`i18n-call-studio-catalog.test.ts`). Lu dans une langue pas encore chargée,
 * il sert une langue DÉJÀ chargée et charge la demandée. Rien de chargé du
 * tout lève.
 */
import type FrenchCallStudio from './interface-catalogs/catalog-call-studio-fr';
import type { InterfaceLanguage } from './interface-language';

type FrenchCallStudioCatalog = typeof FrenchCallStudio;

export type CallStudioCatalogKey = keyof FrenchCallStudioCatalog;

export type CallStudioCatalog = Readonly<Record<CallStudioCatalogKey, string>>;

type Placeholders<S extends string> = S extends `${string}{${infer Name}}${infer Rest}`
  ? Name | Placeholders<Rest>
  : never;

type TranslateCallStudioArgs<K extends CallStudioCatalogKey> = [Placeholders<FrenchCallStudioCatalog[K]>] extends [never]
  ? []
  : [params: Readonly<Record<Placeholders<FrenchCallStudioCatalog[K]>, string>>];

type CatalogModule = { readonly default: CallStudioCatalog };

const LOADERS: Readonly<Record<InterfaceLanguage, () => Promise<CatalogModule>>> = {
  fr: () => import('./interface-catalogs/catalog-call-studio-fr'),
  en: () => import('./interface-catalogs/catalog-call-studio-en'),
  es: () => import('./interface-catalogs/catalog-call-studio-es'),
  pt: () => import('./interface-catalogs/catalog-call-studio-pt'),
  de: () => import('./interface-catalogs/catalog-call-studio-de'),
  it: () => import('./interface-catalogs/catalog-call-studio-it'),
  ar: () => import('./interface-catalogs/catalog-call-studio-ar'),
};

const loaded = new Map<InterfaceLanguage, CallStudioCatalog>();
const inFlight = new Map<InterfaceLanguage, Promise<CallStudioCatalog>>();

export function loadCallStudioCatalog(language: InterfaceLanguage): Promise<CallStudioCatalog> {
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

const PLACEHOLDER = /\{(\w+)\}/g;

export function translateCallStudio<K extends CallStudioCatalogKey>(
  language: InterfaceLanguage,
  key: K,
  ...params: TranslateCallStudioArgs<K>
): string;
export function translateCallStudio(
  language: InterfaceLanguage,
  key: CallStudioCatalogKey,
  params?: Readonly<Record<string, string>>,
): string {
  const catalog = loaded.get(language) ?? loaded.values().next().value;
  if (catalog === undefined) {
    throw new Error(`Catalogue du studio d'appel « ${language} » lu avant d'être chargé (loadCallStudioCatalog).`);
  }
  if (!loaded.has(language)) void loadCallStudioCatalog(language).catch(() => undefined);
  const text = catalog[key];
  if (params === undefined) return text;
  return text.replace(PLACEHOLDER, (whole, name: string) => params[name] ?? whole);
}
