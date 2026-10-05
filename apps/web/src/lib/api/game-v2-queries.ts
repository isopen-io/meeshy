import { leagueStandings, leagueWeekClose, leagueSnapshotDay, friendsLeagueRanking } from '@meeshy/shared/utils/game/league';
import type { LeagueFriendsResponse, LeagueWeekResponse, UserShowcaseResponse } from '@meeshy/shared/types/game';
import { visitorShowcase } from '@meeshy/shared/utils/game/trophies';

import type { DataSource } from './config';
import { GAME_EXTRAS_TODAY, gameExtrasFactsFixture } from './game-fixture';
import { fetchLeagueFriends, fetchLeagueWeek, fetchUserShowcase } from './game-v2';
import type { ApiResult, HttpTransport } from './http';

/**
 * LES LECTURES DE LA VAGUE 2 (#9384, #9385) — le classement de la semaine et la
 * ligue Amis. Elles vivent SOUS UN PRÉFIXE commun (`GAME_V2_QUERY_PREFIX`) que
 * les gestes invalident d'un trait : un consentement retiré ne laisse pas
 * l'ancien classement à l'écran.
 *
 * Servies par la loi partagée quand la source est `'fixtures'` : le classement du
 * banc est calculé par `leagueStandings`, comme le serveur, jamais écrit à la main.
 */
export const GAME_V2_QUERY_PREFIX = ['me', 'game'] as const;
export const LEAGUE_WEEK_QUERY_KEY = [...GAME_V2_QUERY_PREFIX, 'league', 'week'] as const;
export const LEAGUE_FRIENDS_QUERY_KEY = [...GAME_V2_QUERY_PREFIX, 'league', 'friends'] as const;

type Deps = { readonly source: DataSource; readonly transport: HttpTransport; readonly signal?: AbortSignal };

const FIXTURE_MINUTE = 14 * 60;

export function leagueWeekFixture(): LeagueWeekResponse {
  const facts = gameExtrasFactsFixture();
  const group = facts.league.group;
  const week = leagueWeekClose(GAME_EXTRAS_TODAY);
  if (group === null) {
    return { weekKey: GAME_EXTRAS_TODAY, snapshotDay: GAME_EXTRAS_TODAY, closes: week, placed: false, league: null, groupId: null, entries: [] };
  }
  const standings = leagueStandings({ league: group.league, groupId: group.groupId, members: group.members });
  return {
    weekKey: GAME_EXTRAS_TODAY,
    snapshotDay: leagueSnapshotDay({ dayKey: GAME_EXTRAS_TODAY, minuteOfDay: FIXTURE_MINUTE }),
    closes: week,
    placed: true,
    league: group.league,
    groupId: group.groupId,
    entries: standings.map((s) => ({
      rank: s.rank,
      displayName: s.userId === facts.userId ? (facts.league.pseudonym ?? 'Colibri-4821') : `Colibri-${s.userId.replace(/\D/g, '').padStart(4, '0')}`,
      weekPoints: s.weekPoints,
      zone: s.zone,
      cup: s.cup,
      isMe: s.userId === facts.userId,
    })),
  };
}

export function leagueFriendsFixture(): LeagueFriendsResponse {
  const facts = gameExtrasFactsFixture();
  return {
    weekKey: GAME_EXTRAS_TODAY,
    closes: leagueWeekClose(GAME_EXTRAS_TODAY),
    entries: friendsLeagueRanking({
      weekKey: GAME_EXTRAS_TODAY,
      viewerId: facts.userId,
      friendIds: facts.league.friendIds,
      weekPoints: facts.league.friendsWeekPoints,
    }).map((entry) => ({ rank: entry.rank, userId: entry.userId, weekPoints: entry.weekPoints, isMe: entry.isMe })),
  };
}

export async function loadLeagueWeek(deps: Deps): Promise<ApiResult<LeagueWeekResponse>> {
  if (__FIXTURES__ && deps.source === 'fixtures') return { ok: true, data: leagueWeekFixture() };
  return fetchLeagueWeek(deps.transport, deps.signal);
}

export async function loadLeagueFriends(deps: Deps): Promise<ApiResult<LeagueFriendsResponse>> {
  if (__FIXTURES__ && deps.source === 'fixtures') return { ok: true, data: leagueFriendsFixture() };
  return fetchLeagueFriends(deps.transport, deps.signal);
}

/**
 * LA VITRINE D'UN AUTRE (#9387, #9481) — `GET /users/:userId/game/showcase`. Le
 * serveur la ferme selon le réglage du membre (`visible: false` est une VALEUR :
 * une erreur dirait qu'elle existe) et ne sert au visiteur que le MOIS d'obtention.
 * La clé porte l'identifiant : une vitrine par membre, jamais mélangées.
 */
export const userShowcaseQueryKey = (userId: string) => [...GAME_V2_QUERY_PREFIX, 'showcase', userId] as const;

export function userShowcaseFixture(): UserShowcaseResponse {
  const facts = gameExtrasFactsFixture();
  const view = visitorShowcase({ owned: facts.trophies, order: facts.showcaseOrder });
  return { visible: true, items: [...view.items], order: [...view.order] };
}

export async function loadUserShowcase(deps: Deps & { readonly userId: string }): Promise<ApiResult<UserShowcaseResponse>> {
  if (__FIXTURES__ && deps.source === 'fixtures') return { ok: true, data: userShowcaseFixture() };
  return fetchUserShowcase(deps.transport, deps.userId, deps.signal);
}
