import { leagueStandings, leagueWeekClose, leagueSnapshotDay, friendsLeagueRanking } from '@meeshy/shared/utils/game/league';
import type { LeagueFriendsResponse, LeagueWeekResponse, UserShowcaseResponse } from '@meeshy/shared/types/game';
import { visitorShowcase } from '@meeshy/shared/utils/game/trophies';

import { GAME_EXTRAS_TODAY, gameExtrasFactsFixture } from './game-fixture';

/**
 * LES FIXTURES DE LA VAGUE 2 (#9384, #9385, #9510) — seul le dynamic `import()`
 * de `game-v2-queries.ts` atteint ce module : sans la séparation, le classement
 * du banc (`leagueStandings`, comme le serveur) entraînait `game-fixture.ts`
 * (et ses noms de personnes) dans le dist `VITE_DATA_SOURCE=gateway`.
 */
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

export function userShowcaseFixture(): UserShowcaseResponse {
  const facts = gameExtrasFactsFixture();
  const view = visitorShowcase({ owned: facts.trophies, order: facts.showcaseOrder });
  return { visible: true, items: [...view.items], order: [...view.order] };
}
