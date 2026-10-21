/**
 * LE CATALOGUE DES LIBELLÉS D'USAGE DES CADRES (#10146) — « Utilisable :
 * appels vidéo et captures », « Capture photo et vidéo uniquement », « Rang
 * Ambassadeur IV uniquement »… : ce que toute puce ou vignette de cadre
 * affiche, dans les sept langues. Les clés sont celles de la loi partagée
 * (`FRAME_USAGE_LABEL_KEYS`) ; `describeFrameUsage` choisit la clé, ce module
 * la traduit. Un `import()` par langue, chargé avec la surface qui montre des
 * cadres (le mode Montage d'un appel, la photo du jeu), jamais au démarrage.
 *
 * Une clé absente d'une langue est une erreur de compilation
 * (`satisfies FrameUsageCatalog`) et un témoin rouge
 * (`i18n-frame-usage-catalog.test.ts`). Lu dans une langue pas encore chargée,
 * il sert une langue DÉJÀ chargée et charge la demandée. Rien de chargé du
 * tout lève.
 */
import type { FrameUsageLabel, FrameUsageLabelKey } from '@meeshy/shared/types/frame-usage';

import type { InterfaceLanguage } from './interface-language';

export type FrameUsageCatalog = Readonly<Record<FrameUsageLabelKey, string>>;

type CatalogModule = { readonly default: FrameUsageCatalog };

const LOADERS: Readonly<Record<InterfaceLanguage, () => Promise<CatalogModule>>> = {
  fr: () => import('./interface-catalogs/catalog-frame-usage-fr'),
  en: () => import('./interface-catalogs/catalog-frame-usage-en'),
  es: () => import('./interface-catalogs/catalog-frame-usage-es'),
  pt: () => import('./interface-catalogs/catalog-frame-usage-pt'),
  de: () => import('./interface-catalogs/catalog-frame-usage-de'),
  it: () => import('./interface-catalogs/catalog-frame-usage-it'),
  ar: () => import('./interface-catalogs/catalog-frame-usage-ar'),
};

const loaded = new Map<InterfaceLanguage, FrameUsageCatalog>();
const inFlight = new Map<InterfaceLanguage, Promise<FrameUsageCatalog>>();

export function loadFrameUsageCatalog(language: InterfaceLanguage): Promise<FrameUsageCatalog> {
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

/**
 * Le texte d'un libellé d'usage. Les paramètres de la loi sont des CLÉS (un
 * rang, une rareté, une famille) : l'hôte remet leurs noms traduits par
 * `names` ; à défaut, la valeur de la loi (la division, déjà en chiffres romains).
 */
export function frameUsageText(language: InterfaceLanguage, label: FrameUsageLabel, names: Readonly<Record<string, string>> = {}): string {
  const catalog = loaded.get(language) ?? loaded.values().next().value;
  if (catalog === undefined) {
    throw new Error(`Catalogue des libellés d'usage des cadres « ${language} » lu avant d'être chargé (loadFrameUsageCatalog).`);
  }
  if (!loaded.has(language)) void loadFrameUsageCatalog(language).catch(() => undefined);
  return catalog[label.key].replace(PLACEHOLDER, (whole, name: string) => names[name] ?? label.params[name] ?? whole);
}
