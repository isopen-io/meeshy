import { describe, it, expect } from 'vitest';
import { classifyRelativeTime } from '../../utils/relative-time.js';

const NOW = 1_700_000_000_000;
const MIN = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;

describe('classifyRelativeTime', () => {
  it('classes a delay under one minute as now', () => {
    expect(classifyRelativeTime(NOW - 0, NOW)).toEqual({ unit: 'now' });
    expect(classifyRelativeTime(NOW - 59_999, NOW)).toEqual({ unit: 'now' });
  });

  it('classes a future target (negative delay) as now', () => {
    expect(classifyRelativeTime(NOW + 5 * MIN, NOW)).toEqual({ unit: 'now' });
  });

  it('classes whole minutes between 1 and 59 as minutes', () => {
    expect(classifyRelativeTime(NOW - 1 * MIN, NOW)).toEqual({ unit: 'minutes', value: 1 });
    expect(classifyRelativeTime(NOW - 59 * MIN, NOW)).toEqual({ unit: 'minutes', value: 59 });
  });

  it('crosses to hours exactly at 60 minutes', () => {
    expect(classifyRelativeTime(NOW - 59 * MIN - 59_999, NOW)).toEqual({ unit: 'minutes', value: 59 });
    expect(classifyRelativeTime(NOW - 60 * MIN, NOW)).toEqual({ unit: 'hours', value: 1 });
  });

  it('classes whole hours between 1 and 23 as hours', () => {
    expect(classifyRelativeTime(NOW - 1 * HOUR, NOW)).toEqual({ unit: 'hours', value: 1 });
    expect(classifyRelativeTime(NOW - 23 * HOUR, NOW)).toEqual({ unit: 'hours', value: 23 });
  });

  it('crosses to days exactly at 24 hours', () => {
    expect(classifyRelativeTime(NOW - 24 * HOUR + 1, NOW)).toEqual({ unit: 'hours', value: 23 });
    expect(classifyRelativeTime(NOW - 24 * HOUR, NOW)).toEqual({ unit: 'days', value: 1 });
  });

  it('classes days up to the default beyond threshold (7)', () => {
    expect(classifyRelativeTime(NOW - 1 * DAY, NOW)).toEqual({ unit: 'days', value: 1 });
    expect(classifyRelativeTime(NOW - 6 * DAY, NOW)).toEqual({ unit: 'days', value: 6 });
  });

  it('crosses to beyond exactly at the default threshold of 7 days', () => {
    expect(classifyRelativeTime(NOW - 7 * DAY + 1, NOW)).toEqual({ unit: 'days', value: 6 });
    expect(classifyRelativeTime(NOW - 7 * DAY, NOW)).toEqual({ unit: 'beyond' });
    expect(classifyRelativeTime(NOW - 30 * DAY, NOW)).toEqual({ unit: 'beyond' });
  });

  it('honors a custom beyondDays threshold', () => {
    expect(classifyRelativeTime(NOW - 2 * DAY, NOW, { beyondDays: 3 })).toEqual({ unit: 'days', value: 2 });
    expect(classifyRelativeTime(NOW - 3 * DAY, NOW, { beyondDays: 3 })).toEqual({ unit: 'beyond' });
  });

  it('never overflows to beyond when beyondDays is Infinity', () => {
    expect(classifyRelativeTime(NOW - 365 * DAY, NOW, { beyondDays: Infinity })).toEqual({
      unit: 'days',
      value: 365,
    });
  });
});
