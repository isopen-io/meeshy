import { useEffect, useRef } from 'react';

import type { GameBlock, GameChest, GameMission, GameMissions as GameMissionsBlock } from '@meeshy/shared/types/game';

import { Chest, useChoreography } from '@/components/game';
import { ProgressBar } from '@/components/progress-bar';
import { difficultyName, formatCount, gameText, missionTitle, pointsLabel } from '@/lib/view/game-copy';

import { GAME_BRAND, GAME_ERROR, GAME_GOOD, GAME_INK, GAME_INK_2, GAME_ON_WARM, GAME_WARM, GameCard, GameChip } from './game-surface';

/**
 * LES MISSIONS DU JOUR ET LE COFFRE (#9383) — trois missions, leur avancement,
 * un changement par jour (1 Meesh), et le coffre qui s'ouvre quand tout est
 * fait (conception, partie II « Missions du jour »).
 *
 * Le coffre dit son contenu AVANT l'ouverture (60 à 200 points, une chance sur
 * six d'un fragment, une sur vingt d'un gel) : un tirage dont on ignore les
 * chances est une loterie, pas un jeu. Ouvert, ses récompenses se posent AU-
 * DESSUS de lui (`data-game-reward`) — c'est la cible de la chorégraphie
 * « chest », que ce composant joue quand le contenu servi arrive.
 *
 * Rien n'est inventé côté client : les missions, leur objectif et leur
 * récompense viennent du bloc `game` (calculés par la loi partagée), et le
 * contenu du coffre n'existe qu'une fois la passerelle l'a tiré. Pendant
 * l'ouverture, le coffre est déjà ouvert (retour instantané) et le contenu
 * attendu s'annonce comme tel.
 */

type PrismHour = NonNullable<GameBlock['boosts']['prismHour']>;

export type GameMissionsProps = {
  readonly missions: GameMissionsBlock;
  readonly chest: GameChest;
  /** Meeshes gardées : de quoi payer un changement. */
  readonly held: number;
  readonly level: number;
  readonly prismHour: PrismHour | null;
  readonly online: boolean;
  /** La mission dont la remplaçante est attendue. */
  readonly pendingRerollId: string | null;
  readonly chestOpening: boolean;
  readonly onReroll: (missionId: string) => void;
  readonly onClaim: () => void;
  readonly errors?: { readonly reroll?: string | undefined; readonly chest?: string | undefined };
};

/** Le prix d'un changement ; le libellé du bouton le dit dans la phrase du catalogue (« Changer · 1 Meesh »), comme sur iOS. */
const REROLL_PRICE = 1;

const clock = (minute: number): string =>
  `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;

const chance = (fraction: number): string => gameText('game.chest.chance', { odds: formatCount(Math.round(1 / fraction)) });

function MissionRow({
  mission,
  canReroll,
  pending,
  online,
  held,
  onReroll,
}: {
  readonly mission: GameMission;
  readonly canReroll: boolean;
  readonly pending: boolean;
  readonly online: boolean;
  readonly held: number;
  readonly onReroll: (missionId: string) => void;
}) {
  const done = mission.completedAt !== null;
  const title = missionTitle(mission.templateKey, mission.target);
  return (
    <li
      data-game-mission={mission.id}
      aria-busy={pending}
      className="flex flex-col gap-1.5 rounded-card px-3 py-3"
      style={{ backgroundColor: 'color-mix(in srgb, var(--color-ios-ink-3) 10%, transparent)', opacity: pending ? 0.6 : 1 }}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <GameChip tint={mission.difficulty === 'gold' ? GAME_WARM : GAME_BRAND}>{difficultyName(mission.difficulty)}</GameChip>
        {mission.prism ? <GameChip tint={GAME_BRAND}>{gameText('game.mission.prism')}</GameChip> : null}
        {done ? <GameChip tint={GAME_GOOD}>{gameText('game.mission.done')}</GameChip> : null}
      </div>
      <p className="text-body font-semibold" style={{ color: GAME_INK }}>
        {title}
      </p>
      <ProgressBar progress={mission.progress / mission.target} tint={done ? GAME_GOOD : GAME_BRAND} label={title} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-caption" style={{ color: GAME_INK_2 }}>
          {gameText('game.fmt.fraction', { done: formatCount(Math.min(mission.progress, mission.target)), total: formatCount(mission.target) })}
          {' · '}
          <span style={{ color: GAME_INK, fontWeight: 700 }}>{gameText('game.fmt.signed', { value: pointsLabel(mission.reward) })}</span>
          {mission.glory > 0 ? (
            <span style={{ color: GAME_WARM, fontWeight: 700 }}> · {gameText('game.mission.glory', { glory: formatCount(mission.glory) })}</span>
          ) : null}
        </p>
        {canReroll && !done ? (
          <button
            type="button"
            data-game-reroll=""
            disabled={!online || pending || held < REROLL_PRICE}
            aria-label={gameText('game.mission.reroll.a11y', { title })}
            onClick={() => onReroll(mission.id)}
            className="rounded-chip px-3 text-check font-semibold disabled:opacity-50"
            style={{ minHeight: 44, color: GAME_BRAND, backgroundColor: 'color-mix(in srgb, var(--color-ios-brand) 12%, transparent)' }}
          >
            {gameText('game.mission.reroll')}
          </button>
        ) : null}
      </div>
    </li>
  );
}

function Rewards({ reward }: { readonly reward: NonNullable<GameChest['reward']> }) {
  return (
    <ul className="flex flex-wrap justify-center gap-2" aria-label={gameText('game.chest.contents')}>
      <li data-game-reward="" className="rounded-chip px-2.5 py-1 text-check font-semibold" style={{ backgroundColor: 'color-mix(in srgb, var(--ios-warning) 18%, transparent)', color: GAME_INK }}>
        {gameText('game.fmt.signed', { value: pointsLabel(reward.points) })}
      </li>
      {reward.fragment ? (
        <li data-game-reward="" className="rounded-chip px-2.5 py-1 text-check font-semibold" style={{ backgroundColor: 'color-mix(in srgb, var(--ios-warning) 18%, transparent)', color: GAME_INK }}>
          {gameText('game.chest.reward.fragment')}
        </li>
      ) : null}
      {reward.freeze ? (
        <li data-game-reward="" className="rounded-chip px-2.5 py-1 text-check font-semibold" style={{ backgroundColor: 'color-mix(in srgb, var(--ios-warning) 18%, transparent)', color: GAME_INK }}>
          {gameText('game.chest.reward.freeze')}
        </li>
      ) : null}
    </ul>
  );
}

function ChestCard({ chest, opening, online, onClaim, error }: { readonly chest: GameChest; readonly opening: boolean; readonly online: boolean; readonly onClaim: () => void; readonly error: string | undefined }) {
  const { ref, play } = useChoreography<HTMLDivElement>();
  const rewarded = useRef(chest.reward !== null);
  useEffect(() => {
    if (chest.reward === null) {
      rewarded.current = false;
      return;
    }
    if (rewarded.current) return;
    rewarded.current = true;
    play('chest', { rewards: 1 + Number(chest.reward.fragment) + Number(chest.reward.freeze) });
  }, [chest.reward, play]);

  const state = opening || chest.status === 'claimed' ? (chest.reward === null ? 'opening' : 'claimed') : chest.status;
  const open = state === 'opening' || state === 'claimed';
  const { odds } = chest;
  return (
    <div data-game-chest-state={state} className="flex flex-col items-center gap-2 rounded-card px-3 py-3" style={{ backgroundColor: 'color-mix(in srgb, var(--ios-warning) 8%, transparent)' }}>
      <div ref={ref} className="flex flex-col items-center gap-2">
        {chest.reward === null ? null : <Rewards reward={chest.reward} />}
        <Chest state={open ? 'open' : 'closed'} size={90} />
      </div>
      <h3 className="text-body font-bold" style={{ color: GAME_INK }}>
        {gameText('game.chest.title')}
      </h3>
      {state === 'locked' ? (
        <p className="text-caption" style={{ color: GAME_INK_2 }}>
          {gameText('game.chest.locked')}
        </p>
      ) : null}
      {state === 'opening' ? (
        <p role="status" className="text-caption" style={{ color: GAME_INK_2 }}>
          {gameText('game.chest.opening')}
        </p>
      ) : null}
      {state === 'ready' ? (
        <button
          type="button"
          data-game-chest-open=""
          disabled={!online}
          onClick={onClaim}
          className="rounded-chip px-4 text-body font-bold disabled:opacity-50"
          style={{ minHeight: 44, backgroundColor: GAME_WARM, color: GAME_ON_WARM }}
        >
          {gameText('game.chest.open')}
        </button>
      ) : null}
      {state === 'claimed' ? (
        <p className="text-caption" style={{ color: GAME_INK_2 }}>
          {gameText('game.chest.claimed')}
        </p>
      ) : null}
      <p className="text-center text-caption" style={{ color: GAME_INK_2 }}>
        {gameText('game.chest.odds', {
          min: formatCount(odds.minPoints),
          max: pointsLabel(odds.maxPoints),
          fragment: chance(odds.fragment),
          freeze: chance(odds.freeze),
        })}
      </p>
      {error === undefined || opening ? null : (
        <p role="alert" className="text-caption" style={{ color: GAME_ERROR }}>
          {error}
        </p>
      )}
    </div>
  );
}

export function GameMissions(props: GameMissionsProps) {
  const { missions, chest, held, level, prismHour, online, pendingRerollId, chestOpening, onReroll, onClaim, errors } = props;

  if (!missions.unlocked) {
    return (
      <GameCard id="game-missions" labelledBy="game-missions-title">
        <h2 id="game-missions-title" className="text-body font-bold" style={{ color: GAME_INK }}>
          {gameText('game.missions.title')}
        </h2>
        <p className="text-caption" style={{ color: GAME_INK_2 }}>
          {gameText('game.missions.locked', { level: formatCount(level) })}
        </p>
      </GameCard>
    );
  }

  return (
    <GameCard id="game-missions" labelledBy="game-missions-title">
      <h2 id="game-missions-title" className="text-body font-bold" style={{ color: GAME_INK }}>
        {gameText('game.missions.title')}
      </h2>
      {missions.prismDay ? (
        <p className="text-caption" style={{ color: GAME_INK_2 }}>
          {gameText('game.missions.prism_day')}
        </p>
      ) : null}
      {prismHour === null ? null : (
        <p className="text-caption" style={{ color: GAME_INK_2 }}>
          {gameText('game.missions.prism_hour', { start: clock(prismHour.startMinute), end: clock(prismHour.endMinute) })}
        </p>
      )}
      <ul className="flex flex-col gap-2">
        {missions.items.map((mission) => (
          <MissionRow
            key={mission.id}
            mission={mission}
            canReroll={missions.rerollAvailable}
            pending={pendingRerollId === mission.id}
            online={online}
            held={held}
            onReroll={onReroll}
          />
        ))}
      </ul>
      {errors?.reroll === undefined ? null : (
        <p role="alert" className="text-caption" style={{ color: GAME_ERROR }}>
          {errors.reroll}
        </p>
      )}
      {online ? null : (
        <p className="text-caption" style={{ color: GAME_INK_2 }}>
          {gameText('game.missions.offline')}
        </p>
      )}
      <ChestCard chest={chest} opening={chestOpening} online={online} onClaim={onClaim} error={errors?.chest} />
    </GameCard>
  );
}
