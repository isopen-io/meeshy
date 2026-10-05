/**
 * Le jour, la graine et le tirage — aucune horloge ni aléa implicites (#9373).
 */

import { describe, it, expect } from 'vitest';
import { addDays, dayDiff, dayNumber, fnv1a, isDayKey, mulberry32, monthOf, seededRng } from '../../utils/game/day-prng.js';

describe('les jours', () => {
  it('reconnaît une clé de jour AAAA-MM-JJ', () => {
    expect(isDayKey('2026-10-05')).toBe(true);
    expect(isDayKey('2026-13-05')).toBe(false);
    expect(isDayKey('2026-02-30')).toBe(false);
    expect(isDayKey('05/10/2026')).toBe(false);
  });

  it('numérote les jours depuis 1970-01-01', () => {
    expect(dayNumber('1970-01-01')).toBe(0);
    expect(dayNumber('1970-01-02')).toBe(1);
    expect(dayNumber('2026-10-05')).toBe(20_731);
  });

  it('ajoute des jours à travers les mois, les années et le 29 février', () => {
    expect(addDays('2026-10-05', 1)).toBe('2026-10-06');
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2026-10-05', -5)).toBe('2026-09-30');
  });

  it('mesure l\'écart en jours', () => {
    expect(dayDiff('2026-10-03', '2026-10-05')).toBe(2);
    expect(dayDiff('2026-10-05', '2026-10-05')).toBe(0);
    expect(dayDiff('2026-10-06', '2026-10-05')).toBe(-1);
  });

  it('dit le mois', () => {
    expect(monthOf('2026-10-05')).toBe('2026-10');
  });
});

describe('la graine', () => {
  it('hache en FNV-1a 32 bits sur les octets UTF-8', () => {
    expect(fnv1a('')).toBe(0x811c9dc5);
    expect(fnv1a('a')).toBe(0xe40c292c);
    expect(fnv1a('foobar')).toBe(0xbf9cf968);
  });

  it('rend le même tirage pour la même graine', () => {
    const a = mulberry32(12345);
    const b = mulberry32(12345);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it('suit la suite de référence de mulberry32', () => {
    const rng = mulberry32(1);
    const values = [rng(), rng(), rng()];
    expect(values.every((v) => v >= 0 && v < 1)).toBe(true);
    expect(values[0]).toBeCloseTo(0.6270739405881613, 12);
  });

  it('dérive la suite de l\'utilisateur, du jour et d\'un sel', () => {
    const one = seededRng({ userId: 'u1', dayKey: '2026-10-05', salt: 'missions' });
    const two = seededRng({ userId: 'u1', dayKey: '2026-10-05', salt: 'missions' });
    const other = seededRng({ userId: 'u2', dayKey: '2026-10-05', salt: 'missions' });
    expect(one()).toBe(two());
    expect(one()).not.toBe(other());
  });
});
