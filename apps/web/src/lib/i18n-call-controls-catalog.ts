/**
 * LE CATALOGUE DES CONTRÔLES D'UN APPEL EN COURS (#8433, #8438, #8439, #8437)
 * — ajouter des personnes, modérer, réagir, choisir ce qu'on enregistre, et le
 * mot de l'appel entrant d'une invitation, dans les sept langues du produit.
 * Même mécanique que le catalogue de l'enregistrement : un `import()` par
 * langue, chargé AVEC l'écran d'appel (`components/call-layer.tsx`), jamais au
 * démarrage. Le catalogue d'interface a atteint son plafond (`budgets.json` ›
 * `interface_catalogs`).
 *
 * Une clé absente d'une langue est une erreur de compilation
 * (`satisfies CallControlsCatalog`) et un témoin rouge
 * (`i18n-call-controls-catalog.test.ts`). Lu dans une langue pas encore
 * chargée (l'interface a changé de langue pendant l'appel), il sert une langue
 * DÉJÀ chargée et charge la demandée : un écran d'appel ne tombe pas pour un
 * libellé. Rien de chargé du tout lève.
 */
import type FrenchCallControls from './interface-catalogs/catalog-call-controls-fr';
import type { InterfaceLanguage } from './interface-language';

type FrenchCallControlsCatalog = typeof FrenchCallControls;

export type CallControlsCatalogKey = keyof FrenchCallControlsCatalog;

export type CallControlsCatalog = Readonly<Record<CallControlsCatalogKey, string>>;

type Placeholders<S extends string> = S extends `${string}{${infer Name}}${infer Rest}`
  ? Name | Placeholders<Rest>
  : never;

type TranslateCallControlsArgs<K extends CallControlsCatalogKey> = [Placeholders<FrenchCallControlsCatalog[K]>] extends [never]
  ? []
  : [params: Readonly<Record<Placeholders<FrenchCallControlsCatalog[K]>, string>>];

type CatalogModule = { readonly default: CallControlsCatalog };

const LOADERS: Readonly<Record<InterfaceLanguage, () => Promise<CatalogModule>>> = {
  fr: () => import('./interface-catalogs/catalog-call-controls-fr'),
  en: () => import('./interface-catalogs/catalog-call-controls-en'),
  es: () => import('./interface-catalogs/catalog-call-controls-es'),
  pt: () => import('./interface-catalogs/catalog-call-controls-pt'),
  de: () => import('./interface-catalogs/catalog-call-controls-de'),
  it: () => import('./interface-catalogs/catalog-call-controls-it'),
  ar: () => import('./interface-catalogs/catalog-call-controls-ar'),
};

const loaded = new Map<InterfaceLanguage, CallControlsCatalog>();
const inFlight = new Map<InterfaceLanguage, Promise<CallControlsCatalog>>();

export function loadCallControlsCatalog(language: InterfaceLanguage): Promise<CallControlsCatalog> {
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

export function translateCallControls<K extends CallControlsCatalogKey>(
  language: InterfaceLanguage,
  key: K,
  ...params: TranslateCallControlsArgs<K>
): string;
export function translateCallControls(
  language: InterfaceLanguage,
  key: CallControlsCatalogKey,
  params?: Readonly<Record<string, string>>,
): string {
  const catalog = loaded.get(language) ?? loaded.values().next().value;
  if (catalog === undefined) {
    throw new Error(`Catalogue des contrôles d'appel « ${language} » lu avant d'être chargé (loadCallControlsCatalog).`);
  }
  if (!loaded.has(language)) void loadCallControlsCatalog(language).catch(() => undefined);
  const text = catalog[key];
  if (params === undefined) return text;
  return text.replace(PLACEHOLDER, (whole, name: string) => params[name] ?? whole);
}
