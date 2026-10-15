/**
 * CE QU'UN LIEN DU JEU OUVRE (#9947) — une saison n (calendrier, thème, état,
 * ma progression) et une semaine de ligue (mon résultat gravé, ou la purge).
 * Les instants sont tirés du CALENDRIER partagé, jamais d'une date en dur : la
 * date d'ouverture de la saison 1 est une donnée qui bouge (#10014).
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { gameLeagueWeekArchiveSchema, gameSeasonArchiveSchema } from '@meeshy/shared/types/game-archive';
import { seasonCalendar, type SeasonCalendar } from '@meeshy/shared/utils/game/season';
import { GameArchiveService, type SeasonCalendarSource } from '../GameArchiveService';
import { leagueRetentionHorizon } from '../LeagueSettlement';
import { fakeGameDb, seedUser, USER, OTHER } from './fakeGameDb';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }) },
}));

const S2 = seasonCalendar(2)!;
const S1 = seasonCalendar(1)!;
const S3 = seasonCalendar(3)!;
const at = (dayKey: string, time = '12:00:00') => new Date(`${dayKey}T${time}Z`);
/** Le jeudi de la quatrième semaine de la saison 2. */
const MID_S2 = at(addDaysUtc(S2.weekKeys[3]!, 3));
/** Le jeudi de la sixième semaine : la saison 1 a fini depuis plus de 28 jours. */
const LATE_S2 = at(addDaysUtc(S2.weekKeys[5]!, 3));

function addDaysUtc(dayKey: string, days: number): string {
  return new Date(Date.parse(`${dayKey}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

const setup = () => {
  const db = fakeGameDb();
  seedUser(db, { engagementScore: 4000 });
  seedUser(db, { engagementScore: 4000 }, OTHER);
  return { db, service: new GameArchiveService(db.prisma) };
};

describe('GameArchiveService.season', () => {
  it('une saison passée, en cours ou future : son calendrier et son thème, la même pour tous', async () => {
    const { service } = setup();
    const [past, current, upcoming] = await Promise.all([1, 2, 3].map((n) => service.season(USER, n, MID_S2)));

    expect(past).toMatchObject({ number: 1, status: 'past', startDay: S1.startDay, endDay: S1.endDay, themeKey: S1.themeKey });
    expect(current).toMatchObject({ number: 2, status: 'current', weekKeys: S2.weekKeys });
    expect(upcoming).toMatchObject({ number: 3, status: 'upcoming', startDay: S3.startDay, themeKey: S3.themeKey, progress: null });
    for (const season of [past, current, upcoming]) expect(gameSeasonArchiveSchema.safeParse(season).success).toBe(true);
  });

  it('la saison passée porte MON palmarès — jamais celui d’un autre', async () => {
    const { db, service } = setup();
    db.gameSeason.rows.push({ id: 'a', userId: USER, number: 1, stars: 163, claimedSteps: [1, 2, 40], sealOwnedAt: new Date(), settledAt: new Date() });
    db.gameSeason.rows.push({ id: 'b', userId: OTHER, number: 1, stars: 12, claimedSteps: [1], sealOwnedAt: null, settledAt: null });

    const mine = await service.season(USER, 1, MID_S2);
    const theirs = await service.season(OTHER, 2, MID_S2);

    expect(mine!.progress).toEqual({ stars: 163, steps: 40, claimedSteps: [1, 2, 40], sealOwned: true, completed: true, settled: true });
    expect(theirs!.progress).toBeNull();
  });

  it('la frontière : le dimanche 20 h de la dernière semaine ferme la saison, dans MON fuseau', async () => {
    const { service } = setup();
    const lastSunday = S1.endDay;
    expect((await service.season(USER, 1, at(lastSunday, '19:59:00')))!.status).toBe('current');
    expect((await service.season(USER, 1, at(lastSunday, '20:00:00')))!.status).toBe('past');
  });

  it('le calendrier se lit par UNE fonction, remplaçable par un calendrier servi', async () => {
    const { db } = setup();
    const served: SeasonCalendar = { ...S2, themeKey: 'language:ja' };
    const read = jest.fn<SeasonCalendarSource['season']>().mockImplementation(async (n) => (n === 2 ? served : null));
    const service = new GameArchiveService(db.prisma, { calendar: { season: read } });

    expect((await service.season(USER, 2, MID_S2))!.themeKey).toBe('language:ja');
    expect(await service.season(USER, 4, MID_S2)).toBeNull();
    expect(read).toHaveBeenCalledWith(2);
  });

  it('avant l’ouverture de la saison 1, elle est À VENIR : son thème et sa date d’ouverture, jamais un vide (#10014)', async () => {
    const { service } = setup();
    const eve = at(addDaysUtc(S1.startDay, -3));
    expect(await service.season(USER, 1, eve)).toMatchObject({ number: 1, status: 'upcoming', startDay: S1.startDay, themeKey: S1.themeKey, progress: null });
  });

  it('un numéro qui n’est pas une saison ne lit rien', async () => {
    const { service } = setup();
    expect(await service.season(USER, 0, MID_S2)).toBeNull();
  });
});

describe('GameArchiveService.leagueWeek', () => {
  it('une semaine passée : MON résultat gravé, sans rien des autres membres du groupe', async () => {
    const { db, service } = setup();
    const weekKey = S2.weekKeys[1]!;
    db.leagueMembership.rows.push({ id: 'm1', userId: USER, weekKey, groupId: 'g', league: 'jade', finalRank: 3, finalPoints: 820, zone: 'promotion', cup: 'bronze', settledAt: new Date() });
    db.leagueMembership.rows.push({ id: 'm2', userId: OTHER, weekKey, groupId: 'g', league: 'jade', finalRank: 1, finalPoints: 990, zone: 'promotion', cup: 'gold', settledAt: new Date() });

    const week = await service.leagueWeek(USER, weekKey, MID_S2);

    expect(week).toEqual({
      weekKey,
      status: 'past',
      season: 2,
      retention: 'kept',
      result: { league: 'jade', finalRank: 3, finalPoints: 820, zone: 'promotion', cup: 'bronze', settled: true },
    });
    expect(gameLeagueWeekArchiveSchema.safeParse(week).success).toBe(true);
  });

  it('une semaine en cours : ma ligue, pas encore de rang', async () => {
    const { db, service } = setup();
    const weekKey = S2.weekKeys[3]!;
    db.leagueMembership.rows.push({ id: 'm1', userId: USER, weekKey, groupId: 'g', league: 'ambre' });

    expect(await service.leagueWeek(USER, weekKey, MID_S2)).toMatchObject({
      status: 'current',
      result: { league: 'ambre', finalRank: null, zone: null, cup: null, settled: false },
    });
  });

  it('une semaine future n’a rien, une semaine passée sans place non plus', async () => {
    const { service } = setup();
    expect(await service.leagueWeek(USER, S3.weekKeys[0]!, MID_S2)).toMatchObject({ status: 'upcoming', season: 3, retention: 'kept', result: null });
    expect(await service.leagueWeek(USER, S2.weekKeys[0]!, MID_S2)).toMatchObject({ status: 'past', retention: 'kept', result: null });
  });

  it('une semaine purgée le DIT : 28 jours après la fin de sa saison', async () => {
    const { service } = setup();
    expect(await service.leagueWeek(USER, S1.weekKeys[7]!, MID_S2)).toMatchObject({ retention: 'kept' });
    expect(await service.leagueWeek(USER, S1.weekKeys[7]!, LATE_S2)).toMatchObject({ status: 'past', season: 1, retention: 'purged', result: null });
  });
});

describe('la pré-saison des ligues (#10014)', () => {
  it('une semaine de ligue d’avant la saison 1 garde son résultat, hors saison', async () => {
    const { db, service } = setup();
    const weekKey = addDaysUtc(S1.startDay, -14);
    db.leagueMembership.rows.push({ id: 'm1', userId: USER, weekKey, groupId: 'g', league: 'quartz', finalRank: 2, finalPoints: 410, zone: 'promotion', cup: 'silver', settledAt: new Date() });
    expect(await service.leagueWeek(USER, weekKey, at(addDaysUtc(S1.startDay, -3)))).toMatchObject({ status: 'past', season: null, retention: 'kept', result: { cup: 'silver' } });
  });
});

describe('leagueRetentionHorizon', () => {
  it('la règle de la purge : avant cet horizon, plus rien ne reste', () => {
    expect(leagueRetentionHorizon(MID_S2)).toBe(S1.startDay);
    expect(leagueRetentionHorizon(LATE_S2)).toBe(S2.startDay);
  });
});
