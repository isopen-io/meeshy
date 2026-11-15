import type { LeagueFriendsResponse } from '@meeshy/shared/types/game';

import { formatCount, gameText, pointsLabel } from '@/lib/view/game-copy';
import { remainingLabel, weekLabel } from '@/lib/view/game-copy-v2';

import { GAME_BRAND, GAME_ERROR, GAME_INK, GAME_INK_2, GameCard } from './game-surface';

/**
 * LA LIGUE ENTRE AMIS (#9385) — le même classement de la semaine, restreint aux
 * amis ACCEPTÉS. Toujours ouverte, sans consentement : ils se connaissent déjà
 * (`canSeeLeagueMember`), donc leurs NOMS s'affichent — le seul endroit du jeu
 * où un classement porte des identités.
 *
 * L'hôte résout les noms (`names`, depuis le cache des amitiés) ; un ami dont le
 * nom n'est pas connu s'affiche « Un ami », jamais son identifiant.
 */
export type FriendsState =
  | { readonly status: 'loading' }
  | { readonly status: 'error'; readonly message: string }
  | { readonly status: 'ready'; readonly data: LeagueFriendsResponse };

export function GameFriendsLeague({
  state,
  names,
  now,
  onRetry,
}: {
  readonly state: FriendsState;
  readonly names: ReadonlyMap<string, string>;
  readonly now: Date;
  readonly onRetry: () => void;
}) {
  return (
    <GameCard id="game-friends-league" labelledBy="game-friends-league-title">
      <h2 id="game-friends-league-title" className="text-body font-bold" style={{ color: GAME_INK }}>
        {gameText('game.league.friends.title')}
      </h2>
      <p className="text-caption" style={{ color: GAME_INK_2 }}>
        {gameText('game.league.friends.body')}
      </p>
      {state.status === 'ready' ? (
        <>
          <p className="text-caption" style={{ color: GAME_INK_2 }}>
            {weekLabel(state.data.weekKey)} · {gameText('game.league.closes', { remaining: remainingLabel(state.data.closes, now) })}
          </p>
          {state.data.entries.length <= 1 ? (
            <p className="text-caption" style={{ color: GAME_INK_2 }}>
              {gameText('game.league.friends.empty')}
            </p>
          ) : null}
          <ol className="flex flex-col gap-1" data-game-friends-standings="">
            {state.data.entries.map((entry) => (
              <li
                key={entry.userId}
                data-game-me={entry.isMe ? '' : undefined}
                className="flex items-center gap-3 rounded-chip px-3"
                style={{ minHeight: 44, backgroundColor: entry.isMe ? `color-mix(in srgb, ${GAME_BRAND} 14%, transparent)` : 'transparent' }}
              >
                <span className="w-7 shrink-0 text-body font-bold tabular-nums" style={{ color: GAME_INK_2 }}>
                  {formatCount(entry.rank)}
                </span>
                <span className="min-w-0 flex-1 truncate text-body font-semibold" style={{ color: GAME_INK }}>
                  {entry.isMe ? gameText('game.league.me') : (names.get(entry.userId) ?? gameText('game.league.friends.unknown'))}
                </span>
                <span className="shrink-0 text-caption font-semibold tabular-nums" style={{ color: GAME_INK }}>
                  {pointsLabel(entry.weekPoints)}
                </span>
              </li>
            ))}
          </ol>
        </>
      ) : null}
      {state.status === 'loading' ? (
        <div role="status" aria-busy="true" data-game-skeleton="" className="flex flex-col gap-1">
          {[0, 1, 2].map((row) => (
            <div key={row} className="rounded-chip" style={{ height: 44, backgroundColor: 'color-mix(in srgb, var(--color-ios-ink) 7%, transparent)' }} />
          ))}
        </div>
      ) : null}
      {state.status === 'error' ? (
        <div role="alert" className="flex flex-col gap-2">
          <p className="text-caption" style={{ color: GAME_ERROR }}>
            {state.message}
          </p>
          <button type="button" onClick={onRetry} className="rounded-chip px-4 text-body font-bold" style={{ minHeight: 44, color: GAME_BRAND }}>
            {gameText('game.retry')}
          </button>
        </div>
      ) : null}
    </GameCard>
  );
}
