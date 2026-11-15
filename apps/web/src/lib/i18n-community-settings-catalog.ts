/**
 * LE CATALOGUE DES RÉGLAGES D'UNE COMMUNAUTÉ (#6377) — les libellés
 * `community.settings.*` de l'écran Réglages (`routes/community-settings.tsx`),
 * dans les sept langues, repris d'iOS (`CommunitySettingsScreen.swift`). Un
 * `import()` par langue, chargé AVEC cet écran (`routes/route-table.tsx`),
 * jamais au démarrage ni avec le détail : le catalogue d'interface est à son
 * plafond, et celui de l'adhésion aussi (`budgets.json`).
 *
 * Aucun repli : une clé absente d'une langue est une erreur de compilation
 * (`satisfies CommunitySettingsCatalog`) ; un catalogue lu avant d'être
 * chargé lève.
 */
import type FrenchSettings from './interface-catalogs/catalog-community-settings-fr';
import type { InterfaceLanguage } from './interface-language';

type FrenchSettingsCatalog = typeof FrenchSettings;

export type CommunitySettingsCatalogKey = keyof FrenchSettingsCatalog;

export type CommunitySettingsCatalog = Readonly<Record<CommunitySettingsCatalogKey, string>>;

type Placeholders<S extends string> = S extends `${string}{${infer Name}}${infer Rest}` ? Name | Placeholders<Rest> : never;

type TranslateSettingsArgs<K extends CommunitySettingsCatalogKey> = [Placeholders<FrenchSettingsCatalog[K]>] extends [never]
  ? []
  : [params: Readonly<Record<Placeholders<FrenchSettingsCatalog[K]>, string>>];

type CatalogModule = { readonly default: CommunitySettingsCatalog };

const LOADERS: Readonly<Record<InterfaceLanguage, () => Promise<CatalogModule>>> = {
  fr: () => import('./interface-catalogs/catalog-community-settings-fr'),
  en: () => import('./interface-catalogs/catalog-community-settings-en'),
  es: () => import('./interface-catalogs/catalog-community-settings-es'),
  pt: () => import('./interface-catalogs/catalog-community-settings-pt'),
  de: () => import('./interface-catalogs/catalog-community-settings-de'),
  it: () => import('./interface-catalogs/catalog-community-settings-it'),
  ar: () => import('./interface-catalogs/catalog-community-settings-ar'),
};

const loaded = new Map<InterfaceLanguage, CommunitySettingsCatalog>();
const inFlight = new Map<InterfaceLanguage, Promise<CommunitySettingsCatalog>>();

export function loadCommunitySettingsCatalog(language: InterfaceLanguage): Promise<CommunitySettingsCatalog> {
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

export const isCommunitySettingsCatalogLoaded = (language: InterfaceLanguage): boolean => loaded.has(language);

const PLACEHOLDER = /\{(\w+)\}/g;

export function translateCommunitySettings<K extends CommunitySettingsCatalogKey>(language: InterfaceLanguage, key: K, ...params: TranslateSettingsArgs<K>): string;
export function translateCommunitySettings(language: InterfaceLanguage, key: CommunitySettingsCatalogKey, params?: Readonly<Record<string, string>>): string {
  const catalog = loaded.get(language);
  if (catalog === undefined) {
    throw new Error(`Catalogue des réglages d'une communauté « ${language} » lu avant d'être chargé (loadCommunitySettingsCatalog).`);
  }
  const text = catalog[key];
  if (params === undefined) return text;
  return text.replace(PLACEHOLDER, (whole, name: string) => params[name] ?? whole);
}
