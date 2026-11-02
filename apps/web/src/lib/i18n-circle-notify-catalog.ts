/**
 * LE CATALOGUE DE « QUI EST PRÉVENU » (#14063) — les libellés `circleNotify.*`
 * de la section de Réglages › Notifications, dans les sept langues du produit.
 * Même mécanique que `i18n-sounds-mine-catalog.ts` : un `import()` par langue,
 * chargé par la section (`routes/settings-circle-notify.tsx`), jamais au
 * démarrage — le catalogue d'interface est à son plafond (`budgets.json` ›
 * `interface_catalogs`).
 *
 * Les noms des CERCLES ne sont pas ici : ils viennent de `@meeshy/shared`
 * (`RELATION_LEVEL_LABELS`), la table que les trois clients partagent. Seul
 * « Personne » (`NOBODY`), qui n'est pas un cercle, y est.
 *
 * Aucun repli : une clé absente d'une langue est une erreur de compilation
 * (`satisfies CircleNotifyCatalog`) et un témoin rouge ; un catalogue lu avant
 * d'être chargé lève.
 */
import type FrenchCircleNotify from './interface-catalogs/catalog-circle-notify-fr';
import type { InterfaceLanguage } from './interface-language';

export type CircleNotifyCatalogKey = keyof typeof FrenchCircleNotify;

export type CircleNotifyCatalog = Readonly<Record<CircleNotifyCatalogKey, string>>;

type CatalogModule = { readonly default: CircleNotifyCatalog };

const LOADERS: Readonly<Record<InterfaceLanguage, () => Promise<CatalogModule>>> = {
  fr: () => import('./interface-catalogs/catalog-circle-notify-fr'),
  en: () => import('./interface-catalogs/catalog-circle-notify-en'),
  es: () => import('./interface-catalogs/catalog-circle-notify-es'),
  pt: () => import('./interface-catalogs/catalog-circle-notify-pt'),
  de: () => import('./interface-catalogs/catalog-circle-notify-de'),
  it: () => import('./interface-catalogs/catalog-circle-notify-it'),
  ar: () => import('./interface-catalogs/catalog-circle-notify-ar'),
};

const loaded = new Map<InterfaceLanguage, CircleNotifyCatalog>();
const inFlight = new Map<InterfaceLanguage, Promise<CircleNotifyCatalog>>();

export const isCircleNotifyCatalogLoaded = (language: InterfaceLanguage): boolean => loaded.has(language);

export function loadCircleNotifyCatalog(language: InterfaceLanguage): Promise<CircleNotifyCatalog> {
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

export function translateCircleNotify(language: InterfaceLanguage, key: CircleNotifyCatalogKey): string {
  const catalog = loaded.get(language);
  if (catalog === undefined) {
    throw new Error(`Catalogue « Qui est prévenu » « ${language} » lu avant d'être chargé (loadCircleNotifyCatalog).`);
  }
  return catalog[key];
}
