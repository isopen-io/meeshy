import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { GameDuo } from '@/components/game-duo';
import { GameFriendsLeague, type FriendsState } from '@/components/game-friends-league';
import { GameLeague, type WeekState } from '@/components/game-league';
import { GAME_BRAND, GAME_CARD, GAME_INK, GAME_INK_2 } from '@/components/game-surface';
import { unwrap } from '@/lib/api/client';
import { apiDeps } from '@/lib/api/deps';
import type { EngagementWithGame } from '@/lib/api/engagement';
import { LEAGUE_FRIENDS_QUERY_KEY, LEAGUE_WEEK_QUERY_KEY, loadLeagueFriends, loadLeagueWeek } from '@/lib/api/game-v2-queries';
import { suspendForGameCatalog } from '@/lib/i18n-game-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { useOnline } from '@/lib/net/online';
import { gameText } from '@/lib/view/game-copy';
import { useMinute } from '@/lib/view/use-minute';
import { useGameFriends } from '@/routes/game-friends';
import { useGameV2Actions, type GameV2Actions } from '@/routes/game-v2-actions';
import { ProgressionPage } from '@/routes/progression-page';

import type { LeagueFriendsResponse, LeagueWeekResponse } from '@meeshy/shared/types/game';

import type { DuoFriend } from '@/components/game-duo';

/**
 * LA PAGE « LIGUE » (#9384, #9385) — la ligue publique, la ligue entre amis, la
 * mission en duo. Une page dédiée du hub Progression, au même cadre que Badges,
 * Défis et Succès : retour en verre, titre, hors-ligne dit.
 *
 * CACHE-FIRST. Le bloc `game` vient du cache de la progression (la même clé que
 * le hub : aucune requête de plus à l'ouverture) ; le classement et la ligue
 * Amis sont des lectures à part, servies depuis leur cache dès qu'il existe et
 * rafraîchies en silence. Un squelette ne paraît que sur un cache VIDE.
 *
 * Devant un ancien serveur (aucune extension `league` dans le bloc), la page dit
 * que cette partie du jeu n'est pas disponible plutôt que de se peindre à
 * moitié.
 */

type Tab = 'mine' | 'friends';

const stateOf = <T,>(query: { data: T | undefined; isError: boolean; error: Error | null }): { status: 'ready'; data: T } | { status: 'error'; message: string } | { status: 'loading' } =>
  query.data !== undefined ? { status: 'ready', data: query.data } : query.isError ? { status: 'error', message: query.error?.message ?? '' } : { status: 'loading' };

export type LigueBodyProps = {
  readonly progress: EngagementWithGame;
  readonly tab: Tab;
  readonly onTab: (tab: Tab) => void;
  readonly week: WeekState;
  readonly friendsState: FriendsState;
  readonly friends: readonly DuoFriend[];
  readonly names: ReadonlyMap<string, string>;
  readonly actions: GameV2Actions;
  readonly online: boolean;
  readonly now: Date;
  readonly onRetryWeek: () => void;
  readonly onRetryFriends: () => void;
};

export function LigueBody(props: LigueBodyProps) {
  const { progress, tab, onTab, week, friendsState, friends, names, actions, online, now } = props;
  const game = progress.game;
  const league = game?.league;
  if (game === undefined || league === undefined) {
    return (
      <p className="rounded-card px-4 py-4 text-caption" style={{ backgroundColor: GAME_CARD, color: GAME_INK_2 }}>
        {gameText('game.unavailable')}
      </p>
    );
  }

  const tabs: ReadonlyArray<readonly [Tab, string]> = [
    ['mine', gameText('game.league.tab.mine')],
    ['friends', gameText('game.league.tab.friends')],
  ];

  return (
    <>
      <div
        role="tablist"
        aria-label={gameText('game.league.title')}
        className="flex gap-2"
        onKeyDown={(event) => {
          /* Le clavier circule entre les onglets (flèches, début, fin) : le focus suit la sélection. */
          const order = tabs.map(([key]) => key);
          const index = order.indexOf(tab);
          const target =
            event.key === 'ArrowRight' || event.key === 'ArrowLeft'
              ? order[(index + 1) % order.length]
              : event.key === 'Home'
                ? order[0]
                : event.key === 'End'
                  ? order[order.length - 1]
                  : undefined;
          if (target === undefined) return;
          event.preventDefault();
          onTab(target);
          requestAnimationFrame(() => document.getElementById(`game-league-tab-${target}`)?.focus());
        }}
      >
        {tabs.map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            id={`game-league-tab-${key}`}
            aria-selected={tab === key}
            tabIndex={tab === key ? 0 : -1}
            aria-controls="game-league-panel"
            data-game-league-tab={key}
            onClick={() => onTab(key)}
            className="flex-1 rounded-chip px-4 text-body font-semibold"
            style={{
              minHeight: 44,
              backgroundColor: tab === key ? `color-mix(in srgb, ${GAME_BRAND} 18%, transparent)` : GAME_CARD,
              color: tab === key ? GAME_BRAND : GAME_INK,
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <div id="game-league-panel" role="tabpanel" aria-labelledby={`game-league-tab-${tab}`} className="flex flex-col gap-5">
        {tab === 'mine' ? (
          <GameLeague
            league={league}
            levelRecord={game.level.record}
            week={week}
            online={online}
            now={now}
            consent={{ pending: actions.consent.pending, error: actions.consent.error }}
            pseudonym={{ pending: actions.pseudonym.pending, error: actions.pseudonym.error }}
            onConsent={(consent, pseudonym) => actions.consent.run({ consent, ...(pseudonym === undefined ? {} : { pseudonym }) })}
            onPseudonym={actions.pseudonym.run}
            onRetryWeek={props.onRetryWeek}
          />
        ) : (
          <GameFriendsLeague state={friendsState} names={names} now={now} onRetry={props.onRetryFriends} />
        )}
        {game.duo === undefined ? null : (
          <GameDuo
            duo={game.duo}
            levelRecord={game.level.record}
            friends={friends}
            online={online}
            busy={actions.invite.pending || actions.accept.pending || actions.abandon.pending}
            error={actions.invite.error ?? actions.accept.error ?? actions.abandon.error}
            onInvite={actions.invite.run}
            onAccept={actions.accept.run}
            onAbandon={actions.abandon.run}
          />
        )}
      </div>
    </>
  );
}

function LigueScreenBody({ progress }: { readonly progress: EngagementWithGame }) {
  const [tab, setTab] = useState<Tab>('mine');
  const online = useOnline();
  const minute = useMinute();
  const now = new Date(minute * 60_000);
  const actions = useGameV2Actions();
  const { friends, names } = useGameFriends();
  const open = progress.game?.league?.access === 'open';

  const week = useQuery({
    queryKey: LEAGUE_WEEK_QUERY_KEY,
    /* Pas pendant que le consentement part : la ligue vient de s'ouvrir EN LOCAL, la passerelle ne la sert pas encore — la relecture qui suit le geste la rend. */
    enabled: open && tab === 'mine' && !actions.consent.pending,
    queryFn: async ({ signal }): Promise<LeagueWeekResponse> => unwrap(await loadLeagueWeek({ ...apiDeps, signal })),
  });
  const friendsQuery = useQuery({
    queryKey: LEAGUE_FRIENDS_QUERY_KEY,
    enabled: tab === 'friends',
    queryFn: async ({ signal }): Promise<LeagueFriendsResponse> => unwrap(await loadLeagueFriends({ ...apiDeps, signal })),
  });
  const weekState = stateOf(week);

  return (
    <LigueBody
      progress={progress}
      tab={tab}
      onTab={setTab}
      week={weekState.status === 'ready' ? { status: 'ready', week: weekState.data } : weekState}
      friendsState={(() => {
        const s = stateOf(friendsQuery);
        return s.status === 'ready' ? { status: 'ready', data: s.data } : s;
      })()}
      friends={friends}
      names={names}
      actions={actions}
      online={online}
      now={now}
      onRetryWeek={() => void week.refetch()}
      onRetryFriends={() => void friendsQuery.refetch()}
    />
  );
}

export default function ProgressionLigueScreen() {
  suspendForGameCatalog(currentInterfaceLanguage());
  return (
    <ProgressionPage
      concept="league"
      titre={gameText('game.league.title')}
      teinte={GAME_BRAND}
      compte={(p) => {
        const current = (p as EngagementWithGame).game?.league?.current;
        return current === undefined || current === null ? null : `${current.rank} / ${current.groupSize}`;
      }}
    >
      {(progress) => <LigueScreenBody progress={progress} />}
    </ProgressionPage>
  );
}
