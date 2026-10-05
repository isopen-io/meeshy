import type { EngagementWithGame } from '@/lib/api/engagement';
import { medalOfAxis } from '@/lib/game/medal';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { formatCount, gameText, levelRingLabel, levelTierName, meeshCount, rankLabel, rankName, treasuryName, daysLabel, medalLabel } from '@/lib/view/game-copy';
import { trophyView } from '@/lib/view/game-copy-v2';
import { Link } from '@/routes/route-table';
import { engagementAxisLabel } from '@meeshy/shared/utils/engagement-labels';

import { Flame } from './game/flame';
import { GameMedal } from './game/medal';
import { LevelRing } from './game/level-ring';
import { RankBlason } from './game/rank-blason';
import { Trophy } from './game/trophy';
import { GAME_BRAND, GAME_INK, GAME_INK_2, GameCard } from './game-surface';
import { shelfOrder } from './game-showcase';

/**
 * LE JEU SUR SON PROFIL (#9481) — ce que la personne montre d'elle-même : l'anneau
 * de niveau (emblème du palier, chiffre romain, étoiles de Prestige), le blason de
 * son rang et sa division, le trésor, la Flamme, la vitrine de trophées, ses
 * meilleures médailles, et la porte vers Progression. Une carte, pas un écran :
 * le profil reste le profil.
 *
 * C'est SA vue : il montre tout, quels que soient ses réglages de visibilité (ils
 * disent ce que les AUTRES en voient). Cache-first : il lit le cache de la
 * progression (la même clé que le hub) et ne bloque rien ; sans bloc `game`
 * (ancien serveur, jeu pas encore chargé) il ne se dessine pas.
 */
const SHELF_SIZE = 4;
const MEDAL_COUNT = 4;

export function GameProfileOwn({ progress }: { readonly progress: EngagementWithGame }) {
  const game = progress.game;
  if (game === undefined) return null;
  const language = currentInterfaceLanguage();
  const { level, glory, treasury, flame } = game;

  const shelf = game.trophies === undefined ? [] : shelfOrder(game.trophies).flatMap((key) => {
    const view = trophyView(key, language);
    return view === null ? [] : [{ key, view }];
  });
  const medals = progress.axes
    .map((axis) => ({ axis, medal: medalOfAxis(axis) }))
    .filter(({ medal }) => medal.tier > 0)
    .sort((a, b) => b.medal.tier - a.medal.tier || b.medal.progress - a.medal.progress)
    .slice(0, MEDAL_COUNT);

  return (
    <GameCard id="game-profile" labelledBy="game-profile-title">
      <h2 id="game-profile-title" className="text-check font-semibold uppercase tracking-wide" style={{ color: GAME_INK_2 }}>
        {gameText('game.profile.title')}
      </h2>
      <div className="flex items-center gap-4">
        <LevelRing level={level.level} tier={level.tier} progress={level.progress} size={80} prestige={level.prestige} label={levelRingLabel(level.level, level.tier, language)} />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <p className="text-body font-bold" style={{ color: GAME_INK }}>
            {gameText('game.profile.level', { level: formatCount(level.level), tier: levelTierName(level.tier) })}
          </p>
          <p className="text-caption font-semibold" style={{ color: GAME_INK }}>
            {rankLabel(glory.rank, glory.division)}
          </p>
          <p className="text-check" style={{ color: GAME_INK_2 }}>
            {gameText('game.profile.glory', { glory: formatCount(glory.glory) })}
          </p>
        </div>
        <RankBlason rank={glory.rank} division={glory.division} size={64} label={rankName(glory.rank)} />
      </div>

      <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-caption" style={{ color: GAME_INK }} data-game-profile-stats="">
        <li>
          {treasury.tier === null ? meeshCount(treasury.held) : gameText('game.profile.treasury', { meeshes: meeshCount(treasury.held), tier: treasuryName(treasury.tier) })}
        </li>
        <li className="flex items-center gap-1">
          <Flame form={flame.form ?? 'braise'} size={18} />
          {gameText('game.profile.flame', { days: daysLabel(flame.days) })}
        </li>
      </ul>

      {shelf.length === 0 ? null : (
        <div className="flex flex-col gap-1.5" data-game-profile-shelf="">
          <h3 className="text-check font-semibold uppercase tracking-wide" style={{ color: GAME_INK_2 }}>
            {gameText('game.profile.showcase')}
          </h3>
          <ul className="flex items-end gap-3" aria-label={gameText('game.profile.showcase')}>
            {shelf.slice(0, SHELF_SIZE).map(({ key, view }) => (
              <li key={key} data-game-trophy={key} className="flex flex-col items-center">
                <Trophy kind={view.kind} size={52} label={view.plate} {...(view.material === undefined ? {} : { material: view.material })} />
                <span className="sr-only">{view.title}</span>
              </li>
            ))}
          </ul>
          <Link to="progressionVitrine" className="flex items-center text-caption font-semibold" style={{ minHeight: 44, color: GAME_BRAND }}>
            {gameText('game.profile.see_showcase')}
          </Link>
        </div>
      )}

      {medals.length === 0 ? null : (
        <div className="flex flex-col gap-1.5" data-game-profile-medals="">
          <h3 className="text-check font-semibold uppercase tracking-wide" style={{ color: GAME_INK_2 }}>
            {gameText('game.profile.medals')}
          </h3>
          <ul className="flex items-end gap-3">
            {medals.map(({ axis, medal }) => (
              <li key={axis.axisKey} data-game-medal-axis={axis.axisKey}>
                <GameMedal
                  size={44}
                  family={medal.family}
                  pictogram={medal.pictogram}
                  tier={medal.tier}
                  progress={medal.progress}
                  label={medalLabel(medal, engagementAxisLabel(language, axis.axisKey), language)}
                />
              </li>
            ))}
          </ul>
        </div>
      )}

      <Link to="progression" data-game-profile-progress="" className="flex items-center text-body font-semibold" style={{ minHeight: 44, color: GAME_BRAND }}>
        {gameText('game.profile.see_progress')}
      </Link>
    </GameCard>
  );
}
