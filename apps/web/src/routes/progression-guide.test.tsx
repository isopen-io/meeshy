import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, useState } from 'react';

import { ONBOARDING_STEP_KEYS } from '@meeshy/shared/utils/game/guide';
import { resolveEngagementProgress } from '@meeshy/shared/utils/engagement-progress';

import { ENGAGEMENT_PROGRESS_QUERY_KEY, type EngagementWithGame } from '@/lib/api/engagement';
import { ENGAGEMENT_PROGRESS_FIXTURE } from '@/lib/api/engagement-fixture';
import { gameBlockFixture } from '@/lib/api/game-fixture';
import type { ApiResult, HttpRequest } from '@/lib/api/http';
import type { GuideCard } from '@/lib/game-guide/card';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import { pathOf, routedTransport } from '@/test-support/routed-transport';

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

const ALL_STEPS = ONBOARDING_STEP_KEYS.map((key) => `onboarding.${key}`);

const view = (patch: Parameters<typeof gameBlockFixture>[0] = {}, extra: Partial<EngagementWithGame> = {}): EngagementWithGame => ({
  ...resolveEngagementProgress(ENGAGEMENT_PROGRESS_FIXTURE),
  game: gameBlockFixture(patch),
  ...extra,
});

const memory = () => {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
    store,
  };
};

type Bench = {
  readonly guide: () => GameGuide;
  readonly show: (next: EngagementWithGame | undefined) => Promise<void>;
  readonly posted: () => readonly string[][];
  readonly cached: () => EngagementWithGame | undefined;
};

async function bench(
  initial: EngagementWithGame | undefined,
  options: { readonly storage?: ReturnType<typeof memory>; readonly reply?: (req: HttpRequest) => ApiResult<unknown> | undefined } = {},
): Promise<Bench> {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } });
  if (initial !== undefined) client.setQueryData(ENGAGEMENT_PROGRESS_QUERY_KEY, initial);
  const { transport, calls } = routedTransport((req) => {
    if (pathOf(req) !== '/api/v1/me/game/guide/seen') return undefined;
    const custom = options.reply?.(req);
    if (custom !== undefined) return custom;
    const keys = (req.body as { keys: string[] }).keys;
    return { ok: true, data: { guideSeen: keys } };
  });
  let current: GameGuide | null = null;
  let setView: (next: EngagementWithGame | undefined) => void = () => undefined;
  function Probe() {
    const [shown, set] = useState<EngagementWithGame | undefined>(initial);
    setView = set;
    current = useGameGuide({ view: shown, transport, storage: options.storage ?? memory() });
    return null;
  }
  await mount(
    <QueryClientProvider client={client}>
      <Probe />
    </QueryClientProvider>,
  );
  await act(() => new Promise<void>((resolve) => setTimeout(resolve, 10)));
  return {
    guide: () => {
      if (current === null) throw new Error('le crochet n’est pas monté');
      return current;
    },
    show: async (next) => {
      await act(async () => setView(next));
      await act(() => new Promise<void>((resolve) => setTimeout(resolve, 10)));
    },
    posted: () => calls().map((c) => (c.body as { keys: string[] }).keys),
    cached: () => client.getQueryData<EngagementWithGame>(ENGAGEMENT_PROGRESS_QUERY_KEY),
  };
}

const key = (card: GuideCard | null): string | null => card?.key ?? null;
const settle = () => act(() => new Promise<void>((resolve) => setTimeout(resolve, 20)));

describe('à l’ouverture', () => {
  test('un compte neuf commence l’intégration : la carte de bienvenue, en entier', async () => {
    const b = await bench(view({ guideSeen: [] }));
    expect(key(b.guide().card)).toBe('onboarding.welcome');
    expect(b.guide().card?.presentation).toBe('full');
  });

  test('la carte montrée est marquée vue — et envoyée au serveur, une fois', async () => {
    const b = await bench(view({ guideSeen: [] }));
    expect(b.posted()).toEqual([['onboarding.welcome']]);
  });

  test('le cache porte la clé vue aussitôt : un autre écran ne la remontre pas', async () => {
    const b = await bench(view({ guideSeen: [] }));
    expect(b.cached()?.game?.guideSeen).toContain('onboarding.welcome');
  });

  test('l’intégration finie, une découverte se dit : le premier niveau, en entier', async () => {
    const b = await bench(view({ guideSeen: ALL_STEPS, score: 45, debitablePoints: 45, glory: 0, balance: 0, mintedLifetime: 0, missions: [] }));
    expect(key(b.guide().card)).toBe('first-level');
    expect(b.guide().card?.presentation).toBe('full');
  });

  test('une UNE seule carte par ouverture, même quand plusieurs découvertes attendent', async () => {
    const b = await bench(view({ guideSeen: ALL_STEPS }));
    expect(b.guide().card).not.toBeNull();
    expect(b.posted()).toHaveLength(1);
    expect(b.posted()[0]).toHaveLength(1);
  });

  test('tout est vu et rien ne presse : aucune carte', async () => {
    const seen = [...ALL_STEPS, 'first-level', 'new-tier', 'missions-unlocked', 'first-mint-possible', 'new-rank', 'treasury-tier'];
    const b = await bench(view({ guideSeen: seen, mintedLifetime: 3 }));
    expect(b.guide().card).toBeNull();
    expect(b.posted()).toEqual([]);
  });

  test('une urgence se redit en version courte, sans renvoyer sa clé', async () => {
    const seen = [...ALL_STEPS, 'first-level', 'new-tier', 'missions-unlocked', 'new-rank', 'treasury-tier', 'flame-at-risk'];
    const b = await bench(view({ guideSeen: seen, mintedLifetime: 3, lastActiveDay: '2026-10-04' }));
    expect(key(b.guide().card)).toBe('flame-at-risk');
    expect(b.guide().card?.presentation).toBe('short');
    expect(b.posted()).toEqual([]);
  });

  test('un ancien serveur (aucun bloc game) : aucune carte, aucun envoi', async () => {
    const b = await bench(resolveEngagementProgress(ENGAGEMENT_PROGRESS_FIXTURE));
    expect(b.guide().card).toBeNull();
    expect(b.posted()).toEqual([]);
  });

  test('pas de lecture encore : aucune carte', async () => {
    const b = await bench(undefined);
    expect(b.guide().card).toBeNull();
  });

  test('le retour après sept jours d’absence se dit, d’après le dernier passage', async () => {
    const storage = memory();
    storage.setItem('meeshy.game.last-visit', '2026-09-26');
    const seen = [...ALL_STEPS, 'first-level', 'new-tier', 'missions-unlocked', 'new-rank', 'treasury-tier'];
    const b = await bench(view({ guideSeen: seen, mintedLifetime: 3 }), { storage });
    expect(key(b.guide().card)).toBe('return-after-absence');
    expect(storage.getItem('meeshy.game.last-visit')).toBe('2026-10-05');
  });

  test('un serveur qui refuse l’envoi ne retire pas la carte', async () => {
    const b = await bench(view({ guideSeen: [] }), { reply: () => ({ ok: false, status: 503, error: 'réseau' }) });
    expect(key(b.guide().card)).toBe('onboarding.welcome');
  });
});

describe('les gestes', () => {
  test('« Passer » une étape montre la suivante, et la marque vue', async () => {
    const b = await bench(view({ guideSeen: [] }));
    await act(async () => b.guide().dismiss());
    await settle();
    expect(key(b.guide().card)).toBe('onboarding.first-points');
    expect(b.posted()).toEqual([['onboarding.welcome'], ['onboarding.first-points']]);
  });

  test('« Plus tard » sur un moment ferme la carte', async () => {
    const b = await bench(view({ guideSeen: ALL_STEPS }));
    await act(async () => b.guide().dismiss());
    await settle();
    expect(b.guide().card).toBeNull();
  });

  test('« Passer l’intégration » marque toutes les étapes restantes, en un seul envoi', async () => {
    const b = await bench(view({ guideSeen: [] }));
    await act(async () => b.guide().skipAll());
    await settle();
    expect(b.guide().card).toBeNull();
    expect(b.posted()[1]).toEqual(ALL_STEPS.slice(1));
  });

  test('la dernière étape passée, l’intégration est finie : aucune étape ne revient', async () => {
    const b = await bench(view({ guideSeen: ALL_STEPS.slice(0, 6), mintedLifetime: 3 }));
    expect(key(b.guide().card)).toBe('onboarding.rank');
    await act(async () => b.guide().dismiss());
    await settle();
    expect(b.guide().card?.step).toBeUndefined();
  });
});

describe('ce qui arrive pendant que l’écran est ouvert', () => {
  const seen = [...ALL_STEPS, 'first-level', 'new-tier', 'missions-unlocked', 'new-rank', 'treasury-tier', 'first-mint-possible'];

  test('un palier franchi se dit aussitôt', async () => {
    const b = await bench(view({ guideSeen: seen, score: 10 * 9 * 9 + 5, mintedLifetime: 3 }));
    expect(b.guide().card).toBeNull();
    await b.show(view({ guideSeen: seen, score: 10 * 10 * 10, mintedLifetime: 3 }));
    expect(key(b.guide().card)).toBe('new-tier');
    expect(b.guide().card?.presentation).toBe('short');
  });

  test('une transition ne coupe pas la parole à l’intégration', async () => {
    const b = await bench(view({ guideSeen: [], score: 10 * 9 * 9 + 5 }));
    await b.show(view({ guideSeen: [], score: 10 * 10 * 10 }));
    expect(key(b.guide().card)).toBe('onboarding.welcome');
  });

  test('la première frappe : le niveau avant → après', async () => {
    const before = view({ guideSeen: seen, mintedLifetime: 0 });
    const b = await bench(before);
    const price = before.game?.mint.price ?? 0;
    await b.show(view({ guideSeen: seen, mintedLifetime: 1, score: (before.game?.level.score ?? 0) - price, levelRecord: before.game?.level.level ?? 1 }));
    expect(key(b.guide().card)).toBe('first-mint');
    expect(b.guide().card?.presentation).toBe('full');
  });
});
