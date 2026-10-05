/**
 * GLOIRE ET RANGS (#9373) — la Gloire s'accumule dans un registre en ajout
 * seul, elle ne baisse jamais ; le rang se lit sur elle.
 * `docs/product/jeu-meeshy-conception.html` § II.4.
 *
 * Dix rangs en trois divisions (III, II, I). Chaque intervalle est coupé en
 * tiers égaux (début + ⌊étendue × k ÷ 3⌋, en entiers). Légende n'a pas de
 * borne haute : ses divisions avancent par paliers de 40 000. Mythe n'est pas
 * un seuil mais un DRAPEAU que le serveur fournit (les 100 Légendes les plus
 * glorieuses) : le client ne le calcule jamais.
 */

import { newLevelsReached } from './levels.js';

export const GLORY_POINTS = {
  mint: 100,
  firstLevel: 20,
  goldMission: 40,
  leagueUp: 30,
  leagueCup: 100,
  season: 500,
  prestige: 1000,
} as const;

export const ACHIEVEMENT_RARITIES = ['common', 'rare', 'epic', 'legendary', 'mythic'] as const;
export type AchievementRarity = (typeof ACHIEVEMENT_RARITIES)[number];

const ACHIEVEMENT_GLORY: Readonly<Record<AchievementRarity, number>> = {
  common: 10,
  rare: 25,
  epic: 60,
  legendary: 150,
  mythic: 400,
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

export const GLORY_RANKS = [
  { key: 'murmure', minGlory: 0 },
  { key: 'echo', minGlory: 500 },
  { key: 'voix', minGlory: 1500 },
  { key: 'conteur', minGlory: 3500 },
  { key: 'passeur', minGlory: 7000 },
  { key: 'polyglotte', minGlory: 12_000 },
  { key: 'ambassadeur', minGlory: 20_000 },
  { key: 'orateur', minGlory: 32_000 },
  { key: 'oracle', minGlory: 50_000 },
  { key: 'legende', minGlory: 80_000 },
] as const;

export type GloryRankKey = (typeof GLORY_RANKS)[number]['key'];
export type GloryRankOrMythic = GloryRankKey | 'mythe';
export type GloryDivision = 3 | 2 | 1;

/** Largeur d'une division de Légende — au-delà, il n'y a plus de rang. */
export const LEGEND_DIVISION_STEP = 40_000;

const DIVISIONS: readonly GloryDivision[] = [3, 2, 1];

export type GloryStep = {
  readonly rank: GloryRankKey;
  readonly division: GloryDivision;
  readonly minGlory: number;
};

const divisionStart = (rankIndex: number, divisionIndex: number): number => {
  const rank = GLORY_RANKS[rankIndex]!;
  const following = GLORY_RANKS[rankIndex + 1];
  if (following === undefined) return rank.minGlory + LEGEND_DIVISION_STEP * divisionIndex;
  return rank.minGlory + Math.floor(((following.minGlory - rank.minGlory) * divisionIndex) / 3);
};

/** Toutes les marches, du plus bas au plus haut : 10 rangs × 3 divisions. */
const STEPS: readonly GloryStep[] = GLORY_RANKS.flatMap((rank, rankIndex) =>
  DIVISIONS.map((division, divisionIndex) => ({
    rank: rank.key,
    division,
    minGlory: divisionStart(rankIndex, divisionIndex),
  })),
);

export type GloryStanding = {
  readonly glory: number;
  readonly rank: GloryRankOrMythic;
  /** `null` pour Mythe. */
  readonly division: GloryDivision | null;
  /** Gloire où commence la division courante — `null` pour Mythe. */
  readonly divisionMinGlory: number | null;
  /** La division suivante, `null` en division I de Légende et pour Mythe. */
  readonly next: GloryStep | null;
  readonly gloryMissing: number | null;
  /** Fraction parcourue dans la division, de 0 à 1 ; `1` quand il n'y a pas de suite. */
  readonly progress: number;
};

export function gloryStanding(params: { readonly glory: number; readonly mythic: boolean }): GloryStanding {
  const glory = Number.isFinite(params.glory) ? Math.max(0, Math.trunc(params.glory)) : 0;
  const legendStart = GLORY_RANKS.at(-1)!.minGlory;

  if (params.mythic && glory >= legendStart) {
    return { glory, rank: 'mythe', division: null, divisionMinGlory: null, next: null, gloryMissing: null, progress: 1 };
  }

  const stepIndex = STEPS.reduce((found, step, index) => (glory >= step.minGlory ? index : found), 0);
  const step = STEPS[stepIndex]!;
  const next = STEPS[stepIndex + 1] ?? null;

  return {
    glory,
    rank: step.rank,
    division: step.division,
    divisionMinGlory: step.minGlory,
    next,
    gloryMissing: next === null ? null : next.minGlory - glory,
    progress: next === null ? 1 : (glory - step.minGlory) / (next.minGlory - step.minGlory),
  };
}
