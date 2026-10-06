import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, useState } from 'react';

import { ONBOARDING_STEP_KEYS } from '@meeshy/shared/utils/game/guide';
import { resolveEngagementProgress } from '@meeshy/shared/utils/engagement-progress';

import { ENGAGEMENT_PROGRESS_QUERY_KEY, type EngagementWithGame } from '@/lib/api/engagement';
import { ENGAGEMENT_PROGRESS_FIXTURE } from '@/lib/api/engagement-fixture';
import { gameBlockWithExtrasFixture } from '@/lib/api/game-fixture';
import { snapshotOf, type GuideSnapshot } from '@/lib/game-guide/events-v2';
import { recallSnapshot, rememberSnapshot } from '@/lib/game-guide/memory';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import { routedTransport } from '@/test-support/routed-transport';

import { useGameGuide, type GameGuide } from './progression-guide';

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const { mount, unmountAll } = createActMounter();

beforeAll(() => {
  ensureHappyDomRegistered({ url: 'http://localhost/me/progression' });
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});
afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});
afterEach(unmountAll);

/** Tout ce qui se découvre est déjà vu : seul le moment de la vague 2 que le test provoque peut s'afficher. */
const SEEN = [...ONBOARDING_STEP_KEYS.map((key) => `onboarding.${key}`), 'first-level', 'new-tier', 'missions-unlocked', 'new-rank', 'treasury-tier', 'league-first', 'season-start'];

const view = (patch: Parameters<typeof gameBlockWithExtrasFixture>[0] = {}): EngagementWithGame => ({
  ...resolveEngagementProgress(ENGAGEMENT_PROGRESS_FIXTURE),
  game: gameBlockWithExtrasFixture({ guideSeen: SEEN, ...patch }),
});

const promotedTo = (league: 'saphir' | 'ambre'): EngagementWithGame => {
  const v = view();
  const current = v.game?.league?.current;
  return v.game?.league === undefined || current === undefined || current === null
    ? v
    : { ...v, game: { ...v.game, league: { ...v.game.league, weekKey: '2026-11-09', current: { ...current, league } } } };
};

const memory = () => {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
    store,
  };
};

async function bench(initial: EngagementWithGame, options: { readonly storage?: ReturnType<typeof memory>; readonly userId?: string | null } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } });
  client.setQueryData(ENGAGEMENT_PROGRESS_QUERY_KEY, initial);
  const { transport } = routedTransport(() => ({ ok: true, data: { guideSeen: [] } }));
  const storage = options.storage ?? memory();
  const userId = options.userId === undefined ? 'user-1' : options.userId;
  let current: GameGuide | null = null;
  let setView: (next: EngagementWithGame) => void = () => undefined;
  function Probe() {
    const [shown, set] = useState(initial);
    setView = set;
    current = useGameGuide({ view: shown, transport, storage, userId, today: () => '2026-11-09' });
    return null;
  }
  await mount(
    <QueryClientProvider client={client}>
      <Probe />
    </QueryClientProvider>,
  );
  await act(() => new Promise<void>((resolve) => setTimeout(resolve, 10)));
  return {
    card: () => current?.card ?? null,
    storage,
    show: async (next: EngagementWithGame) => {
      await act(async () => setView(next));
      await act(() => new Promise<void>((resolve) => setTimeout(resolve, 10)));
    },
  };
}

/**
 * LE GUIDE DE LA VAGUE 2 (#9481) — ce qui arrive PENDANT une absence se raconte
 * à l’ouverture suivante (la ligue tombe le dimanche soir), par comparaison à
 * l’instantané que l’appareil a gardé ; ce qui arrive pendant que l’écran est
 * ouvert se raconte tout de suite. Une seule carte à la fois.
 */
describe('à l’ouverture : ce qui s’est passé pendant l’absence', () => {
  const remembered = (): GuideSnapshot => {
    const game = view().game;
    if (game === undefined) throw new Error('un bloc attendu');
    return snapshotOf(game);
  };

  test('une ligue plus haute que celle gardée : la carte de la montée, avec son bouton vers la ligue', async () => {
    const storage = memory();
    rememberSnapshot(storage, 'user-1', remembered());
    const b = await bench(promotedTo('saphir'), { storage });
    expect(b.card()?.key).toBe('league-promoted');
    expect(b.card()?.action).toBe('see-league');
    expect(b.card()?.copy.what).toContain('Saphir');
    expect(b.card()?.photo).toBe(true);
    expect(b.card()?.emblemV2).toEqual({ kind: 'league-up', league: 'saphir', weekKey: '2026-11-02' });
  });

  test('une ligue plus basse : la descente, que Meo dit calmement — et qui ne se photographie pas', async () => {
    const storage = memory();
    rememberSnapshot(storage, 'user-1', remembered());
    const b = await bench(promotedTo('ambre'), { storage });
    expect(b.card()?.key).toBe('league-relegated');
    expect(b.card()?.speaker).toBe('meo');
    expect(b.card()?.photo).toBe(false);
  });

  test('sans mémoire (première ouverture) : rien n’est inventé', async () => {
    const b = await bench(promotedTo('saphir'));
    expect(b.card()).toBeNull();
  });

  test('sans compte connu : le guide ne lit ni n’écrit aucune mémoire', async () => {
    const storage = memory();
    const b = await bench(promotedTo('saphir'), { storage, userId: null });
    expect(b.card()).toBeNull();
    expect([...storage.store.keys()].some((key) => key.includes('guide-memory'))).toBe(false);
  });

  test('l’instantané du jour est gardé pour la prochaine ouverture', async () => {
    const storage = memory();
    rememberSnapshot(storage, 'user-1', remembered());
    await bench(promotedTo('saphir'), { storage });
    expect(recallSnapshot(storage, 'user-1')?.league?.current?.league).toBe('saphir');
  });

  test('la deuxième ouverture avec le même état ne redit rien', async () => {
    const storage = memory();
    rememberSnapshot(storage, 'user-1', remembered());
    await bench(promotedTo('saphir'), { storage });
    unmountAll();
    const again = await bench(promotedTo('saphir'), { storage });
    expect(again.card()).toBeNull();
  });
});

describe('pendant que l’écran est ouvert', () => {
  test('un nouveau trophée remplace la carte : le moment du trophée, qui se photographie', async () => {
    const b = await bench(view());
    expect(b.card()).toBeNull();
    const base = view();
    const next: EngagementWithGame =
      base.game?.trophies === undefined
        ? base
        : { ...base, game: { ...base.game, trophies: { items: [...base.game.trophies.items, { key: 'trophy.season-cup.1', awardedAt: '2026-11-09T10:00:00.000Z' }], order: base.game.trophies.order } } };
    await b.show(next);
    expect(b.card()?.key).toBe('trophy');
    expect(b.card()?.action).toBe('see-trophies');
    expect(b.card()?.emblemV2).toEqual({ kind: 'trophy', trophyKey: 'trophy.season-cup.1' });
  });

  test('un tampon de plus à l’Atlas : la carte du tampon, jamais une photo', async () => {
    const b = await bench(view());
    const base = view();
    const next: EngagementWithGame =
      base.game?.atlas === undefined
        ? base
        : { ...base, game: { ...base.game, atlas: { ...base.game.atlas, stamped: 5, stamps: [...base.game.atlas.stamps, { language: 'ja', stampedOn: '2026-11-09' }] } } };
    await b.show(next);
    expect(b.card()?.key).toBe('atlas-stamp');
    expect(b.card()?.copy.what).toContain('Japonais');
    expect(b.card()?.photo).toBe(false);
  });
});
