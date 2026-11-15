/**
 * LE CATALOGUE DE « MES SONS » (#9848) — les libellés `soundsMine.*` de
 * l'écran `/me/sounds` (Réglages › Outils), dans les sept langues du produit.
 * Même mécanique que l'accueil (`i18n-onboarding-catalog.ts`) : un `import()`
 * par langue, chargé par l'écran (`routes/sounds-mine.tsx`), jamais au
 * démarrage — le catalogue d'interface est à son plafond (`budgets.json` ›
 * `interface_catalogs`), et seul l'auteur qui ouvre sa bibliothèque en paie
 * les octets. L'écran l'attend lui-même (`SoundsMineScreen`) : la table des
 * routes est dans la première peinture, elle aussi à son plafond.
 *
 * Aucun repli : une clé absente d'une langue est une erreur de compilation
 * (`satisfies SoundsMineCatalog`) et un témoin rouge
 * (`i18n-sounds-mine-catalog.test.ts`) ; un catalogue lu avant d'être chargé
 * lève.
 */
import type FrenchSoundsMine from './interface-catalogs/catalog-sounds-mine-fr';
import type { InterfaceLanguage } from './interface-language';

type FrenchSoundsMineCatalog = typeof FrenchSoundsMine;

export type SoundsMineCatalogKey = keyof FrenchSoundsMineCatalog;

export type SoundsMineCatalog = Readonly<Record<SoundsMineCatalogKey, string>>;

type Placeholders<S extends string> = S extends `${string}{${infer Name}}${infer Rest}`
  ? Name | Placeholders<Rest>
  : never;

type TranslateSoundsMineArgs<K extends SoundsMineCatalogKey> = [Placeholders<FrenchSoundsMineCatalog[K]>] extends [never]
  ? []
  : [params: Readonly<Record<Placeholders<FrenchSoundsMineCatalog[K]>, string>>];

type CatalogModule = { readonly default: SoundsMineCatalog };

const LOADERS: Readonly<Record<InterfaceLanguage, () => Promise<CatalogModule>>> = {
  fr: () => import('./interface-catalogs/catalog-sounds-mine-fr'),
  en: () => import('./interface-catalogs/catalog-sounds-mine-en'),
  es: () => import('./interface-catalogs/catalog-sounds-mine-es'),
  pt: () => import('./interface-catalogs/catalog-sounds-mine-pt'),
  de: () => import('./interface-catalogs/catalog-sounds-mine-de'),
  it: () => import('./interface-catalogs/catalog-sounds-mine-it'),
  ar: () => import('./interface-catalogs/catalog-sounds-mine-ar'),
};

const loaded = new Map<InterfaceLanguage, SoundsMineCatalog>();
const inFlight = new Map<InterfaceLanguage, Promise<SoundsMineCatalog>>();

export const isSoundsMineCatalogLoaded = (language: InterfaceLanguage): boolean => loaded.has(language);

export function loadSoundsMineCatalog(language: InterfaceLanguage): Promise<SoundsMineCatalog> {
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

export function translateSoundsMine<K extends SoundsMineCatalogKey>(
  language: InterfaceLanguage,
  key: K,
  ...params: TranslateSoundsMineArgs<K>
): string;
export function translateSoundsMine(
  language: InterfaceLanguage,
  key: SoundsMineCatalogKey,
  params?: Readonly<Record<string, string>>,
): string {
  const catalog = loaded.get(language);
  if (catalog === undefined) {
    throw new Error(`Catalogue de « Mes sons » « ${language} » lu avant d'être chargé (loadSoundsMineCatalog).`);
  }
  const text = catalog[key];
  if (params === undefined) return text;
  return text.replace(PLACEHOLDER, (whole, name: string) => params[name] ?? whole);
}
