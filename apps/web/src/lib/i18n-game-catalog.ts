/**
 * LE CATALOGUE DU JEU (#9379) — tout ce que le jeu Meeshy dit : paliers, rangs,
 * formes de la Flamme, paliers du trésor, missions, coffre, guide de Mee et
 * Meo et ses sept étapes, carnet des règles, frappe, dépenses, moments photo,
 * dans les sept langues du produit. Même mécanique que le catalogue de
 * l'accueil (`i18n-onboarding-catalog.ts`) : un `import()` par langue et par
 * PARTIE (#9542, plus bas), chargé avec les écrans qui la lisent
 * (`routes/route-table.tsx`), jamais au démarrage — le catalogue d'interface a
 * atteint son plafond (`budgets.json` › `interface_catalogs`).
 *
 * Aucun repli : une clé absente d'une langue est une erreur de compilation
 * (`satisfies Game…Catalog`) et un témoin rouge (`i18n-game-catalog.test.ts`) ;
 * une clé lue avant que sa partie soit chargée lève.
 *
 * LE PLURIEL est une famille de clés `<base>.one`, `<base>.other` — et, pour
 * les langues qui ont plus de catégories (l'arabe : `zero`, `two`, `few`,
 * `many`), la forme propre à la catégorie quand elle existe, sinon `.other`.
 * La catégorie vient de `Intl.PluralRules` dans la langue de l'interface, jamais
 * d'un `=== 1`. Le nombre est formaté par `Intl.NumberFormat` de la même langue.
 */
import type FrenchBanner from './interface-catalogs/catalog-game-banner-fr';
import type FrenchConcept from './interface-catalogs/catalog-game-concept-fr';
import type FrenchCore from './interface-catalogs/catalog-game-fr';
import type FrenchRules from './interface-catalogs/catalog-game-rules-fr';
import type { InterfaceLanguage } from './interface-language';

/**
 * LE CATALOGUE EST EN QUATRE PARTIES (#9542) — un seul vocabulaire (`game.*`),
 * une seule façon de le lire (`translateGame`), mais quatre fichiers par langue,
 * chargés chacun avec les écrans qui le lisent :
 *
 *   · `banner`  — ce que le bandeau du joueur dit sur tous les hubs ;
 *   · `core`    — le jeu lui-même (missions, frappe, Flamme, ligue, saison…) ;
 *   · `concept` — la première page de Progression, les fiches, le tableau de bord ;
 *   · `rules`   — le carnet des règles et son atlas.
 *
 * Le bandeau s'affiche sur CHAQUE hub : il ne télécharge que sa partie (une
 * cinquantaine de clés), plus les huit cents du jeu entier.
 */
type FrenchParts = {
  readonly banner: typeof FrenchBanner;
  readonly core: typeof FrenchCore;
  readonly concept: typeof FrenchConcept;
  readonly rules: typeof FrenchRules;
};

export type GameCatalogPart = keyof FrenchParts;

export const GAME_CATALOG_PARTS = ['banner', 'core', 'concept', 'rules'] as const satisfies readonly GameCatalogPart[];

type FrenchGameCatalog = FrenchParts['banner'] & FrenchParts['core'] & FrenchParts['concept'] & FrenchParts['rules'];

export type GameCatalogKey = keyof FrenchGameCatalog;

type PluralBaseOf<K> = K extends `${infer Base}.other` ? Base : never;

/** Les bases dont le français porte la forme `.other` : celles qui s'accordent en nombre. */
export type GamePluralBase = PluralBaseOf<GameCatalogKey>;

type PluralCategory = 'zero' | 'two' | 'few' | 'many';

/** Les formes que seules certaines langues portent (catégories CLDR autres que `one` et `other`). */
export type GamePluralForm = `${GamePluralBase}.${PluralCategory}`;

type PartCatalog<French> = Readonly<Record<keyof French, string>> &
  Readonly<Partial<Record<`${PluralBaseOf<keyof French>}.${PluralCategory}`, string>>>;

/** Ce que chaque fichier d'une langue doit porter : exactement les clés de la partie française. */
export type GameBannerCatalog = PartCatalog<FrenchParts['banner']>;
export type GameCoreCatalog = PartCatalog<FrenchParts['core']>;
export type GameConceptCatalog = PartCatalog<FrenchParts['concept']>;
export type GameRulesCatalog = PartCatalog<FrenchParts['rules']>;

/** Le catalogue ENTIER, les quatre parties réunies. */
export type GameCatalog = Readonly<Record<GameCatalogKey, string>> & Readonly<Partial<Record<GamePluralForm, string>>>;

type Placeholders<S extends string> = S extends `${string}{${infer Name}}${infer Rest}` ? Name | Placeholders<Rest> : never;

export type TranslateGameArgs<K extends GameCatalogKey> = [Placeholders<FrenchGameCatalog[K]>] extends [never]
  ? []
  : [params: Readonly<Record<Placeholders<FrenchGameCatalog[K]>, string>>];

type PartTexts = Readonly<Record<string, string>>;
type PartModule = { readonly default: PartTexts };
type PartLoaders = Readonly<Record<InterfaceLanguage, () => Promise<PartModule>>>;

const LOADERS: Readonly<Record<GameCatalogPart, PartLoaders>> = {
  banner: {
    fr: () => import('./interface-catalogs/catalog-game-banner-fr'),
    en: () => import('./interface-catalogs/catalog-game-banner-en'),
    es: () => import('./interface-catalogs/catalog-game-banner-es'),
    pt: () => import('./interface-catalogs/catalog-game-banner-pt'),
    de: () => import('./interface-catalogs/catalog-game-banner-de'),
    it: () => import('./interface-catalogs/catalog-game-banner-it'),
    ar: () => import('./interface-catalogs/catalog-game-banner-ar'),
  },
  core: {
    fr: () => import('./interface-catalogs/catalog-game-fr'),
    en: () => import('./interface-catalogs/catalog-game-en'),
    es: () => import('./interface-catalogs/catalog-game-es'),
    pt: () => import('./interface-catalogs/catalog-game-pt'),
    de: () => import('./interface-catalogs/catalog-game-de'),
    it: () => import('./interface-catalogs/catalog-game-it'),
    ar: () => import('./interface-catalogs/catalog-game-ar'),
  },
  concept: {
    fr: () => import('./interface-catalogs/catalog-game-concept-fr'),
    en: () => import('./interface-catalogs/catalog-game-concept-en'),
    es: () => import('./interface-catalogs/catalog-game-concept-es'),
    pt: () => import('./interface-catalogs/catalog-game-concept-pt'),
    de: () => import('./interface-catalogs/catalog-game-concept-de'),
    it: () => import('./interface-catalogs/catalog-game-concept-it'),
    ar: () => import('./interface-catalogs/catalog-game-concept-ar'),
  },
  rules: {
    fr: () => import('./interface-catalogs/catalog-game-rules-fr'),
    en: () => import('./interface-catalogs/catalog-game-rules-en'),
    es: () => import('./interface-catalogs/catalog-game-rules-es'),
    pt: () => import('./interface-catalogs/catalog-game-rules-pt'),
    de: () => import('./interface-catalogs/catalog-game-rules-de'),
    it: () => import('./interface-catalogs/catalog-game-rules-it'),
    ar: () => import('./interface-catalogs/catalog-game-rules-ar'),
  },
};

/**
 * CE QUE CHAQUE ÉCRAN CHARGE — écrit UNE fois : la table des routes charge ces
 * parties avant de rendre (`loadGameScreenCatalog`), l'écran les réclame en mode
 * Suspense (`suspendForGameCatalog`), et le témoin `game-catalog-parts.test.ts`
 * vérifie que chaque clé lue par un écran vit dans une partie que SA route
 * charge. Le bandeau est dans toutes : ses clés (noms de palier, de rang, de
 * ligue, accords) servent partout.
 */
export const GAME_SCREEN_PARTS = {
  banner: ['banner'],
  profile: ['banner', 'core'],
  progression: ['banner', 'core', 'concept'],
  rules: ['banner', 'core', 'rules'],
} as const satisfies Readonly<Record<string, readonly GameCatalogPart[]>>;

export type GameScreen = keyof typeof GAME_SCREEN_PARTS;

const slot = (language: InterfaceLanguage, part: GameCatalogPart): string => `${language}/${part}`;

const loadedParts = new Map<string, PartTexts>();
const inFlight = new Map<string, Promise<PartTexts>>();
/** Les parties chargées d'une langue, réunies : la lecture d'une clé ne cherche pas dans quatre objets. */
const merged = new Map<InterfaceLanguage, PartTexts>();

function loadPart(language: InterfaceLanguage, part: GameCatalogPart): Promise<PartTexts> {
  const key = slot(language, part);
  const ready = loadedParts.get(key);
  if (ready !== undefined) return Promise.resolve(ready);
  const pending = inFlight.get(key);
  if (pending !== undefined) return pending;

  const request = LOADERS[part][language]().then(
    ({ default: texts }) => {
      loadedParts.set(key, texts);
      merged.set(language, { ...merged.get(language), ...texts });
      inFlight.delete(key);
      return texts;
    },
    (error: unknown) => {
      inFlight.delete(key);
      throw error;
    },
  );
  inFlight.set(key, request);
  return request;
}

const hasParts = (language: InterfaceLanguage, parts: readonly GameCatalogPart[]): boolean =>
  parts.every((part) => loadedParts.has(slot(language, part)));

export function loadGameCatalogParts(language: InterfaceLanguage, parts: readonly GameCatalogPart[]): Promise<void> {
  if (hasParts(language, parts)) return Promise.resolve();
  return Promise.all(parts.map((part) => loadPart(language, part))).then(() => undefined);
}

/** Les parties d'un écran, dans la langue donnée — ce que la table des routes charge en parallèle du chunk de l'écran. */
export const loadGameScreenCatalog = (language: InterfaceLanguage, screen: GameScreen): Promise<void> =>
  loadGameCatalogParts(language, GAME_SCREEN_PARTS[screen]);

/** Le catalogue ENTIER d'une langue. Aucun écran ne l'appelle : c'est l'outil des témoins et des catalogues comparés. */
export function loadGameCatalog(language: InterfaceLanguage): Promise<GameCatalog> {
  return loadGameCatalogParts(language, GAME_CATALOG_PARTS).then(() => merged.get(language) as GameCatalog);
}

/** Oublie tout ce qui est chargé — pour les témoins qui mesurent ce qu'un écran lit avec SES seules parties. */
export function unloadGameCatalog(): void {
  loadedParts.clear();
  merged.clear();
}

/**
 * LECTURE EN MODE SUSPENSE — jette la promesse en cours si les parties de
 * l'écran ne sont pas encore chargées dans cette langue ; la limite Suspense la
 * plus proche la rattrape et réessaie. La route charge ces parties AVANT de
 * rendre, mais un changement de langue pendant que l'écran est ouvert
 * (`interface-language.ts` ne charge que le catalogue d'interface) rendrait
 * sinon une langue sans texte.
 */
export function suspendForGameCatalog(language: InterfaceLanguage, screen: GameScreen): void {
  if (hasParts(language, GAME_SCREEN_PARTS[screen])) return;
  throw loadGameScreenCatalog(language, screen);
}

const PLACEHOLDER = /\{(\w+)\}/g;

const catalogOf = (language: InterfaceLanguage): GameCatalog => {
  const catalog = merged.get(language);
  if (catalog === undefined) {
    throw new Error(`Catalogue du jeu « ${language} » lu avant d'être chargé (loadGameCatalog).`);
  }
  return catalog as GameCatalog;
};

/** Une clé dont la partie n'est pas chargée LÈVE : un écran qui afficherait sa clé nue aurait l'air de marcher. */
const textOf = (language: InterfaceLanguage, key: string): string => {
  const text = (catalogOf(language) as Readonly<Record<string, string | undefined>>)[key];
  if (text === undefined) {
    throw new Error(`Clé du jeu « ${key} » lue en « ${language} » avant que sa partie du catalogue soit chargée (GAME_SCREEN_PARTS).`);
  }
  return text;
};

const interpolate = (text: string, params: Readonly<Record<string, string>> | undefined): string =>
  params === undefined ? text : text.replace(PLACEHOLDER, (whole, name: string) => params[name] ?? whole);

export function translateGame<K extends GameCatalogKey>(language: InterfaceLanguage, key: K, ...params: TranslateGameArgs<K>): string;
export function translateGame(language: InterfaceLanguage, key: GameCatalogKey, params?: Readonly<Record<string, string>>): string {
  return interpolate(textOf(language, key), params);
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
  const text = forms[`${base}.${gamePluralCategory(language, count)}`] ?? textOf(language, `${base}.other`);
  return interpolate(text, { count: formatGameNumber(language, count), ...params });
}

const ordinalRules = new Map<InterfaceLanguage, Intl.PluralRules>();

function gameOrdinalCategory(language: InterfaceLanguage, count: number): Intl.LDMLPluralRule {
  const known = ordinalRules.get(language);
  if (known !== undefined) return known.select(count);
  const created = new Intl.PluralRules(LOCALES[language], { type: 'ordinal' });
  ordinalRules.set(language, created);
  return created.select(count);
}

/** Les familles ORDINALES : leurs formes suivent les catégories ordinales de la langue (l'anglais porte `two` et `few`). */
export const GAME_ORDINAL_BASES = ['game.banner.place'] as const satisfies readonly GamePluralBase[];

export type GameOrdinalBase = (typeof GAME_ORDINAL_BASES)[number];

/**
 * Un rang ORDINAL (« 4e », « 4th », « 4. ») : la forme de la catégorie
 * ordinale du nombre dans la langue (`Intl.PluralRules` en `type: 'ordinal'`),
 * sinon `.other` — même famille de clés que les pluriels, autres règles.
 */
export function translateGameOrdinal(language: InterfaceLanguage, base: GameOrdinalBase, count: number): string {
  const catalog = catalogOf(language);
  const forms = catalog as Readonly<Record<string, string | undefined>>;
  const text = forms[`${base}.${gameOrdinalCategory(language, count)}`] ?? textOf(language, `${base}.other`);
  return interpolate(text, { count: formatGameNumber(language, count) });
}
