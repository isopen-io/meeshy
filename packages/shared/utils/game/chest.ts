/**
 * LE COFFRE DU JOUR (#9373, #10011) — déterministe par utilisateur, par jour, par EFFORT des missions du jour et
 * par le cours de la Meesh du compte. `docs/product/jeu-meeshy-conception.html` § II.5.
 *
 * ## Ce qu'il contient (décision du porteur, 2026-10-10, 3e et dernière précision)
 *
 *  - des POINTS, de 500 à 10 000, selon la COMPLEXITÉ des trois missions du jour ;
 *  - de la GLOIRE : un point de Gloire pour dix de ces points (`gloryForChest`, `glory.ts`), de 50 à 1 000 ;
 *  - une PRIME en points, tirée au sort, au cours de la Meesh du compte FIGÉ au début du jour de jeu (#10219) —
 *    `meeshPrice(frappées avant le jour + 1)`, `chestPriceMints` :
 *    une chance sur 20 le prix entier, sinon une chance sur 6 un cinquième du prix (arrondi), sinon rien ;
 *  - UN fragment d'étoile, une fois sur six — un objet de COLLECTION (`star-fragments.ts`), qui ne se convertit
 *    en rien et ne paie aucune frappe ;
 *  - un gel de Flamme, une fois sur vingt.
 *
 * Le coffre n'ajoute que des points : il ne frappe aucune Meesh et ne convertit rien. Une Meesh se frappe
 * toujours en débitant des points (`mint.ts`, `no-money-invariants.test.ts`).
 *
 * ## La complexité du jour
 *
 * L'EFFORT d'une mission est ce que le catalogue lui-même tient pour son poids : la base de points de sa
 * difficulté plus ses points par unité d'objectif, multipliés par l'objectif tiré
 * (`MISSION_BASE_POINTS[difficulté] + unitPoints × objectif`, sans la bande ni la Flamme). L'effort du jour
 * est la somme de ses trois missions.
 *
 *     points = 500 + round(9 500 × (effort − 300) ÷ 4 200), l'effort borné à [300, 4 500]
 *
 * Une droite monotone, en ENTIERS exacts : 300 d'effort vaut 500 points, 4 500 en vaut 10 000.
 *
 * ## Les tirages, dans l'ordre où le générateur les consomme
 *
 *  1. la valeur des points tirés d'avant #10011 — consommée, ignorée : les tirages suivants restent ceux d'avant ;
 *  2. le fragment d'étoile (`< 1/6`) ;
 *  3. le gel (`< 1/20`) ;
 *  4. la prime entière (`< 1/20`) ;
 *  5. la prime d'un cinquième (`< 1/6`), lue seulement quand la prime entière n'est pas tombée.
 *
 * Les cinq valeurs sont TOUJOURS consommées : un tirage ne dépend jamais d'un autre.
 *
 * ## Gratuit, et dit avant l'ouverture
 *
 * Le coffre ne coûte rien, aucun argent n'y entre et rien de ce qu'il donne ne se transfère ni ne se convertit
 * (`no-money-invariants.test.ts`). Son contenu certain (points, Gloire) et les deux montants possibles de la
 * prime sont servis AVANT l'ouverture (`GameChest.today`), avec les probabilités de chaque tirage (`CHEST_ODDS`).
 *
 * `points` reste le TOTAL crédité, prime comprise : un client d'avant #10011 lit `{points, fragment, freeze}`,
 * et `fragment: true` y veut dire « un fragment d'étoile trouvé ».
 */

import { seededRng } from './day-prng.js';
import { gloryForChest } from './glory.js';
import { MISSION_TEMPLATES } from './mission-catalog.js';
import { MISSION_BASE_POINTS, MISSION_DIFFICULTIES, type MissionDifficulty } from './missions.js';

export const CHEST_POINTS_MIN = 500;
export const CHEST_POINTS_MAX = 10_000;
/** L'effort qui vaut le minimum de points, et celui qui vaut le maximum. */
export const CHEST_EFFORT_FLOOR = 300;
export const CHEST_EFFORT_CEILING = 4500;

/** La prime : une chance sur 20 le prix entier de la prochaine Meesh, sinon une sur 6 un cinquième de ce prix. */
export const CHEST_BONUS_FIFTH_DIVISOR = 5;

/** Ce que le coffre peut contenir — affiché AVANT l'ouverture. `bonusFifth` se lit quand `bonusWhole` n'est pas tombé. */
export const CHEST_ODDS = {
  minPoints: CHEST_POINTS_MIN,
  maxPoints: CHEST_POINTS_MAX,
  /** UN fragment d'étoile. */
  fragment: 1 / 6,
  freeze: 1 / 20,
  minGlory: CHEST_POINTS_MIN / 10,
  maxGlory: CHEST_POINTS_MAX / 10,
  bonusWhole: 1 / 20,
  bonusFifth: 1 / 6,
} as const;

/** Le contenu CERTAIN du coffre et les deux primes possibles, connus dès que les missions du jour sont tirées. */
export type ChestContent = {
  readonly points: number;
  readonly glory: number;
  /** La prime entière possible, en points : le prix de la prochaine Meesh du compte. */
  readonly bonusWhole: number;
  /** La prime d'un cinquième possible, en points. */
  readonly bonusFifth: number;
};

export type ChestBonus = 'none' | 'fifth' | 'whole';

export type DailyChest = {
  /** Le TOTAL crédité, prime comprise — le seul montant que lisent les clients d'avant #10011. */
  readonly points: number;
  /** UN fragment d'étoile trouvé (une chance sur six). */
  readonly fragment: boolean;
  readonly freeze: boolean;
  /** La Gloire des points de l'effort (la prime n'en donne pas). */
  readonly glory: number;
  /** La prime tombée, et son montant en points (`0` sans prime). */
  readonly bonus: ChestBonus;
  readonly bonusPoints: number;
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

/** Les points du coffre pour cet effort : une droite de 500 (300 d'effort) à 10 000 (4 500), arrondie au plus proche. */
export const chestPointsForEffort = (effort: number): number => {
  const bounded = Math.min(CHEST_EFFORT_CEILING, Math.max(CHEST_EFFORT_FLOOR, sanitize(effort)));
  const span = CHEST_EFFORT_CEILING - CHEST_EFFORT_FLOOR;
  const gain = CHEST_POINTS_MAX - CHEST_POINTS_MIN;
  return CHEST_POINTS_MIN + Math.floor((gain * (bounded - CHEST_EFFORT_FLOOR) * 2 + span) / (2 * span));
};

/** Les deux primes possibles au cours de la Meesh du compte : le prix entier, et son cinquième arrondi. */
export const chestBonusAmounts = (nextMeeshPrice: number): { readonly whole: number; readonly fifth: number } => {
  const whole = sanitize(nextMeeshPrice);
  return { whole, fifth: Math.floor((whole * 2 + CHEST_BONUS_FIFTH_DIVISOR) / (2 * CHEST_BONUS_FIFTH_DIVISOR)) };
};

/**
 * LE COURS DE LA PRIME, FIGÉ AU DÉBUT DU JOUR DE JEU (#10219) — l'instant qui sépare les frappes qui comptent de
 * celles qui ne comptent pas : l'OUVERTURE du jour de jeu, soit le tirage de ses missions (le plus ancien `createdAt`
 * des missions du jour), jamais après `now`. La prime se tire au prix de la Meesh suivante pour les frappes
 * ANTÉRIEURES à cet instant : `meeshPrice(frappes avant l'ouverture + 1)`. Une frappe du jour, même avant l'ouverture
 * du coffre, ne la fait plus monter.
 *
 * Un instant, pas un jour civil : le fuseau du compte n'y entre pas (le changer ne reclasse aucune frappe), un jour
 * de jeu prolongé (`resolveGameDayKey`) garde ses frappes, et la passerelle compte en UNE requête bornée par cet
 * instant — une frappe concurrente, forcément postérieure, n'y entre jamais. Le résultat se grave sur
 * `GameDay.chestMintBase` à la première lecture du jour et fait foi ensuite.
 */
export const chestPriceCutoff = (params: { readonly missionsOpenedAt: readonly (Date | null | undefined)[]; readonly now: Date }): Date => {
  const opened = params.missionsOpenedAt
    .filter((date): date is Date => date instanceof Date && Number.isFinite(date.getTime()))
    .reduce((earliest, date) => Math.min(earliest, date.getTime()), params.now.getTime());
  return new Date(opened);
};

/** Le contenu certain du coffre pour cet effort, et les primes possibles au cours de la prochaine Meesh. */
export const chestContentForEffort = (effort: number, nextMeeshPrice: number): ChestContent => {
  const points = chestPointsForEffort(effort);
  const bonus = chestBonusAmounts(nextMeeshPrice);
  return { points, glory: gloryForChest(points), bonusWhole: bonus.whole, bonusFifth: bonus.fifth };
};

/**
 * Le coffre du jour. `nextMeeshPrice` est `meeshPrice(frappes avant chestPriceCutoff(…) + 1)` : le cours de la Meesh FIGÉ au
 * début du jour de jeu (#10219), gravé par le serveur. La réclamation est idempotente : le contenu gravé fait foi.
 */
export function dailyChest(params: {
  readonly userId: string;
  readonly dayKey: string;
  readonly effort: number;
  readonly nextMeeshPrice: number;
}): DailyChest {
  const rng = seededRng({ userId: params.userId, dayKey: params.dayKey, salt: 'chest' });
  rng();
  const fragment = rng() < CHEST_ODDS.fragment;
  const freeze = rng() < CHEST_ODDS.freeze;
  const wholeDraw = rng() < CHEST_ODDS.bonusWhole;
  const fifthDraw = rng() < CHEST_ODDS.bonusFifth;
  const content = chestContentForEffort(params.effort, params.nextMeeshPrice);
  const bonus: ChestBonus = wholeDraw ? 'whole' : fifthDraw ? 'fifth' : 'none';
  const bonusPoints = bonus === 'whole' ? content.bonusWhole : bonus === 'fifth' ? content.bonusFifth : 0;
  return { points: content.points + bonusPoints, fragment, freeze, glory: content.glory, bonus, bonusPoints };
}
