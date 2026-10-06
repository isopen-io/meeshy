import type { GameLeagueBlock } from '@meeshy/shared/types/game';

import { formatCount, gameText, pointsLabel } from '@/lib/view/game-copy';
import { leagueName, remainingLabel } from '@/lib/view/game-copy-v2';
import { useMinute } from '@/lib/view/use-minute';
import { Link } from '@/routes/route-table';

import { GAME_BRAND, GAME_INK, GAME_INK_2 } from './game-surface';
import { LeagueGem } from './game/league-gem';

/**
 * LE DÉTAIL DE LIGUE (#9541, directive porteur 2026-10-06) — dans l'écran
 * Engagement, AVANT le héros de frappe des Meeshes : la gemme de la ligue, la
 * place dans le groupe, les points de la semaine, le temps qui reste avant la
 * fermeture. Quatre lignes courtes, un toucher mène à la ligue.
 *
 * Il n'existe que si le joueur est PLACÉ dans la ligue publique : verrouillée,
 * fermée aux mineurs, sans consentement ou sans groupe, la ligue n'a rien à
 * détailler — la porte de la ligue (`game-doors`) dit déjà pourquoi. Le détail
 * lit le bloc `game` (cache d'abord) ; l'horloge est celle de la minute.
 */
export function GameLeagueSummary({ league, now }: { readonly league: GameLeagueBlock | undefined; readonly now?: Date }) {
  const minute = useMinute();
  if (league === undefined || league.access !== 'open' || league.current === null) return null;
  const { current } = league;
  const clock = now ?? new Date(minute * 60_000);
  return (
    <Link
      to="progressionLigue"
      data-game-league-summary={current.league}
      className="flex items-center gap-3 rounded-card px-4 py-3"
      style={{ minHeight: 44, backgroundColor: 'var(--color-ios-card)' }}
    >
      <span aria-hidden="true" className="shrink-0">
        <LeagueGem league={current.league} size={48} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-body font-bold" style={{ color: GAME_INK }}>
          {gameText('game.league.title')} · {leagueName(current.league)}
        </span>
        <span data-game-league-place="" className="text-caption font-semibold" style={{ color: GAME_INK }}>
          {gameText('game.league.rank_line', { rank: formatCount(current.rank), size: formatCount(current.groupSize) })}
        </span>
        <span data-game-league-points="" className="text-caption" style={{ color: GAME_INK_2 }}>
          {gameText('game.league.week_points', { points: pointsLabel(current.weekPoints) })}
        </span>
        <span data-game-league-closes="" className="text-caption" style={{ color: GAME_INK_2 }}>
          {gameText('game.league.closes', { remaining: remainingLabel(league.closes, clock) })}
        </span>
      </span>
      <span style={{ color: GAME_BRAND }} aria-hidden="true">
        ›
      </span>
    </Link>
  );
}
