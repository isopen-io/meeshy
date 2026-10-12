import { describe, expect, test } from 'bun:test';

import type { SeasonThemeKey } from '@meeshy/shared/utils/game/season';
import { DEFAULT_SEASON_SCHEDULE, type SeasonSchedule } from '@meeshy/shared/utils/game/season-schedule';

import { pausedSeasonOf } from './paused-season';

const def = (number: number, status: 'scheduled' | 'paused', themeKey: SeasonThemeKey = 'language:fr') =>
  ({ number, startDay: '2027-04-26', status, themeKey, stepPoints: 100, copy: null }) as const;

describe('pausedSeasonOf', () => {
  test('le repli ne met rien en pause', () => {
    expect(pausedSeasonOf(DEFAULT_SEASON_SCHEDULE)).toBeNull();
  });

  test('la première saison en pause, avec son thème', () => {
    const schedule: SeasonSchedule = { revision: 2, seasons: [def(1, 'scheduled'), def(3, 'paused', 'language:hi'), def(2, 'paused', 'language:ja')] };
    expect(pausedSeasonOf(schedule)).toEqual({ number: 2, themeKey: 'language:ja' });
  });

  test('un calendrier sans pause : null', () => {
    expect(pausedSeasonOf({ revision: 2, seasons: [def(1, 'scheduled')] })).toBeNull();
  });
});
