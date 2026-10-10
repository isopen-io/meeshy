import { useState } from 'react';

import type { GameDuoBlock } from '@meeshy/shared/types/game';
import { DUO_MIN_LEVEL } from '@meeshy/shared/utils/game/duo';

import { formatCount, gameText, missionTitle, pointsLabel } from '@/lib/view/game-copy';

import { GAME_BRAND, GAME_ERROR, GAME_GOOD, GAME_INK, GAME_INK_2, GAME_ON_WARM, GameCard } from './game-surface';
import { GameRequirementLine } from './game-touch';

/**
 * LA MISSION EN DUO (#9385, conception II.7) — à deux, avec un ami accepté :
 * un objectif commun dans la semaine, la récompense DOUBLE si les deux finissent
 * leur part. Elle s'ouvre au niveau 20 (record) pour les deux, sur invitation
 * ACCEPTÉE, et se quitte à tout moment (conformité B-4). Aucune pression : le
 * duo n'envoie rien, il se lit ici.
 *
 * Cinq états, lus de `duo.status` : jamais ouvert (`none`), invité (envoyée ou
 * reçue), actif, réussi, abandonné ou expiré. L'écran ne devine rien : la
 * mission, la part du partenaire et la récompense viennent du bloc servi.
 */

export type DuoFriend = { readonly id: string; readonly displayName: string };

export type GameDuoProps = {
  readonly duo: GameDuoBlock;
  readonly levelRecord: number;
  readonly friends: readonly DuoFriend[];
  readonly online: boolean;
  readonly busy: boolean;
  readonly error?: string | undefined;
  readonly onInvite: (friend: DuoFriend) => void;
  readonly onAccept: (duoId: string) => void;
  readonly onAbandon: (duoId: string) => void;
};

function Bar({ value, target, tint }: { readonly value: number; readonly target: number; readonly tint: string }) {
  const percent = Math.min(100, Math.round((Math.min(value, target) / Math.max(1, target)) * 100));
  return (
    <div role="presentation" className="h-2 overflow-hidden rounded-full" style={{ backgroundColor: 'var(--game-track)' }}>
      <div className="h-full rounded-full" style={{ width: `${percent}%`, backgroundColor: tint }} />
    </div>
  );
}

function Action({ marker, onClick, disabled, busy, tint, children }: { readonly marker: string; readonly onClick: () => void; readonly disabled: boolean; readonly busy: boolean; readonly tint: string; readonly children: React.ReactNode }) {
  return (
    <button
      type="button"
      {...{ [marker]: '' }}
      disabled={disabled || busy}
      aria-busy={busy}
      onClick={onClick}
      className="rounded-chip px-4 text-body font-bold disabled:opacity-60"
      style={{ minHeight: 44, backgroundColor: tint, color: GAME_ON_WARM }}
    >
      {children}
    </button>
  );
}

function Quiet({ marker, onClick, disabled, children }: { readonly marker: string; readonly onClick: () => void; readonly disabled: boolean; readonly children: React.ReactNode }) {
  return (
    <button type="button" {...{ [marker]: '' }} disabled={disabled} onClick={onClick} className="rounded-chip px-4 text-body font-semibold disabled:opacity-60" style={{ minHeight: 44, color: GAME_ERROR }}>
      {children}
    </button>
  );
}

const SEARCH_FROM = 6;

const fold = (value: string): string => value.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase();

/**
 * LES AMIS INVITABLES — tous, jamais les huit premiers : une personne qui a
 * cent amis acceptés doit pouvoir inviter le centième. La liste défile dans sa
 * hauteur ; au-delà de quelques amis, un champ de recherche (sans casse ni
 * accent) la restreint. Les amis viennent du cache persisté (`useGameFriends`) :
 * rien ne se charge ici, donc rien à attendre.
 */
function FriendPicker({ friends, online, busy, onInvite }: { readonly friends: readonly DuoFriend[]; readonly online: boolean; readonly busy: boolean; readonly onInvite: (friend: DuoFriend) => void }) {
  const [query, setQuery] = useState('');
  const needle = fold(query.trim());
  const shown = needle === '' ? friends : friends.filter((friend) => fold(friend.displayName).includes(needle));
  return (
    <>
      {friends.length < SEARCH_FROM ? null : (
        <input
          type="search"
          value={query}
          onInput={(event) => setQuery((event.target as HTMLInputElement).value)}
          onChange={() => undefined}
          aria-label={gameText('game.duo.search')}
          placeholder={gameText('game.duo.search')}
          className="min-h-11 rounded-chip border-0 px-4 text-body"
          style={{ backgroundColor: 'var(--game-track)', color: GAME_INK }}
        />
      )}
      {shown.length === 0 ? (
        <p role="status" className="text-caption" style={{ color: GAME_INK_2 }}>
          {gameText('game.duo.search.none')}
        </p>
      ) : (
        <ul data-game-duo-friends="" className="flex max-h-72 flex-col gap-1 overflow-y-auto overflow-x-clip overscroll-x-none" aria-label={gameText('game.duo.pick')}>
          {shown.map((friend) => (
            <li key={friend.id}>
              <Action marker="data-game-duo-invite" tint={GAME_BRAND} busy={busy} disabled={!online} onClick={() => onInvite(friend)}>
                {gameText('game.duo.invite', { name: friend.displayName })}
              </Action>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export function GameDuo(props: GameDuoProps) {
  const { duo, levelRecord, friends, online, busy, error, onInvite, onAccept, onAbandon } = props;
  const partner = duo.partner?.displayName ?? gameText('game.league.friends.unknown');
  const duoId = duo.duoId;

  const body = ((): React.ReactNode => {
    if (!duo.unlocked) {
      return (
        <>
          <p className="text-caption" style={{ color: GAME_INK_2 }}>
            {gameText('game.duo.locked', { level: formatCount(DUO_MIN_LEVEL), current: formatCount(levelRecord) })}
          </p>
          <GameRequirementLine concept="league" current={levelRecord} required={DUO_MIN_LEVEL} record />
        </>
      );
    }
    if (duo.status === 'invited') {
      return (
        <>
          <p className="text-caption" style={{ color: GAME_INK_2 }}>
            {duo.role === 'invitee' ? gameText('game.duo.invited.invitee', { name: partner }) : gameText('game.duo.invited.inviter', { name: partner })}
          </p>
          {duo.role === 'invitee' && duoId !== null ? (
            <Action marker="data-game-duo-accept" tint={GAME_BRAND} busy={busy} disabled={!online} onClick={() => onAccept(duoId)}>
              {gameText('game.duo.accept')}
            </Action>
          ) : null}
          {duoId === null ? null : (
            <Quiet marker="data-game-duo-abandon" disabled={!online || busy} onClick={() => onAbandon(duoId)}>
              {duo.role === 'invitee' ? gameText('game.duo.decline') : gameText('game.duo.cancel')}
            </Quiet>
          )}
        </>
      );
    }
    if (duo.status === 'active' || duo.status === 'completed') {
      const mission = duo.mission;
      const progress = duo.progress;
      return (
        <>
          {mission === null ? null : (
            <p className="text-body font-semibold" style={{ color: GAME_INK }}>
              {missionTitle(mission.templateKey, mission.partTarget)}
            </p>
          )}
          {mission === null || progress === null ? null : (
            <div className="flex flex-col gap-2" data-game-duo-progress="">
              <div className="flex flex-col gap-1">
                <p className="text-caption" style={{ color: GAME_INK_2 }}>
                  {gameText('game.duo.progress.me', { done: formatCount(Math.min(progress.mine, mission.partTarget)), target: formatCount(mission.partTarget) })}
                </p>
                <Bar value={progress.mine} target={mission.partTarget} tint={GAME_BRAND} />
              </div>
              <div className="flex flex-col gap-1">
                <p className="text-caption" style={{ color: GAME_INK_2 }}>
                  {gameText('game.duo.progress.partner', { name: partner, done: formatCount(Math.min(progress.partner, mission.partTarget)), target: formatCount(mission.partTarget) })}
                </p>
                <Bar value={progress.partner} target={mission.partTarget} tint={GAME_GOOD} />
              </div>
              <p className="text-caption" style={{ color: GAME_INK_2 }}>
                {gameText('game.duo.progress.common', { done: formatCount(progress.common), target: formatCount(mission.commonTarget) })}
              </p>
            </div>
          )}
          {duo.reward === null ? null : (
            <p className="text-caption font-semibold" style={{ color: duo.reward.doubled ? GAME_GOOD : GAME_INK }}>
              {duo.reward.doubled ? gameText('game.duo.reward.doubled', { points: pointsLabel(duo.reward.points) }) : gameText('game.duo.reward', { points: pointsLabel(duo.reward.points) })}
            </p>
          )}
          <p className="text-caption" style={{ color: GAME_INK_2 }}>
            {duo.status === 'completed' ? gameText('game.duo.completed') : gameText('game.duo.reward.hint')}
          </p>
          {duo.status === 'active' && duoId !== null ? (
            <Quiet marker="data-game-duo-abandon" disabled={!online || busy} onClick={() => onAbandon(duoId)}>
              {gameText('game.duo.abandon')}
            </Quiet>
          ) : null}
        </>
      );
    }
    return (
      <>
        <p className="text-caption" style={{ color: GAME_INK_2 }}>
          {duo.status === 'abandoned' ? gameText('game.duo.abandoned') : duo.status === 'expired' ? gameText('game.duo.expired') : gameText('game.duo.none')}
        </p>
        {duo.status !== 'none' ? null : friends.length === 0 ? (
          <p className="text-caption" style={{ color: GAME_INK_2 }}>
            {gameText('game.duo.no_friends')}
          </p>
        ) : (
          <FriendPicker friends={friends} online={online} busy={busy} onInvite={onInvite} />
        )}
      </>
    );
  })();

  return (
    <GameCard id="game-duo" labelledBy="game-duo-title">
      <h2 id="game-duo-title" className="text-body font-bold" style={{ color: GAME_INK }}>
        {gameText('game.duo.title')}
      </h2>
      {body}
      {error === undefined ? null : (
        <p role="alert" className="text-caption" style={{ color: GAME_ERROR }}>
          {error}
        </p>
      )}
      {online ? null : (
        <p className="text-caption" style={{ color: GAME_INK_2 }}>
          {gameText('game.offline.action')}
        </p>
      )}
    </GameCard>
  );
}
