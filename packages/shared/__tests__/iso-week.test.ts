import { describe, expect, it } from 'vitest';
import { addUtcDays, isoWeekKey, isoWeekStart, utcDayKey } from '../utils/iso-week';

describe('iso-week — la semaine ISO, en UTC', () => {
  it('nomme le jour UTC, jamais le jour local', () => {
    expect(utcDayKey(new Date('2026-10-31T23:59:59Z'))).toBe('2026-10-31');
    expect(utcDayKey(new Date('2026-11-01T00:00:00Z'))).toBe('2026-11-01');
  });

  it('numérote la semaine ISO : le samedi 2026-10-31 est en W44', () => {
    expect(isoWeekKey(new Date('2026-10-31T12:00:00Z'))).toBe('2026-W44');
  });

  it('le lundi ouvre la semaine, le dimanche la ferme', () => {
    expect(isoWeekKey(new Date('2026-10-26T00:00:00Z'))).toBe('2026-W44');
    expect(isoWeekKey(new Date('2026-11-01T23:59:59Z'))).toBe('2026-W44');
    expect(isoWeekKey(new Date('2026-11-02T00:00:00Z'))).toBe('2026-W45');
  });

  it("rattache les derniers jours de décembre à la semaine 1 de l'année suivante quand l'ISO le veut", () => {
    expect(isoWeekKey(new Date('2024-12-30T10:00:00Z'))).toBe('2025-W01');
    expect(isoWeekKey(new Date('2021-01-03T10:00:00Z'))).toBe('2020-W53');
  });

  it('rend le lundi 00:00 UTC de la semaine', () => {
    expect(isoWeekStart(new Date('2026-11-01T23:59:59Z')).toISOString()).toBe('2026-10-26T00:00:00.000Z');
    expect(isoWeekStart(new Date('2026-10-26T00:00:00Z')).toISOString()).toBe('2026-10-26T00:00:00.000Z');
  });

  it('ajoute des jours UTC sans dépendre du fuseau ni du changement d’heure', () => {
    expect(addUtcDays(new Date('2026-10-25T12:00:00Z'), 7).toISOString()).toBe('2026-11-01T12:00:00.000Z');
    expect(addUtcDays(new Date('2026-03-01T00:00:00Z'), -1).toISOString()).toBe('2026-02-28T00:00:00.000Z');
  });
});
