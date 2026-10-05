import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act } from 'react';

import { resolveEngagementProgress } from '@meeshy/shared/utils/engagement-progress';

import { ENGAGEMENT_PROGRESS_QUERY_KEY, type EngagementWithGame } from '@/lib/api/engagement';
import { ENGAGEMENT_PROGRESS_FIXTURE } from '@/lib/api/engagement-fixture';
import { gameBlockFixture } from '@/lib/api/game-fixture';
import type { ApiResult, HttpRequest } from '@/lib/api/http';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import { pathOf, routedTransport } from '@/test-support/routed-transport';

import { GAME_MUTATION_KEY, useGameActions, type GameActions } from './progression-game-actions';

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

const seed = (patch: Parameters<typeof gameBlockFixture>[0] = {}): EngagementWithGame => ({
  ...resolveEngagementProgress(ENGAGEMENT_PROGRESS_FIXTURE),
  game: gameBlockFixture(patch),
});

const ok = (data: unknown): ApiResult<unknown> => ({ ok: true, data });
const refused = (code: string): ApiResult<unknown> => ({ ok: false, status: 409, error: 'refus', code });

/** Monte le crochet sur un cache amorcé ; rend ses actions courantes et le cache. */
async function bench(
  view: EngagementWithGame,
  answer: (req: HttpRequest) => ApiResult<unknown> | undefined,
  hold?: Promise<ApiResult<unknown>>,
) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } });
  client.setQueryData(ENGAGEMENT_PROGRESS_QUERY_KEY, view);
  const routed = routedTransport(answer);
  const { calls } = routed;
  const transport = routed.transport;
  if (hold !== undefined) {
    const inner = transport.request.bind(transport);
    transport.request = (async (req: HttpRequest) => {
      await inner(req);
      return hold;
    }) as typeof transport.request;
  }
  let current: GameActions | null = null;
  function Probe() {
    current = useGameActions({ transport });
    return null;
  }
  await mount(
    <QueryClientProvider client={client}>
      <Probe />
    </QueryClientProvider>,
  );
  const actions = (): GameActions => {
    if (current === null) throw new Error('le crochet n’est pas monté');
    return current;
  };
  const cached = (): EngagementWithGame => client.getQueryData<EngagementWithGame>(ENGAGEMENT_PROGRESS_QUERY_KEY) ?? view;
  return { actions, cached, calls, client };
}

const settle = () => act(() => new Promise<void>((resolve) => setTimeout(resolve, 20)));
const gameOf = (v: EngagementWithGame) => {
  if (v.game === undefined) throw new Error('bloc game attendu');
  return v.game;
};

describe('les gestes en vol', () => {
  test('un geste en vol se compte parmi les gestes du jeu (le guide et les photos l’attendent)', async () => {
    const hold = new Promise<ApiResult<unknown>>(() => undefined);
    const { actions, client } = await bench(seed(), () => undefined, hold);
    await act(async () => actions().buyFreeze());
    await settle();
    expect(client.isMutating({ mutationKey: GAME_MUTATION_KEY })).toBe(1);
  });

  test('sans crypto.randomUUID (ancienne WebView Android), le geste part avec un identifiant d’idempotence', async () => {
    const original = globalThis.crypto;
    const getRandomValues = original.getRandomValues.bind(original);
    Object.defineProperty(globalThis, 'crypto', { configurable: true, value: { getRandomValues } });
    try {
      const { actions, calls } = await bench(seed(), () => ok({ status: 'bought', freezes: 1, balance: 0 }));
      await act(async () => actions().buyFreeze());
      await settle();
      const ids = calls().map((c) => (c.body as { requestId?: string }).requestId ?? '');
      expect(ids).toHaveLength(1);
      expect(ids[0]?.length ?? 0).toBeGreaterThanOrEqual(8);
    } finally {
      Object.defineProperty(globalThis, 'crypto', { configurable: true, value: original });
    }
  });
});

describe('la frappe', () => {
  test('POST sur la frappe, avec UN requestId ; le niveau redescend sans attendre', async () => {
    const before = seed();
    let land: (value: ApiResult<unknown>) => void = () => undefined;
    const hold = new Promise<ApiResult<unknown>>((resolve) => {
      land = resolve;
    });
    const { actions, cached, calls } = await bench(before, () => undefined, hold);
    await act(async () => actions().mint());
    await settle();
    expect(calls().filter((c) => pathOf(c) === '/api/v1/me/meesh/mint')).toHaveLength(1);
    expect(actions().pending.mint).toBe(true);
    expect(gameOf(cached()).level.level).toBeLessThan(gameOf(before).level.level);
    expect(gameOf(cached()).treasury.held).toBe(gameOf(before).treasury.held + 1);
    land(ok({ status: 'minted', balance: 5, mintedLifetime: 4 }));
    await settle();
    expect(actions().pending.mint).toBe(false);
  });

  test('succès : la pièce frappée est célébrée avec son numéro et son édition', async () => {
    const { actions } = await bench(seed(), (req) =>
      pathOf(req) === '/api/v1/me/meesh/mint'
        ? ok({ status: 'minted', balance: 5, mintedLifetime: 4, number: 4, edition: 'silver', price: 1221, gloryGained: 100, levelBefore: 14, levelAfter: 9 })
        : undefined,
    );
    await act(async () => actions().mint());
    await settle();
    expect(actions().celebration?.number).toBe(4);
    expect(actions().celebration?.edition).toBe('silver');
  });

  test('succès d’un ancien serveur (réponse sans numéro) : l’aperçu montré avant le geste porte le numéro', async () => {
    const before = seed();
    const { actions } = await bench(before, (req) =>
      pathOf(req) === '/api/v1/me/meesh/mint' ? ok({ status: 'minted', balance: 5, mintedLifetime: 4 }) : undefined,
    );
    await act(async () => actions().mint());
    await settle();
    expect(actions().celebration?.number).toBe(gameOf(before).mint.number);
  });

  test('échec : l’instantané est restauré et le refus se dit', async () => {
    const before = seed();
    const { actions, cached } = await bench(before, (req) =>
      pathOf(req) === '/api/v1/me/meesh/mint' ? refused('INSUFFICIENT_POINTS') : undefined,
    );
    await act(async () => actions().mint());
    await settle();
    expect(gameOf(cached()).level.score).toBe(gameOf(before).level.score);
    expect(gameOf(cached()).treasury.held).toBe(gameOf(before).treasury.held);
    expect(actions().errors.mint).toContain('points');
    expect(actions().celebration).toBeNull();
  });

  test('le requestId survit à un échec (le retry n’est pas une seconde frappe) et change après un succès', async () => {
    let attempt = 0;
    const { actions, calls } = await bench(seed(), (req) => {
      if (pathOf(req) !== '/api/v1/me/meesh/mint') return undefined;
      attempt += 1;
      return attempt === 1 ? { ok: false, status: 503, error: 'réseau' } : ok({ status: 'minted', balance: 5, mintedLifetime: 4 });
    });
    await act(async () => actions().mint());
    await settle();
    await act(async () => actions().mint());
    await settle();
    await act(async () => actions().mint());
    await settle();
    const ids = calls().map((c) => (c.body as { requestId: string }).requestId);
    expect(ids[0]).toBe(ids[1]);
    expect(ids[2]).not.toBe(ids[1]);
  });
});

describe('un identifiant déjà pris par une autre écriture (REQUEST_ID_CONFLICT)', () => {
  test('le refus se dit en toutes lettres, et le geste suivant part avec un NOUVEL identifiant', async () => {
    let attempt = 0;
    const { actions, calls } = await bench(seed(), (req) => {
      if (pathOf(req) !== '/api/v1/me/meesh/mint') return undefined;
      attempt += 1;
      return attempt === 1 ? refused('REQUEST_ID_CONFLICT') : ok({ status: 'minted', balance: 5, mintedLifetime: 4 });
    });
    await act(async () => actions().mint());
    await settle();
    expect(actions().errors.mint).toContain('identifiant');
    expect(actions().errors.mint).not.toContain('connexion');
    await act(async () => actions().mint());
    await settle();
    const ids = calls().map((c) => (c.body as { requestId: string }).requestId);
    expect(ids).toHaveLength(2);
    expect(ids[1]).not.toBe(ids[0]);
  });

  test('un refus d’un autre ordre garde l’identifiant : le retry reste le même geste', async () => {
    let attempt = 0;
    const { actions, calls } = await bench(seed(), (req) => {
      if (pathOf(req) !== '/api/v1/me/game/flame/freezes') return undefined;
      attempt += 1;
      return attempt === 1 ? refused('FREEZE_AT_MAXIMUM') : ok({ status: 'bought', freezes: 1, balance: 0 });
    });
    await act(async () => actions().buyFreeze());
    await settle();
    await act(async () => actions().buyFreeze());
    await settle();
    const ids = calls().map((c) => (c.body as { requestId: string }).requestId);
    expect(ids[1]).toBe(ids[0]);
  });
});

describe('changer une mission', () => {
  const replacement = { ...gameBlockFixture().missions.items[1]!, id: 'm-new', templateKey: 'comment-text', progress: 0 };

  test('le chemin de la mission, la remplaçante prend sa place, le solde servi fait foi', async () => {
    const { actions, cached, calls } = await bench(seed(), (req) =>
      pathOf(req) === '/api/v1/me/game/missions/m-medium/reroll' ? ok({ mission: replacement, balance: 3 }) : undefined,
    );
    await act(async () => actions().reroll('m-medium'));
    await settle();
    expect(calls()).toHaveLength(1);
    expect(gameOf(cached()).missions.items.map((m) => m.id)).toEqual(['m-easy', 'm-new', 'm-hard']);
    expect(gameOf(cached()).treasury.held).toBe(3);
  });

  test('refus (déjà changé aujourd’hui) : tout revient, et la raison se dit', async () => {
    const before = seed();
    const { actions, cached } = await bench(before, (req) =>
      pathOf(req).endsWith('/reroll') ? refused('MISSION_REROLL_EXHAUSTED') : undefined,
    );
    await act(async () => actions().reroll('m-medium'));
    await settle();
    expect(gameOf(cached()).missions.rerollAvailable).toBe(true);
    expect(gameOf(cached()).treasury.held).toBe(gameOf(before).treasury.held);
    expect(actions().errors.reroll).toContain('déjà changé');
  });
});

describe('le coffre, le gel et le rallumage', () => {
  const done = () =>
    seed({ missions: gameBlockFixture().missions.items.map((m) => ({ ...m, progress: m.target, completedAt: '2026-10-05T10:00:00.000Z' })) });

  test('le coffre s’ouvre, puis son contenu servi se pose', async () => {
    const reward = { points: 120, fragment: true, freeze: false };
    const { actions, cached } = await bench(done(), (req) =>
      pathOf(req) === '/api/v1/me/game/chest/claim' ? ok({ status: 'claimed', reward, score: 1400 }) : undefined,
    );
    await act(async () => actions().claimChest());
    await settle();
    expect(gameOf(cached()).chest.status).toBe('claimed');
    expect(gameOf(cached()).chest.reward).toEqual(reward);
  });

  test('un coffre refusé se referme', async () => {
    const { actions, cached } = await bench(done(), (req) =>
      pathOf(req) === '/api/v1/me/game/chest/claim' ? refused('CHEST_NOT_READY') : undefined,
    );
    await act(async () => actions().claimChest());
    await settle();
    expect(gameOf(cached()).chest.status).toBe('ready');
    expect(actions().errors.chest).toContain('missions');
  });

  test('un gel acheté : un de plus, le solde servi', async () => {
    const { actions, cached } = await bench(seed(), (req) =>
      pathOf(req) === '/api/v1/me/game/flame/freezes' ? ok({ status: 'bought', freezes: 2, balance: 3 }) : undefined,
    );
    await act(async () => actions().buyFreeze());
    await settle();
    expect(gameOf(cached()).treasury.held).toBeLessThanOrEqual(4);
  });

  test('un gel refusé (réserve pleine) est rendu, le message est celui du maximum', async () => {
    const before = seed();
    const { actions, cached } = await bench(before, (req) =>
      pathOf(req) === '/api/v1/me/game/flame/freezes' ? refused('FREEZE_AT_MAXIMUM') : undefined,
    );
    await act(async () => actions().buyFreeze());
    await settle();
    expect(gameOf(cached()).flame.freezes).toBe(gameOf(before).flame.freezes);
    expect(actions().errors.freeze).toContain('maximum');
  });

  test('le rallumage : la série servie, le solde servi', async () => {
    const out = seed({ streak: 9, lastActiveDay: '2026-10-03', broken: { streak: 9, lastActiveDay: '2026-10-03' }, freezes: 0, balance: 5 });
    const { actions, cached } = await bench(out, (req) =>
      pathOf(req) === '/api/v1/me/game/flame/relight' ? ok({ status: 'relit', streak: 9, balance: 2 }) : undefined,
    );
    await act(async () => actions().relight());
    await settle();
    expect(gameOf(cached()).flame.days).toBe(9);
    expect(gameOf(cached()).flame.status).toBe('lit');
    expect(gameOf(cached()).treasury.held).toBe(2);
  });
});
