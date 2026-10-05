/**
 * LE CATALOGUE DE L'ENREGISTREMENT D'APPEL (#8064) — les libellés
 * `callRecording.*` de la couche de consentement, de l'indicateur « en cours »
 * et du mot de fin, dans les sept langues du produit. Même mécanique que les
 * catalogues d'invitation et d'accueil : un `import()` par langue, chargé avec
 * la couche (`components/call-layer.tsx`) quand une demande existe, jamais au
 * démarrage ni à un appel sans enregistrement. Le catalogue d'interface a
 * atteint son plafond (`budgets.json` › `interface_catalogs`) : il ne porte que
 * les deux libellés du bouton, visible avant toute demande.
 *
 * Aucun repli : une clé absente d'une langue est une erreur de compilation
 * (`satisfies CallRecordingCatalog`) et un témoin rouge
 * (`i18n-call-recording-catalog.test.ts`) ; un catalogue lu avant d'être chargé lève.
 */
import type FrenchCallRecording from './interface-catalogs/catalog-call-recording-fr';
import type { InterfaceLanguage } from './interface-language';

type FrenchCallRecordingCatalog = typeof FrenchCallRecording;

export type CallRecordingCatalogKey = keyof FrenchCallRecordingCatalog;

export type CallRecordingCatalog = Readonly<Record<CallRecordingCatalogKey, string>>;

type Placeholders<S extends string> = S extends `${string}{${infer Name}}${infer Rest}`
  ? Name | Placeholders<Rest>
  : never;

type TranslateCallRecordingArgs<K extends CallRecordingCatalogKey> = [Placeholders<FrenchCallRecordingCatalog[K]>] extends [never]
  ? []
  : [params: Readonly<Record<Placeholders<FrenchCallRecordingCatalog[K]>, string>>];

type CatalogModule = { readonly default: CallRecordingCatalog };

const LOADERS: Readonly<Record<InterfaceLanguage, () => Promise<CatalogModule>>> = {
  fr: () => import('./interface-catalogs/catalog-call-recording-fr'),
  en: () => import('./interface-catalogs/catalog-call-recording-en'),
  es: () => import('./interface-catalogs/catalog-call-recording-es'),
  pt: () => import('./interface-catalogs/catalog-call-recording-pt'),
  de: () => import('./interface-catalogs/catalog-call-recording-de'),
  it: () => import('./interface-catalogs/catalog-call-recording-it'),
  ar: () => import('./interface-catalogs/catalog-call-recording-ar'),
};

const loaded = new Map<InterfaceLanguage, CallRecordingCatalog>();
const inFlight = new Map<InterfaceLanguage, Promise<CallRecordingCatalog>>();

export function loadCallRecordingCatalog(language: InterfaceLanguage): Promise<CallRecordingCatalog> {
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

export function translateCallRecording<K extends CallRecordingCatalogKey>(
  language: InterfaceLanguage,
  key: K,
  ...params: TranslateCallRecordingArgs<K>
): string;
export function translateCallRecording(
  language: InterfaceLanguage,
  key: CallRecordingCatalogKey,
  params?: Readonly<Record<string, string>>,
): string {
  const catalog = loaded.get(language);
  if (catalog === undefined) {
    throw new Error(`Catalogue de l'enregistrement d'appel « ${language} » lu avant d'être chargé (loadCallRecordingCatalog).`);
  }
  const text = catalog[key];
  if (params === undefined) return text;
  return text.replace(PLACEHOLDER, (whole, name: string) => params[name] ?? whole);
}
