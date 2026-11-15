import { describe, expect, test } from 'bun:test';

import { threadPerspective, THREAD_MAX_DISTANCE } from './perspective';

describe('threadPerspective', () => {
  test('pile dans la bande (distance 0) -> echelle et opacite pleines', () => {
    expect(threadPerspective(0)).toEqual({ alpha: 1, scale: 1 });
  });

  test('sous la bande (distance negative) -> aucun estompage (convention thread)', () => {
    expect(threadPerspective(-200)).toEqual({ alpha: 1, scale: 1 });
  });

  test('a la saturation (380) -> planchers 0,18 / 0,60', () => {
    const { alpha, scale } = threadPerspective(THREAD_MAX_DISTANCE);
    expect(alpha).toBeCloseTo(0.18, 5);
    expect(scale).toBeCloseTo(0.6, 5);
  });

  test('au-dela de la saturation -> clampe aux memes planchers', () => {
    expect(threadPerspective(760)).toEqual(threadPerspective(THREAD_MAX_DISTANCE));
  });

  test('a mi-course (190) -> demi-effet', () => {
    const { alpha, scale } = threadPerspective(190);
    expect(alpha).toBeCloseTo(1 - 0.82 * 0.5, 5);
    expect(scale).toBeCloseTo(1 - 0.4 * 0.5, 5);
  });
});
