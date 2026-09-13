import { describe, expect, test } from 'bun:test';

import { resolveOutOfView } from '@/lib/view/out-of-view';
import { PINNED_RAIL_RELEASE_RATIO, PINNED_RAIL_REVEAL_RATIO } from './pinned-rail';

describe('pinned-rail — révélé quand le grand rail est SORTI, relâché à un quart', () => {
  test('la révélation attend que le grand rail soit ENTIÈREMENT hors champ', () => {
    expect(PINNED_RAIL_REVEAL_RATIO).toBe(0);
  });

  test('le relâchement est un seuil réel, entre les deux bornes', () => {
    expect(PINNED_RAIL_RELEASE_RATIO).toBeGreaterThan(0);
    expect(PINNED_RAIL_RELEASE_RATIO).toBeLessThan(1);
  });

  test('composées, ces deux valeurs reproduisent exactement les cas de `resolveOutOfView`', () => {
    const withPinnedRailThresholds = (pinned: boolean, visibleRatio: number) =>
      resolveOutOfView({
        pinned,
        visibleRatio,
        revealRatio: PINNED_RAIL_REVEAL_RATIO,
        releaseRatio: PINNED_RAIL_RELEASE_RATIO,
      });

    expect(withPinnedRailThresholds(false, 0)).toBe(true);
    expect(withPinnedRailThresholds(false, 0.1)).toBe(false);
    expect(withPinnedRailThresholds(true, 0.2)).toBe(true);
    expect(withPinnedRailThresholds(true, 0.25)).toBe(false);
    expect(withPinnedRailThresholds(true, 1)).toBe(false);
  });
});
