import type { GameBlock } from '@meeshy/shared/types/game';
import type { PhotoCatchUpEntry, PhotoCatchUpStanding, PhotoStepEmblem, PhotoTrack } from '@meeshy/shared/utils/game/photo-catch-up';

import { levelReading } from '@/lib/game/ladder';
import { shownRank } from '@/lib/view/game-copy';

import {
  flameMoment,
  levelHundredMoment,
  meeshMoment,
  photoMomentOfEmblemV2,
  rankMoment,
  startMoment,
  tierMoment,
  treasuryMoment,
  type PhotoMoment,
} from './moments';

/**
 * LE RATTRAPAGE DU CARNET (#9961, #9962) — le côté web de la loi partagée
 * (`packages/shared/utils/game/photo-catch-up.ts`). Deux traductions, rien
 * d'autre : le bloc `game` servi devient la SITUATION que la loi lit, et
 * chaque étape devient un moment COMPLET par les MÊMES constructeurs que la
 * proposition en direct (`moments.ts`) — l'identité d'une étape est donc celle
 * d'une photo déjà gardée, et le carnet ne la redemande pas.
 */

export function catchUpStandingOf(game: GameBlock): PhotoCatchUpStanding {
  const { rank, division } = shownRank(game.glory);
  return {
    rank,
    division,
    levelRecord: levelReading(game.level).record,
    prestige: game.level.prestige,
    minted: Math.max(0, game.mint.number - 1),
    treasuryTier: game.treasury.tier,
    flameRecord: Math.max(game.level.ladder?.steps?.flameRecord ?? 0, game.flame.days),
  };
}

const momentOfStep = (emblem: PhotoStepEmblem): PhotoMoment => {
  switch (emblem.kind) {
    case 'start':
      return startMoment();
    case 'rank':
      return rankMoment({ rank: emblem.rank, division: emblem.division });
    case 'tier':
      return tierMoment({ tier: emblem.tier, level: emblem.level });
    case 'level-hundred':
      return levelHundredMoment(emblem.prestige);
    case 'prestige':
      return photoMomentOfEmblemV2({ kind: 'prestige', number: emblem.number });
    case 'meesh':
      return meeshMoment({ number: emblem.number, edition: emblem.edition });
    case 'treasury':
      return treasuryMoment(emblem.tier);
    case 'flame':
      return flameMoment(emblem.days);
  }
};

export type CatchUpMoment = {
  readonly track: PhotoTrack;
  readonly moment: PhotoMoment;
  readonly state: PhotoCatchUpEntry['state'];
  /** L'identité de l'étape à photographier d'abord ; `null` pour l'étape ouverte. */
  readonly blockedBy: string | null;
};

export const catchUpMoments = (entries: readonly PhotoCatchUpEntry[]): CatchUpMoment[] =>
  entries.map((entry) => ({ track: entry.track, moment: momentOfStep(entry.emblem), state: entry.state, blockedBy: entry.blockedBy }));
