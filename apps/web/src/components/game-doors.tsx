import type { ReactNode } from 'react';

import type { GameBlock } from '@meeshy/shared/types/game';

import { formatCount, gameText } from '@/lib/view/game-copy';
import { leagueName } from '@/lib/view/game-copy-v2';
import { Link } from '@/routes/route-table';

import { GAME_BRAND, GAME_CARD, GAME_INK, GAME_INK_2 } from './game-surface';
import { LeagueGem } from './game/league-gem';

/**
 * LES PORTES DE LA VAGUE 2 SUR « PROGRESSION » (#9481) — Ligue, Saison,
 * Vitrine, Atlas, Prestige : une entrée par page, avec ce qu'elle ANNONCE (le
 * rang de la semaine, l'étape de la saison…), parce que c'est ce qui donne envie
 * d'ouvrir. Une porte n'existe que si son extension est servie : devant un
 * ancien serveur, l'écran d'avant reste intact.
 */

type DoorProps = {
  readonly to: 'progressionLigue';
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

export function GameDoors({ game }: { readonly game: GameBlock }) {
  const league = game.league;
  if (league === undefined) return null;
  return (
    <nav aria-label={gameText('game.door.league')} className="flex flex-col gap-2" data-game-doors="">
      <Door
        to="progressionLigue"
        icon={<LeagueGem league={league.current?.league ?? 'quartz'} size={30} />}
        title={gameText('game.door.league')}
        subtitle={leagueSubtitle(league)}
      />
    </nav>
  );
}
