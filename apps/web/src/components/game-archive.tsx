import type { ReactNode } from 'react';

import type { GameUpcomingSeasonBlock } from '@meeshy/shared/types/game';
import type { GameLeagueWeekArchive, GameLeagueWeekResult, GameSeasonArchive } from '@meeshy/shared/types/game-archive';
import type { LeagueMoment, LeagueZone } from '@meeshy/shared/utils/game/league';
import { SEASON_STEPS, liveSeasonTense, seasonTenseAt } from '@meeshy/shared/utils/game/season';
import { DEFAULT_SEASON_SCHEDULE, scheduledSeasonCalendar, seasonDefinitionOf, seasonStatusOf, type SeasonSchedule } from '@meeshy/shared/utils/game/season-schedule';

import { localMoment } from '@/lib/game/local-moment';
import { translateGamePlural } from '@/lib/i18n-game-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { formatCount, gameText, pointsLabel } from '@/lib/view/game-copy';
import { dayLabel, leagueName, seasonThemeName, weekLabel, zoneLabel } from '@/lib/view/game-copy-v2';

import { LeagueGem } from './game/league-gem';
import { GameSeasonOpened, GameSeasonPaused, GameSeasonUpcoming } from './game-season';
import { GAME_BRAND, GAME_ERROR, GAME_GOOD, GAME_INK, GAME_INK_2, GameCard } from './game-surface';

/**
 * UNE SAISON PASSÉE OU FUTURE, UNE SEMAINE PASSÉE, QUAND UN LIEN LES OUVRE
 * (#10018) — miroir de `apps/ios/Meeshy/Features/Main/Game/Wave2/GameArchiveViews.swift`.
 *
 * L'écran se décide par une règle PURE (`seasonShown`, `leagueShown`) : la
 * saison et la semaine EN COURS gardent l'écran d'avant, inchangé ; la saison à
 * venir que le bloc `game` porte déjà se peint sans attendre le réseau ; une
 * lecture froide hors ligne le dit, jamais un écran vide.
 *
 * Rien de la présence d'autrui : une saison montre son calendrier (le même pour
 * tous) et MON palmarès ; une semaine, MON résultat gravé.
 */

/** Ce que les règles lisent d'une requête : la donnée, et l'échec quand il n'y a rien d'autre. */
export type ArchiveRead<T> = { readonly data: T | undefined; readonly error: string | null };

type FocusGame = {
  readonly season?: { readonly number: number } | null | undefined;
  readonly seasonUpcoming?: GameUpcomingSeasonBlock | null | undefined;
  readonly league?: { readonly weekKey: string } | undefined;
};

export type PausedSeason = { readonly number: number; readonly themeKey: string };

export type SeasonShown =
  | { readonly kind: 'current' }
  | { readonly kind: 'upcoming'; readonly upcoming: GameUpcomingSeasonBlock }
  /** Ouverte d'après l'horloge locale, mais le bloc gardé ne porte pas encore son parcours (#10131). */
  | { readonly kind: 'opened'; readonly season: GameUpcomingSeasonBlock }
  | { readonly kind: 'past'; readonly season: GameSeasonArchive }
  /** Mise en pause par l'administration (calendrier servi, #10232) : son thème, aucune date. */
  | { readonly kind: 'paused'; readonly season: PausedSeason }
  | { readonly kind: 'loading' }
  | { readonly kind: 'error'; readonly message: string };

export type LeagueShown =
  | { readonly kind: 'current' }
  | { readonly kind: 'week'; readonly week: GameLeagueWeekArchive }
  | { readonly kind: 'loading' }
  | { readonly kind: 'error'; readonly message: string };

/** Le bloc `game` ne suffit pas à peindre cette saison : il faut la lire. */
export const needsSeasonArchive = (focus: number | null, game: FocusGame | undefined): boolean =>
  focus !== null && game?.season?.number !== focus && game?.seasonUpcoming?.number !== focus;

export const needsLeagueWeekArchive = (focus: string | null, game: FocusGame | undefined): boolean =>
  focus !== null && game?.league?.weekKey !== focus;

/**
 * L'écran d'une saison sous un lien. L'état se CALCULE (#10131) : celui que la passerelle a servi, avancé par
 * l'horloge locale (`liveSeasonTense`) — une copie « à venir » gardée hors ligne bascule d'elle-même le jour de son
 * ouverture. Une saison ouverte dont le bloc gardé ne porte pas encore le parcours se dit OUVERTE (`opened`), jamais
 * sous le parcours d'une autre saison.
 */
export function seasonShown(
  focus: number | null,
  game: FocusGame | undefined,
  read: ArchiveRead<GameSeasonArchive>,
  moment: LeagueMoment = localMoment(),
  schedule: SeasonSchedule = DEFAULT_SEASON_SCHEDULE,
): SeasonShown {
  if (focus === null) return { kind: 'current' };
  /* Le calendrier SERVI fait foi sur la pause : une saison future mise en pause (ou derrière une pause) n'a plus de
     dates, quoi qu'en dise une copie gardée avant la pause. Une saison en cours ou passée ne se met jamais en pause. */
  const paused = (): SeasonShown | null => {
    if (seasonStatusOf(schedule, focus) !== 'paused') return null;
    const definition = seasonDefinitionOf(schedule, focus);
    return definition === null ? null : { kind: 'paused', season: { number: focus, themeKey: definition.themeKey } };
  };
  const archive = read.data;
  if (archive !== undefined && archive.number === focus) {
    const dates = { number: archive.number, themeKey: archive.themeKey, startDay: archive.startDay, endDay: archive.endDay };
    const tense = liveSeasonTense({ served: archive.status, startDay: archive.startDay, endDay: archive.endDay }, moment);
    if (tense === 'past') return { kind: 'past', season: archive.status === 'past' ? archive : { ...archive, status: 'past' } };
    if (tense === 'upcoming') return paused() ?? { kind: 'upcoming', upcoming: dates };
    return game?.season?.number === focus ? { kind: 'current' } : { kind: 'opened', season: dates };
  }
  if (game?.season?.number === focus) return { kind: 'current' };
  const stopped = paused();
  if (stopped !== null) return stopped;
  const upcoming = game?.seasonUpcoming;
  if (upcoming !== undefined && upcoming !== null && upcoming.number === focus) {
    const tense = liveSeasonTense({ served: 'upcoming', startDay: upcoming.startDay, endDay: upcoming.endDay }, moment);
    if (tense === 'upcoming') return { kind: 'upcoming', upcoming };
    if (tense === 'current') return { kind: 'opened', season: upcoming };
  }
  /* Cache froid, calendrier SERVI : une saison future (ou ouverte) se peint depuis lui, sans attendre le réseau.
     Le repli (révision 0) ne devine rien : la saison attend sa lecture. */
  if (schedule.revision > 0) {
    const calendar = scheduledSeasonCalendar(schedule, focus);
    if (calendar !== null) {
      const dates = { number: calendar.number, themeKey: calendar.themeKey, startDay: calendar.startDay, endDay: calendar.endDay };
      const tense = seasonTenseAt(calendar, moment);
      if (tense === 'upcoming') return { kind: 'upcoming', upcoming: dates };
      if (tense === 'current') return { kind: 'opened', season: dates };
    }
  }
  return read.error === null ? { kind: 'loading' } : { kind: 'error', message: read.error };
}

/**
 * L'EN-TÊTE DE LA PAGE SAISON (#10132) — la saison du LIEN, son numéro et son état ; le compteur d'étapes de la
 * saison en cours seulement quand c'est elle que la page montre. Une lecture en attente ne compte rien.
 */
export function seasonHeaderCount(shown: SeasonShown, current: { readonly steps: number; readonly stepsTotal: number } | null | undefined): string | null {
  switch (shown.kind) {
    case 'current':
      return current === null || current === undefined ? null : `${current.steps} / ${current.stepsTotal}`;
    case 'past':
      return gameText('game.archive.season.past_title', { number: formatCount(shown.season.number) });
    case 'upcoming':
      return gameText('game.archive.season.upcoming_title', { number: formatCount(shown.upcoming.number) });
    case 'opened':
      return gameText('game.archive.season.current_title', { number: formatCount(shown.season.number) });
    case 'paused':
      return gameText('game.archive.season.paused_title', { number: formatCount(shown.season.number) });
    default:
      return null;
  }
}

export function leagueShown(focus: string | null, game: FocusGame | undefined, read: ArchiveRead<GameLeagueWeekArchive>): LeagueShown {
  if (focus === null) return { kind: 'current' };
  const archive = read.data;
  if (archive !== undefined && archive.weekKey === focus) return archive.status === 'current' ? { kind: 'current' } : { kind: 'week', week: archive };
  if (game?.league?.weekKey === focus) return { kind: 'current' };
  return read.error === null ? { kind: 'loading' } : { kind: 'error', message: read.error };
}

/** Un cache froid hors ligne : la phrase de l'échec et de quoi relire. */
export function GameArchiveRetry({ id, message, onRetry }: { readonly id: string; readonly message: string; readonly onRetry: () => void }) {
  return (
    <GameCard id={id} labelledBy={`${id}-title`}>
      <h2 id={`${id}-title`} className="sr-only">
        {gameText('game.season.title')}
      </h2>
      <div role="alert" className="flex flex-col gap-2">
        <p className="text-caption" style={{ color: GAME_ERROR }}>
          {message}
        </p>
        <button type="button" data-game-archive-retry="" onClick={onRetry} className="rounded-chip px-4 text-body font-bold" style={{ minHeight: 44, color: GAME_BRAND }}>
          {gameText('game.retry')}
        </button>
      </div>
    </GameCard>
  );
}

/** Ce que la page Saison montre d'une saison qui n'est pas en cours. */
export function GameSeasonArchiveView({
  shown,
  onRetry,
  skeleton,
  moment,
}: {
  readonly shown: SeasonShown;
  readonly onRetry: () => void;
  readonly skeleton: ReactNode;
  readonly moment?: LeagueMoment | undefined;
}) {
  if (shown.kind === 'upcoming') return <GameSeasonUpcoming upcoming={shown.upcoming} moment={moment} />;
  if (shown.kind === 'opened') return <GameSeasonOpened season={shown.season} />;
  if (shown.kind === 'paused') return <GameSeasonPaused season={shown.season} />;
  if (shown.kind === 'past') return <GameSeasonRecord season={shown.season} />;
  if (shown.kind === 'error') return <GameArchiveRetry id="game-season-archive-error" message={shown.message} onRetry={onRetry} />;
  if (shown.kind === 'loading') return <>{skeleton}</>;
  return null;
}

/** LE PALMARÈS d'une saison passée : mes étoiles, mes étapes, les récompenses réclamées, la coupe et le Sceau. */
export function GameSeasonRecord({ season }: { readonly season: GameSeasonArchive }) {
  const language = currentInterfaceLanguage();
  const theme = seasonThemeName(season.themeKey, language);
  const progress = season.progress;
  return (
    <GameCard id="game-season-archive" labelledBy="game-season-archive-title" tint={GAME_BRAND}>
      <h2 id="game-season-archive-title" className="text-title font-bold" style={{ color: GAME_INK }}>
        {gameText('game.archive.season.past_title', { number: formatCount(season.number) })}
      </h2>
      {theme === null ? null : (
        <p className="text-body font-semibold" style={{ color: GAME_BRAND }}>
          {gameText('game.season.theme', { theme })}
        </p>
      )}
      <p className="text-caption" style={{ color: GAME_INK_2 }}>
        {gameText('game.archive.season.dates', { start: dayLabel(season.startDay, language), end: dayLabel(season.endDay, language) })}
      </p>
      {progress === null ? (
        <p data-game-season-archive-unplayed="" className="text-caption" style={{ color: GAME_INK_2 }}>
          {gameText('game.archive.season.not_played')}
        </p>
      ) : (
        <>
          <p className="text-body font-semibold" style={{ color: GAME_INK }}>
            {translateGamePlural(language, 'game.season.stars', progress.stars)} ·{' '}
            {gameText('game.season.steps_line', { steps: formatCount(progress.steps), total: formatCount(SEASON_STEPS) })}
          </p>
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={SEASON_STEPS}
            aria-valuenow={progress.steps}
            aria-label={gameText('game.season.steps_line', { steps: formatCount(progress.steps), total: formatCount(SEASON_STEPS) })}
            className="h-2 overflow-hidden rounded-full"
            style={{ backgroundColor: 'var(--game-track)' }}
          >
            <div className="h-full rounded-full" style={{ width: `${Math.round((progress.steps / SEASON_STEPS) * 100)}%`, backgroundColor: GAME_BRAND }} />
          </div>
          <p className="text-caption" style={{ color: GAME_INK_2 }}>
            {translateGamePlural(language, 'game.archive.season.rewards', progress.claimedSteps.length)}
          </p>
          <p data-game-season-archive-cup={progress.completed ? 'won' : 'missed'} className="text-caption font-semibold" style={{ color: progress.completed ? GAME_GOOD : GAME_INK_2 }}>
            {gameText(progress.completed ? 'game.archive.season.cup_won' : 'game.archive.season.cup_missed')}
          </p>
          {progress.sealOwned ? (
            <p data-game-season-archive-seal="" className="text-caption font-semibold" style={{ color: GAME_GOOD }}>
              {gameText('game.archive.season.seal_owned')}
            </p>
          ) : null}
        </>
      )}
    </GameCard>
  );
}

const ZONE_TINT: Readonly<Record<LeagueZone, string>> = { promotion: GAME_GOOD, safe: GAME_INK_2, relegation: GAME_ERROR };

function Engraved({ result }: { readonly result: GameLeagueWeekResult }) {
  return (
    <div className="flex items-center gap-3">
      <span className="grid shrink-0 place-items-center" aria-hidden="true">
        <LeagueGem league={result.league} size={64} />
      </span>
      <div className="flex min-w-0 flex-col gap-0.5">
        <p className="text-title font-bold" style={{ color: GAME_INK }}>
          {leagueName(result.league)}
        </p>
        {result.finalRank === null ? null : (
          <p className="text-body font-semibold" style={{ color: GAME_INK }}>
            {gameText('game.archive.week.rank', { rank: formatCount(result.finalRank) })}
          </p>
        )}
        {result.finalPoints === null ? null : (
          <p className="text-caption" style={{ color: GAME_INK_2 }}>
            {gameText('game.archive.week.points', { points: pointsLabel(result.finalPoints) })}
          </p>
        )}
        {result.zone === null ? null : (
          <p data-game-league-archive-zone={result.zone} className="text-caption font-semibold" style={{ color: ZONE_TINT[result.zone] }}>
            {zoneLabel(result.zone)}
          </p>
        )}
        {result.cup !== null ? (
          <p data-game-league-archive-cup={result.cup} className="text-caption font-semibold" style={{ color: GAME_INK }}>
            {gameText(`game.league.cup.${result.cup}`)}
          </p>
        ) : result.settled ? (
          <p className="text-caption" style={{ color: GAME_INK_2 }}>
            {gameText('game.archive.week.no_cup')}
          </p>
        ) : null}
        {result.settled ? null : (
          <p className="text-caption" style={{ color: GAME_INK_2 }}>
            {gameText('game.archive.week.unsettled')}
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * MON RÉSULTAT GRAVÉ d'une semaine : la ligue, le rang final, la zone et la
 * coupe — ou la purge, ou l'absence de place, ou une semaine pas commencée.
 * Aucun autre membre du groupe ne se relit.
 */
export function GameLeagueWeekRecord({ archive }: { readonly archive: GameLeagueWeekArchive }) {
  const state = archive.status === 'upcoming' ? 'upcoming' : archive.result !== null ? 'engraved' : archive.retention === 'purged' ? 'purged' : 'unplaced';
  return (
    <GameCard id="game-league-archive" labelledBy="game-league-archive-title">
      <h2 id="game-league-archive-title" className="text-body font-bold" style={{ color: GAME_INK }}>
        {gameText('game.league.title')} · {weekLabel(archive.weekKey)}
      </h2>
      <div data-game-league-archive={state} className="flex flex-col gap-2">
        {state === 'engraved' && archive.result !== null ? <Engraved result={archive.result} /> : null}
        {state === 'upcoming' ? (
          <p className="text-caption" style={{ color: GAME_INK_2 }}>
            {gameText('game.archive.week.upcoming')}
          </p>
        ) : null}
        {state === 'purged' ? (
          <p className="text-caption" style={{ color: GAME_INK_2 }}>
            {gameText('game.archive.week.purged')}
          </p>
        ) : null}
        {state === 'unplaced' ? (
          <p className="text-caption" style={{ color: GAME_INK_2 }}>
            {gameText('game.archive.week.not_placed')}
          </p>
        ) : null}
      </div>
      <p className="text-caption" style={{ color: GAME_INK_2 }}>
        {gameText('game.archive.week.privacy')}
      </p>
    </GameCard>
  );
}
