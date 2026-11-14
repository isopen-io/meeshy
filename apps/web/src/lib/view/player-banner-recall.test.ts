import { describe, expect, test } from 'bun:test';

import { PLAYER_BANNER_RECALL_MS } from '@meeshy/shared/utils/game/banner-recall-timing';

import { isRecallingPlayerBanner, recallPlayerBanner } from './player-banner-recall';
import { createPlayerBannerVisit } from './player-banner-visit';

/**
 * LE RAPPEL (#17366, retouche 3) — un acte réalisé, l'Offrande prête, la Flamme à risque ou le geste « tirer la liste »
 * font revenir le bandeau QUELQUES SECONDES, puis il repart seul. L'ouverture de l'app n'en change pas.
 */
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const retired = () => {
  const store = createPlayerBannerVisit();
  store.getState().send('shown');
  store.getState().send('expired');
  store.getState().send('exited');
  return store;
};

describe('le bandeau rappelé', () => {
  test('quelques secondes, bien moins que l’ouverture', () => {
    expect(PLAYER_BANNER_RECALL_MS).toBe(5_000);
  });

  test('retiré, un rappel le remontre, puis il repart seul par la sortie de l’ouverture', async () => {
    const store = retired();
    recallPlayerBanner({ store, ms: 20 });
    expect(store.getState().phase).toBe('shown');
    expect(isRecallingPlayerBanner(store)).toBe(true);
    await sleep(40);
    expect(store.getState().phase).toBe('leaving');
    store.getState().send('exited');
    expect(store.getState().phase).toBe('gone');
  });

  test('en train de partir, un rappel le retient', () => {
    const store = createPlayerBannerVisit();
    store.getState().send('shown');
    store.getState().send('expired');
    recallPlayerBanner({ store, ms: 1_000 });
    expect(store.getState().phase).toBe('shown');
  });

  test('pendant l’ouverture, un rappel ne raccourcit rien', async () => {
    const store = createPlayerBannerVisit();
    store.getState().send('shown');
    const visit = store.getState().visit;
    recallPlayerBanner({ store, ms: 10 });
    await sleep(30);
    expect(store.getState()).toMatchObject({ phase: 'shown', visit });
    expect(isRecallingPlayerBanner(store)).toBe(false);
  });

  test('avant sa première peinture, un rappel attend l’ouverture', () => {
    const store = createPlayerBannerVisit();
    recallPlayerBanner({ store, ms: 10 });
    expect(store.getState().phase).toBe('armed');
  });

  test('un second rappel relance ses secondes', async () => {
    const store = retired();
    recallPlayerBanner({ store, ms: 40 });
    await sleep(25);
    recallPlayerBanner({ store, ms: 40 });
    await sleep(25);
    expect(store.getState().phase).toBe('shown');
    await sleep(30);
    expect(store.getState().phase).toBe('leaving');
  });

  test('une réouverture de l’app l’emporte : la fin du rappel ne coupe pas la nouvelle ouverture', async () => {
    const store = retired();
    recallPlayerBanner({ store, ms: 20 });
    store.getState().send('reopened');
    store.getState().send('shown');
    await sleep(40);
    expect(store.getState().phase).toBe('shown');
    expect(isRecallingPlayerBanner(store)).toBe(false);
  });
});
