/**
 * L'HORLOGE DU JEU (#9375) — le jour et la minute se lisent dans le fuseau de l'utilisateur.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { dayKeyOf, markerOfDayKey, minuteOfDayInTimezone } from '../gameClock';

describe('gameClock', () => {
  it('la clé de jour suit le fuseau : 23 h 30 UTC est déjà demain à Paris', () => {
    const instant = new Date('2026-10-05T23:30:00Z');
    expect(dayKeyOf(instant, 'UTC')).toBe('2026-10-05');
    expect(dayKeyOf(instant, 'Europe/Paris')).toBe('2026-10-06');
  });

  it('un fuseau absent ou invalide retombe sur UTC', () => {
    const instant = new Date('2026-10-05T23:30:00Z');
    expect(dayKeyOf(instant, null)).toBe('2026-10-05');
    expect(dayKeyOf(instant, 'Pas/UnFuseau')).toBe('2026-10-05');
  });

  it('le marqueur d’un jour est minuit UTC — la forme de User.lastStreakDate', () => {
    expect(markerOfDayKey('2026-10-05').toISOString()).toBe('2026-10-05T00:00:00.000Z');
  });

  it('la minute du jour se lit dans le fuseau', () => {
    const instant = new Date('2026-10-05T18:20:00Z');
    expect(minuteOfDayInTimezone(instant, 'UTC')).toBe(18 * 60 + 20);
    expect(minuteOfDayInTimezone(instant, 'Europe/Paris')).toBe(20 * 60 + 20);
  });

  it('minuit local vaut 0, pas 24 × 60 (le piège de hour12 false)', () => {
    expect(minuteOfDayInTimezone(new Date('2026-10-05T22:00:00Z'), 'Europe/Paris')).toBe(0);
  });
});
