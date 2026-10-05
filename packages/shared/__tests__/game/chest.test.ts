import { describe, it, expect } from 'vitest';
import { CHEST_ODDS, dailyChest } from '../../utils/game/chest.js';

describe('le coffre du jour', () => {
  it('expose ses probabilités avant l\'ouverture', () => {
    expect(CHEST_ODDS).toEqual({ minPoints: 60, maxPoints: 200, fragment: 1 / 6, freeze: 1 / 20 });
  });

  it('est déterministe pour un utilisateur et un jour', () => {
    expect(dailyChest({ userId: 'u1', dayKey: '2026-10-05' })).toEqual(dailyChest({ userId: 'u1', dayKey: '2026-10-05' }));
  });

  it('donne entre 60 et 200 points, toujours entiers', () => {
    for (let u = 0; u < 500; u++) {
      const { points } = dailyChest({ userId: `u${u}`, dayKey: '2026-10-05' });
      expect(Number.isInteger(points)).toBe(true);
      expect(points).toBeGreaterThanOrEqual(60);
      expect(points).toBeLessThanOrEqual(200);
    }
  });

  it('tient ses probabilités sur un grand nombre de coffres', () => {
    const N = 6000;
    const chests = Array.from({ length: N }, (_, u) => dailyChest({ userId: `user-${u}`, dayKey: '2026-10-05' }));
    const fragments = chests.filter((c) => c.fragment).length / N;
    const freezes = chests.filter((c) => c.freeze).length / N;
    expect(fragments).toBeGreaterThan(1 / 6 - 0.03);
    expect(fragments).toBeLessThan(1 / 6 + 0.03);
    expect(freezes).toBeGreaterThan(1 / 20 - 0.02);
    expect(freezes).toBeLessThan(1 / 20 + 0.02);
  });

  it('ne contient jamais de Meesh', () => {
    expect(Object.keys(dailyChest({ userId: 'u1', dayKey: '2026-10-05' })).sort()).toEqual(['fragment', 'freeze', 'points']);
  });
});
