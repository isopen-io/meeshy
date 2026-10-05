import { describe, it, expect } from 'vitest';
import {
  PRISM_HOUR_MULTIPLIER,
  TAILWIND_FACTOR,
  isInPrismHour,
  prismHourWindow,
  tailwindFactor,
} from '../../utils/game/boosts.js';

describe('le Vent arrière', () => {
  it('vaut ×1,25 tant que le niveau est sous le record', () => {
    expect(TAILWIND_FACTOR).toBe(1.25);
    expect(tailwindFactor({ level: 32, levelRecord: 36 })).toBe(1.25);
  });

  it('retombe à ×1 une fois le record retrouvé', () => {
    expect(tailwindFactor({ level: 36, levelRecord: 36 })).toBe(1);
    expect(tailwindFactor({ level: 40, levelRecord: 36 })).toBe(1);
  });
});

describe('l\'Heure du Prisme', () => {
  const window = (userId: string, dayKey: string) => prismHourWindow({ userId, dayKey });

  it('double les missions', () => {
    expect(PRISM_HOUR_MULTIPLIER).toBe(2);
  });

  it('dure une heure, entre 9 h et 21 h locales', () => {
    for (let day = 1; day <= 28; day++) {
      const w = window('user-a', `2026-10-${String(day).padStart(2, '0')}`);
      expect(w.endMinute - w.startMinute).toBe(60);
      expect(w.startMinute).toBeGreaterThanOrEqual(9 * 60);
      expect(w.endMinute).toBeLessThanOrEqual(21 * 60);
    }
  });

  it('est déterministe pour un utilisateur et un jour', () => {
    expect(window('user-a', '2026-10-05')).toEqual(window('user-a', '2026-10-05'));
  });

  it('varie d\'un jour à l\'autre et d\'un utilisateur à l\'autre', () => {
    const starts = new Set(
      ['u1', 'u2', 'u3', 'u4', 'u5', 'u6'].flatMap((u) =>
        [1, 2, 3, 4, 5].map((d) => window(u, `2026-10-0${d}`).startMinute),
      ),
    );
    expect(starts.size).toBeGreaterThan(5);
  });

  it('commence sur un quart d\'heure', () => {
    expect(window('user-a', '2026-10-05').startMinute % 15).toBe(0);
  });

  it('tient la fenêtre pour [début, fin[', () => {
    const w = { startMinute: 600, endMinute: 660 };
    expect(isInPrismHour(w, 599)).toBe(false);
    expect(isInPrismHour(w, 600)).toBe(true);
    expect(isInPrismHour(w, 659)).toBe(true);
    expect(isInPrismHour(w, 660)).toBe(false);
  });
});
