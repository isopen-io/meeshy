import { describe, expect, test } from 'bun:test';

import { gameLeagueWeekArchiveSchema, gameSeasonArchiveSchema } from '@meeshy/shared/types/game-archive';

import { fetchLeagueWeekArchive, fetchSeasonArchive, isLeagueWeekArchive, isSeasonArchive, leagueWeekArchiveQueryKey, seasonArchiveQueryKey } from './game-archive';
import { GAME_V2_QUERY_PREFIX } from './game-v2-queries';
import { createHttpTransport } from './http';

/**
 * LE PORT DES ARCHIVES DU JEU (#10018) — la saison n et la semaine de ligue,
 * lues par leur chemin partagé ; la frontière dit OUI exactement là où le
 * schéma Zod de la passerelle dit oui.
 */

type Call = { readonly url: string };

function transportServing(body: unknown, calls: Call[] = []) {
  const fetchImpl: typeof fetch = async (input) => {
    calls.push({ url: String(input) });
    return new Response(JSON.stringify({ success: true, data: body }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  return createHttpTransport({ base: 'https://gate.test', credential: () => ({ kind: 'registered', token: 'jwt-test' }), fetchImpl, timeoutMs: 0 });
}

const WEEKS = ['2027-02-15', '2027-02-22', '2027-03-01', '2027-03-08', '2027-03-15', '2027-03-22', '2027-03-29', '2027-04-05'];

export const pastSeason = {
  number: 2,
  status: 'past',
  themeKey: 'language:es',
  startDay: '2027-02-15',
  endDay: '2027-04-11',
  weekKeys: WEEKS,
  progress: { stars: 160, steps: 40, claimedSteps: [1, 2, 3], sealOwned: true, completed: true, settled: true },
} as const;

const upcomingSeason = { ...pastSeason, number: 3, status: 'upcoming', progress: null } as const;

const pastWeek = {
  weekKey: '2026-10-12',
  status: 'past',
  season: null,
  retention: 'kept',
  result: { league: 'jade', finalRank: 3, finalPoints: 410, zone: 'promotion', cup: 'bronze', settled: true },
} as const;

const purgedWeek = { weekKey: '2026-10-12', status: 'past', season: null, retention: 'purged', result: null } as const;

const seasonVariants: ReadonlyArray<readonly [string, unknown]> = [
  ['passée', pastSeason],
  ['future', upcomingSeason],
  ['un état inconnu', { ...pastSeason, status: 'someday' }],
  ['sept semaines', { ...pastSeason, weekKeys: WEEKS.slice(1) }],
  ['une étape hors parcours', { ...pastSeason, progress: { ...pastSeason.progress, claimedSteps: [41] } }],
  ['une progression amputée', { ...pastSeason, progress: { stars: 3 } }],
  ['un numéro nul', { ...pastSeason, number: 0 }],
];

const weekVariants: ReadonlyArray<readonly [string, unknown]> = [
  ['passée', pastWeek],
  ['purgée', purgedWeek],
  ['une ligue inconnue', { ...pastWeek, result: { ...pastWeek.result, league: 'or' } }],
  ['une rétention inconnue', { ...pastWeek, retention: 'gone' }],
  ['une clé qui n’est pas un jour', { ...pastWeek, weekKey: 'lundi' }],
  ['un rang nul', { ...pastWeek, result: { ...pastWeek.result, finalRank: 0 } }],
];

describe('les archives du jeu — la frontière', () => {
  for (const [name, payload] of seasonVariants) {
    test(`une saison (${name}) : la garde et le schéma Zod disent la même chose`, () => {
      expect(isSeasonArchive(payload)).toBe(gameSeasonArchiveSchema.safeParse(payload).success);
    });
  }

  for (const [name, payload] of weekVariants) {
    test(`une semaine (${name}) : la garde et le schéma Zod disent la même chose`, () => {
      expect(isLeagueWeekArchive(payload)).toBe(gameLeagueWeekArchiveSchema.safeParse(payload).success);
    });
  }

  test('une saison se lit par son chemin partagé', async () => {
    const calls: Call[] = [];
    const result = await fetchSeasonArchive(transportServing(pastSeason, calls), 2);
    expect(calls.map((c) => c.url)).toEqual(['https://gate.test/api/v1/me/game/seasons/2']);
    expect(result.ok && result.data.progress?.completed).toBe(true);
  });

  test('une semaine se lit par son lundi, encodé', async () => {
    const calls: Call[] = [];
    const result = await fetchLeagueWeekArchive(transportServing(purgedWeek, calls), '2026-10-12');
    expect(calls.map((c) => c.url)).toEqual(['https://gate.test/api/v1/me/game/league/weeks/2026-10-12']);
    expect(result.ok && result.data.retention).toBe('purged');
  });

  test('une réponse illisible est un refus, jamais une saison vide', async () => {
    const result = await fetchSeasonArchive(transportServing({ number: 2 }), 2);
    expect(result.ok).toBe(false);
    expect(result.ok ? null : result.code).toBe('MALFORMED_PAYLOAD');
  });

  test('chaque saison et chaque semaine a SA clé, sous le préfixe persisté du jeu', () => {
    expect(seasonArchiveQueryKey(2).slice(0, GAME_V2_QUERY_PREFIX.length)).toEqual([...GAME_V2_QUERY_PREFIX]);
    expect(seasonArchiveQueryKey(2)).not.toEqual(seasonArchiveQueryKey(3));
    expect(leagueWeekArchiveQueryKey('2026-10-12')).not.toEqual(leagueWeekArchiveQueryKey('2026-10-05'));
  });
});
