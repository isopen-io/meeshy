/**
 * LE COFFRE DU JOUR (#9373, #10011) — déterministe par utilisateur, par jour et par EFFORT des missions du jour.
 * `docs/product/jeu-meeshy-conception.html` § II.5.
 *
 * ## Ce qu'il contient (porteur, 2026-10-10)
 *
 *  - des POINTS, de 100 à 10 000, selon la COMPLEXITÉ des trois missions du jour ;
 *  - de la GLOIRE : un point de Gloire pour dix points (`gloryForChest`, `glory.ts`) ;
 *  - des FRAGMENTS DE MEESH : 1, 2 dès 2 500 points, 3 dès 7 500 — plus UN en prime une fois sur six ;
 *    cinq fragments paient une FRAPPE GRATUITE (porteur, 2026-10-10 : `MEESH_FRAGMENTS_PER_MEESH`,
 *    `previewFragmentMint` dans `mint.ts`) — la frappe les consomme au lieu des points ;
 *  - un gel de Flamme, une fois sur vingt.
 *
 * ## La complexité du jour
 *
 * L'EFFORT d'une mission est ce que le catalogue lui-même tient pour son poids : la base de points de sa
 * difficulté plus ses points par unité d'objectif, multipliés par l'objectif tiré
 * (`MISSION_BASE_POINTS[difficulté] + unitPoints × objectif`, sans la bande ni la Flamme). L'effort du jour
 * est la somme de ses trois missions. Une mission d'Or, un objectif plus haut ou un geste plus lourd (publier,
 * commenter) pèsent plus ; un compte de niveau plus haut reçoit des objectifs plus hauts, donc plus d'effort.
 *
 *     points = 100 + round(9 900 × (effort − 300) ÷ 4 200), l'effort borné à [300, 4 500]
 *
 * Une droite : 300 d'effort (le jour le plus léger du catalogue en tire 326) vaut 100 points, 4 500 en vaut
 * 10 000 (le plus lourd en tire 4 655, borné). Monotone, en ENTIERS exacts.
 *
 * ## Gratuit, et dit avant l'ouverture
 *
 * Le coffre ne coûte rien, aucun argent n'y entre et rien de ce qu'il donne ne se transfère ni ne se convertit
 * en argent — les fragments ne servent qu'à frapper, dans le jeu (`no-money-invariants.test.ts`). Son contenu certain (points, Gloire, fragments) est servi AVANT
 * l'ouverture (`GameChest.today`), et ses deux tirages (le fragment en prime, le gel) ont leurs probabilités
 * affichées (`CHEST_ODDS`).
 *
 * Le générateur consomme TOUJOURS sa première valeur (celle des points tirés d'avant #10011) : le fragment et
 * le gel d'un jour donné restent ceux qu'ils étaient.
 */

import { seededRng } from './day-prng.js';
import { gloryForChest } from './glory.js';
import { MISSION_TEMPLATES } from './mission-catalog.js';
import { MISSION_BASE_POINTS, MISSION_DIFFICULTIES, type MissionDifficulty } from './missions.js';

export const CHEST_POINTS_MIN = 100;
export const CHEST_POINTS_MAX = 10_000;
/** L'effort qui vaut le minimum de points, et celui qui vaut le maximum. */
export const CHEST_EFFORT_FLOOR = 300;
export const CHEST_EFFORT_CEILING = 4500;

/** Cinq fragments paient une frappe gratuite. */
export const MEESH_FRAGMENTS_PER_MEESH = 5;
/** Les fragments certains : 1, puis 2 dès 2 500 points, 3 dès 7 500. */
export const CHEST_FRAGMENT_STEP_POINTS = 5000;
export const CHEST_FRAGMENTS_MAX = 3;

/** Ce que le coffre peut contenir — affiché AVANT l'ouverture. `fragment` : la chance d'UN fragment en prime. */
export const CHEST_ODDS = {
  minPoints: CHEST_POINTS_MIN,
  maxPoints: CHEST_POINTS_MAX,
  fragment: 1 / 6,
  freeze: 1 / 20,
  minGlory: CHEST_POINTS_MIN / 10,
  maxGlory: CHEST_POINTS_MAX / 10,
  minMeeshFragments: 1,
  maxMeeshFragments: CHEST_FRAGMENTS_MAX + 1,
  meeshFragmentsPerMeesh: MEESH_FRAGMENTS_PER_MEESH,
} as const;

/** Le contenu CERTAIN du coffre, connu dès que les missions du jour sont tirées. */
export type ChestContent = {
  readonly points: number;
  readonly glory: number;
  /** Les fragments certains, sans celui de la prime. */
  readonly meeshFragments: number;
};

export type DailyChest = {
  readonly points: number;
  /** Le fragment EN PRIME (une chance sur six) — le seul que lisent les clients d'avant #10011. */
  readonly fragment: boolean;
  readonly freeze: boolean;
  readonly glory: number;
  /** Tous les fragments de Meesh du coffre, prime comprise. */
  readonly meeshFragments: number;
};

/** Ce qu'une mission apporte à l'effort : sa difficulté, son gabarit, son objectif. */
export type ChestMission = {
  readonly templateKey: string;
  readonly difficulty: string;
  readonly target: number;
};

const sanitize = (value: number): number => (Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0);

const isDifficulty = (value: string): value is MissionDifficulty => (MISSION_DIFFICULTIES as readonly string[]).includes(value);

/** Un gabarit que le catalogue ne connaît plus ne pèse que sa difficulté. */
const unitPointsOf = (templateKey: string): number => MISSION_TEMPLATES.find((t) => t.key === templateKey)?.unitPoints ?? 0;

/** L'effort d'une mission : `base de sa difficulté + unitPoints × objectif`. Une difficulté inconnue pèse comme la facile. */
export const missionEffort = (mission: ChestMission): number =>
  MISSION_BASE_POINTS[isDifficulty(mission.difficulty) ? mission.difficulty : 'easy'] + unitPointsOf(mission.templateKey) * sanitize(mission.target);

/** L'effort du jour : la somme de ses missions. */
export const dayEffort = (missions: readonly ChestMission[]): number => missions.reduce((sum, mission) => sum + missionEffort(mission), 0);

/** Les points du coffre pour cet effort : une droite de 100 (300 d'effort) à 10 000 (4 500), arrondie au plus proche. */
export const chestPointsForEffort = (effort: number): number => {
  const bounded = Math.min(CHEST_EFFORT_CEILING, Math.max(CHEST_EFFORT_FLOOR, sanitize(effort)));
  const span = CHEST_EFFORT_CEILING - CHEST_EFFORT_FLOOR;
  const gain = CHEST_POINTS_MAX - CHEST_POINTS_MIN;
  return CHEST_POINTS_MIN + Math.floor((gain * (bounded - CHEST_EFFORT_FLOOR) * 2 + span) / (2 * span));
};

/** Les fragments certains pour ces points : 1, 2 dès 2 500, 3 dès 7 500. */
export const chestFragmentsForPoints = (points: number): number =>
  Math.min(CHEST_FRAGMENTS_MAX, 1 + Math.floor((sanitize(points) + CHEST_FRAGMENT_STEP_POINTS / 2) / CHEST_FRAGMENT_STEP_POINTS));

/** Le contenu certain du coffre pour cet effort. */
export const chestContentForEffort = (effort: number): ChestContent => {
  const points = chestPointsForEffort(effort);
  return { points, glory: gloryForChest(points), meeshFragments: chestFragmentsForPoints(points) };
};

export function dailyChest(params: { readonly userId: string; readonly dayKey: string; readonly effort: number }): DailyChest {
  const rng = seededRng({ userId: params.userId, dayKey: params.dayKey, salt: 'chest' });
  rng();
  const fragment = rng() < CHEST_ODDS.fragment;
  const freeze = rng() < CHEST_ODDS.freeze;
  const content = chestContentForEffort(params.effort);
  return {
    points: content.points,
    fragment,
    freeze,
    glory: content.glory,
    meeshFragments: content.meeshFragments + (fragment ? 1 : 0),
  };
}

export type MeeshFragmentProgress = {
  /** Les fragments en poche : gagnés aux coffres, moins ceux qu'ont consommés les frappes. */
  readonly held: number;
  /** Les fragments d'une frappe gratuite : cinq. */
  readonly perMeesh: number;
};

/** Les fragments en poche : gagnés moins dépensés, jamais négatifs. */
export const meeshFragmentProgress = (params: { readonly earned: number; readonly spent: number }): MeeshFragmentProgress => ({
  held: Math.max(0, sanitize(params.earned) - sanitize(params.spent)),
  perMeesh: MEESH_FRAGMENTS_PER_MEESH,
});
