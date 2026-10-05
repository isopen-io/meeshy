import { Fragment } from 'react';

import type { GameLeagueBlock, LeagueWeekEntry, LeagueWeekResponse } from '@meeshy/shared/types/game';
import type { LeagueKey, LeagueZone } from '@meeshy/shared/utils/game/league';

import { formatCount, gameText, pointsLabel } from '@/lib/view/game-copy';
import { leagueName, remainingLabel, weekLabel, zoneLabel } from '@/lib/view/game-copy-v2';

import { GameLeagueConsent, PseudonymField } from './game-league-consent';
import { GAME_BRAND, GAME_ERROR, GAME_GOOD, GAME_INK, GAME_INK_2, GameCard, GameChip } from './game-surface';
import { LeagueGem } from './game/league-gem';
import { Trophy } from './game/trophy';

/**
 * LA LIGUE PUBLIQUE (#9384, conception II.7) — la gemme et le rang de la
 * semaine, la zone de montée et de descente, le classement du groupe sous
 * PSEUDONYMES, le compte à rebours calme, le consentement et le pseudonyme.
 *
 * Quatre états, dans l'ordre où la passerelle les sert (`access`) : verrouillée
 * (niveau 10), fermée aux mineurs, en attente de consentement, ouverte. Un état
 * que ce client ne connaît pas n'est pas peint : il vaut mieux se taire que
 * deviner une porte.
 *
 * LE CLASSEMENT NE RÉVÈLE AUCUNE ACTIVITÉ EN DIRECT (conformité A-6) : les
 * lignes des AUTRES sont figées à 4 h (`snapshotDay`), seule la ligne `isMe` est
 * vivante, et l'écran le DIT. Aucune ligne ne montre d'avatar, de drapeau ni de
 * langue. Les données viennent de `GET /me/game/league/week`, lues cache-first
 * par l'hôte : ce composant ne connaît ni le réseau ni le cache.
 */

const ZONE_TINT: Readonly<Record<LeagueZone, string>> = { promotion: GAME_GOOD, safe: GAME_INK_2, relegation: GAME_ERROR };
const CUP_MATERIAL = { gold: 'gold', silver: 'silver', bronze: 'bronze' } as const;

export type WeekState =
  | { readonly status: 'loading' }
  | { readonly status: 'error'; readonly message: string }
  | { readonly status: 'ready'; readonly week: LeagueWeekResponse };

function StandingRow({ entry }: { readonly entry: LeagueWeekEntry }) {
  return (
    <li
      data-game-standing={entry.rank}
      data-game-me={entry.isMe ? '' : undefined}
      className="flex items-center gap-3 rounded-chip px-3"
      style={{
        minHeight: 44,
        backgroundColor: entry.isMe ? `color-mix(in srgb, ${GAME_BRAND} 14%, transparent)` : 'transparent',
        borderInlineStart: `3px solid ${ZONE_TINT[entry.zone]}`,
      }}
    >
      <span className="w-7 shrink-0 text-body font-bold tabular-nums" style={{ color: GAME_INK_2 }}>
        {formatCount(entry.rank)}
      </span>
      <span className="min-w-0 flex-1 truncate text-body font-semibold" style={{ color: GAME_INK }}>
        {entry.displayName}
        {entry.isMe ? (
          <>
            {' '}
            <GameChip tint={GAME_BRAND}>{gameText('game.league.me')}</GameChip>
          </>
        ) : null}
      </span>
      {entry.cup === null ? null : (
        <span className="shrink-0">
          <Trophy kind="league" size={22} material={CUP_MATERIAL[entry.cup]} />
          <span className="sr-only">{gameText(`game.league.cup.${entry.cup}`)}</span>
        </span>
      )}
      <span className="shrink-0 text-caption font-semibold tabular-nums" style={{ color: GAME_INK }}>
        {pointsLabel(entry.weekPoints)}
      </span>
    </li>
  );
}

/** Le classement du groupe : les zones se nomment (le texte, pas seulement la couleur). */
export function LeagueStandings({ entries }: { readonly entries: readonly LeagueWeekEntry[] }) {
  let previous: LeagueZone | null = null;
  return (
    <ol className="flex flex-col gap-1" data-game-standings="">
      {entries.map((entry) => {
        const heading = entry.zone !== previous;
        previous = entry.zone;
        return (
          <Fragment key={entry.rank}>
            {heading ? (
              <li
                role="presentation"
                data-game-zone={entry.zone}
                className="px-1 pt-2 text-check font-semibold uppercase tracking-wide"
                style={{ color: ZONE_TINT[entry.zone] }}
              >
                {zoneLabel(entry.zone)}
              </li>
            ) : null}
            <StandingRow entry={entry} />
          </Fragment>
        );
      })}
    </ol>
  );
}

function Skeleton() {
  return (
    <div role="status" aria-busy="true" data-game-skeleton="" className="flex flex-col gap-1">
      {[0, 1, 2, 3, 4].map((row) => (
        <div key={row} className="rounded-chip" style={{ height: 44, backgroundColor: 'color-mix(in srgb, var(--color-ios-ink) 7%, transparent)' }} />
      ))}
    </div>
  );
}

export type GameLeagueProps = {
  readonly league: GameLeagueBlock;
  /** Le niveau RECORD : la ligue s'ouvre sur lui, jamais sur le niveau courant. */
  readonly levelRecord: number;
  readonly week: WeekState;
  readonly online: boolean;
  readonly now: Date;
  readonly consent: { readonly pending: boolean; readonly error?: string | undefined };
  readonly pseudonym: { readonly pending: boolean; readonly error?: string | undefined };
  readonly onConsent: (consent: boolean, pseudonym?: string) => void;
  readonly onPseudonym: (name: string) => void;
  readonly onRetryWeek: () => void;
};

const MIN_LEVEL = 10;

function LockedCard({ levelRecord }: { readonly levelRecord: number }) {
  return (
    <GameCard id="game-league-locked" labelledBy="game-league-locked-title">
      <h2 id="game-league-locked-title" className="text-body font-bold" style={{ color: GAME_INK }}>
        {gameText('game.league.title')}
      </h2>
      <p className="text-caption" style={{ color: GAME_INK_2 }}>
        {gameText('game.league.locked', { level: formatCount(MIN_LEVEL), current: formatCount(levelRecord) })}
      </p>
    </GameCard>
  );
}

function PlacedHeader({ league, now }: { readonly league: GameLeagueBlock; readonly now: Date }) {
  const current = league.current;
  if (current === null) {
    return (
      <p className="text-caption" style={{ color: GAME_INK_2 }}>
        {gameText('game.league.waiting')}
      </p>
    );
  }
  const key: LeagueKey = current.league;
  const gap =
    current.pointsToPromotion === null
      ? gameText('game.league.at_top')
      : current.pointsToPromotion === 0
        ? gameText('game.league.in_promotion')
        : gameText('game.league.to_promotion', { points: pointsLabel(current.pointsToPromotion) });
  return (
    <div className="flex items-center gap-3">
      <LeagueGem league={key} size={64} />
      <div className="flex min-w-0 flex-col gap-0.5">
        <p className="text-title font-bold" style={{ color: GAME_INK }}>
          {leagueName(key)}
        </p>
        <p className="text-body font-semibold" style={{ color: GAME_INK }}>
          {gameText('game.league.rank_line', { rank: formatCount(current.rank), size: formatCount(current.groupSize) })}
        </p>
        <p className="text-caption" style={{ color: ZONE_TINT[current.zone] }}>
          {zoneLabel(current.zone)} · {gap}
        </p>
        <p className="text-caption" style={{ color: GAME_INK_2 }}>
          {gameText('game.league.closes', { remaining: remainingLabel(league.closes, now) })}
        </p>
      </div>
    </div>
  );
}

export function GameLeague(props: GameLeagueProps) {
  const { league, levelRecord, week, online, now, consent, pseudonym, onConsent, onPseudonym, onRetryWeek } = props;

  if (league.access === 'locked') return <LockedCard levelRecord={levelRecord} />;
  if (league.access === 'minor') {
    return (
      <GameCard id="game-league-minor" labelledBy="game-league-minor-title">
        <h2 id="game-league-minor-title" className="text-body font-bold" style={{ color: GAME_INK }}>
          {gameText('game.league.title')}
        </h2>
        <p className="text-caption" style={{ color: GAME_INK_2 }}>
          {gameText('game.league.minor')}
        </p>
      </GameCard>
    );
  }
  if (league.access === 'consent-required') {
    return <GameLeagueConsent online={online} busy={consent.pending} error={consent.error} onAccept={(name) => onConsent(true, name)} />;
  }

  return (
    <>
      <GameCard id="game-league" labelledBy="game-league-title" tint={GAME_BRAND}>
        <h2 id="game-league-title" className="text-check font-semibold uppercase tracking-wide" style={{ color: GAME_INK_2 }}>
          {gameText('game.league.title')} · {weekLabel(league.weekKey)}
        </h2>
        <PlacedHeader league={league} now={now} />
      </GameCard>

      <GameCard labelledBy="game-league-standings-title">
        <h2 id="game-league-standings-title" className="sr-only">
          {gameText('game.league.tab.mine')}
        </h2>
        {week.status === 'ready' && week.week.entries.length > 0 ? <LeagueStandings entries={week.week.entries} /> : null}
        {week.status === 'ready' && week.week.entries.length === 0 ? (
          <p className="text-caption" style={{ color: GAME_INK_2 }}>
            {gameText('game.league.empty')}
          </p>
        ) : null}
        {week.status === 'loading' ? <Skeleton /> : null}
        {week.status === 'error' ? (
          <div role="alert" className="flex flex-col gap-2">
            <p className="text-caption" style={{ color: GAME_ERROR }}>
              {week.message}
            </p>
            <button type="button" onClick={onRetryWeek} className="rounded-chip px-4 text-body font-bold" style={{ minHeight: 44, color: GAME_BRAND }}>
              {gameText('game.retry')}
            </button>
          </div>
        ) : null}
        <p className="text-caption" style={{ color: GAME_INK_2 }}>
          {gameText('game.league.snapshot')}
        </p>
      </GameCard>

      <GameCard id="game-league-pseudonym-card" labelledBy="game-league-pseudonym-title">
        <h2 id="game-league-pseudonym-title" className="text-body font-bold" style={{ color: GAME_INK }}>
          {gameText('game.league.pseudonym.title')}
        </h2>
        {league.pseudonym === null ? null : (
          <p className="text-caption" style={{ color: GAME_INK_2 }}>
            {gameText('game.league.pseudonym.current', { name: league.pseudonym })}
          </p>
        )}
        <PseudonymField
          allowEmpty={false}
          label={gameText('game.league.pseudonym.new')}
          hint={gameText('game.league.pseudonym.hint_change')}
          busy={pseudonym.pending || !online}
          error={pseudonym.error}
          submitLabel={gameText('game.league.pseudonym.save')}
          onSubmit={onPseudonym}
        />
        <button
          type="button"
          data-game-league-leave=""
          disabled={!online || consent.pending}
          aria-busy={consent.pending}
          onClick={() => onConsent(false)}
          className="rounded-chip px-4 text-body font-semibold disabled:opacity-60"
          style={{ minHeight: 44, color: GAME_ERROR }}
        >
          {gameText('game.league.consent.leave')}
        </button>
        {consent.error === undefined ? null : (
          <p role="alert" className="text-caption" style={{ color: GAME_ERROR }}>
            {consent.error}
          </p>
        )}
        {online ? null : (
          <p className="text-caption" style={{ color: GAME_INK_2 }}>
            {gameText('game.offline.action')}
          </p>
        )}
      </GameCard>
    </>
  );
}
