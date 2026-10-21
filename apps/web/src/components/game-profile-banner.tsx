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
 * rang à droite » ; #10601 — directive porteur 2026-10-14 : aux deux ANGLES BAS,
 * le bas du cadre épousant la limite basse de la bannière, des fonds allégés).
 *
 *   · à l'angle bas du DÉBUT (gauche ; droite en RTL), en colonne : le nom du
 *     palier, le cercle — qui porte le niveau, sa progression et le prestige —
 *     puis les étincelles dessous, par leur glyphe (« ✦ 18 347 » — porteur
 *     2026-10-19, #10951) ; le record et ce qu'il manque vivent dans le
 *     libellé d'accessibilité ;
 *   · à l'angle bas de la FIN, en colonne : la Gloire (« ♛ 18 790 »)
 *     au-dessus du blason du rang, son nom ET sa division dessous
 *     (« Murmure V ») — la Gloire fait le rang, elle le coiffe.
 *
 * Chaque cadre a les coins HAUTS arrondis et les coins BAS carrés, posés sur le
 * bord bas : la découpe de la bannière (`overflow-hidden rounded-card`) taille
 * leurs angles extérieurs sur les siens, sans débord ni jour. Le fond est un
 * VOILE léger, sans flou — la bannière et ses dessins se voient au travers — et
 * le texte blanc porte une ombre courte qui le tient lisible sur une bannière
 * claire, comme iOS (`GameBannerBadgeView`). L'avatar chevauche le MILIEU du
 * bas de la bannière : les deux cadres prennent chacun la moitié de ce qu'il
 * laisse (`AVATAR_CLEARANCE`) et la même hauteur, quel que soit leur contenu.
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
  /** Les ÉTINCELLES en poche ; `null` : non servies (ou aucune). */
  readonly points: number | null;
  /** La Gloire totale, à côté du blason (#10913, #10951) ; `null` : non servie (autre que soi et ses amis, ou ancien serveur). */
  readonly glory: number | null;
  /** Le niveau MAX à vie, sous le niveau actuel ; `null` : non servi (ancien serveur). Il survit au Prestige. */
  readonly levelMax: number | null;
  /** Ce qu'il reste vers le niveau suivant ; `null` : au plafond, ou non servi. */
  readonly pointsToNext: number | null;
};

/** L'avatar (90 px et son liseré de 4) plus 4 px de jour de chaque côté, au milieu du bas de la bannière. */
export const AVATAR_CLEARANCE = 106;
/** Le voile (24 %) laisse voir la bannière ; un liseré d'ombre serré autour de chaque lettre tient le texte blanc
 *  lisible sur une bannière claire, là où un fond épais la cacherait. */
const GROUP =
  'flex min-w-0 bg-[color-mix(in_srgb,var(--color-media-backdrop)_24%,transparent)] px-2 pb-1.5 pt-1 text-on-media [text-shadow:0_0_1px_var(--color-scrim-strong),0_0_3px_var(--color-scrim),0_1px_2px_var(--color-scrim)]';
/**
 * Les coins HAUTS, en propriétés LOGIQUES (RTL compris) : le cadre du niveau (étincelles) n'est plus arrondi à son bord de
 * DÉBUT, celui du rang à son bord de FIN — les deux n'arrondissent que le coin qui regarde l'avatar. Les coins bas restent carrés.
 */
const LEVEL_CORNERS = 'rounded-se-card';
const RANK_CORNERS = 'rounded-ss-card';
/** Les deux cadres ont TOUJOURS la même taille (#10951) : chacun la moitié de ce que l'avatar laisse, la même hauteur (`items-stretch`). */
const GROUP_STYLE = { width: `calc((100% - ${AVATAR_CLEARANCE}px) / 2)` } as const;

/** Les glyphes des deux monnaies du jeu, sans mot : ✦ les étincelles, ♛ la Gloire (◆ et ★ sont pris par le fragment et la coupe). */
export const SPARK_GLYPH = '✦';
export const GLORY_GLYPH = '♛';

const glyphAmount = (glyph: string, amount: number, language: InterfaceLanguage): string => `${glyph}\u00a0${formatCount(amount, language)}`;

const pointsLine = (points: number, language: InterfaceLanguage): string =>
  translateGame(language, 'game.banner.points', { points: formatCount(points, language) });

const gloryLine = (glory: number, language: InterfaceLanguage): string =>
  translateGame(language, 'game.rank.glory', { glory: formatCount(glory, language) });

/** Ce qu'il reste nomme le niveau visé (#10540) : « encore 1 301 vers le 28 », jamais « encore 1 301 » à côté d'un total de points. */
const missingLine = (points: number, nextLevel: number, language: InterfaceLanguage): string =>
  translateGame(language, 'game.banner.missing', { points: formatCount(points, language), level: formatCount(nextLevel, language) });

function levelLabel(standing: BannerStanding, language: InterfaceLanguage): string {
  const { level, tier, prestige, points, pointsToNext, levelMax } = standing;
  const parts: readonly (string | null)[] = [
    levelRingLabelWithPrestige(level, tier, prestige, language),
    points === null ? null : pointsLine(points, language),
    levelMax === null ? null : translateGame(language, 'game.banner.level_max_a11y', { level: formatCount(levelMax, language) }),
    pointsToNext === null ? null : missingLine(pointsToNext, level + 1, language),
  ];
  return parts.filter((part): part is string => part !== null).join(translateGame(language, 'game.banner.separator'));
}

function rankLabel(standing: BannerStanding, language: InterfaceLanguage): string {
  const parts = [standingLabel(standing, language), standing.glory === null ? null : gloryLine(standing.glory, language)];
  return parts.filter((part): part is string => part !== null).join(translateGame(language, 'game.banner.separator'));
}

export function GameProfileBanner({ standing }: { readonly standing: BannerStanding }) {
  const language = currentInterfaceLanguage();
  const { level, tier, prestige, progress, points, glory, rank, division, mythic } = standing;
  const rankLine = standingLabel(standing, language);
  return (
    <div
      data-profile-banner-game=""
      className="@container pointer-events-none absolute flex items-stretch justify-between"
      style={{ insetInlineStart: 0, insetInlineEnd: 0, bottom: 0 }}
    >
      <div data-profile-banner-level="" role="img" aria-label={levelLabel(standing, language)} className={`${GROUP} ${LEVEL_CORNERS} flex-col items-center justify-center gap-0.5`} style={GROUP_STYLE}>
        <span aria-hidden="true" data-profile-banner-level-name="" className="max-w-full truncate text-mini font-semibold leading-none">
          {levelTierName(tier, language)}
        </span>
        <span aria-hidden="true" className="shrink-0">
          <LevelRing level={level} tier={tier} progress={progress} size={40} prestige={prestige} />
        </span>
        {points === null ? null : (
          <span aria-hidden="true" data-profile-banner-points={points} className="max-w-full truncate text-body font-bold leading-tight tabular-nums">
            {glyphAmount(SPARK_GLYPH, points, language)}
          </span>
        )}
      </div>
      <div data-profile-banner-rank="" role="img" aria-label={rankLabel(standing, language)} className={`${GROUP} ${RANK_CORNERS} flex-col items-center justify-center gap-0.5`} style={GROUP_STYLE}>
        {glory === null ? null : (
          <span aria-hidden="true" data-profile-banner-glory={glory} className="max-w-full truncate text-body font-bold leading-tight tabular-nums">
            {glyphAmount(GLORY_GLYPH, glory, language)}
          </span>
        )}
        <span aria-hidden="true" className="shrink-0">
          <RankBlason rank={rank} division={division} mythic={mythic} level={level} size={34} label={rankName(rank, language)} />
        </span>
        <span aria-hidden="true" data-profile-banner-rank-name="" className="max-w-full truncate text-check font-semibold">
          {rankLine}
        </span>
      </div>
    </div>
  );
}
