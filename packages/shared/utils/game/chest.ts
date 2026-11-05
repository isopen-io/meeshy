/**
 * LE COFFRE DU JOUR (#9373, #10011) — déterministe par utilisateur, par jour, par EFFORT des missions du jour et
 * par le cours de la Meesh du compte. `docs/product/jeu-meeshy-conception.html` § II.5.
 *
 * ## Ce qu'il contient (décision du porteur, 2026-10-10, 3e et dernière précision)
 *
 *  - des POINTS, de 500 à 10 000, selon la COMPLEXITÉ des trois missions du jour ;
 *  - de la GLOIRE (porteur, 2026-11-05, #16414), de 1 250 à 5 800 : une BASE de 1 250 à 3 000 selon la même
 *    complexité, et une PRIME DE PRÉCOCITÉ de 2 800 à 0 selon l'heure du jour de jeu où le coffre s'ouvre ;
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
 * ## La Gloire : la complexité, puis l'heure (#16414)
 *
 *     base      = 1 250 + round(1 750 × (effort − 300) ÷ 4 200), l'effort borné à [300, 4 500]
 *     précocité = round(2 800 × (23 − h) ÷ 23), h = heures ENTIÈRES écoulées depuis le début du jour de jeu, bornée à [0, 23]
 *
 * La base suit la même droite que les points (1 250 au jour le plus léger, 3 000 au plus lourd). La précocité vaut
 * 2 800 dans la première heure du jour de jeu et décroît d'un vingt-troisième par heure jusqu'à 0 dans la dernière ;
 * un jour de jeu prolongé (`resolveGameDayKey`, au-delà de 24 h) n'en paie plus. Une heure illisible n'en paie pas.
 *
 * Le DÉBUT du jour de jeu (`chestDayStart`) est minuit de sa clé dans le fuseau du compte — sauf si les missions du
 * jour ont été tirées AVANT cet instant : un fuseau changé en cours de journée (vers l'ouest) recule minuit après le
 * tirage, et l'ouverture des missions, instant serveur que le fuseau ne déplace pas, fait alors foi. Changer de
 * fuseau ne rajeunit donc jamais un jour de jeu.
 *
 * La passerelle calcule l'heure à l'instant SERVEUR de la réclamation et GRAVE la Gloire totale sur le coffre ; une
 * réclamation rejouée rend la valeur gravée. L'aperçu (`GameChest.today`) sert la Gloire « si on l'ouvre maintenant »
 * et sa part de précocité (`earlyGlory`) ; `glory` reste le total, le seul champ que lisent les clients d'avant.
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
import { MISSION_TEMPLATES } from './mission-catalog.js';
import { MISSION_BASE_POINTS, MISSION_DIFFICULTIES, type MissionDifficulty } from './missions.js';

export const CHEST_POINTS_MIN = 500;
export const CHEST_POINTS_MAX = 10_000;
/** L'effort qui vaut le minimum de points, et celui qui vaut le maximum. */
export const CHEST_EFFORT_FLOOR = 300;
export const CHEST_EFFORT_CEILING = 4500;

/** La Gloire du coffre (#16414) : la base, de 1 250 à 3 000 sur l'effort, puis la prime de précocité, de 2 800 à 0. */
export const CHEST_GLORY_MIN = 1250;
export const CHEST_GLORY_BASE_MAX = 3000;
export const CHEST_EARLY_GLORY_MAX = 2800;
export const CHEST_GLORY_MAX = CHEST_GLORY_BASE_MAX + CHEST_EARLY_GLORY_MAX;
/** La dernière heure entière du jour de jeu : la précocité y vaut 0, et au-delà. */
export const CHEST_EARLY_LAST_HOUR = 23;
const HOUR_MS = 3_600_000;

/** La prime : une chance sur 20 le prix entier de la prochaine Meesh, sinon une sur 6 un cinquième de ce prix. */
export const CHEST_BONUS_FIFTH_DIVISOR = 5;

/** Ce que le coffre peut contenir — affiché AVANT l'ouverture. `bonusFifth` se lit quand `bonusWhole` n'est pas tombé. */
export const CHEST_ODDS = {
  minPoints: CHEST_POINTS_MIN,
  maxPoints: CHEST_POINTS_MAX,
  /** UN fragment d'étoile. */
  fragment: 1 / 6,
  freeze: 1 / 20,
  minGlory: CHEST_GLORY_MIN,
  maxGlory: CHEST_GLORY_MAX,
  bonusWhole: 1 / 20,
  bonusFifth: 1 / 6,
} as const;

/** Le contenu CERTAIN du coffre et les deux primes possibles, connus dès que les missions du jour sont tirées. */
export type ChestContent = {
  readonly points: number;
  /** La Gloire TOTALE si le coffre s'ouvre maintenant : la base et la précocité. */
  readonly glory: number;
  /** La part de précocité de `glory` (#16414). */
  readonly earlyGlory: number;
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
  /** La Gloire TOTALE : la base de l'effort et la précocité (la prime en points n'en donne pas). */
  readonly glory: number;
  /** La part de précocité de `glory` (#16414). */
  readonly earlyGlory: number;
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

/** Une droite de `low` (300 d'effort) à `high` (4 500), en entiers exacts, arrondie au plus proche. */
const effortLine = (effort: number, low: number, high: number): number => {
  const bounded = Math.min(CHEST_EFFORT_CEILING, Math.max(CHEST_EFFORT_FLOOR, sanitize(effort)));
  const span = CHEST_EFFORT_CEILING - CHEST_EFFORT_FLOOR;
  return low + Math.floor(((high - low) * (bounded - CHEST_EFFORT_FLOOR) * 2 + span) / (2 * span));
};

/** Les points du coffre pour cet effort : une droite de 500 (300 d'effort) à 10 000 (4 500), arrondie au plus proche. */
export const chestPointsForEffort = (effort: number): number => effortLine(effort, CHEST_POINTS_MIN, CHEST_POINTS_MAX);

/** La Gloire de base du coffre pour cet effort : une droite de 1 250 (300 d'effort) à 3 000 (4 500). */
export const chestBaseGloryForEffort = (effort: number): number => effortLine(effort, CHEST_GLORY_MIN, CHEST_GLORY_BASE_MAX);

/**
 * La prime de précocité après `elapsedHours` heures du jour de jeu : 2 800 dans la première, 0 dans la dernière
 * (la 24e) et au-delà, arrondie au plus proche. Une heure illisible ne paie rien ; une heure négative vaut la première.
 */
export const chestEarlyGlory = (elapsedHours: number): number => {
  if (!Number.isFinite(elapsedHours)) return 0;
  const hour = Math.min(CHEST_EARLY_LAST_HOUR, Math.max(0, Math.floor(elapsedHours)));
  return Math.floor((CHEST_EARLY_GLORY_MAX * (CHEST_EARLY_LAST_HOUR - hour) * 2 + CHEST_EARLY_LAST_HOUR) / (2 * CHEST_EARLY_LAST_HOUR));
};

/**
 * Le DÉBUT du jour de jeu pour la précocité : minuit de sa clé dans le fuseau du compte, ou l'ouverture des missions
 * du jour si elle le précède (un fuseau changé vers l'ouest ne rajeunit pas la journée).
 */
export const chestDayStart = (params: { readonly localMidnight: Date; readonly missionsOpenedAt: readonly (Date | null | undefined)[] }): Date =>
  chestPriceCutoff({ missionsOpenedAt: params.missionsOpenedAt, now: params.localMidnight });

/** Les heures ENTIÈRES écoulées depuis le début du jour de jeu (négatives si `now` le précède). */
export const chestElapsedHours = (params: { readonly dayStartedAt: Date; readonly now: Date }): number =>
  Math.floor((params.now.getTime() - params.dayStartedAt.getTime()) / HOUR_MS);

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

/**
 * Le contenu certain du coffre pour cet effort, ouvert après `elapsedHours` heures du jour de jeu, et les primes
 * possibles au cours de la prochaine Meesh.
 */
export const chestContentForEffort = (effort: number, nextMeeshPrice: number, elapsedHours: number): ChestContent => {
  const bonus = chestBonusAmounts(nextMeeshPrice);
  const earlyGlory = chestEarlyGlory(elapsedHours);
  return {
    points: chestPointsForEffort(effort),
    glory: chestBaseGloryForEffort(effort) + earlyGlory,
    earlyGlory,
    bonusWhole: bonus.whole,
    bonusFifth: bonus.fifth,
  };
};

/**
 * Le coffre du jour. `nextMeeshPrice` est `meeshPrice(frappes avant chestPriceCutoff(…) + 1)` : le cours de la Meesh FIGÉ au
 * début du jour de jeu (#10219), gravé par le serveur ; `elapsedHours` les heures entières du jour de jeu à
 * l'instant SERVEUR de la réclamation (`chestElapsedHours`, #16414). La réclamation est idempotente : le contenu
 * gravé fait foi.
 */
export function dailyChest(params: {
  readonly userId: string;
  readonly dayKey: string;
  readonly effort: number;
  readonly nextMeeshPrice: number;
  readonly elapsedHours: number;
}): DailyChest {
  const rng = seededRng({ userId: params.userId, dayKey: params.dayKey, salt: 'chest' });
  rng();
  const fragment = rng() < CHEST_ODDS.fragment;
  const freeze = rng() < CHEST_ODDS.freeze;
  const wholeDraw = rng() < CHEST_ODDS.bonusWhole;
  const fifthDraw = rng() < CHEST_ODDS.bonusFifth;
  const content = chestContentForEffort(params.effort, params.nextMeeshPrice, params.elapsedHours);
  const bonus: ChestBonus = wholeDraw ? 'whole' : fifthDraw ? 'fifth' : 'none';
  const bonusPoints = bonus === 'whole' ? content.bonusWhole : bonus === 'fifth' ? content.bonusFifth : 0;
  return { points: content.points + bonusPoints, fragment, freeze, glory: content.glory, earlyGlory: content.earlyGlory, bonus, bonusPoints };
}
