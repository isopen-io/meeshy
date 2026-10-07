/**
 * GLOIRE ET RANGS (#9373, échelle de #9636) — la Gloire s'accumule dans un
 * registre en ajout seul, elle ne baisse jamais ; le rang se lit sur elle.
 * `docs/product/jeu-meeshy-conception.html` § II.4.
 *
 * Dix rangs, de Murmure (0) à Légende (600 000), chacun coupé en CINQ divisions
 * égales : V au départ du rang, I juste avant le rang suivant (début +
 * ⌊étendue × k ÷ 5⌋, en entiers). Légende a désormais une borne haute, le seuil
 * du Mythe (1 000 000) : au-delà, faute de place, on reste Légende I.
 *
 * Mythe n'est pas un seuil mais une PLACE : cent places, prises dans l'ordre
 * d'arrivée à 1 000 000 de Gloire. Chaque attribution porte le NUMÉRO de sa place
 * (1 à 100) et un NUMÉRO D'ÉMISSION (1, 2, 3… jamais réattribué) dont dérive sa
 * Signature unique. Tant que le compte existe, la place ne se perd jamais ; la
 * suppression du compte la libère pour le suivant, qui reçoit une émission neuve.
 * La passerelle l'attribue et la sert, le client ne la calcule jamais
 * (`mythe.ts`, `MythicSeat`).
 *
 * ## Rétrocompatibilité du fil (#9223)
 *
 * Les clients publiés ne connaissent que trois divisions (III, II, I) et les
 * décodent STRICTEMENT (iOS : `GloryDivision` à trois cas ; web : `isDivision`).
 * Le fil garde donc `division` dans 1–3 — sa projection héritée,
 * `legacyGloryDivision` : V et IV → III, III et II → II, I → I — et porte la
 * division à cinq crans dans un champ NEUF, `division5`.
 */

import { newLevelsReached } from './levels.js';

/** La Gloire de chaque source ponctuelle — les missions ont leur table, `MISSION_GLORY`. */
export const GLORY_POINTS = {
  mint: 1000,
  firstLevel: 100,
  leagueUp: 300,
  leagueCup: 1000,
  season: 5000,
  prestige: 10_000,
} as const;

/**
 * La Gloire d'une mission du jour, par difficulté — la SEULE table que les
 * missions lisent (`missionGlory`, `missions.ts`). Gravée sur la mission au
 * tirage : un barème qui bouge ne réécrit pas une mission déjà tirée.
 */
export const MISSION_GLORY = { easy: 40, medium: 100, hard: 250, gold: 500 } as const;
export type MissionGloryDifficulty = keyof typeof MISSION_GLORY;

export const gloryForMission = (difficulty: MissionGloryDifficulty): number => MISSION_GLORY[difficulty];

export const ACHIEVEMENT_RARITIES = ['common', 'rare', 'epic', 'legendary', 'mythic'] as const;
export type AchievementRarity = (typeof ACHIEVEMENT_RARITIES)[number];

const ACHIEVEMENT_GLORY: Readonly<Record<AchievementRarity, number>> = {
  common: 100,
  rare: 250,
  epic: 600,
  legendary: 1500,
  mythic: 4000,
};

export const gloryForAchievement = (rarity: AchievementRarity): number => ACHIEVEMENT_GLORY[rarity];

export const gloryForNewLevels = (params: { readonly level: number; readonly previousRecord: number | null }): number =>
  newLevelsReached(params).count * GLORY_POINTS.firstLevel;

/** Records de Flamme (jours de série) et leur Gloire. */
export const FLAME_RECORD_GLORY = [
  { days: 7, glory: 50 },
  { days: 30, glory: 150 },
  { days: 100, glory: 500 },
  { days: 365, glory: 2000 },
] as const;

export const gloryForFlameRecords = (params: { readonly previousLongest: number; readonly longest: number }): number =>
  FLAME_RECORD_GLORY.filter((r) => params.previousLongest < r.days && params.longest >= r.days).reduce(
    (total, r) => total + r.glory,
    0,
  );

/** Le seuil du Mythe — et la borne haute de Légende. */
export const MYTHE_GLORY = 1_000_000;
/** Le nombre de places du Mythe : jamais une de plus. */
export const MYTHE_SIZE = 100;

export const GLORY_RANKS = [
  { key: 'murmure', minGlory: 0 },
  { key: 'echo', minGlory: 2000 },
  { key: 'voix', minGlory: 6000 },
  { key: 'conteur', minGlory: 15_000 },
  { key: 'passeur', minGlory: 35_000 },
  { key: 'polyglotte', minGlory: 70_000 },
  { key: 'ambassadeur', minGlory: 130_000 },
  { key: 'orateur', minGlory: 230_000 },
  { key: 'oracle', minGlory: 380_000 },
  { key: 'legende', minGlory: 600_000 },
] as const;

export type GloryRankKey = (typeof GLORY_RANKS)[number]['key'];
export type GloryRankOrMythic = GloryRankKey | 'mythe';

/** La division à cinq crans : 5 = V (la plus faible), 1 = I (la plus haute). */
export type GloryDivision5 = 5 | 4 | 3 | 2 | 1;
/** La division HÉRITÉE du fil, la seule que les clients publiés savent lire. */
export type GloryDivision = 3 | 2 | 1;

export const GLORY_DIVISIONS: readonly GloryDivision5[] = [5, 4, 3, 2, 1];

const LEGACY_DIVISION: Readonly<Record<GloryDivision5, GloryDivision>> = { 5: 3, 4: 3, 3: 2, 2: 2, 1: 1 };

/** La projection d'une division à cinq crans sur les trois que lisent les clients publiés. */
export const legacyGloryDivision = (division: GloryDivision5): GloryDivision => LEGACY_DIVISION[division];

export type GloryStep = {
  readonly rank: GloryRankKey;
  /** Projection héritée (1–3) — voir `legacyGloryDivision`. */
  readonly division: GloryDivision;
  readonly division5: GloryDivision5;
  readonly minGlory: number;
};

const divisionStart = (rankIndex: number, divisionIndex: number): number => {
  const rank = GLORY_RANKS[rankIndex]!;
  const upper = GLORY_RANKS[rankIndex + 1]?.minGlory ?? MYTHE_GLORY;
  return rank.minGlory + Math.floor(((upper - rank.minGlory) * divisionIndex) / GLORY_DIVISIONS.length);
};

/** Toutes les marches, du plus bas au plus haut : 10 rangs × 5 divisions, calculées à l'appel. */
export const gloryLadder = (): readonly GloryStep[] =>
  GLORY_RANKS.flatMap((rank, rankIndex) =>
    GLORY_DIVISIONS.map((division5, divisionIndex) => ({
      rank: rank.key,
      division: legacyGloryDivision(division5),
      division5,
      minGlory: divisionStart(rankIndex, divisionIndex),
    })),
  );

/** Un numéro de place du Mythe : un entier de 1 à 100. */
export const isMythicNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= MYTHE_SIZE;

/** Un numéro d'émission : un entier à partir de 1, sans borne haute — il ne revient jamais. */
export const isMythicEdition = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 1;

/** Une place du Mythe telle que le serveur la sert : la place (1 à 100) et l'émission (sa Signature). */
export type MythicSeatRef = { readonly number: number; readonly edition: number };

const validSeat = (seat: MythicSeatRef | null | undefined): MythicSeatRef | null =>
  seat != null && isMythicNumber(seat.number) && isMythicEdition(seat.edition) ? { number: seat.number, edition: seat.edition } : null;

export type GloryStanding = {
  readonly glory: number;
  readonly rank: GloryRankOrMythic;
  /** Projection héritée (1–3), `null` pour Mythe. */
  readonly division: GloryDivision | null;
  /** V (5) à I (1), `null` pour Mythe. */
  readonly division5: GloryDivision5 | null;
  /** Gloire où commence la division courante — `null` pour Mythe. */
  readonly divisionMinGlory: number | null;
  /** La division suivante, `null` en Légende I et pour Mythe. */
  readonly next: GloryStep | null;
  readonly gloryMissing: number | null;
  /** Fraction parcourue dans la division, de 0 à 1 ; `1` quand il n'y a pas de suite. */
  readonly progress: number;
  /** La place du Mythe et son émission, quand le serveur les a servies. */
  readonly mythic: MythicSeatRef | null;
};

/**
 * Le rang lu sur la Gloire. Mythe vient du SERVEUR, jamais du seuil : `mythicSeat`
 * (la place et son émission) ou, pour un appelant qui ne connaît que le rang servi,
 * `mythic: true`. La place ne se perd pas : Mythe ne dépend plus de la Gloire.
 */
export function gloryStanding(params: {
  readonly glory: number;
  readonly mythic?: boolean;
  readonly mythicSeat?: MythicSeatRef | null;
}): GloryStanding {
  const glory = Number.isFinite(params.glory) ? Math.max(0, Math.trunc(params.glory)) : 0;
  const seat = validSeat(params.mythicSeat);

  if (seat !== null || params.mythic === true) {
    return {
      glory,
      rank: 'mythe',
      division: null,
      division5: null,
      divisionMinGlory: null,
      next: null,
      gloryMissing: null,
      progress: 1,
      mythic: seat,
    };
  }

  const steps = gloryLadder();
  const stepIndex = steps.reduce((found, step, index) => (glory >= step.minGlory ? index : found), 0);
  const step = steps[stepIndex]!;
  const next = steps[stepIndex + 1] ?? null;

  return {
    glory,
    rank: step.rank,
    division: step.division,
    division5: step.division5,
    divisionMinGlory: step.minGlory,
    next,
    gloryMissing: next === null ? null : next.minGlory - glory,
    progress: next === null ? 1 : (glory - step.minGlory) / (next.minGlory - step.minGlory),
    mythic: null,
  };
}
