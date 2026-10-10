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
  /** Un geste du jeu est en vol (`settled` faux) : la lecture montrée est l'optimiste. */
  readonly pending: (next: EngagementWithGame) => Promise<void>;
  /** Le geste est réglé ; la lecture devient `next` (ou reste celle montrée). */
  readonly confirm: (next?: EngagementWithGame) => Promise<void>;
  readonly posted: () => readonly string[][];
  readonly requestIds: () => readonly string[];
  readonly cached: () => EngagementWithGame | undefined;
};

async function bench(
  initial: EngagementWithGame | undefined,
  options: {
    readonly storage?: ReturnType<typeof memory>;
    readonly reply?: (req: HttpRequest) => ApiResult<unknown> | undefined;
    readonly today?: string;
  } = {},
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
  let setSettled: (next: boolean) => void = () => undefined;
  const storage = options.storage ?? memory();
  const today = options.today ?? '2026-10-05';
  function Probe() {
    const [shown, set] = useState<EngagementWithGame | undefined>(initial);
    const [settled, mark] = useState(true);
    setView = set;
    setSettled = mark;
    current = useGameGuide({ view: shown, transport, storage, settled, today: () => today });
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
    pending: async (next) => {
      await act(async () => {
        setSettled(false);
        setView(next);
      });
      await act(() => new Promise<void>((resolve) => setTimeout(resolve, 10)));
    },
    confirm: async (next) => {
      await act(async () => {
        if (next !== undefined) setView(next);
        setSettled(true);
      });
      await act(() => new Promise<void>((resolve) => setTimeout(resolve, 10)));
    },
    posted: () => calls().map((c) => (c.body as { keys: string[] }).keys),
    requestIds: () => calls().map((c) => (c.body as { requestId: string }).requestId),
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
    const b = await bench(view({ guideSeen: ALL_STEPS, score: 450, levelRecord: null, debitablePoints: 450, glory: 0, balance: 0, mintedLifetime: 0, missions: [] }));
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

  test('le dernier passage se compte en jours de l’APPAREIL, pas d’après une lecture en cache d’un autre jour', async () => {
    const storage = memory();
    storage.setItem('meeshy.game.last-visit', '2026-10-05');
    const seen = [...ALL_STEPS, 'first-level', 'new-tier', 'missions-unlocked', 'new-rank', 'treasury-tier'];
    const cachedTenDaysAgo = view({ guideSeen: seen, mintedLifetime: 3 });
    const b = await bench(cachedTenDaysAgo, { storage, today: '2026-10-15' });
    expect(key(b.guide().card)).toBe('return-after-absence');
    expect(storage.getItem('meeshy.game.last-visit')).toBe('2026-10-15');
  });

  test('sans crypto.randomUUID (ancienne WebView Android, contexte non sécurisé), la clé vue part quand même', async () => {
    const original = globalThis.crypto;
    const getRandomValues = original.getRandomValues.bind(original);
    Object.defineProperty(globalThis, 'crypto', { configurable: true, value: { getRandomValues } });
    try {
      const b = await bench(view({ guideSeen: [] }));
      expect(b.posted()).toEqual([['onboarding.welcome']]);
      expect(b.requestIds()[0]?.length ?? 0).toBeGreaterThanOrEqual(8);
    } finally {
      Object.defineProperty(globalThis, 'crypto', { configurable: true, value: original });
    }
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
    const b = await bench(view({ guideSeen: seen, score: 100 * 9 * 9 + 5, levelRecord: 9, mintedLifetime: 3 }));
    expect(b.guide().card).toBeNull();
    await b.show(view({ guideSeen: seen, score: 100 * 10 * 10, levelRecord: 9, mintedLifetime: 3 }));
    expect(key(b.guide().card)).toBe('new-tier');
    expect(b.guide().card?.presentation).toBe('short');
  });

  test('une transition ne coupe pas la parole à l’intégration', async () => {
    const b = await bench(view({ guideSeen: [], score: 100 * 9 * 9 + 5, levelRecord: 9 }));
    await b.show(view({ guideSeen: [], score: 100 * 10 * 10, levelRecord: 9 }));
    expect(key(b.guide().card)).toBe('onboarding.welcome');
  });

  test('un geste encore en vol ne se célèbre pas : la carte attend la confirmation', async () => {
    const b = await bench(view({ guideSeen: seen, score: 100 * 9 * 9 + 5, levelRecord: 9, mintedLifetime: 3 }));
    const optimistic = view({ guideSeen: seen, score: 100 * 10 * 10, levelRecord: 9, mintedLifetime: 3 });
    await b.pending(optimistic);
    expect(b.guide().card).toBeNull();
    await b.confirm();
    expect(key(b.guide().card)).toBe('new-tier');
  });

  test('un geste refusé et restauré ne laisse aucune carte ni aucune clé vue', async () => {
    const before = view({ guideSeen: seen, score: 100 * 9 * 9 + 5, levelRecord: 9, mintedLifetime: 3 });
    const b = await bench(before);
    await b.pending(view({ guideSeen: seen, score: 100 * 10 * 10, levelRecord: 9, mintedLifetime: 3 }));
    await b.confirm(before);
    expect(b.guide().card).toBeNull();
    expect(b.posted()).toEqual([]);
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

describe('les étapes qui attendent leur geste', () => {
  const fresh = (patch: Parameters<typeof gameBlockFixture>[0] = {}) =>
    view({ score: 0, levelRecord: null, debitablePoints: 0, glory: 0, balance: 0, mintedLifetime: 0, streak: 0, lastActiveDay: null, missions: [], ...patch }, { isEmpty: true });
  const firstGesture = (guideSeen: string[]) =>
    view({ score: 12, levelRecord: null, debitablePoints: 12, glory: 0, balance: 0, mintedLifetime: 0, streak: 1, missions: [], guideSeen }, { isEmpty: false });
  const missionsOpen = (done: boolean, guideSeen: string[]) =>
    view({
      score: 800,
      guideSeen,
      missions: [
        { id: 'm-easy', difficulty: 'easy', templateKey: 'send-texts', signal: 'axis:content.text_message', prism: false, target: 5, progress: done ? 5 : 1, reward: 36, glory: 0, completedAt: done ? '2026-10-05T08:00:00.000Z' : null },
      ],
    });

  test('la bienvenue vue, le premier geste pas fait : à la réouverture elle se redit, la suite n’arrive pas', async () => {
    const b = await bench(fresh({ guideSeen: ['onboarding.welcome'] }));
    expect(key(b.guide().card)).toBe('onboarding.welcome');
    expect(b.guide().card?.awaiting).toBe(true);
    expect(b.posted()).toEqual([]);
  });

  test('la bienvenue vue, le premier geste fait : la suite — « Bravo, tes premiers points »', async () => {
    const b = await bench(firstGesture(['onboarding.welcome']));
    expect(key(b.guide().card)).toBe('onboarding.first-points');
    expect(b.posted()).toEqual([['onboarding.first-points']]);
  });

  test('le geste a lieu PENDANT que l’écran est ouvert : l’étape avance d’elle-même', async () => {
    const b = await bench(fresh({ guideSeen: [] }));
    expect(key(b.guide().card)).toBe('onboarding.welcome');
    await b.show(firstGesture(['onboarding.welcome']));
    expect(key(b.guide().card)).toBe('onboarding.first-points');
    expect(b.posted()).toEqual([['onboarding.welcome'], ['onboarding.first-points']]);
  });

  test('un geste encore en vol ne fait pas avancer l’étape : elle attend la confirmation', async () => {
    const b = await bench(fresh({ guideSeen: [] }));
    await b.pending(firstGesture(['onboarding.welcome']));
    expect(key(b.guide().card)).toBe('onboarding.welcome');
    await b.confirm();
    expect(key(b.guide().card)).toBe('onboarding.first-points');
  });

  test('un geste refusé et restauré laisse l’étape où elle était', async () => {
    const before = fresh({ guideSeen: [] });
    const b = await bench(before);
    await b.pending(firstGesture(['onboarding.welcome']));
    await b.confirm(before);
    expect(key(b.guide().card)).toBe('onboarding.welcome');
  });

  test('« Passer » sur une étape qui attend montre la suivante, et la suivante devient la dernière vue', async () => {
    const b = await bench(fresh({ guideSeen: [] }));
    await act(async () => b.guide().dismiss());
    await settle();
    expect(key(b.guide().card)).toBe('onboarding.first-points');
  });

  test('la mission facile : l’étape des missions attend, puis avance à la Flamme quand elle est faite', async () => {
    const seen = ['onboarding.welcome', 'onboarding.first-points', 'onboarding.levels', 'onboarding.missions'];
    const b = await bench(missionsOpen(false, seen));
    expect(key(b.guide().card)).toBe('onboarding.missions');
    expect(b.guide().card?.awaiting).toBe(true);
    await b.show(missionsOpen(true, seen));
    expect(key(b.guide().card)).toBe('onboarding.flame');
  });

  test('missions fermées : l’étape ne retient personne, la Flamme suit', async () => {
    const seen = ['onboarding.welcome', 'onboarding.first-points', 'onboarding.levels', 'onboarding.missions'];
    const b = await bench(firstGesture(seen));
    expect(key(b.guide().card)).toBe('onboarding.flame');
  });

  test('la Flamme : revenir le lendemain (deux jours de série) fait avancer l’étape', async () => {
    const seen = ['onboarding.welcome', 'onboarding.first-points', 'onboarding.levels', 'onboarding.missions', 'onboarding.flame'];
    const day1 = view({ score: 800, streak: 1, lastActiveDay: '2026-10-05', guideSeen: seen });
    const b = await bench(day1);
    expect(key(b.guide().card)).toBe('onboarding.flame');
    expect(b.guide().card?.awaiting).toBe(true);
    await b.show(view({ score: 900, streak: 2, lastActiveDay: '2026-10-06', guideSeen: seen }));
    expect(key(b.guide().card)).toBe('onboarding.mint');
  });

  test('« Passer l’intégration » libère aussi une étape qui attend', async () => {
    const b = await bench(fresh({ guideSeen: [] }));
    await act(async () => b.guide().skipAll());
    await settle();
    expect(b.guide().card).toBeNull();
  });
});
