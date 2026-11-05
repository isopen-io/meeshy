import { describe, expect, test } from 'bun:test';

import { REEL_SCENE_LOOP, REEL_STUDIO } from '@/lib/api/fixtures-reels';
import { resolveFeedCardModel } from '@/lib/feed/card-model';

import { reelImager, type ReelImagerLauncher } from './reel-imager';

const NOW = new Date('2026-09-14T09:00:00.000Z');

const spy = (): { readonly launcher: ReelImagerLauncher; readonly keys: string[] } => {
  const keys: string[] = [];
  return {
    keys,
    launcher: async ({ subject }) => {
      keys.push(subject.key);
    },
  };
};

describe('reelImager — la baguette du réel lance l’Imager de SA scène (#16333)', () => {
  test('un réel à scène part au bandeau des exports, sous sa clé de publication', () => {
    const { launcher, keys } = spy();
    const model = resolveFeedCardModel(REEL_SCENE_LOOP, { preferredLanguages: ['fr'], now: NOW });
    reelImager(launcher)(model);
    expect(keys).toEqual([`post:${model.id}`]);
  });

  test('un réel sans scène ne lance rien', () => {
    const { launcher, keys } = spy();
    reelImager(launcher)(resolveFeedCardModel(REEL_STUDIO, { preferredLanguages: ['fr'], now: NOW }));
    expect(keys).toEqual([]);
  });
});
