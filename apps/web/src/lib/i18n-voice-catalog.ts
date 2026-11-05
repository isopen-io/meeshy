/**
 * LE CATALOGUE DE LA VOIX (#16419) — les libellés `voice.*` de la section
 * Réglages › Voix et de la note posée sous mon propre vocal quand le
 * consentement vocal manque, dans les sept langues du produit. Même mécanique
 * que `i18n-circle-notify-catalog.ts` : un `import()` par langue, chargé à la
 * demande, jamais au démarrage — le catalogue d'interface est à son plafond
 * (`budgets.json` › `interface_catalogs`).
 *
 * Aucun repli : une clé absente d'une langue est une erreur de compilation
 * (`satisfies VoiceCatalog`) et un témoin rouge ; un catalogue lu avant
 * d'être chargé lève.
 */
import type FrenchVoice from './interface-catalogs/catalog-voice-fr';
import type { InterfaceLanguage } from './interface-language';

export type VoiceCatalogKey = keyof typeof FrenchVoice;

export type VoiceCatalog = Readonly<Record<VoiceCatalogKey, string>>;

type CatalogModule = { readonly default: VoiceCatalog };

const LOADERS: Readonly<Record<InterfaceLanguage, () => Promise<CatalogModule>>> = {
  fr: () => import('./interface-catalogs/catalog-voice-fr'),
  en: () => import('./interface-catalogs/catalog-voice-en'),
  es: () => import('./interface-catalogs/catalog-voice-es'),
  pt: () => import('./interface-catalogs/catalog-voice-pt'),
  de: () => import('./interface-catalogs/catalog-voice-de'),
  it: () => import('./interface-catalogs/catalog-voice-it'),
  ar: () => import('./interface-catalogs/catalog-voice-ar'),
};

const loaded = new Map<InterfaceLanguage, VoiceCatalog>();
const inFlight = new Map<InterfaceLanguage, Promise<VoiceCatalog>>();

export const isVoiceCatalogLoaded = (language: InterfaceLanguage): boolean => loaded.has(language);

export function loadVoiceCatalog(language: InterfaceLanguage): Promise<VoiceCatalog> {
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

export function translateVoice(language: InterfaceLanguage, key: VoiceCatalogKey): string {
  const catalog = loaded.get(language);
  if (catalog === undefined) {
    throw new Error(`Catalogue « Voix » « ${language} » lu avant d'être chargé (loadVoiceCatalog).`);
  }
  return catalog[key];
}
