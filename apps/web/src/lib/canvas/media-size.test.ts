import { describe, expect, test } from 'bun:test';

import { placedMediaDesignSize } from './media-size';

// T-D8 — 65 % du petit côté, miroir StoryMediaLayer.baseMediaDesignSize.
describe('placedMediaDesignSize — 65 % du petit côté (T-D8)', () => {
  test('ratio 1 ⇒ 540×540', () => {
    expect(placedMediaDesignSize({ aspectRatio: 1 })).toEqual({ width: 540, height: 540 });
  });

  test('ratio 0.5 ⇒ 351×702', () => {
    expect(placedMediaDesignSize({ aspectRatio: 0.5 })).toEqual({ width: 351, height: 702 });
  });

  test('ratio 2 ⇒ 702×351', () => {
    expect(placedMediaDesignSize({ aspectRatio: 2 })).toEqual({ width: 702, height: 351 });
  });

  test('ratio 1.04 (tolérance 0.05) ⇒ carré', () => {
    expect(placedMediaDesignSize({ aspectRatio: 1.04 })).toEqual({ width: 540, height: 540 });
  });

  test('ratio 1.06 ⇒ PAS carré (hors tolérance)', () => {
    const size = placedMediaDesignSize({ aspectRatio: 1.06 });
    expect(size.width).not.toBe(size.height);
  });

  test('ratio 20 borné à 10 ⇒ 702×70.2', () => {
    const size = placedMediaDesignSize({ aspectRatio: 20 });
    expect(size.width).toBeCloseTo(702, 9);
    expect(size.height).toBeCloseTo(70.2, 9);
  });

  test('scale 2 double les deux dimensions', () => {
    expect(placedMediaDesignSize({ aspectRatio: 1, scale: 2 })).toEqual({ width: 1080, height: 1080 });
  });

  test('crop {x:0,y:0,w:0.5,h:1} sur ratio 2 ⇒ effectif 1 ⇒ carré', () => {
    expect(placedMediaDesignSize({ aspectRatio: 2, crop: { x: 0, y: 0, width: 0.5, height: 1 } })).toEqual({ width: 540, height: 540 });
  });
});
