import type { GameBlock } from '@meeshy/shared/types/game';
import { flameForm, type FlameFormKey } from '@meeshy/shared/utils/game/flame';
import type { GloryDivision, GloryRankOrMythic } from '@meeshy/shared/utils/game/glory';
import type { GuideMomentKey } from '@meeshy/shared/utils/game/guide';
import { LEVEL_TIER_KEYS, type LevelTierKey } from '@meeshy/shared/utils/game/levels';
import { meeshEdition, type MeeshEdition } from '@meeshy/shared/utils/game/mint';
import { TREASURY_TIERS, type TreasuryTierKey } from '@meeshy/shared/utils/game/treasury';

import type { EngagementWithGame } from '@/lib/api/engagement';
import { LEVEL_TIER_NAMES, TREASURY_NAMES, editionName, formatCount, rankLabel } from '@/lib/view/game-copy';

/**
 * LES MOMENTS QUI SE PHOTOGRAPHIENT (#9382) — conception, partie VI : « les
 * grands moments se photographient ». Photo de départ, nouveau rang ou
 * division, nouveau palier de niveau et Prestige, première Meesh, chaque 10e
 * et chaque édition or ou prisme, palier du trésor, Flamme à 7, 30, 100 et 365
 * jours.
 *
 * Un moment est une DONNÉE : une identité stable (`id`), l'emblème que le
 * cadre grave (`emblem`), et deux lignes (`kicker`, `title`). L'identité fait
 * qu'un « plus tard » puis un retour ne propose jamais deux fois la même photo,
 * et qu'une division nouvelle est un moment nouveau.
 *
 * Trois sources, qui se recoupent par les MÊMES constructeurs :
 *  - `photoMomentFromCard` : la carte du guide propose « Immortaliser » pour le
 *    moment qu'elle vient de dire ;
 *  - `photoMomentsOfTransition` : ce qui arrive pendant que l'écran est ouvert ;
 *  - `startMoment` : la photo de départ, à la fin de l'intégration.
 */

export type PhotoEmblem =
  | { readonly kind: 'start' }
  | { readonly kind: 'rank'; readonly rank: GloryRankOrMythic; readonly division: GloryDivision | null }
  | { readonly kind: 'tier'; readonly tier: LevelTierKey; readonly level: number }
  | { readonly kind: 'level-hundred'; readonly prestige: number }
  | { readonly kind: 'meesh'; readonly number: number; readonly edition: MeeshEdition }
  | { readonly kind: 'treasury'; readonly tier: TreasuryTierKey }
  | { readonly kind: 'flame'; readonly form: FlameFormKey; readonly days: number };

export type PhotoMoment = {
  readonly id: string;
  readonly emblem: PhotoEmblem;
  /** La ligne du dessus : « Nouveau rang ». */
  readonly kicker: string;
  /** La ligne forte : « Voix II ». */
  readonly title: string;
};

export const startMoment = (): PhotoMoment => ({
  id: 'start',
  emblem: { kind: 'start' },
  kicker: 'Premiers pas',
  title: 'Mon départ sur Meeshy',
});

export const rankMoment = (params: { readonly rank: GloryRankOrMythic; readonly division: GloryDivision | null }): PhotoMoment => ({
  id: `rank:${params.rank}:${params.division ?? 0}`,
  emblem: { kind: 'rank', rank: params.rank, division: params.division },
  kicker: 'Nouveau rang',
  title: rankLabel(params.rank, params.division),
});

export const tierMoment = (params: { readonly tier: LevelTierKey; readonly level: number }): PhotoMoment => ({
  id: `tier:${params.tier}`,
  emblem: { kind: 'tier', tier: params.tier, level: params.level },
  kicker: `Niveau ${params.level}`,
  title: `Palier ${LEVEL_TIER_NAMES[params.tier]}`,
});

export const levelHundredMoment = (prestige: number): PhotoMoment => ({
  id: `level-100:${prestige}`,
  emblem: { kind: 'level-hundred', prestige },
  kicker: prestige === 0 ? 'Au sommet' : 'Nouveau tour',
  title: prestige === 0 ? 'Niveau 100' : `Prestige ${prestige}`,
});

export const meeshMoment = (params: { readonly number: number; readonly edition: MeeshEdition }): PhotoMoment => ({
  id: `meesh:${params.number}`,
  emblem: { kind: 'meesh', number: params.number, edition: params.edition },
  kicker: 'Meesh frappée',
  title:
    params.number === 1
      ? 'Ma première Meesh'
      : `Meesh n° ${formatCount(params.number)}${params.edition === 'silver' ? '' : ` · ${editionName(params.edition)}`}`,
});

export const treasuryMoment = (tier: TreasuryTierKey): PhotoMoment => ({
  id: `treasury:${tier}`,
  emblem: { kind: 'treasury', tier },
  kicker: 'Trésor',
  title: TREASURY_NAMES[tier],
});

const FLAME_THRESHOLDS = [7, 30, 100, 365] as const;

const flameThreshold = (days: number): number | null =>
  [...FLAME_THRESHOLDS].reverse().find((threshold) => days >= threshold) ?? null;

export const flameMoment = (days: number): PhotoMoment => {
  const threshold = flameThreshold(days) ?? days;
  return {
    id: `flame:${threshold}`,
    emblem: { kind: 'flame', form: flameForm(threshold) ?? 'braise', days: threshold },
    kicker: 'Flamme',
    title: `${threshold} jours de Flamme`,
  };
};

const tierLevel = (tier: LevelTierKey): number => LEVEL_TIER_KEYS.indexOf(tier) * 10;

/** Le moment que propose une carte du guide, dans l'état courant du jeu ; `null` si elle ne se photographie pas. */
export function photoMomentFromCard(key: GuideMomentKey, game: GameBlock): PhotoMoment | null {
  switch (key) {
    case 'new-rank':
      return rankMoment({ rank: game.glory.rank, division: game.glory.division });
    case 'new-tier':
      return tierMoment({ tier: game.level.tier, level: tierLevel(game.level.tier) });
    case 'first-mint': {
      /* `mint.number` est la PROCHAINE pièce : celle qui vient d'être frappée porte le numéro d'avant. */
      const number = Math.max(1, game.mint.number - 1);
      return meeshMoment({ number, edition: meeshEdition(number) });
    }
    case 'treasury-tier':
      return game.treasury.tier === null ? null : treasuryMoment(game.treasury.tier);
    case 'level-100':
      return levelHundredMoment(game.level.prestige);
    default:
      return null;
  }
}

const treasuryIndex = (game: GameBlock): number => TREASURY_TIERS.findIndex((tier) => tier.key === game.treasury.tier);

/** Les moments que la transition vient de produire : ce que Mee propose APRÈS la célébration. */
export function photoMomentsOfTransition(previous: EngagementWithGame, next: EngagementWithGame): PhotoMoment[] {
  const before = previous.game;
  const after = next.game;
  if (before === undefined || after === undefined) return [];

  const minted = before.mint.number;
  const crossedFlame = FLAME_THRESHOLDS.some((threshold) => before.flame.days < threshold && after.flame.days >= threshold);
  const rankUp =
    after.glory.rank !== before.glory.rank ||
    (after.glory.division !== null && before.glory.division !== null && after.glory.division < before.glory.division);

  const moments: (PhotoMoment | null)[] = [
    rankUp && after.glory.glory > before.glory.glory ? rankMoment({ rank: after.glory.rank, division: after.glory.division }) : null,
    LEVEL_TIER_KEYS.indexOf(after.level.tier) > LEVEL_TIER_KEYS.indexOf(before.level.tier)
      ? tierMoment({ tier: after.level.tier, level: tierLevel(after.level.tier) })
      : null,
    after.level.prestige > before.level.prestige ? levelHundredMoment(after.level.prestige) : null,
    after.mint.number > before.mint.number && (minted === 1 || minted % 10 === 0)
      ? meeshMoment({ number: minted, edition: meeshEdition(minted) })
      : null,
    treasuryIndex(after) > treasuryIndex(before) && after.treasury.tier !== null ? treasuryMoment(after.treasury.tier) : null,
    crossedFlame ? flameMoment(after.flame.days) : null,
  ];
  return moments.filter((moment): moment is PhotoMoment => moment !== null);
}
