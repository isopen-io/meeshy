/**
 * #10016 — le calendrier servi se lit en base, se garde 30 s, et ne fait JAMAIS tomber le Jeu : une base
 * injoignable rend la dernière lecture, ou la constante.
 */
import { describe, it, expect, beforeEach, jest } from '@jest/globals';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }) },
}));

import { DEFAULT_SEASON_SCHEDULE, scheduledSeasonCalendar } from '@meeshy/shared/utils/game/season-schedule';
import { SeasonScheduleUnavailable, currentSeasonSchedule, invalidateSeasonSchedule, scheduleOfRows, seasonSchedule, seasonScheduleForWrite } from '../SeasonScheduleService';

const row = (over: Record<string, unknown> = {}) => ({
  number: 2,
  startDay: '2027-03-01',
  status: 'scheduled',
  themeKey: 'language:ja',
  stepPoints: 150,
  copy: null,
  revision: 4,
  ...over,
});

const prismaWith = (findMany: () => Promise<unknown[]>) => ({ gameSeasonDefinition: { findMany: jest.fn(findMany) } }) as never;

beforeEach(() => invalidateSeasonSchedule());

describe('SeasonScheduleService', () => {
  it('lit les définitions : révision = la plus haute, lignes illisibles ignorées', () => {
    const schedule = scheduleOfRows([row(), row({ number: 3, startDay: '2027-04-27', revision: 6 }) as never]);
    expect(schedule.revision).toBe(6);
    expect(schedule.seasons.map((d) => d.number)).toEqual([2]);
    expect(scheduledSeasonCalendar(schedule, 2)?.startDay).toBe('2027-03-01');
  });

  it('garde la lecture 30 s', async () => {
    const prisma = prismaWith(async () => [row()]);
    await seasonSchedule(prisma);
    await seasonSchedule(prisma);
    expect((prisma as any).gameSeasonDefinition.findMany).toHaveBeenCalledTimes(1);
    expect(currentSeasonSchedule().revision).toBe(4);
  });

  it('base injoignable : la constante, puis la dernière lecture', async () => {
    expect(await seasonSchedule(prismaWith(async () => { throw new Error('down'); }))).toEqual(DEFAULT_SEASON_SCHEDULE);
    await seasonSchedule(prismaWith(async () => [row()]), { fresh: true });
    const kept = await seasonSchedule(prismaWith(async () => { throw new Error('down'); }), { fresh: true });
    expect(kept.revision).toBe(4);
  });

  it('une lecture fraîche ne rejoint pas une lecture en vol partie avant une écriture', async () => {
    let release: (rows: unknown[]) => void = () => undefined;
    const slow = prismaWith(() => new Promise((resolve) => { release = resolve; }));
    const stale = seasonSchedule(slow);
    const fresh = await seasonSchedule(prismaWith(async () => [row({ revision: 9 })]), { fresh: true });
    expect(fresh.revision).toBe(9);
    release([]);
    await stale;
  });

  it('une écriture du Jeu ne part jamais sur la constante faute de lecture', async () => {
    await expect(seasonScheduleForWrite(prismaWith(async () => { throw new Error('down'); }))).rejects.toBeInstanceOf(SeasonScheduleUnavailable);
    await seasonSchedule(prismaWith(async () => [row()]), { fresh: true });
    invalidateSeasonSchedule();
    await seasonSchedule(prismaWith(async () => [row()]), { fresh: true });
    expect((await seasonScheduleForWrite(prismaWith(async () => { throw new Error('down'); }))).revision).toBe(4);
  });
});
