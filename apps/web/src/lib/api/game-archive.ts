import type { GameLeagueWeekArchive, GameSeasonArchive } from '@meeshy/shared/types/game-archive';
import { GAME_ARCHIVE_RETENTIONS, GAME_ARCHIVE_STATUSES, gameLeagueWeekArchivePath, gameSeasonArchivePath } from '@meeshy/shared/types/game-archive-routes';
import { LEAGUE_KEYS } from '@meeshy/shared/utils/game/league';
import { SEASON_STEPS, SEASON_WEEKS } from '@meeshy/shared/utils/game/season';
import { scheduledSeasonAt, scheduledSeasonCalendar, seasonStatusOf, type SeasonSchedule } from '@meeshy/shared/utils/game/season-schedule';

import { unwrap } from './client';
import type { DataSource } from './config';
import { currentSeasonSchedule } from './game-season-calendar';
import { isBool, isInt, isOneOf, isText, orNull, shape } from './game-guards';
import { GAME_V2_QUERY_PREFIX } from './game-v2-queries';
import type { ApiResult, HttpTransport } from './http';

/**
 * CE QU'UN LIEN DU JEU OUVRE (#9947, #10018) — une saison n et une semaine de
 * ligue, lues par `GET /me/game/seasons/:number` et
 * `GET /me/game/league/weeks/:weekKey` (`GAME_ARCHIVE_ROUTES`, la table
 * partagée, jamais le catalogue généré).
 *
 * CACHE-FIRST. Les clés vivent sous `GAME_V2_QUERY_PREFIX` : persistées avec le
 * reste du cache, elles servent hors ligne la dernière lecture d'une saison ou
 * d'une semaine, une clé par numéro et par lundi — jamais mélangées.
 *
 * La frontière garde ses prédicats (`game-guards.ts`) plutôt que le schéma Zod
 * complet, que le paquet web ne charge pas (ses valeurs viennent de
 * `game-archive-routes.ts`, la partie sans Zod du contrat) : `game-archive.test.ts` les
 * confronte au schéma partagé (`gameSeasonArchiveSchema`,
 * `gameLeagueWeekArchiveSchema`), fixture pour fixture.
 */

export const seasonArchiveQueryKey = (number: number) => [...GAME_V2_QUERY_PREFIX, 'archive', 'season', number] as const;

/**
 * LA LECTURE D'UNE SAISON N, telle que la page la monte (#10131) : cache-first, et RELUE dès que le réseau revient
 * (`refetchOnReconnect: 'always'`, même une copie fraîche) — la copie gardée hors ligne a pu basculer d'elle-même
 * le jour de l'ouverture, le serveur la confirme.
 */
export const seasonArchiveQuery = (params: {
  readonly number: number;
  readonly enabled: boolean;
  readonly deps: { readonly source: DataSource; readonly transport: HttpTransport };
}) => ({
  queryKey: seasonArchiveQueryKey(params.number),
  enabled: params.enabled,
  refetchOnReconnect: 'always' as const,
  queryFn: async ({ signal }: { readonly signal: AbortSignal }): Promise<GameSeasonArchive> => {
    return unwrap(await loadSeasonArchive({ ...params.deps, signal, number: params.number }));
  },
});
export const leagueWeekArchiveQueryKey = (weekKey: string) => [...GAME_V2_QUERY_PREFIX, 'archive', 'league-week', weekKey] as const;

const API_PREFIX = '/api/v1';
const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

const isDayKey = (value: unknown): boolean => typeof value === 'string' && DAY_KEY.test(value);
const isStatus = isOneOf(GAME_ARCHIVE_STATUSES);

const isSeasonProgress = (value: unknown): boolean =>
  shape(value, {
    stars: (n) => isInt(n),
    steps: (n) => isInt(n, 0, SEASON_STEPS),
    claimedSteps: (n) => Array.isArray(n) && n.every((step) => isInt(step, 1, SEASON_STEPS)),
    sealOwned: isBool,
    completed: isBool,
    settled: isBool,
  });

export const isSeasonArchive = (value: unknown): value is GameSeasonArchive =>
  shape(value, {
    number: (n) => isInt(n, 1),
    status: isStatus,
    themeKey: isText,
    startDay: isDayKey,
    endDay: isDayKey,
    weekKeys: (n) => Array.isArray(n) && n.length === SEASON_WEEKS && n.every(isDayKey),
    progress: orNull(isSeasonProgress),
  });

const isWeekResult = (value: unknown): boolean =>
  shape(value, {
    league: isOneOf(LEAGUE_KEYS),
    finalRank: orNull((n) => isInt(n, 1)),
    finalPoints: orNull((n) => isInt(n)),
    zone: orNull(isOneOf(['promotion', 'safe', 'relegation'])),
    cup: orNull(isOneOf(['gold', 'silver', 'bronze'])),
    settled: isBool,
  });

export const isLeagueWeekArchive = (value: unknown): value is GameLeagueWeekArchive =>
  shape(value, {
    weekKey: isDayKey,
    status: isStatus,
    season: orNull((n) => isInt(n, 1)),
    retention: isOneOf(GAME_ARCHIVE_RETENTIONS),
    result: orNull(isWeekResult),
  });

async function read<T>(params: {
  readonly transport: HttpTransport;
  readonly route: string;
  readonly decode: (data: unknown) => data is T;
  readonly what: string;
  readonly signal?: AbortSignal | undefined;
}): Promise<ApiResult<T>> {
  const result = await params.transport.request<unknown>({
    method: 'GET',
    path: `${API_PREFIX}${params.route}`,
    ...(params.signal !== undefined ? { signal: params.signal } : {}),
  });
  if (!result.ok) return result;
  return params.decode(result.data)
    ? { ok: true, data: result.data }
    : { ok: false, status: 502, error: `La réponse du jeu est illisible — ${params.what}`, code: 'MALFORMED_PAYLOAD' };
}

export const fetchSeasonArchive = (transport: HttpTransport, number: number, signal?: AbortSignal) =>
  read({ transport, route: gameSeasonArchivePath(number), decode: isSeasonArchive, what: 'saison', signal });

export const fetchLeagueWeekArchive = (transport: HttpTransport, weekKey: string, signal?: AbortSignal) =>
  read({ transport, route: gameLeagueWeekArchivePath(encodeURIComponent(weekKey)), decode: isLeagueWeekArchive, what: 'semaine de ligue', signal });

type Deps = {
  readonly source: DataSource;
  readonly transport: HttpTransport;
  readonly signal?: AbortSignal;
  /** Le calendrier servi (#10232) ; absent, la copie courante (gardée hors ligne, sinon la dérivation de la loi). */
  readonly schedule?: SeasonSchedule;
};

/**
 * Le banc (`'fixtures'`) sert le CALENDRIER de la loi partagée, sans progression
 * ni résultat : passé, en cours ou à venir se lit contre le jour du poste.
 */
const todayKey = (): string => new Date().toISOString().slice(0, 10);
const sundayOf = (monday: string): string => new Date(Date.parse(`${monday}T00:00:00Z`) + 6 * 86_400_000).toISOString().slice(0, 10);

function statusAgainstToday(first: string, last: string): GameSeasonArchive['status'] {
  const today = todayKey();
  if (today < first) return 'upcoming';
  return today > last ? 'past' : 'current';
}

export async function loadSeasonArchive(deps: Deps & { readonly number: number }): Promise<ApiResult<GameSeasonArchive>> {
  if (__FIXTURES__ && deps.source === 'fixtures') {
    const schedule = deps.schedule ?? currentSeasonSchedule();
    const calendar = scheduledSeasonCalendar(schedule, deps.number);
    if (calendar === null) {
      const paused = Number.isInteger(deps.number) && deps.number >= 1 && seasonStatusOf(schedule, deps.number) === 'paused';
      return paused
        ? { ok: false, status: 404, error: 'Saison en pause', code: 'SEASON_PAUSED' }
        : { ok: false, status: 404, error: 'Saison inconnue', code: 'SEASON_NOT_FOUND' };
    }
    return {
      ok: true,
      data: {
        number: calendar.number,
        status: statusAgainstToday(calendar.startDay, calendar.endDay),
        themeKey: calendar.themeKey,
        startDay: calendar.startDay,
        endDay: calendar.endDay,
        weekKeys: [...calendar.weekKeys],
        progress: null,
      },
    };
  }
  return fetchSeasonArchive(deps.transport, deps.number, deps.signal);
}

export async function loadLeagueWeekArchive(deps: Deps & { readonly weekKey: string }): Promise<ApiResult<GameLeagueWeekArchive>> {
  if (__FIXTURES__ && deps.source === 'fixtures') {
    return {
      ok: true,
      data: { weekKey: deps.weekKey, status: statusAgainstToday(deps.weekKey, sundayOf(deps.weekKey)), season: scheduledSeasonAt(deps.schedule ?? currentSeasonSchedule(), deps.weekKey), retention: 'kept', result: null },
    };
  }
  return fetchLeagueWeekArchive(deps.transport, deps.weekKey, deps.signal);
}
