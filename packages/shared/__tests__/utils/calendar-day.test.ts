import { describe, it, expect } from 'vitest';
import { classifyCalendarDay } from '../../utils/calendar-day.js';

// Local-midnight anchors. We pick a "now" mid-afternoon so that crossing
// calendar boundaries (vs elapsed-ms boundaries) is observable.
const at = (y: number, m: number, d: number, h = 0, min = 0) =>
  new Date(y, m, d, h, min, 0, 0).getTime();

const NOW = at(2026, 5, 15, 14, 30); // Mon Jun 15 2026, 14:30 local

describe('classifyCalendarDay', () => {
  it('classes the same calendar day as today', () => {
    expect(classifyCalendarDay(at(2026, 5, 15, 0, 1), NOW)).toEqual({ unit: 'today' });
    expect(classifyCalendarDay(at(2026, 5, 15, 14, 30), NOW)).toEqual({ unit: 'today' });
    expect(classifyCalendarDay(at(2026, 5, 15, 23, 59), NOW)).toEqual({ unit: 'today' });
  });

  it('classes a future target (later today) as today', () => {
    expect(classifyCalendarDay(at(2026, 5, 15, 18, 0), NOW)).toEqual({ unit: 'today' });
  });

  it('classes a future target on a later day as today (diffDays < 0)', () => {
    expect(classifyCalendarDay(at(2026, 5, 16, 1, 0), NOW)).toEqual({ unit: 'today' });
  });

  it('uses calendar midnight, not elapsed ms (yesterday 23:00 from now 14:30 is yesterday)', () => {
    expect(classifyCalendarDay(at(2026, 5, 14, 23, 0), NOW)).toEqual({ unit: 'yesterday' });
  });

  it('classes exactly one calendar day back as yesterday', () => {
    expect(classifyCalendarDay(at(2026, 5, 14, 0, 1), NOW)).toEqual({ unit: 'yesterday' });
    expect(classifyCalendarDay(at(2026, 5, 14, 23, 59), NOW)).toEqual({ unit: 'yesterday' });
  });

  it('classes 2..6 calendar days back as thisWeek with diffDays', () => {
    expect(classifyCalendarDay(at(2026, 5, 13, 10, 0), NOW)).toEqual({ unit: 'thisWeek', diffDays: 2 });
    expect(classifyCalendarDay(at(2026, 5, 9, 10, 0), NOW)).toEqual({ unit: 'thisWeek', diffDays: 6 });
  });

  it('classes 7+ calendar days back as older', () => {
    expect(classifyCalendarDay(at(2026, 5, 8, 23, 59), NOW)).toEqual({ unit: 'older' });
    expect(classifyCalendarDay(at(2026, 4, 1, 10, 0), NOW)).toEqual({ unit: 'older' });
  });

  it('honors a custom weekDays threshold', () => {
    expect(classifyCalendarDay(at(2026, 5, 13, 10, 0), NOW, { weekDays: 3 })).toEqual({
      unit: 'thisWeek',
      diffDays: 2,
    });
    expect(classifyCalendarDay(at(2026, 5, 12, 10, 0), NOW, { weekDays: 3 })).toEqual({ unit: 'older' });
  });
});
