/**
 * LE CATALOGUE DE TRADUCTION D'INTERFACE (#6206) — les libellés SYSTÈME de
 * web-v2 (menus, écrans, annonces d'accessibilité) dans les sept langues du
 * produit. DISTINCT du Prisme de CONTENU (`resolveUserLanguage()`), qui résout
 * la langue d'un MESSAGE pour son lecteur ; la langue servie ici vient de
 * `interface-language.ts`.
 *
 * **Une langue, un chunk.** Chaque catalogue est un `import()` : un lecteur ne
 * télécharge que le sien, et aucun n'entre dans la première peinture. Le
 * routeur l'attend EN PARALLÈLE du chunk de l'écran (`screenPrerequisite`,
 * `routes/route-table.tsx`), la coquille avant les menus flottants
 * (`components/shell.tsx`) : tout ce qui se rend ensuite lit le catalogue de
 * façon SYNCHRONE.
 *
 * **Aucun repli.** Ni vers le français, ni vers la clé. Une clé absente d'une
 * langue est une erreur de COMPILATION (`satisfies InterfaceCatalog`) et un
 * témoin rouge (`i18n-catalog.test.ts`), jamais un texte d'une autre langue
 * servi en silence. Un catalogue lu avant d'être chargé lève : c'est une
 * rupture du contrat de démarrage, pas un état à maquiller.
 *
 * **Les paramètres se nomment** (`{name}`) et leur liste est TYPÉE depuis la
 * valeur française : `translate(l, 'typing.double', { first, second })`
 * compile, un nom oublié ne compile pas.
 */
import type French from './interface-catalogs/catalog-fr';
import type { InterfaceLanguage } from './interface-language';

type FrenchCatalog = typeof French;

export type InterfaceCatalogKey = keyof FrenchCatalog;

export type InterfaceCatalog = Readonly<Record<InterfaceCatalogKey, string>>;

type Placeholders<S extends string> = S extends `${string}{${infer Name}}${infer Rest}`
  ? Name | Placeholders<Rest>
  : never;

type TranslateArgs<K extends InterfaceCatalogKey> = [Placeholders<FrenchCatalog[K]>] extends [never]
  ? []
  : [params: Readonly<Record<Placeholders<FrenchCatalog[K]>, string>>];

type CatalogModule = { readonly default: InterfaceCatalog };

const LOADERS: Readonly<Record<InterfaceLanguage, () => Promise<CatalogModule>>> = {
  fr: () => import('./interface-catalogs/catalog-fr'),
  en: () => import('./interface-catalogs/catalog-en'),
  es: () => import('./interface-catalogs/catalog-es'),
  pt: () => import('./interface-catalogs/catalog-pt'),
  de: () => import('./interface-catalogs/catalog-de'),
  it: () => import('./interface-catalogs/catalog-it'),
  ar: () => import('./interface-catalogs/catalog-ar'),
};

const loaded = new Map<InterfaceLanguage, InterfaceCatalog>();
const inFlight = new Map<InterfaceLanguage, Promise<InterfaceCatalog>>();

/**
 * Charge le catalogue d'une langue — idempotent : la même promesse sert tous
 * les appelants concurrents, et un échec (réseau coupé sans cache) s'oublie
 * pour qu'un appel suivant puisse réessayer.
 */
export function loadInterfaceCatalog(language: InterfaceLanguage): Promise<InterfaceCatalog> {
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
 * LECTURE EN MODE SUSPENSE (#6341) — jette la promesse en cours si le
 * catalogue n'est pas encore chargé ; la limite Suspense la plus proche la
 * rattrape et réessaie une fois résolue, comme elle le fait déjà pour un
 * `import()` de `lazy()`. Pour `NotFound` (`routes/route-table.tsx`), seul
 * écran qui peut se rendre sans passer par `screenPrerequisite` — une adresse
 * inconnue n'a, par définition, aucune route dont le chargement attendrait le
 * catalogue.
 */
export function suspendForInterfaceCatalog(language: InterfaceLanguage): void {
  if (loaded.has(language)) return;
  throw loadInterfaceCatalog(language);
}

const PLACEHOLDER = /\{(\w+)\}/g;

/** Les noms de paramètres d'un texte de catalogue, dans leur ordre d'apparition. */
export function catalogPlaceholders(text: string): readonly string[] {
  return [...text.matchAll(PLACEHOLDER)].map((match) => match[1] ?? '');
}

export function translate<K extends InterfaceCatalogKey>(
  language: InterfaceLanguage,
  key: K,
  ...params: TranslateArgs<K>
): string;
export function translate(
  language: InterfaceLanguage,
  key: InterfaceCatalogKey,
  params?: Readonly<Record<string, string>>,
): string {
  const catalog = loaded.get(language);
  if (catalog === undefined) {
    throw new Error(`Catalogue d'interface « ${language} » lu avant d'être chargé (loadInterfaceCatalog).`);
  }
  const text = catalog[key];
  if (params === undefined) return text;
  return text.replace(PLACEHOLDER, (whole, name: string) => params[name] ?? whole);
}
