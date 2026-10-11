/**
 * #10016 — le calendrier servi se lit en base, se garde 30 s, et ne fait JAMAIS tomber le Jeu : une base
 * injoignable rend la dernière lecture, ou la constante.
 */
import { describe, it, expect, beforeEach, jest } from '@jest/globals';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }) },
}));

import { DEFAULT_SEASON_SCHEDULE, scheduledSeasonCalendar } from '@meeshy/shared/utils/game/season-schedule';
import { currentSeasonSchedule, invalidateSeasonSchedule, scheduleOfRows, seasonSchedule } from '../SeasonScheduleService';

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
});
