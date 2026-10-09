import type { GameBlock, UserGameProfileResponse } from '@meeshy/shared/types/game';
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

/** Le niveau servi, dont les champs de lecture sont ceux de la vérité (`ladder`) — prestige, score et Prestige inchangés. */
export type ShownLevel = Omit<GameBlock['level'], keyof LevelReading | 'ladder'> & LevelReading;

export const shownLevelOf = (level: GameBlock['level']): ShownLevel => {
  const { ladder: _ladder, ...served } = level;
  return { ...served, ...levelReading(level) };
};

/** Le rang qui lève le plafond où le niveau s'est arrêté : Ambassadeur ouvre 500, Oracle ouvre 1001 ; `null` sans plafond atteint. */
export const capOpener = (level: LevelReading): 'ambassadeur' | 'oracle' | null => {
  if (!level.isMax || level.cap === null || level.cap === undefined) return null;
  return level.cap < 1000 ? 'ambassadeur' : 'oracle';
};

type ServedStanding = NonNullable<UserGameProfileResponse['standing']>;

/** Le profil d'un autre membre tel que l'écran le montre : son niveau et son palier ouverts par le rang. */
export const shownStanding = (standing: ServedStanding | null): (Omit<ServedStanding, 'tier'> & { readonly tier: LevelTierKey }) | null =>
  standing === null ? null : { ...standing, level: standing.ladder?.level ?? standing.level, tier: standing.ladder?.tier ?? standing.tier };
