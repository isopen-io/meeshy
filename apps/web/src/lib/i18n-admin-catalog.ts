/**
 * LE CATALOGUE D'INTERFACE D'ADMINISTRATION (#6871, #6834) — les libellés
 * `admin.*` (hors `admin.title`, resté dans le catalogue commun — voir
 * `catalog-fr.ts`), sortis d'`i18n-catalog.ts` parce qu'un lecteur qui
 * n'ouvre jamais un écran d'administration les payait quand même : 84 clés
 * sur 629, 13 % du poids que TOUT lecteur téléchargeait.
 *
 * **Même mécanique que le catalogue commun** — un `import()` par langue,
 * mémorisé, aucun repli — mais le CHARGEMENT est déclenché seulement à
 * l'entrée d'un écran d'administration (`routes/route-table.tsx`, les
 * chargeurs `adminScreen`/`adminUsersScreen`/`adminUserScreen`), jamais au
 * démarrage : c'est précisément ce qui sort ces clés de la somme bornée par
 * `budgets.json › on_demand_chunks.interface_catalogs`.
 *
 * Un catalogue lu avant d'être chargé lève — même contrat que le catalogue
 * commun, jamais un état à maquiller.
 */
import type FrenchAdmin from './interface-catalogs/catalog-admin-fr';
import type { InterfaceLanguage } from './interface-language';

type FrenchAdminCatalog = typeof FrenchAdmin;

export type AdminInterfaceCatalogKey = keyof FrenchAdminCatalog;

export type AdminInterfaceCatalog = Readonly<Record<AdminInterfaceCatalogKey, string>>;

type Placeholders<S extends string> = S extends `${string}{${infer Name}}${infer Rest}`
  ? Name | Placeholders<Rest>
  : never;

type TranslateAdminArgs<K extends AdminInterfaceCatalogKey> = [Placeholders<FrenchAdminCatalog[K]>] extends [never]
  ? []
  : [params: Readonly<Record<Placeholders<FrenchAdminCatalog[K]>, string>>];

/**
 * Les clés SANS paramètre — celles qu'un composant peut recevoir en prop et
 * traduire sans savoir ce qu'elles disent (#7845). Une union de clés dont UNE
 * porte `{count}` exigerait des paramètres pour toutes : le type les écarte
 * donc à la source, plutôt que de laisser chaque appelant le découvrir.
 */
export type AdminPlainCatalogKey = {
  [K in AdminInterfaceCatalogKey]: TranslateAdminArgs<K> extends [] ? K : never;
}[AdminInterfaceCatalogKey];

type CatalogModule = { readonly default: AdminInterfaceCatalog };

const LOADERS: Readonly<Record<InterfaceLanguage, () => Promise<CatalogModule>>> = {
  fr: () => import('./interface-catalogs/catalog-admin-fr'),
  en: () => import('./interface-catalogs/catalog-admin-en'),
  es: () => import('./interface-catalogs/catalog-admin-es'),
  pt: () => import('./interface-catalogs/catalog-admin-pt'),
  de: () => import('./interface-catalogs/catalog-admin-de'),
  it: () => import('./interface-catalogs/catalog-admin-it'),
  ar: () => import('./interface-catalogs/catalog-admin-ar'),
};

const loaded = new Map<InterfaceLanguage, AdminInterfaceCatalog>();
const inFlight = new Map<InterfaceLanguage, Promise<AdminInterfaceCatalog>>();

/**
 * Charge le catalogue d'administration d'une langue — idempotent : la même
 * promesse sert tous les appelants concurrents, et un échec s'oublie pour
 * qu'un appel suivant puisse réessayer. Voir `loadInterfaceCatalog`
 * (`i18n-catalog.ts`), dont ceci est le jumeau à la demande.
 */
export function loadAdminInterfaceCatalog(language: InterfaceLanguage): Promise<AdminInterfaceCatalog> {
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

/**
 * LECTURE EN MODE SUSPENSE — jette la promesse en cours si le catalogue
 * d'administration n'est pas encore chargé. Sans équivalent de
 * `screenPrerequisite` pour ce second catalogue (le routeur n'a qu'un
 * prérequis GLOBAL), les écrans d'administration eux-mêmes ne l'appellent
 * pas : `route-table.tsx` charge déjà ce catalogue EN PARALLÈLE de leur
 * chunk, avant que le composant ne se rende — exposée pour un futur écran
 * d'administration qui se rendrait sans passer par ce chargeur.
 */
export function suspendForAdminInterfaceCatalog(language: InterfaceLanguage): void {
  if (loaded.has(language)) return;
  throw loadAdminInterfaceCatalog(language);
}

const PLACEHOLDER = /\{(\w+)\}/g;

export function translateAdmin<K extends AdminInterfaceCatalogKey>(
  language: InterfaceLanguage,
  key: K,
  ...params: TranslateAdminArgs<K>
): string;
export function translateAdmin(
  language: InterfaceLanguage,
  key: AdminInterfaceCatalogKey,
  params?: Readonly<Record<string, string>>,
): string {
  const catalog = loaded.get(language);
  if (catalog === undefined) {
    throw new Error(`Catalogue d'administration « ${language} » lu avant d'être chargé (loadAdminInterfaceCatalog).`);
  }
  const text = catalog[key];
  if (params === undefined) return text;
  return text.replace(PLACEHOLDER, (whole, name: string) => params[name] ?? whole);
}
