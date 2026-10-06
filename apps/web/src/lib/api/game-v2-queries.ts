import type { LeagueFriendsResponse, LeagueWeekResponse, UserShowcaseResponse } from '@meeshy/shared/types/game';

import type { DataSource } from './config';
import { fetchLeagueFriends, fetchLeagueWeek, fetchUserShowcase } from './game-v2';
import type { ApiResult, HttpTransport } from './http';

/**
 * LES LECTURES DE LA VAGUE 2 (#9384, #9385) — le classement de la semaine et la
 * ligue Amis. Elles vivent SOUS UN PRÉFIXE commun (`GAME_V2_QUERY_PREFIX`) que
 * les gestes invalident d'un trait : un consentement retiré ne laisse pas
 * l'ancien classement à l'écran.
 *
 * Servies par la loi partagée quand la source est `'fixtures'` : le classement du
 * banc est calculé par `leagueStandings`, comme le serveur, jamais écrit à la
 * main — dans `game-v2-queries-fixture.ts`, importé dynamiquement (#9510) pour
 * que `game-fixture.ts` ne voyage jamais dans un dist `VITE_DATA_SOURCE=gateway`.
 */
export const GAME_V2_QUERY_PREFIX = ['me', 'game'] as const;
export const LEAGUE_WEEK_QUERY_KEY = [...GAME_V2_QUERY_PREFIX, 'league', 'week'] as const;
export const LEAGUE_FRIENDS_QUERY_KEY = [...GAME_V2_QUERY_PREFIX, 'league', 'friends'] as const;

type Deps = { readonly source: DataSource; readonly transport: HttpTransport; readonly signal?: AbortSignal };

export async function loadLeagueWeek(deps: Deps): Promise<ApiResult<LeagueWeekResponse>> {
  if (__FIXTURES__ && deps.source === 'fixtures') {
    const { leagueWeekFixture } = await import('./game-v2-queries-fixture');
    return { ok: true, data: leagueWeekFixture() };
  }
  return fetchLeagueWeek(deps.transport, deps.signal);
}

export async function loadLeagueFriends(deps: Deps): Promise<ApiResult<LeagueFriendsResponse>> {
  if (__FIXTURES__ && deps.source === 'fixtures') {
    const { leagueFriendsFixture } = await import('./game-v2-queries-fixture');
    return { ok: true, data: leagueFriendsFixture() };
  }
  return fetchLeagueFriends(deps.transport, deps.signal);
}

/**
 * LA VITRINE D'UN AUTRE (#9387, #9481) — `GET /users/:userId/game/showcase`. Le
 * serveur la ferme selon le réglage du membre (`visible: false` est une VALEUR :
 * une erreur dirait qu'elle existe) et ne sert au visiteur que le MOIS d'obtention.
 * La clé porte l'identifiant : une vitrine par membre, jamais mélangées.
 */
export const userShowcaseQueryKey = (userId: string) => [...GAME_V2_QUERY_PREFIX, 'showcase', userId] as const;

export async function loadUserShowcase(deps: Deps & { readonly userId: string }): Promise<ApiResult<UserShowcaseResponse>> {
  if (__FIXTURES__ && deps.source === 'fixtures') {
    const { userShowcaseFixture } = await import('./game-v2-queries-fixture');
    return { ok: true, data: userShowcaseFixture() };
  }
  return fetchUserShowcase(deps.transport, deps.userId, deps.signal);
}
