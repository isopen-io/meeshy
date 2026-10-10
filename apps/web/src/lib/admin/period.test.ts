import { describe, expect, test } from 'bun:test';

import { ADMIN_PERIODS, isAdminPeriod, periodStart } from './period';

const NOW = new Date('2026-09-30T12:00:00.000Z');

describe('les périodes d’administration', () => {
  test('quatre fenêtres, dans l’ordre de la plus courte à la plus longue', () => {
    expect([...ADMIN_PERIODS]).toEqual(['24h', '7d', '30d', '90d']);
  });

  test('periodStart recule d’exactement la durée — l’horloge est injectée', () => {
    expect(periodStart('24h', NOW)).toBe('2026-09-29T12:00:00.000Z');
    expect(periodStart('7d', NOW)).toBe('2026-09-23T12:00:00.000Z');
    expect(periodStart('30d', NOW)).toBe('2026-08-31T12:00:00.000Z');
    expect(periodStart('90d', NOW)).toBe('2026-07-02T12:00:00.000Z');
  });

  test('isAdminPeriod : liste blanche', () => {
    expect(isAdminPeriod('7d')).toBe(true);
    expect(isAdminPeriod('1y')).toBe(false);
    expect(isAdminPeriod('')).toBe(false);
  });
});
