/**
 * LE CATALOGUE DU JEU (#9379) — tout ce que le jeu Meeshy dit : paliers, rangs,
 * formes de la Flamme, paliers du trésor, missions, coffre, guide de Mee et
 * Meo et ses sept étapes, carnet des règles, frappe, dépenses, moments photo,
 * dans les sept langues du produit. Même mécanique que le catalogue de
 * l'accueil (`i18n-onboarding-catalog.ts`) : un `import()` par langue, chargé
 * avec les écrans de la progression (`routes/route-table.tsx`), jamais au
 * démarrage — le catalogue d'interface a atteint son plafond
 * (`budgets.json` › `interface_catalogs`).
 *
 * Aucun repli : une clé absente d'une langue est une erreur de compilation
 * (`satisfies GameCatalog`) et un témoin rouge (`i18n-game-catalog.test.ts`) ;
 * un catalogue lu avant d'être chargé lève.
 *
 * LE PLURIEL est une famille de clés `<base>.one`, `<base>.other` — et, pour
 * les langues qui ont plus de catégories (l'arabe : `zero`, `two`, `few`,
 * `many`), la forme propre à la catégorie quand elle existe, sinon `.other`.
 * La catégorie vient de `Intl.PluralRules` dans la langue de l'interface, jamais
 * d'un `=== 1`. Le nombre est formaté par `Intl.NumberFormat` de la même langue.
 */
import type FrenchGame from './interface-catalogs/catalog-game-fr';
import type { InterfaceLanguage } from './interface-language';

type FrenchGameCatalog = typeof FrenchGame;

export type GameCatalogKey = keyof FrenchGameCatalog;

/** Les bases dont le français porte la forme `.other` : celles qui s'accordent en nombre. */
export type GamePluralBase = GameCatalogKey extends infer K ? (K extends `${infer Base}.other` ? Base : never) : never;

/** Les formes que seules certaines langues portent (catégories CLDR autres que `one` et `other`). */
export type GamePluralForm = `${GamePluralBase}.${'zero' | 'two' | 'few' | 'many'}`;

export type GameCatalog = Readonly<Record<GameCatalogKey, string>> & Readonly<Partial<Record<GamePluralForm, string>>>;

type Placeholders<S extends string> = S extends `${string}{${infer Name}}${infer Rest}` ? Name | Placeholders<Rest> : never;

export type TranslateGameArgs<K extends GameCatalogKey> = [Placeholders<FrenchGameCatalog[K]>] extends [never]
  ? []
  : [params: Readonly<Record<Placeholders<FrenchGameCatalog[K]>, string>>];

type CatalogModule = { readonly default: GameCatalog };

const LOADERS: Readonly<Record<InterfaceLanguage, () => Promise<CatalogModule>>> = {
  fr: () => import('./interface-catalogs/catalog-game-fr'),
  en: () => import('./interface-catalogs/catalog-game-en'),
  es: () => import('./interface-catalogs/catalog-game-es'),
  pt: () => import('./interface-catalogs/catalog-game-pt'),
  de: () => import('./interface-catalogs/catalog-game-de'),
  it: () => import('./interface-catalogs/catalog-game-it'),
  ar: () => import('./interface-catalogs/catalog-game-ar'),
};

const loaded = new Map<InterfaceLanguage, GameCatalog>();
const inFlight = new Map<InterfaceLanguage, Promise<GameCatalog>>();

export function loadGameCatalog(language: InterfaceLanguage): Promise<GameCatalog> {
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

const catalogOf = (language: InterfaceLanguage): GameCatalog => {
  const catalog = loaded.get(language);
  if (catalog === undefined) {
    throw new Error(`Catalogue du jeu « ${language} » lu avant d'être chargé (loadGameCatalog).`);
  }
  return catalog;
};

const interpolate = (text: string, params: Readonly<Record<string, string>> | undefined): string =>
  params === undefined ? text : text.replace(PLACEHOLDER, (whole, name: string) => params[name] ?? whole);

export function translateGame<K extends GameCatalogKey>(language: InterfaceLanguage, key: K, ...params: TranslateGameArgs<K>): string;
export function translateGame(language: InterfaceLanguage, key: GameCatalogKey, params?: Readonly<Record<string, string>>): string {
  return interpolate(catalogOf(language)[key], params);
}

/** Les locales Intl : le nombre se formate dans la langue de l'interface (chiffres latins en arabe, comme le reste du produit). */
const LOCALES: Readonly<Record<InterfaceLanguage, string>> = {
  fr: 'fr-FR',
  en: 'en-US',
  es: 'es-ES',
  pt: 'pt-BR',
  de: 'de-DE',
  it: 'it-IT',
  ar: 'ar-u-nu-latn',
};

const numberFormats = new Map<InterfaceLanguage, Intl.NumberFormat>();
const pluralRules = new Map<InterfaceLanguage, Intl.PluralRules>();

export function formatGameNumber(language: InterfaceLanguage, value: number): string {
  const known = numberFormats.get(language);
  if (known !== undefined) return known.format(value);
  const created = new Intl.NumberFormat(LOCALES[language]);
  numberFormats.set(language, created);
  return created.format(value);
}

export function gamePluralCategory(language: InterfaceLanguage, count: number): Intl.LDMLPluralRule {
  const known = pluralRules.get(language);
  if (known !== undefined) return known.select(count);
  const created = new Intl.PluralRules(LOCALES[language]);
  pluralRules.set(language, created);
  return created.select(count);
}

/**
 * Une phrase qui s'accorde au nombre : la forme de la catégorie du nombre dans
 * la langue, sinon `.other`. `{count}` est le nombre formaté ; `params` apporte
 * le reste.
 */
export function translateGamePlural(
  language: InterfaceLanguage,
  base: GamePluralBase,
  count: number,
  params?: Readonly<Record<string, string>>,
): string {
  const catalog = catalogOf(language);
  const forms = catalog as Readonly<Record<string, string | undefined>>;
  const text = forms[`${base}.${gamePluralCategory(language, count)}`] ?? catalog[`${base}.other` as GameCatalogKey];
  return interpolate(text, { count: formatGameNumber(language, count), ...params });
}
