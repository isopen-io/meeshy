/**
 * LE CATALOGUE DU MOT DE PASSE OUBLIÉ (#10823) — les libellés `recovery.*` du
 * parcours « mot de passe oublié » (`routes/forgot-password.tsx`) et de la
 * réinitialisation (`components/reset-password-flow.tsx`), dans les sept
 * langues du produit, avec les valeurs d'iOS (`auth.forgotPassword.*`). Un
 * `import()` par langue, chargé AVEC ces deux routes (`routes/route-table.tsx`)
 * et jamais au démarrage : le catalogue d'interface est à son plafond
 * (`budgets.json` › `interface_catalogs`). Ce que l'écran partage avec la
 * connexion (adresse, envoi, hors ligne, retour) reste au catalogue d'interface.
 *
 * Aucun repli : une clé absente d'une langue est une erreur de compilation
 * (`satisfies AccountRecoveryCatalog`) et un témoin rouge
 * (`i18n-account-recovery-catalog.test.ts`) ; un catalogue lu avant d'être
 * chargé lève.
 */
import type FrenchRecovery from './interface-catalogs/catalog-account-recovery-fr';
import type { InterfaceLanguage } from './interface-language';

type FrenchRecoveryCatalog = typeof FrenchRecovery;

export type AccountRecoveryCatalogKey = keyof FrenchRecoveryCatalog;

export type AccountRecoveryCatalog = Readonly<Record<AccountRecoveryCatalogKey, string>>;

type Placeholders<S extends string> = S extends `${string}{${infer Name}}${infer Rest}` ? Name | Placeholders<Rest> : never;

type TranslateRecoveryArgs<K extends AccountRecoveryCatalogKey> = [Placeholders<FrenchRecoveryCatalog[K]>] extends [never]
  ? []
  : [params: Readonly<Record<Placeholders<FrenchRecoveryCatalog[K]>, string>>];

type CatalogModule = { readonly default: AccountRecoveryCatalog };

const LOADERS: Readonly<Record<InterfaceLanguage, () => Promise<CatalogModule>>> = {
  fr: () => import('./interface-catalogs/catalog-account-recovery-fr'),
  en: () => import('./interface-catalogs/catalog-account-recovery-en'),
  es: () => import('./interface-catalogs/catalog-account-recovery-es'),
  pt: () => import('./interface-catalogs/catalog-account-recovery-pt'),
  de: () => import('./interface-catalogs/catalog-account-recovery-de'),
  it: () => import('./interface-catalogs/catalog-account-recovery-it'),
  ar: () => import('./interface-catalogs/catalog-account-recovery-ar'),
};

const loaded = new Map<InterfaceLanguage, AccountRecoveryCatalog>();
const inFlight = new Map<InterfaceLanguage, Promise<AccountRecoveryCatalog>>();

export function loadAccountRecoveryCatalog(language: InterfaceLanguage): Promise<AccountRecoveryCatalog> {
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

export const isAccountRecoveryCatalogLoaded = (language: InterfaceLanguage): boolean => loaded.has(language);

const PLACEHOLDER = /\{(\w+)\}/g;

export function translateRecovery<K extends AccountRecoveryCatalogKey>(language: InterfaceLanguage, key: K, ...params: TranslateRecoveryArgs<K>): string;
export function translateRecovery(language: InterfaceLanguage, key: AccountRecoveryCatalogKey, params?: Readonly<Record<string, string>>): string {
  const catalog = loaded.get(language);
  if (catalog === undefined) {
    throw new Error(`Catalogue du mot de passe oublié « ${language} » lu avant d'être chargé (loadAccountRecoveryCatalog).`);
  }
  const text = catalog[key];
  if (params === undefined) return text;
  return text.replace(PLACEHOLDER, (whole, name: string) => params[name] ?? whole);
}
