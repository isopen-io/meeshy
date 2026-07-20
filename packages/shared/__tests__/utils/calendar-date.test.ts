import { describe, it, expect } from 'vitest';
import { startOfLocalDayMs, calendarDayDiff } from '../../utils/calendar-date.js';

const at = (y: number, m: number, d: number, h = 0, min = 0): number =>
  new Date(y, m - 1, d, h, min).getTime();

const DAY_MS = 86_400_000;

describe('startOfLocalDayMs', () => {
  it('returns local midnight of the day containing the timestamp', () => {
    expect(startOfLocalDayMs(at(2026, 6, 30, 14, 37))).toBe(at(2026, 6, 30));
  });

  it('is idempotent — start of a start-of-day is itself', () => {
    const midnight = at(2026, 6, 30);
    expect(startOfLocalDayMs(midnight)).toBe(midnight);
  });

  it('maps any hour of the same day to the same value', () => {
    expect(startOfLocalDayMs(at(2026, 6, 30, 0, 1))).toBe(startOfLocalDayMs(at(2026, 6, 30, 23, 59)));
  });
});

describe('calendarDayDiff', () => {
  it('returns 0 for two instants on the same calendar day', () => {
    expect(calendarDayDiff(at(2026, 6, 30, 1, 0), at(2026, 6, 30, 23, 0))).toBe(0);
  });

  it('returns 1 for the previous calendar day regardless of hour', () => {
    // 23:00 yesterday vs 01:00 today → < 26h elapsed but 1 calendar day
    expect(calendarDayDiff(at(2026, 6, 29, 23, 0), at(2026, 6, 30, 1, 0))).toBe(1);
  });

  it('counts whole calendar days for older dates', () => {
    expect(calendarDayDiff(at(2026, 6, 24), at(2026, 6, 30))).toBe(6);
    expect(calendarDayDiff(at(2026, 6, 23), at(2026, 6, 30))).toBe(7);
  });

  it('returns a negative diff for a future calendar day', () => {
    expect(calendarDayDiff(at(2026, 7, 1), at(2026, 6, 30))).toBe(-1);
  });

  it('matches the legacy midnight-difference formula', () => {
    const target = at(2026, 6, 18, 9, 15);
    const now = at(2026, 6, 30, 20, 45);
    const todayStart = new Date(2026, 5, 30).getTime();
    const targetStart = new Date(2026, 5, 18).getTime();
    expect(calendarDayDiff(target, now)).toBe(Math.floor((todayStart - targetStart) / DAY_MS));
  });

  // Régression DST : le jour d'un passage à l'heure d'été ne dure que 23 h. La
  // soustraction de deux minuits locaux tombait alors à 0 pour deux jours distincts
  // (« hier » affiché comme « aujourd'hui »). Ces cas sont indépendants du fuseau du
  // runtime (ils passent aussi en UTC) — la spring-forward US 2026 tombe le 8 mars.
  it('counts one calendar day across a spring-forward transition day (23h day)', () => {
    // message posté le 8 mars (jour à 23 h), « maintenant » le 9 mars → 1 jour (Hier)
    expect(calendarDayDiff(at(2026, 3, 8, 10, 0), at(2026, 3, 9, 10, 0))).toBe(1);
  });

  it('counts one calendar day across a fall-back transition day (25h day)', () => {
    // fall-back US 2026 : nuit du 1er nov (jour à 25 h) → 2 nov = 1 jour
    expect(calendarDayDiff(at(2026, 11, 1, 10, 0), at(2026, 11, 2, 10, 0))).toBe(1);
  });

  it('keeps two instants on a DST transition day at zero', () => {
    expect(calendarDayDiff(at(2026, 3, 8, 0, 30), at(2026, 3, 8, 23, 30))).toBe(0);
  });
});
