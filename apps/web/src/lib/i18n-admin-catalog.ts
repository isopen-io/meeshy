/**
 * **L'ADMINISTRATION PARLE QUATRE LANGUES** (directive porteur 2026-09-30,
 * `decisions.md` D-159) : français, anglais, espagnol, portugais — « c'est
 * tout ». Une langue d'interface hors de ces quatre (allemand, italien, arabe)
 * lit l'administration en ANGLAIS : textes ET formats (dates, nombres, noms de
 * langue), `lang="en" dir="ltr"` à la racine de l'espace. Il n'existe plus de
 * catalogue d'administration de, it ni ar ; les chaînes HORS de l'espace
 * d'administration (catalogue commun : `admin.title`, lu par la rangée des
 * Réglages et le menu flottant) gardent leurs sept langues.
 *
 * `adminLanguageOf` est la règle UNIQUE, `currentAdminLanguage` sa lecture sur
 * le document : tout écran d'administration en tire la langue qu'il passe à
 * `translateAdmin`, au catalogue commun (`translate`) et à chaque `Intl`.
 *
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
import { loadInterfaceCatalog } from './i18n-catalog';
import type FrenchAdmin from './interface-catalogs/catalog-admin-fr';
import { currentInterfaceLanguage, type InterfaceLanguage } from './interface-language';

export const ADMIN_LANGUAGES = ['fr', 'en', 'es', 'pt'] as const;

export type AdminLanguage = (typeof ADMIN_LANGUAGES)[number];

const ADMIN_FALLBACK: AdminLanguage = 'en';

const isAdminLanguage = (code: string): code is AdminLanguage => (ADMIN_LANGUAGES as readonly string[]).includes(code);

/**
 * La langue dans laquelle l'administration se lit pour une langue d'interface
 * donnée : elle-même quand l'administration la parle, l'anglais sinon. Le
 * paramètre est une chaîne et non `InterfaceLanguage` : un appelant égaré qui
 * passerait une langue inconnue lit l'anglais, il ne plante pas.
 */
export function adminLanguageOf(interfaceLanguage: string): AdminLanguage {
  return isAdminLanguage(interfaceLanguage) ? interfaceLanguage : ADMIN_FALLBACK;
}

/** La langue d'administration COURANTE — la langue d'interface du document, passée par `adminLanguageOf`. */
export function currentAdminLanguage(): AdminLanguage {
  return adminLanguageOf(currentInterfaceLanguage());
}

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
 * traduire sans savoir ce qu'elles disent (#7845, #7999). Une union de clés dont UNE
 * porte `{count}` exigerait des paramètres pour toutes : le type les écarte
 * donc à la source, plutôt que de laisser chaque appelant le découvrir.
 */
export type AdminPlainCatalogKey = {
  [K in AdminInterfaceCatalogKey]: TranslateAdminArgs<K> extends [] ? K : never;
}[AdminInterfaceCatalogKey];

type CatalogModule = { readonly default: AdminInterfaceCatalog };

const LOADERS: Readonly<Record<AdminLanguage, () => Promise<CatalogModule>>> = {
  fr: () => import('./interface-catalogs/catalog-admin-fr'),
  en: () => import('./interface-catalogs/catalog-admin-en'),
  es: () => import('./interface-catalogs/catalog-admin-es'),
  pt: () => import('./interface-catalogs/catalog-admin-pt'),
};

const loaded = new Map<AdminLanguage, AdminInterfaceCatalog>();
const inFlight = new Map<AdminLanguage, Promise<AdminInterfaceCatalog>>();

/**
 * Charge ce que l'espace d'administration lit dans une langue — idempotent :
 * la même promesse sert tous les appelants concurrents, et un échec s'oublie
 * pour qu'un appel suivant puisse réessayer. Voir `loadInterfaceCatalog`
 * (`i18n-catalog.ts`), dont ceci est le jumeau à la demande.
 *
 * La langue passe par `adminLanguageOf` : `de` charge le catalogue anglais.
 * **Et le catalogue COMMUN de cette même langue est chargé avec lui** — un
 * écran d'administration lit aussi `admin.title`, `pending.back`,
 * `common.cancel`, et les lit dans la langue de l'ADMINISTRATION, pas dans
 * celle de l'interface : pour un lecteur allemand, le catalogue commun
 * `en` n'a jamais été chargé par rien d'autre, et `translate` lèverait au
 * premier rendu. Un seul chargeur garantit les deux lectures ; aucun chargeur
 * de route n'a à se souvenir du second.
 */
export function loadAdminInterfaceCatalog(interfaceLanguage: InterfaceLanguage): Promise<AdminInterfaceCatalog> {
  const language = adminLanguageOf(interfaceLanguage);
  const ready = loaded.get(language);
  if (ready !== undefined) return Promise.resolve(ready);
  const pending = inFlight.get(language);
  if (pending !== undefined) return pending;

  const request = Promise.all([LOADERS[language](), loadInterfaceCatalog(language)]).then(
    ([{ default: catalog }]) => {
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
 * prérequis GLOBAL), `route-table.tsx` charge ce catalogue EN PARALLÈLE du
 * chunk de l'écran, avant que le composant ne se rende.
 *
 * **Chaque écran d'administration l'appelle AUSSI, en tête de son rendu.** Le
 * chargeur d'une route ne court qu'UNE fois par session (`lazy` mémorise le
 * module) : un lecteur qui ouvre l'administration, change de langue dans les
 * Réglages puis y revient rendrait l'écran avec une langue d'administration
 * dont rien n'a chargé le catalogue — `translateAdmin` lèverait, page blanche.
 * Suspendre rend le squelette le temps du chargement, puis l'écran.
 */
export function suspendForAdminInterfaceCatalog(interfaceLanguage: InterfaceLanguage): void {
  if (loaded.has(adminLanguageOf(interfaceLanguage))) return;
  throw loadAdminInterfaceCatalog(interfaceLanguage);
}

const PLACEHOLDER = /\{(\w+)\}/g;

export function translateAdmin<K extends AdminInterfaceCatalogKey>(
  language: InterfaceLanguage,
  key: K,
  ...params: TranslateAdminArgs<K>
): string;
export function translateAdmin(
  interfaceLanguage: InterfaceLanguage,
  key: AdminInterfaceCatalogKey,
  params?: Readonly<Record<string, string>>,
): string {
  const language = adminLanguageOf(interfaceLanguage);
  const catalog = loaded.get(language);
  if (catalog === undefined) {
    throw new Error(`Catalogue d'administration « ${language} » lu avant d'être chargé (loadAdminInterfaceCatalog).`);
  }
  const text = catalog[key];
  if (params === undefined) return text;
  return text.replace(PLACEHOLDER, (whole, name: string) => params[name] ?? whole);
}

function isCatalogKey(catalog: AdminInterfaceCatalog, key: string): key is AdminInterfaceCatalogKey {
  return Object.prototype.hasOwnProperty.call(catalog, key);
}

/**
 * LA LECTURE TOLÉRANTE (#8876) — `null` quand la clé n'existe pas, au lieu de
 * ne pas compiler : la bibliothèque d'interprétation COMPOSE ses clés depuis
 * une famille et un code que le serveur sert (`admin.enum.<famille>.<code>`),
 * et un code que le catalogue ne connaît pas doit se dire « Non reconnu », pas
 * planter. Le prédicat de type est l'UNIQUE endroit où une chaîne devient une
 * clé ; `i18n-admin-catalog.test.ts` et `interpret/enums.test.ts` mesurent que
 * chaque clé que la bibliothèque compose existe dans les quatre langues de l'administration.
 */
export function translateAdminMaybe(interfaceLanguage: InterfaceLanguage, key: string): string | null {
  const language = adminLanguageOf(interfaceLanguage);
  const catalog = loaded.get(language);
  if (catalog === undefined) {
    throw new Error(`Catalogue d'administration « ${language} » lu avant d'être chargé (loadAdminInterfaceCatalog).`);
  }
  return isCatalogKey(catalog, key) ? catalog[key] : null;
}
