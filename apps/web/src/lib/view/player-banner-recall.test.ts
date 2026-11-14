import { describe, expect, test } from 'bun:test';

import { createPlayerBannerVisit } from './player-banner-visit';
import { createBannerRecall, withBannerRecall } from './player-banner-recall';

/**
 * LE RAPPEL (#17366, retouche 3) — un acte réalisé, l'Offrande prête, la Flamme à risque ou le geste « tirer la
 * liste » font revenir le bandeau QUELQUES SECONDES, puis il repart seul. L'ouverture de l'app n'en change pas.
 */
const fakeClock = () => {
  const pending = new Map<number, () => void>();
  let next = 0;
  return {
    schedule: (run: () => void, _ms: number) => {
      next += 1;
      pending.set(next, run);
      return next;
    },
    cancel: (id: unknown) => void pending.delete(id as number),
    elapse: () => {
      const runs = [...pending.values()];
      pending.clear();
      runs.forEach((run) => run());
    },
    pending,
  };
};

const retired = () => {
  const store = createPlayerBannerVisit();
  store.getState().send('shown');
  store.getState().send('expired');
  store.getState().send('exited');
  return store;
};

describe('le bandeau rappelé', () => {
  test('retiré, un rappel le remontre sous une nouvelle visite, puis ses secondes passées il repart', () => {
    const store = retired();
    const clock = fakeClock();
    const recall = createBannerRecall({ store, ...clock });
    const before = store.getState().visit;
    recall();
    expect(store.getState()).toMatchObject({ phase: 'shown', visit: before + 1 });
    clock.elapse();
    expect(store.getState().phase).toBe('leaving');
    store.getState().send('exited');
    expect(store.getState().phase).toBe('gone');
  });

  test('en train de partir, un rappel le retient', () => {
    const store = createPlayerBannerVisit();
    store.getState().send('shown');
    store.getState().send('expired');
    createBannerRecall({ store, ...fakeClock() })();
    expect(store.getState().phase).toBe('shown');
  });

  test('pendant l’ouverture, un rappel ne raccourcit rien : les trente secondes restent', () => {
    const store = createPlayerBannerVisit();
    store.getState().send('shown');
    const visit = store.getState().visit;
    const clock = fakeClock();
    createBannerRecall({ store, ...clock })();
    expect(store.getState()).toMatchObject({ phase: 'shown', visit });
    expect(clock.pending.size).toBe(0);
  });

  test('avant sa première peinture, un rappel attend l’ouverture', () => {
    const store = createPlayerBannerVisit();
    createBannerRecall({ store, ...fakeClock() })();
    expect(store.getState()).toMatchObject({ phase: 'armed', visit: 1 });
  });

  test('un second rappel pendant le premier relance ses secondes', () => {
    const store = retired();
    const clock = fakeClock();
    const recall = createBannerRecall({ store, ...clock });
    recall();
    const first = store.getState().visit;
    recall();
    expect(store.getState()).toMatchObject({ phase: 'shown', visit: first + 1 });
    expect(clock.pending.size).toBe(1);
  });

  test('une nouvelle ouverture l’emporte : la fin du rappel ne la raccourcit pas', () => {
    const store = retired();
    const clock = fakeClock();
    createBannerRecall({ store, ...clock })();
    store.getState().send('reopened');
    store.getState().send('shown');
    clock.elapse();
    expect(store.getState().phase).toBe('shown');
  });
});

describe('tirer la liste rappelle le bandeau', () => {
  test('le geste rappelle le bandeau PUIS rafraîchit la liste, et rend la même promesse', async () => {
    const store = retired();
    const calls: string[] = [];
    const pull = withBannerRecall(
      async () => {
        calls.push(`refresh:${store.getState().phase}`);
      },
      createBannerRecall({ store, ...fakeClock() }),
    );
    await pull();
    expect(calls).toEqual(['refresh:shown']);
  });
});
