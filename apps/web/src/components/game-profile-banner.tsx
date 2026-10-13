import type { LevelTierKey } from '@meeshy/shared/utils/game/levels';

import { translateGame } from '@/lib/i18n-game-catalog';
import { currentInterfaceLanguage, type InterfaceLanguage } from '@/lib/interface-language';
import { formatCount, levelTierName, rankName, standingLabel, type ShownRank } from '@/lib/view/game-copy';
import { levelRingLabelWithPrestige } from '@/lib/view/game-copy-v2';

import { LevelRing } from './game/level-ring';
import { RankBlason } from './game/rank-blason';

/**
 * **LE JEU, POSÉ SUR LA BANNIÈRE** (#10092, #10231 — précision porteur
 * 2026-10-11 : « les détails de points à gauche de la bannière et le reste de
 * rang à droite »). Deux pastilles de verre, en haut de la bannière, là où
 * l'avatar qui chevauche le bas ne les couvre pas :
 *
 *   · au DÉBUT (gauche ; droite en RTL) : le nom du niveau au-dessus du cercle,
 *     et à côté les points acquis et ce qu'il reste vers le niveau suivant —
 *     les mots de la barre du joueur (« 976 pts », « encore 624 ») ;
 *   · à la FIN : le blason du rang, son nom ET sa division dessous (« Murmure V »).
 *
 * Seulement ce qui est servi : sur la fiche d'un autre, la progression n'est
 * jamais servie et les points ne le sont qu'aux amis — absents, rien ne se
 * dessine à leur place. Chaque pastille est UNE image nommée pour un lecteur
 * d'écran. Le tout laisse passer le toucher (`pointer-events: none`) : la
 * bannière sous lui reste le bouton qui l'ouvre en plein écran.
 */
export type BannerStanding = ShownRank & {
  readonly level: number;
  readonly tier: LevelTierKey;
  readonly prestige: number;
  /** La part du niveau suivant déjà gagnée (0..1) ; `null` : non servie, le cercle est plein. */
  readonly progress: number | null;
  /** Les points acquis ; `null` : non servis (ou aucun). */
  readonly points: number | null;
  /** Ce qu'il reste vers le niveau suivant ; `null` : au plafond, ou non servi. */
  readonly pointsToNext: number | null;
};

const INK = 'var(--color-ios-ink)';
const GROUP = 'glass flex min-w-0 rounded-card px-2 py-1';

const pointsLine = (points: number, language: InterfaceLanguage): string =>
  translateGame(language, 'game.banner.points', { points: formatCount(points, language) });

/** Ce qu'il reste nomme le niveau visé (#10540) : « encore 1 301 vers le 28 », jamais « encore 1 301 » à côté d'un total de points. */
const missingLine = (points: number, nextLevel: number, language: InterfaceLanguage): string =>
  translateGame(language, 'game.banner.missing', { points: formatCount(points, language), level: formatCount(nextLevel, language) });

function levelLabel(standing: BannerStanding, language: InterfaceLanguage): string {
  const { level, tier, prestige, points, pointsToNext } = standing;
  const parts: readonly (string | null)[] = [
    levelRingLabelWithPrestige(level, tier, prestige, language),
    points === null ? null : pointsLine(points, language),
    pointsToNext === null ? null : missingLine(pointsToNext, level + 1, language),
  ];
  return parts.filter((part): part is string => part !== null).join(translateGame(language, 'game.banner.separator'));
}

export function GameProfileBanner({ standing }: { readonly standing: BannerStanding }) {
  const language = currentInterfaceLanguage();
  const { level, tier, prestige, progress, points, pointsToNext, rank, division, mythic } = standing;
  const rankLine = standingLabel(standing, language);
  return (
    <div
      data-profile-banner-game=""
      className="pointer-events-none absolute flex items-start justify-between gap-2"
      style={{ insetInlineStart: 8, insetInlineEnd: 8, top: 8, color: INK }}
    >
      <div data-profile-banner-level="" role="img" aria-label={levelLabel(standing, language)} className={`${GROUP} items-center gap-2`}>
        <span aria-hidden="true" className="flex shrink-0 flex-col items-center">
          <span data-profile-banner-level-name="" className="text-check font-semibold">
            {levelTierName(tier, language)}
          </span>
          <LevelRing level={level} tier={tier} progress={progress} size={40} prestige={prestige} />
        </span>
        {points === null && pointsToNext === null ? null : (
          <span aria-hidden="true" className="flex min-w-0 flex-col leading-tight tabular-nums">
            {points === null ? null : (
              <span data-profile-banner-points={points} className="truncate text-check font-bold">
                {pointsLine(points, language)}
              </span>
            )}
            {pointsToNext === null ? null : (
              <span data-profile-banner-missing={pointsToNext} className="truncate text-caption font-medium">
                {missingLine(pointsToNext, level + 1, language)}
              </span>
            )}
          </span>
        )}
      </div>
      <div data-profile-banner-rank="" role="img" aria-label={rankLine} className={`${GROUP} flex-col items-center`}>
        <RankBlason rank={rank} division={division} mythic={mythic} level={level} size={34} label={rankName(rank, language)} />
        <span aria-hidden="true" data-profile-banner-rank-name="" className="truncate text-check font-semibold">
          {rankLine}
        </span>
      </div>
    </div>
  );
}
