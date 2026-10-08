/**
 * LES ÉTAPES DES NIVEAUX (#9706, porteur 2026-10-08) — une étape simple tous les dix niveaux, de 10 à 100.
 *
 * Les points ne suffisent plus : pour atteindre le niveau 10, il faut aussi avoir frappé une Meesh ; pour
 * le 20, avoir accompli une mission du jour ; et ainsi de suite jusqu'au 100, qui demande le rang Passeur.
 * Si les points sont là mais pas l'étape, le niveau ATTEND au palier précédent (9, 19 … 99), puis monte
 * d'un coup dès que l'étape est faite. Au-delà de 100, plus d'étape : seuls les plafonds du rang (#9688).
 *
 * Chaque étape porte sur un fait qui ne se défait jamais — les Meeshes frappées à vie, les missions du jour
 * accomplies à vie, le RECORD de Flamme, le rang de Gloire —, donc le palier qu'elle ouvre ne se referme
 * pas (c'est ce qui autorise `levelForUnlocks` à lire le record au lieu de relire les faits).
 *
 * Le niveau servi est le plus petit de trois : celui des points, le plafond du rang, le palier des étapes
 * (`levelCapWithSteps`, puis `levelProgress(score, cap, gate)`).
 */

import { GLORY_RANKS, levelCapForRank, type GloryRankKey, type GloryRankOrMythic } from './glory.js';
import { LEVEL_STEP_INTERVAL, LEVEL_STEP_LAST, NO_LEVEL_CAP, tighterLevelCap, type LevelCap } from './levels.js';

export const LEVEL_STEP_KINDS = ['mint', 'missions', 'rank', 'flame'] as const;
export type LevelStepKind = (typeof LEVEL_STEP_KINDS)[number];

/** Une étape : le niveau qu'elle ouvre et ce qu'elle demande. */
export type LevelStepRule =
  | { readonly level: number; readonly kind: 'mint' | 'missions' | 'flame'; readonly target: number }
  | { readonly level: number; readonly kind: 'rank'; readonly rank: GloryRankKey };

/** La table du porteur — une ligne par dizaine, dans l'ordre. */
export const LEVEL_STEPS: readonly LevelStepRule[] = [
  { level: 10, kind: 'mint', target: 1 },
  { level: 20, kind: 'missions', target: 1 },
  { level: 30, kind: 'rank', rank: 'echo' },
  { level: 40, kind: 'flame', target: 7 },
  { level: 50, kind: 'missions', target: 10 },
  { level: 60, kind: 'rank', rank: 'voix' },
  { level: 70, kind: 'mint', target: 5 },
  { level: 80, kind: 'rank', rank: 'conteur' },
  { level: 90, kind: 'flame', target: 30 },
  { level: 100, kind: 'rank', rank: 'passeur' },
];

/** Les compteurs que la passerelle lit pour les étapes — ceux qui ne vivent pas dans le bloc de Gloire. */
export type LevelStepCounts = {
  /** Meeshes frappées à vie (`User.meeshMintedLifetime`). */
  readonly minted: number;
  /** Missions du jour accomplies à vie — comptées jusqu'à `LEVEL_STEP_MISSIONS_COUNTED`, pas au-delà. */
  readonly missionsDone: number;
  /** La plus longue Flamme, en jours (`User.longestStreakDays`). */
  readonly flameRecord: number;
};

/** Tout ce que les étapes lisent : les compteurs, la Gloire et le rang (Mythe compris, servi par le serveur). */
export type LevelStepFacts = LevelStepCounts & {
  readonly glory: number;
  readonly rank: GloryRankOrMythic;
};

/** La plus grande cible des missions : la passerelle n'a pas besoin de compter plus loin. */
export const LEVEL_STEP_MISSIONS_COUNTED = LEVEL_STEPS.reduce(
  (most, rule) => (rule.kind === 'missions' ? Math.max(most, rule.target) : most),
  0,
);

/** Une étape telle que le fil la sert : ce qu'elle demande, où en est le compte, et si elle est faite. */
export type LevelStep = {
  readonly level: number;
  readonly kind: LevelStepKind;
  /** Meeshes, missions, jours de Flamme — ou, pour un rang, la Gloire où il commence. */
  readonly target: number;
  /** Où en est le compte, dans la même unité que `target`. */
  readonly current: number;
  readonly met: boolean;
  /** Le rang demandé — `null` hors des étapes de rang. */
  readonly rank: GloryRankKey | null;
};

const count = (value: number): number => (Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0);

const rankIndex = (rank: GloryRankOrMythic): number =>
  rank === 'mythe' ? GLORY_RANKS.length : GLORY_RANKS.findIndex((step) => step.key === rank);

const rankMinGlory = (rank: GloryRankKey): number => GLORY_RANKS.find((step) => step.key === rank)?.minGlory ?? 0;

const currentOf = (rule: LevelStepRule, facts: LevelStepFacts): number => {
  switch (rule.kind) {
    case 'mint':
      return count(facts.minted);
    case 'missions':
      return count(facts.missionsDone);
    case 'flame':
      return count(facts.flameRecord);
    case 'rank':
      return count(facts.glory);
  }
};

/** L'étape est-elle faite ? Un rang se juge sur le rang SERVI (le Mythe vaut tous les rangs), jamais sur la seule Gloire. */
export const levelStepMet = (rule: LevelStepRule, facts: LevelStepFacts): boolean =>
  rule.kind === 'rank' ? rankIndex(facts.rank) >= rankIndex(rule.rank) : currentOf(rule, facts) >= rule.target;

/** L'étape d'un niveau donné — `null` hors des dizaines de 10 à 100. */
export const levelStepRuleAt = (level: number): LevelStepRule | null => LEVEL_STEPS.find((rule) => rule.level === level) ?? null;

/**
 * Le palier des étapes : la première étape manquante retient le niveau juste en dessous (9, 19 … 99) ;
 * toutes faites, plus rien ne retient (`null`). Sans faits (`null`, un serveur d'avant les étapes), rien
 * non plus : la lecture est celle des points et du rang.
 */
export function levelStepGate(facts: LevelStepFacts | null): LevelCap {
  if (facts === null) return NO_LEVEL_CAP;
  const missing = LEVEL_STEPS.find((rule) => !levelStepMet(rule, facts));
  return missing === undefined ? NO_LEVEL_CAP : missing.level - 1;
}

/** Le plafond du niveau SERVI : le plus serré du rang (#9688) et des étapes (#9706). */
export const levelCapWithSteps = (params: { readonly rank: GloryRankOrMythic; readonly steps: LevelStepFacts | null }): LevelCap =>
  tighterLevelCap(levelCapForRank(params.rank), levelStepGate(params.steps));

const stepOf = (rule: LevelStepRule, facts: LevelStepFacts): LevelStep => ({
  level: rule.level,
  kind: rule.kind,
  target: rule.kind === 'rank' ? rankMinGlory(rule.rank) : rule.target,
  current: currentOf(rule, facts),
  met: levelStepMet(rule, facts),
  rank: rule.kind === 'rank' ? rule.rank : null,
});

/**
 * La PROCHAINE étape au-dessus de ce niveau — celle que l'écran montre, faite ou à faire. `null` au-delà
 * de 100, ou sans faits. Un niveau retenu à 9 montre donc l'étape du 10 : c'est elle qui dit pourquoi.
 */
export function nextLevelStep(level: number, facts: LevelStepFacts | null): LevelStep | null {
  if (facts === null) return null;
  const n = Number.isFinite(level) ? Math.trunc(level) : 0;
  if (n >= LEVEL_STEP_LAST) return null;
  const nextLevel = (Math.floor(Math.max(0, n) / LEVEL_STEP_INTERVAL) + 1) * LEVEL_STEP_INTERVAL;
  const rule = levelStepRuleAt(nextLevel);
  return rule === null ? null : stepOf(rule, facts);
}

/** Toutes les étapes, faites ou à faire — le carnet des règles et la fiche des étapes. */
export const levelStepsOf = (facts: LevelStepFacts): readonly LevelStep[] => LEVEL_STEPS.map((rule) => stepOf(rule, facts));
