import { PROGRESSION_CONCEPTS, type ProgressionConcept } from '@meeshy/shared/utils/progression-layout';

/**
 * LA CARTE DE NAVIGATION DE « PROGRESSION » (#9563, amendement n° 4) — écrite
 * en commentaire de #9563 et de #9564 AVANT le code, et gardée ici : trois
 * niveaux, un parent par écran, et ce que « retour » fait de l'historique.
 *
 *   1. Progression — les concepts ;
 *   2. la fiche d'un concept, ou une porte de la première page (carnet, règles,
 *      réglages du jeu) ;
 *   3. la sous-page d'un concept (classement, saison, vitrine…), sous SA fiche.
 *
 * Rien n'est plus profond, et aucun écran n'a deux parents : la coquille
 * (`routes/progression-shell.tsx`) lit son retour ICI, jamais d'une prop qu'une
 * page pourrait oublier ou contredire. L'app iOS reproduit la même carte.
 *
 * Fonctions PURES : l'historique entre en données (`HistoryEntry`), la coquille
 * applique la décision.
 */

/** Les sous-pages, et la fiche dont chacune est le niveau 3. */
export const SUBPAGE_CONCEPT = {
  progressionLigue: 'league',
  progressionSaison: 'season',
  progressionPrestige: 'prestige',
  progressionBadges: 'badges',
  progressionDefis: 'defis',
  progressionSucces: 'succes',
  progressionVitrine: 'showcase',
  progressionAtlas: 'atlas',
} as const satisfies Readonly<Record<string, ProgressionConcept>>;

export type SubpageRoute = keyof typeof SUBPAGE_CONCEPT;

/** Les portes de la première page qui ne sont pas des concepts : niveau 2, sous Progression. */
export const ANNEX_ROUTES = ['progressionCarnet', 'progressionRegles', 'progressionReglages'] as const;

export type AnnexRoute = (typeof ANNEX_ROUTES)[number];

/** L'ancienne adresse du Tableau de bord : elle rend Progression et remplace l'adresse. */
export const DASHBOARD_ALIAS_ROUTE = 'progressionTableau';

export type GameScreen =
  | { readonly kind: 'root' }
  | { readonly kind: 'fiche'; readonly concept: ProgressionConcept }
  | { readonly kind: 'annex'; readonly route: AnnexRoute }
  | { readonly kind: 'subpage'; readonly route: SubpageRoute; readonly concept: ProgressionConcept };

export type NavTarget =
  | { readonly to: 'list' }
  | { readonly to: 'progression' }
  | { readonly to: 'progressionConcept'; readonly concept: ProgressionConcept }
  | { readonly to: AnnexRoute | SubpageRoute };

const CONCEPTS: ReadonlySet<string> = new Set<string>(PROGRESSION_CONCEPTS);

export const isProgressionConceptKey = (value: string): value is ProgressionConcept => CONCEPTS.has(value);

const isSubpage = (key: string): key is SubpageRoute => Object.hasOwn(SUBPAGE_CONCEPT, key);

const isAnnex = (key: string): key is AnnexRoute => (ANNEX_ROUTES as readonly string[]).includes(key);

/**
 * L'écran du jeu qu'une route EST, ou `null` hors du jeu. Une fiche à la clé
 * inconnue reste une fiche (elle dit « cette fiche n'existe pas ») : son parent
 * est Progression, comme toutes les fiches.
 */
export function gameScreenOf(route: { readonly key: string; readonly params: Readonly<Record<string, string>> }): GameScreen | null {
  if (route.key === 'progression' || route.key === DASHBOARD_ALIAS_ROUTE) return { kind: 'root' };
  if (route.key === 'progressionConcept') {
    const concept = route.params.concept ?? '';
    return { kind: 'fiche', concept: isProgressionConceptKey(concept) ? concept : 'level' };
  }
  if (isSubpage(route.key)) return { kind: 'subpage', route: route.key, concept: SUBPAGE_CONCEPT[route.key] };
  if (isAnnex(route.key)) return { kind: 'annex', route: route.key };
  return null;
}

export function levelOf(screen: GameScreen): 1 | 2 | 3 {
  switch (screen.kind) {
    case 'root':
      return 1;
    case 'fiche':
    case 'annex':
      return 2;
    case 'subpage':
      return 3;
  }
}

/** Le parent : où mène « retour ». Progression a pour parent l'extérieur du jeu (la liste, faute d'historique). */
export function parentOf(screen: GameScreen): NavTarget {
  switch (screen.kind) {
    case 'root':
      return { to: 'list' };
    case 'fiche':
    case 'annex':
      return { to: 'progression' };
    case 'subpage':
      return { to: 'progressionConcept', concept: screen.concept };
  }
}

/** La chaîne des ancêtres DANS le jeu, de Progression au parent (vide pour Progression). */
export function ancestorsOf(screen: GameScreen): readonly NavTarget[] {
  switch (screen.kind) {
    case 'root':
      return [];
    case 'fiche':
    case 'annex':
      return [{ to: 'progression' }];
    case 'subpage':
      return [{ to: 'progression' }, { to: 'progressionConcept', concept: screen.concept }];
  }
}

/** La sous-page d'un concept, s'il en a une : la seule entrée de « Aller plus loin » de sa fiche. */
export function subpageOf(concept: ProgressionConcept): SubpageRoute | undefined {
  return (Object.keys(SUBPAGE_CONCEPT) as SubpageRoute[]).find((route) => SUBPAGE_CONCEPT[route] === concept);
}

export const GAME_ROOT_PATH = '/me/progression';

export const isGamePath = (path: string): boolean => {
  const pathname = path.split(/[?#]/, 1)[0] ?? '';
  return pathname === GAME_ROOT_PATH || pathname.startsWith(`${GAME_ROOT_PATH}/`);
};

const pathnameOf = (path: string): string => path.split(/[?#]/, 1)[0] ?? '';

/** Une entrée de l'historique de l'onglet : son adresse (chemin + recherche) et sa clé. */
export type HistoryEntry = { readonly path: string; readonly key: string };

export type UpMove =
  /** Le parent est sous nous, dans la suite d'écrans du jeu : on y RECULE (position retrouvée). */
  | { readonly kind: 'traverse'; readonly key: string }
  /** Le parent n'est pas dans l'historique du jeu (lien profond) : l'écran est REMPLACÉ par lui. */
  | { readonly kind: 'replace' }
  /** L'historique est illisible (navigateur sans API Navigation) : on avance vers le parent. */
  | { readonly kind: 'push' };

/**
 * CE QUE « RETOUR » FAIT DE L'HISTORIQUE. On cherche le parent en reculant dans
 * la suite CONTIGUË d'écrans du jeu qui précède : trouvé, on y recule ; une
 * entrée hors du jeu rencontrée d'abord, on remplace. Jamais on ne recule
 * par-dessus un écran étranger au jeu.
 */
export function upMove(params: { readonly parentPath: string; readonly entries: readonly HistoryEntry[] | null; readonly index: number }): UpMove {
  const { entries, index, parentPath } = params;
  if (entries === null) return { kind: 'push' };
  const before = entries.slice(0, Math.max(0, index)).reverse();
  const run = before.findIndex((entry) => !isGamePath(entry.path));
  const inGame = run === -1 ? before : before.slice(0, run);
  const parent = inGame.find((entry) => pathnameOf(entry.path) === pathnameOf(parentPath));
  return parent === undefined ? { kind: 'replace' } : { kind: 'traverse', key: parent.key };
}

/**
 * LA PILE PORTE LE CHEMIN COMPLET (comme la pile iOS). Arrivé sur une fiche ou
 * une sous-page depuis l'EXTÉRIEUR du jeu (notification, bandeau, lien profond,
 * rechargement), on glisse ses ancêtres sous l'écran : le retour en verre ET le
 * retour système remontent alors au parent. Arrivé depuis un autre écran du jeu,
 * on ne touche à rien : « retour » remontera par `upMove`.
 */
export function chainBelow(params: { readonly screen: GameScreen; readonly previousPath: string | null; readonly pathOf: (target: NavTarget) => string }): readonly string[] {
  const { screen, previousPath, pathOf } = params;
  if (previousPath !== null && isGamePath(previousPath)) return [];
  return ancestorsOf(screen).map(pathOf);
}

/**
 * LA SECTION D'UNE FICHE qu'une entrée vise (`?section=` sur l'adresse de la
 * fiche). La notification de la mission du jour ouvre la fiche des missions
 * défilée jusqu'aux gestes : la liste et le coffre.
 */
export const FICHE_SECTION_PARAM = 'section';

export const FICHE_SECTIONS = ['gestures'] as const;

export type FicheSection = (typeof FICHE_SECTIONS)[number];

export const ENTRY_SECTION: Readonly<Partial<Record<ProgressionConcept, FicheSection>>> = { missions: 'gestures' };

export const ficheSection = (value: string | null): FicheSection | undefined =>
  value !== null && (FICHE_SECTIONS as readonly string[]).includes(value) ? (value as FicheSection) : undefined;

/** `?section=<concept>` sur Progression : la clé d'un concept, rien d'autre (une liste FERMÉE). */
export const ROOT_SECTION_PARAM = 'section';

const DASHBOARD_PATH = `${GAME_ROOT_PATH}/tableau-de-bord`;

/**
 * LES REDIRECTIONS DE PROGRESSION — l'adresse qu'il faut substituer à celle-ci
 * (en REMPLAÇANT l'entrée d'historique), ou `null` :
 *
 *   · `/me/progression/tableau-de-bord` → `/me/progression` : le Tableau de bord
 *     n'existe plus, ses favoris et son historique ouvrent Progression ;
 *   · `/me/progression?section=<concept>` → la fiche de ce concept, à la section
 *     que la carte nomme (`ENTRY_SECTION`). Une valeur qui n'est pas la clé d'un
 *     concept ne désigne rien : Progression reste.
 */
export function redirectOf(path: string, pathOf: (target: NavTarget) => string): string | null {
  const [pathname = '', query = ''] = path.split('?', 2);
  if (pathname === DASHBOARD_PATH) return GAME_ROOT_PATH;
  if (pathname !== GAME_ROOT_PATH) return null;
  const section = new URLSearchParams(query).get(ROOT_SECTION_PARAM) ?? '';
  if (!isProgressionConceptKey(section)) return null;
  const fiche = pathOf({ to: 'progressionConcept', concept: section });
  const focus = ENTRY_SECTION[section];
  return focus === undefined ? fiche : `${fiche}?${FICHE_SECTION_PARAM}=${focus}`;
}
