import { useEffect, useRef, useState } from 'react';

import type { GameBlock, GameChest, GameMission, GameMissions as GameMissionsBlock } from '@meeshy/shared/types/game';
import { MISSION_REROLL_PRICE, MISSIONS_MIN_LEVEL } from '@meeshy/shared/utils/game/missions';
import { spendPreview } from '@meeshy/shared/utils/game/spend';

import { dailyMissionClock, endOfGameDay, type DailyMissionClock } from '@/lib/game/mission-clock';
import { personalMissionClock } from '@/lib/game/personal-mission-clock';
import { timerLabel } from '@/lib/view/game-copy-v2';

import { Chest, useChoreography } from '@/components/game';
import { ProgressBar } from '@/components/progress-bar';
import { difficultyName, formatCount, gameText, meeshCount, missionTitle, pointsLabel } from '@/lib/view/game-copy';
import { chestDetail, missionDetail } from '@/lib/view/game-detail';

import { GAME_BRAND, GAME_ERROR, GAME_GOOD, GAME_INK, GAME_INK_2, GAME_ON_WARM, GAME_WARM, GameCard, GameChip } from './game-surface';
import { GameFactChips, GameRequirementLine, GameSpendLine, GameTouch } from './game-touch';

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
  /** L'horloge des minuteurs (#9539) ; absente, les cartes lisent l'heure et se mettent à jour d'elles-mêmes. */
  readonly now?: Date | undefined;
};

const clock = (minute: number): string =>
  `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;

const chance = (fraction: number): string => gameText('game.chest.chance', { odds: formatCount(Math.round(1 / fraction)) });

function MissionRow({
  mission,
  clock: timer,
  canReroll,
  pending,
  online,
  affordable,
  onReroll,
}: {
  readonly mission: GameMission;
  /** Où en est le jour de la mission (#9539) ; `null` quand le jour servi est illisible : pas de minuteur. */
  readonly clock: DailyMissionClock | null;
  readonly canReroll: boolean;
  readonly pending: boolean;
  readonly online: boolean;
  /** Le solde couvre le prix d'un changement (`MISSION_REROLL_PRICE`). */
  readonly affordable: boolean;
  readonly onReroll: (missionId: string) => void;
}) {
  const done = mission.completedAt !== null;
  const title = missionTitle(mission.templateKey, mission.target);
  const ended = timer?.phase === 'finished' || timer?.phase === 'missed';
  return (
    <li
      data-game-mission={mission.id}
      {...(timer === null ? {} : { 'data-game-mission-phase': timer.phase })}
      aria-busy={pending}
      className="flex flex-col gap-1.5 rounded-card px-3 py-3"
      style={{ backgroundColor: 'color-mix(in srgb, var(--color-ios-ink-3) 10%, transparent)', opacity: pending ? 0.6 : timer?.phase === 'missed' ? 0.7 : 1 }}
    >
      {/* La mission se touche : ses pastilles, son titre et sa jauge ouvrent SES précisions (#9563). Le bouton « Changer » reste à part. */}
      <GameTouch detail={missionDetail(mission)} className="flex w-full flex-col gap-1.5 rounded-chip" style={{ minHeight: 44 }}>
      <div className="flex flex-wrap items-center gap-1.5">
        <GameChip tint={mission.difficulty === 'gold' ? GAME_WARM : GAME_BRAND}>{difficultyName(mission.difficulty)}</GameChip>
        {mission.prism ? <GameChip tint={GAME_BRAND}>{gameText('game.mission.prism')}</GameChip> : null}
        {ended ? (
          <GameChip tint={timer.phase === 'finished' ? GAME_GOOD : GAME_INK_2}>{gameText(timer.phase === 'finished' ? 'game.mission.personal.completed' : 'game.mission.personal.missed')}</GameChip>
        ) : done ? (
          <GameChip tint={GAME_GOOD}>{gameText('game.mission.done')}</GameChip>
        ) : null}
      </div>
      <p className="text-body font-semibold" style={{ color: GAME_INK }}>
        {title}
      </p>
      <ProgressBar progress={mission.progress / mission.target} tint={done ? GAME_GOOD : GAME_BRAND} label={title} />
      </GameTouch>
      {timer?.phase !== 'active' || timer.remainingMs === null ? null : (
        <p data-game-mission-timer="" className="text-caption font-semibold" style={{ color: GAME_INK_2 }}>
          {gameText('game.mission.personal.active', { remaining: timerLabel(timer.remainingMs) })}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-caption" style={{ color: GAME_INK_2 }}>
          {gameText('game.fmt.fraction', { done: formatCount(Math.min(mission.progress, mission.target)), total: formatCount(mission.target) })}
          {' · '}
          <span style={{ color: GAME_INK, fontWeight: 700 }}>{gameText('game.fmt.signed', { value: pointsLabel(mission.reward) })}</span>
          {mission.glory > 0 ? (
            <span style={{ color: GAME_WARM, fontWeight: 700 }}> · {gameText('game.mission.glory', { glory: formatCount(mission.glory) })}</span>
          ) : null}
        </p>
        {canReroll && !done && (timer?.actionable ?? true) ? (
          <button
            type="button"
            data-game-reroll=""
            disabled={!online || pending || !affordable}
            aria-label={gameText('game.mission.reroll.a11y', { title, price: meeshCount(MISSION_REROLL_PRICE) })}
            onClick={() => onReroll(mission.id)}
            className="rounded-chip px-3 text-check font-semibold disabled:opacity-50"
            style={{ minHeight: 44, color: GAME_BRAND, backgroundColor: 'color-mix(in srgb, var(--color-ios-brand) 12%, transparent)' }}
          >
            {gameText('game.mission.reroll', { price: meeshCount(MISSION_REROLL_PRICE) })}
          </button>
        ) : null}
      </div>
    </li>
  );
}

/** Les minuteurs se rafraîchissent à la minute près : jamais de secondes qui défilent, une lecture calme. */
const TICK_MS = 15_000;

/**
 * Le minuteur ne coûte rien hors écran : AUCUN intervalle tant que l'onglet est caché, aucun une fois la fin
 * de la plage passée (rien ne change plus), et une relecture immédiate au retour — la carte ne montre jamais
 * l'heure d'avant l'absence (#9539).
 */
function useClockNow(fixed: Date | undefined, end: number): Date {
  const [now, setNow] = useState(() => fixed ?? new Date());
  useEffect(() => {
    if (fixed !== undefined) return;
    let id: ReturnType<typeof setInterval> | undefined;
    const stop = () => {
      if (id !== undefined) clearInterval(id);
      id = undefined;
    };
    const tick = () => {
      const current = new Date();
      setNow(current);
      if (current.getTime() >= end) stop();
    };
    const start = () => {
      stop();
      if (document.visibilityState === 'hidden' || Date.now() >= end) return;
      id = setInterval(tick, TICK_MS);
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') return stop();
      tick();
      start();
    };
    start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [fixed, end]);
  return fixed ?? now;
}

/**
 * LA MISSION PERSONNELLE (#9539) — une mission de plus, avec sa plage. Le minuteur court jusqu'au début (à
 * venir) puis jusqu'à la FIN (en cours) ; passée la fin, la carte dit « Terminée » ou « Manquée », sans
 * décompte. Elle ne se change pas : le tirage est le sien, une fois par jour.
 */
function PersonalMissionRow({ mission, now }: { readonly mission: NonNullable<GameMissionsBlock['personal']>; readonly now: Date }) {
  const clock = personalMissionClock({ startsAt: mission.startsAt, endsAt: mission.endsAt, completedAt: mission.completedAt, now });
  const done = clock.phase === 'completed';
  const title = missionTitle(mission.templateKey, mission.target);
  const status =
    clock.phase === 'completed' || clock.phase === 'missed'
      ? gameText(`game.mission.personal.${clock.phase}`)
      : gameText(clock.phase === 'upcoming' ? 'game.mission.personal.upcoming' : 'game.mission.personal.active', { remaining: timerLabel(clock.remainingMs ?? 0) });
  return (
    <li
      data-game-personal={mission.id}
      data-game-personal-phase={clock.phase}
      className="flex flex-col gap-1.5 rounded-card px-3 py-3"
      style={{ backgroundColor: 'color-mix(in srgb, var(--color-ios-brand) 10%, transparent)', opacity: clock.phase === 'missed' ? 0.7 : 1 }}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <GameChip tint={GAME_BRAND}>{gameText('game.mission.personal.chip')}</GameChip>
        <GameChip tint={done ? GAME_GOOD : clock.phase === 'missed' ? GAME_INK_2 : GAME_WARM}>{status}</GameChip>
      </div>
      <p className="text-body font-semibold" style={{ color: GAME_INK }}>
        {title}
      </p>
      <ProgressBar progress={mission.progress / mission.target} tint={done ? GAME_GOOD : GAME_BRAND} label={title} />
      <p className="text-caption" style={{ color: GAME_INK_2 }}>
        {gameText('game.fmt.fraction', { done: formatCount(Math.min(mission.progress, mission.target)), total: formatCount(mission.target) })}
        {' · '}
        <span style={{ color: GAME_INK, fontWeight: 700 }}>{gameText('game.fmt.signed', { value: pointsLabel(mission.reward) })}</span>
      </p>
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

function ChestCard({
  chest,
  done,
  opening,
  online,
  onClaim,
  error,
}: {
  readonly chest: GameChest;
  /** Les missions du jour faites, sur celles du jour : ce que le coffre attend. */
  readonly done: { readonly count: number; readonly total: number };
  readonly opening: boolean;
  readonly online: boolean;
  readonly onClaim: () => void;
  readonly error: string | undefined;
}) {
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
        <GameTouch detail={chestDetail(chest)} named className="grid place-items-center rounded-card">
          <Chest state={open ? 'open' : 'closed'} size={90} />
        </GameTouch>
      </div>
      <h3 className="text-body font-bold" style={{ color: GAME_INK }}>
        {gameText('game.chest.title')}
      </h3>
      {state === 'locked' ? (
        <>
          <p className="text-caption" style={{ color: GAME_INK_2 }}>
            {gameText('game.chest.locked')}
          </p>
          <GameFactChips
            concept="missions"
            marker="data-game-chest-requirement"
            chips={[{ fact: 'missions_done', label: gameText('game.fact.done'), value: gameText('game.fmt.fraction', { done: formatCount(done.count), total: formatCount(done.total) }) }]}
          />
        </>
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

/**
 * La dernière fin de plage de la carte : passé elle, plus rien ne change et l'horloge s'arrête. UNE horloge pour
 * toutes les cartes (les trois du jour et la personnelle), jamais un intervalle par ligne.
 */
function lastWindowEnd(missions: GameMissionsBlock): number {
  const day = missions.items.some((mission) => mission.completedAt === null) ? endOfGameDay(missions.dayKey)?.getTime() ?? 0 : 0;
  const personal = missions.personal == null ? Number.NaN : new Date(missions.personal.endsAt).getTime();
  return Math.max(day, Number.isNaN(personal) ? 0 : personal);
}

export function GameMissions(props: GameMissionsProps) {
  const { missions, chest, held, level, prismHour, online, pendingRerollId, chestOpening, onReroll, onClaim, errors } = props;
  const now = useClockNow(props.now, missions.unlocked ? lastWindowEnd(missions) : 0);

  if (!missions.unlocked) {
    return (
      <GameCard id="game-missions" labelledBy="game-missions-title">
        <h2 id="game-missions-title" className="text-body font-bold" style={{ color: GAME_INK }}>
          {gameText('game.missions.title')}
        </h2>
        <p className="text-caption" style={{ color: GAME_INK_2 }}>
          {gameText('game.missions.locked', { level: formatCount(level) })}
        </p>
        <GameRequirementLine concept="missions" current={level} required={MISSIONS_MIN_LEVEL} />
      </GameCard>
    );
  }

  const reroll = spendPreview({ held, cost: MISSION_REROLL_PRICE });
  /* Le serveur retire le changement faute de Meesh (`rerollAvailable`) : la ligne reste, pour dire combien il en manque. */
  const rows = missions.items.map((mission) => ({ mission, clock: dailyMissionClock({ dayKey: missions.dayKey, completed: mission.completedAt !== null, now }) }));
  const rerollable = rows.some(({ mission, clock: timer }) => mission.completedAt === null && (timer?.actionable ?? true));
  const rerollShown = rerollable && (missions.rerollAvailable || !reroll.affordable);
  const done = { count: missions.items.filter((mission) => mission.completedAt !== null).length, total: missions.items.length };

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
        {rows.map(({ mission, clock: timer }) => (
          <MissionRow
            key={mission.id}
            mission={mission}
            clock={timer}
            canReroll={missions.rerollAvailable}
            pending={pendingRerollId === mission.id}
            online={online}
            affordable={reroll.affordable}
            onReroll={onReroll}
          />
        ))}
        {missions.personal == null ? null : <PersonalMissionRow mission={missions.personal} now={now} />}
      </ul>
      {/* Le prix d'un changement, avant le geste (#9705) : une ligne pour la liste, pas une par mission. */}
      {rerollShown ? (
        <div data-game-spend-reroll="" className="flex flex-col gap-1">
          <p className="text-caption font-semibold" style={{ color: GAME_INK_2 }}>
            {gameText('game.mission.reroll', { price: meeshCount(MISSION_REROLL_PRICE) })}
          </p>
          <GameSpendLine concept="missions" held={held} cost={MISSION_REROLL_PRICE} format={meeshCount} />
        </div>
      ) : null}
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
      <ChestCard chest={chest} done={done} opening={chestOpening} online={online} onClaim={onClaim} error={errors?.chest} />
    </GameCard>
  );
}
