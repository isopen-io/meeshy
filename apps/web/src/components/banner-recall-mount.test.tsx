import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { act } from 'react';

import { ENGAGEMENT_PROGRESS_QUERY_KEY, loadEngagementProgress } from '@/lib/api/engagement';
import { httpTransport } from '@/lib/api/client';
import { appQueryClient } from '@/lib/api/query-client';
import { gamePrefs } from '@/lib/game/preferences';
import { loadGameCatalog } from '@/lib/i18n-game-catalog';
import { createBannerRecall } from '@/lib/view/player-banner-recall';
import { playerBannerVisitStore } from '@/lib/view/player-banner-visit';
import { watchBannerRecall } from '@/lib/view/use-banner-recall';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { BannerRecallMount } from './banner-recall-mount';
import { TopBand } from './top-band';

/**
 * LA BANNIÈRE RAPPELÉE (#17366, retouche 3) — retirée, la bannière revient QUELQUES SECONDES quand un acte est
 * réalisé, quand l'Offrande est prête ou la Flamme à risque, ou quand on tire la liste ; puis elle repart seule.
 * Le guet vit dans le chrome différé : la bande du haut, dans l'entrée, n'en apprend pas même le nom.
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const { mount, unmountAll, settle } = createActMounter();

beforeAll(async () => {
  ensureHappyDomRegistered({ url: 'http://localhost/' });
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadGameCatalog('fr');
  const cached = await loadEngagementProgress({ source: 'fixtures', transport: httpTransport });
  if (!cached.ok) throw new Error('progression de démonstration attendue');
  appQueryClient.setQueryData(ENGAGEMENT_PROGRESS_QUERY_KEY, cached.data);
});
afterEach(() => {
  unmountAll();
  gamePrefs.set({ hidden: false });
  playerBannerVisitStore.setState({ phase: 'armed', visit: 1 });
});
afterAll(async () => {
  appQueryClient.removeQueries({ queryKey: ENGAGEMENT_PROGRESS_QUERY_KEY });
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

const TIMING = { holdMs: 40, exitMs: 40 } as const;
const RECALL_MS = 70;
const sleep = async (ms: number): Promise<void> => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
};
const waitForBanner = async (host: ParentNode): Promise<Element | null> => {
  for (let attempt = 0; attempt < 20 && host.querySelector('[data-player-banner]') === null; attempt += 1) await settle();
  return host.querySelector('[data-player-banner]');
};
const retiredBand = async () => {
  const host = await mount(<TopBand routeKey="list" signedIn timing={TIMING} />);
  expect(await waitForBanner(host)).not.toBeNull();
  await sleep(160);
  expect(host.querySelector('[data-player-slot]')).toBeNull();
  return host;
};

type Cached = { game: { missions: { unlocked: boolean; items: { completedAt: string | null }[] } } };

describe('la bannière rappelée', () => {
  test('tirer la liste la rappelle : elle revient le temps du rappel, puis repart', async () => {
    const recall = createBannerRecall({ recallMs: RECALL_MS });
    const host = await retiredBand();
    await act(async () => recall());
    expect(await waitForBanner(host)).not.toBeNull();
    await sleep(220);
    expect(host.querySelector('[data-player-slot]')).toBeNull();
    expect(playerBannerVisitStore.getState().phase).toBe('gone');
  });

  test('un acte réalisé, arrivé dans le cache, la rappelle par le guet du chrome différé, sans aucune requête', async () => {
    const before = appQueryClient.getQueryData<Cached>(ENGAGEMENT_PROGRESS_QUERY_KEY);
    if (before === undefined) throw new Error('progression de démonstration attendue');
    const day = (done: number): Cached => ({
      ...before,
      game: { ...before.game, missions: { unlocked: true, items: [0, 1, 2].map((index) => ({ completedAt: index < done ? '2026-11-14T09:00:00.000Z' : null })) } },
    });
    const recall = createBannerRecall({ recallMs: RECALL_MS });
    const load = () =>
      Promise.resolve((hidden: () => boolean) =>
        watchBannerRecall({
          read: () => appQueryClient.getQueryData(ENGAGEMENT_PROGRESS_QUERY_KEY),
          subscribe: (listener) => appQueryClient.getQueryCache().subscribe(listener),
          hidden,
          onRecall: recall,
        }),
      );
    try {
      appQueryClient.setQueryData(ENGAGEMENT_PROGRESS_QUERY_KEY, day(1));
      const host = await retiredBand();
      await mount(<BannerRecallMount signedIn load={load} />);
      await settle();
      await act(async () => appQueryClient.setQueryData(ENGAGEMENT_PROGRESS_QUERY_KEY, day(2)));
      expect(await waitForBanner(host)).not.toBeNull();
    } finally {
      appQueryClient.setQueryData(ENGAGEMENT_PROGRESS_QUERY_KEY, before);
    }
  });

  test('« Jeu masqué » : ni le geste ni un acte ne la rappellent', async () => {
    gamePrefs.set({ hidden: true });
    const host = await mount(<TopBand routeKey="list" signedIn timing={TIMING} />);
    await act(async () => createBannerRecall({ recallMs: RECALL_MS })());
    await settle();
    expect(host.querySelector('[data-player-banner]')).toBeNull();
  });

  test('sans compte connecté, le guet ne se charge pas', async () => {
    let loads = 0;
    await mount(
      <BannerRecallMount
        signedIn={false}
        load={() => {
          loads += 1;
          return Promise.resolve(() => () => undefined);
        }}
      />,
    );
    await settle();
    expect(loads).toBe(0);
  });

  test('démonté, le guet se désabonne', async () => {
    let stopped = 0;
    await mount(<BannerRecallMount signedIn load={() => Promise.resolve(() => () => void (stopped += 1))} />);
    await settle();
    unmountAll();
    expect(stopped).toBe(1);
  });
});
