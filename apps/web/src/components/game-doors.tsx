import type { ReactNode } from 'react';

import type { GameBlock } from '@meeshy/shared/types/game';

import { translateGamePlural } from '@/lib/i18n-game-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { formatCount, gameText } from '@/lib/view/game-copy';
import { leagueName } from '@/lib/view/game-copy-v2';
import { Link } from '@/routes/route-table';

import { GAME_BRAND, GAME_CARD, GAME_INK, GAME_INK_2 } from './game-surface';
import { AtlasStamp } from './game/atlas-stamp';
import { LeagueGem } from './game/league-gem';
import { SealMark } from './game/seal-mark';
import { Trophy } from './game/trophy';

/**
 * LES PORTES DE LA VAGUE 2 SUR « PROGRESSION » (#9481) — Ligue, Saison,
 * Vitrine, Atlas, Prestige : une entrée par page, avec ce qu'elle ANNONCE (le
 * rang de la semaine, l'étape de la saison…), parce que c'est ce qui donne envie
 * d'ouvrir. Une porte n'existe que si son extension est servie : devant un
 * ancien serveur, l'écran d'avant reste intact.
 */

type DoorProps = {
  readonly to: 'progressionLigue' | 'progressionSaison' | 'progressionVitrine' | 'progressionAtlas' | 'progressionPrestige';
  readonly icon: ReactNode;
  readonly title: string;
  readonly subtitle: string;
};

function Door({ to, icon, title, subtitle }: DoorProps) {
  return (
    <Link
      to={to}
      data-game-door={to}
      className="flex items-center gap-3 rounded-card px-4 py-3"
      style={{ minHeight: 44, backgroundColor: GAME_CARD }}
    >
      <span className="grid size-9 shrink-0 place-items-center" aria-hidden="true">
        {icon}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-body font-semibold" style={{ color: GAME_INK }}>
          {title}
        </span>
        <span className="truncate text-caption" style={{ color: GAME_INK_2 }}>
          {subtitle}
        </span>
      </span>
      <span style={{ color: GAME_BRAND }} aria-hidden="true">
        ›
      </span>
    </Link>
  );
}

function leagueSubtitle(league: NonNullable<GameBlock['league']>): string {
  if (league.access === 'locked') return gameText('game.door.league.locked', { level: formatCount(10) });
  const current = league.current;
  if (league.access === 'open' && current !== null) {
    return gameText('game.door.league.rank', { league: leagueName(current.league), rank: formatCount(current.rank), size: formatCount(current.groupSize) });
  }
  return gameText('game.door.league.open');
}

function seasonSubtitle(season: NonNullable<GameBlock['season']>): string {
  return gameText('game.door.season.steps', { steps: formatCount(season.steps), total: formatCount(season.stepsTotal) });
}

function prestigeSubtitle(prestige: NonNullable<GameBlock['prestige']>): string {
  if (prestige.canPrestige) return gameText('game.door.prestige.ready');
  return prestige.stars > 0
    ? gameText('game.door.prestige.stars', { stars: formatCount(prestige.stars), max: formatCount(prestige.max) })
    : gameText('game.door.prestige.locked');
}

export function GameDoors({ game }: { readonly game: GameBlock }) {
  const { league, season, trophies, atlas, prestige } = game;
  if (league === undefined && season === undefined && trophies === undefined && atlas === undefined && prestige === undefined) return null;
  const language = currentInterfaceLanguage();
  return (
    <nav aria-label={gameText('game.doors.label')} className="flex flex-col gap-2" data-game-doors="">
      {league === undefined ? null : (
        <Door
          to="progressionLigue"
          icon={<LeagueGem league={league.current?.league ?? 'quartz'} size={30} />}
          title={gameText('game.door.league')}
          subtitle={leagueSubtitle(league)}
        />
      )}
      {season === undefined ? null : (
        <Door
          to="progressionSaison"
          icon={<SealMark owned reached size={30} />}
          title={season === null ? gameText('game.season.title') : gameText('game.door.season', { number: formatCount(season.number) })}
          subtitle={season === null ? gameText('game.door.season.none') : seasonSubtitle(season)}
        />
      )}
      {trophies === undefined ? null : (
        <Door
          to="progressionVitrine"
          icon={<Trophy kind="league" size={30} material="gold" />}
          title={gameText('game.door.showcase')}
          subtitle={trophies.items.length === 0 ? gameText('game.door.showcase.empty') : translateGamePlural(language, 'game.door.showcase.count', trophies.items.length)}
        />
      )}
      {atlas === undefined ? null : (
        <Door
          to="progressionAtlas"
          icon={<AtlasStamp code={atlas.stamps[0]?.language ?? null} size={32} />}
          title={gameText('game.door.atlas')}
          subtitle={gameText('game.door.atlas.count', { stamped: formatCount(atlas.stamped), total: formatCount(atlas.total) })}
        />
      )}
      {prestige === undefined ? null : (
        <Door
          to="progressionPrestige"
          icon={<Trophy kind="prestige" size={34} />}
          title={gameText('game.door.prestige')}
          subtitle={prestigeSubtitle(prestige)}
        />
      )}
    </nav>
  );
}
