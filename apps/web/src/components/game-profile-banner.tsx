import type { LevelTierKey } from '@meeshy/shared/utils/game/levels';

import { currentInterfaceLanguage } from '@/lib/interface-language';
import { levelTierName, rankName, type ShownRank } from '@/lib/view/game-copy';
import { levelRingLabelWithPrestige } from '@/lib/view/game-copy-v2';

import { LevelRing } from './game/level-ring';
import { RankBlason } from './game/rank-blason';

/**
 * **LE JEU, POSÉ SUR LA BANNIÈRE** (#10092, directive porteur 2026-10-11) — à
 * la place du bloc du jeu : à droite de la bannière, le cercle de niveau
 * surmonté du NOM du niveau, et à sa droite le blason du rang avec le NOM du
 * rang en dessous. Rien d'autre : ni Gloire, ni trésor, ni Flamme, ni vitrine.
 *
 * Il laisse passer le toucher (`pointer-events: none`) : la bannière sous lui
 * reste le bouton qui l'ouvre en plein écran. Une pastille de surface le rend
 * lisible sur n'importe quelle image.
 */
export type BannerStanding = ShownRank & {
  readonly level: number;
  readonly tier: LevelTierKey;
  readonly prestige: number;
};

const INK = 'var(--color-ios-ink)';

export function GameProfileBanner({ standing }: { readonly standing: BannerStanding }) {
  const language = currentInterfaceLanguage();
  const { level, tier, prestige, rank, division, mythic } = standing;
  return (
    <div
      data-profile-banner-game=""
      className="glass pointer-events-none absolute flex items-center gap-2 rounded-card px-2 py-1"
      style={{
        insetInlineEnd: 8,
        bottom: 8,
        color: INK,
      }}
    >
      <span className="flex flex-col items-center">
        <span data-profile-banner-level-name="" className="text-check font-semibold">
          {levelTierName(tier, language)}
        </span>
        <LevelRing level={level} tier={tier} progress={null} size={40} prestige={prestige} label={levelRingLabelWithPrestige(level, tier, prestige, language)} />
      </span>
      <span className="flex flex-col items-center">
        <RankBlason rank={rank} division={division} mythic={mythic} level={level} size={34} label={rankName(rank, language)} />
        <span data-profile-banner-rank-name="" className="text-check font-semibold">
          {rankName(rank, language)}
        </span>
      </span>
    </div>
  );
}
