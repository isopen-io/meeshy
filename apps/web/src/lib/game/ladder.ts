import type { GameBlock } from '@meeshy/shared/types/game';
import { LEVEL_TIER_KEYS, levelTierStart, type LevelCap, type LevelTierKey } from '@meeshy/shared/utils/game/levels';

/**
 * LA LECTURE DU NIVEAU QUE L'ÉCRAN MONTRE (#9688) — les niveaux s'ouvrent selon le rang. Le serveur sert la
 * vérité dans `level.ladder` et garde les champs d'hier sous l'ancienne loi (≤ 100, dix paliers) pour les
 * clients publiés. Devant un serveur antérieur (sans `ladder`), les champs d'hier SONT la vérité.
 */
export type LevelReading = {
  readonly level: number;
  readonly tier: LevelTierKey;
  readonly floorScore: number;
  readonly nextThreshold: number | null;
  readonly pointsToNext: number;
  readonly progress: number;
  readonly record: number;
  /** Le plafond que le rang ouvre — `null` : sans limite ; `undefined` : un serveur antérieur ne le dit pas. */
  readonly cap: LevelCap | undefined;
  /** Le niveau est au plafond du rang : il monte dès que le rang l'ouvre. */
  readonly isMax: boolean;
};

export const levelReading = (level: GameBlock['level']): LevelReading =>
  level.ladder ?? {
    level: level.level,
    tier: level.tier,
    floorScore: level.floorScore,
    nextThreshold: level.nextThreshold,
    pointsToNext: level.pointsToNext,
    progress: level.progress,
    record: level.record,
    cap: undefined,
    isMax: level.nextThreshold === null,
  };

/** Les niveaux que coûte la frappe, lus sur la même vérité. */
export const mintLevels = (mint: GameBlock['mint']): { readonly levelBefore: number; readonly levelAfter: number; readonly levelsLost: number } =>
  mint.ladder ?? { levelBefore: mint.levelBefore, levelAfter: mint.levelAfter, levelsLost: mint.levelsLost };

/** Le premier niveau du palier suivant — `null` après Singularité, qui n'a pas de fin. */
export const nextTierLevel = (tier: LevelTierKey): number | null => {
  const next = LEVEL_TIER_KEYS[LEVEL_TIER_KEYS.indexOf(tier) + 1];
  return next === undefined ? null : levelTierStart(next);
};

/** Galaxie et Singularité sont des spectres : elles se peignent au prisme. */
export const isSpectralTier = (tier: LevelTierKey): boolean => tier === 'galaxie' || tier === 'singularite';
