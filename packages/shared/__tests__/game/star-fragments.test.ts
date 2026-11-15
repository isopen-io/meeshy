import { describe, expect, it } from 'vitest';
import { seasonStarFragments, starFragmentsCollected } from '../../utils/game/star-fragments.js';
import { seasonStepReward } from '../../utils/game/season.js';

describe('les fragments d\'étoile (#10011)', () => {
  it('la saison en donne UN aux étapes 5, 15, 25 et 35, et à elles seules', () => {
    const steps = Array.from({ length: 40 }, (_, i) => i + 1).filter((step) => seasonStepReward(step)?.kind === 'fragment');
    expect(steps).toEqual([5, 15, 25, 35]);
    steps.forEach((step) => expect(seasonStepReward(step)).toEqual({ kind: 'fragment', amount: 1 }));
  });

  it('compte les étapes à fragment réclamées d\'une saison, une fois chacune', () => {
    expect(seasonStarFragments([])).toBe(0);
    expect(seasonStarFragments([1, 2, 3, 4, 5, 6, 10])).toBe(1);
    expect(seasonStarFragments([5, 15, 25, 35, 40])).toBe(4);
    expect(seasonStarFragments([5, 5, 5])).toBe(1);
    expect(seasonStarFragments([0, -5, 45, 5.5])).toBe(0);
  });

  it('additionne toutes les sources : le compte ignore la source', () => {
    expect(starFragmentsCollected({ chestDays: 0, seasons: [] })).toBe(0);
    expect(starFragmentsCollected({ chestDays: 3, seasons: [] })).toBe(3);
    expect(starFragmentsCollected({ chestDays: 2, seasons: [[5, 15], [5, 10, 35]] })).toBe(2 + 2 + 2);
    expect(starFragmentsCollected({ chestDays: Number.NaN, seasons: [[25]] })).toBe(1);
    expect(starFragmentsCollected({ chestDays: -4, seasons: [] })).toBe(0);
  });
});
