import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act } from 'react';

import { levelThreshold } from '@meeshy/shared/utils/game/levels';
import { resolveEngagementProgress } from '@meeshy/shared/utils/engagement-progress';

import { ENGAGEMENT_PROGRESS_QUERY_KEY, type EngagementWithGame } from '@/lib/api/engagement';
import { ENGAGEMENT_PROGRESS_FIXTURE } from '@/lib/api/engagement-fixture';
import { gameBlockWithExtrasFixture } from '@/lib/api/game-fixture';
import { LEAGUE_WEEK_QUERY_KEY } from '@/lib/api/game-v2-queries';
import { leagueWeekFixture } from '@/lib/api/game-v2-queries-fixture';
import type { ApiResult, HttpRequest } from '@/lib/api/http';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import { pathOf, routedTransport } from '@/test-support/routed-transport';

import { GAME_MUTATION_KEY } from './progression-game-actions';
import { useGameV2Actions, type GameV2Actions } from './game-v2-actions';

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const { mount, unmountAll } = createActMounter();

beforeAll(() => {
  ensureHappyDomRegistered({ url: 'http://localhost/me/progression/ligue' });
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});
afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});
afterEach(unmountAll);

const seed = (facts: Parameters<typeof gameBlockWithExtrasFixture>[0] = {}, extras: Parameters<typeof gameBlockWithExtrasFixture>[1] = {}): EngagementWithGame => ({
  ...resolveEngagementProgress(ENGAGEMENT_PROGRESS_FIXTURE),
  game: gameBlockWithExtrasFixture(facts, extras),
});
const asking = (): EngagementWithGame => seed({}, { league: { consented: false, pseudonym: null, group: null, friendIds: [], friendsWeekPoints: {} } });

const ok = (data: unknown): ApiResult<unknown> => ({ ok: true, data });
const refused = (code: string): ApiResult<unknown> => ({ ok: false, status: 409, error: 'refus', code });

async function bench(view: EngagementWithGame, answer: (req: HttpRequest) => ApiResult<unknown> | undefined, hold?: Promise<ApiResult<unknown>>) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } });
  client.setQueryData(ENGAGEMENT_PROGRESS_QUERY_KEY, view);
  const routed = routedTransport(answer);
  const transport = routed.transport;
  if (hold !== undefined) {
    const inner = transport.request.bind(transport);
    transport.request = (async (req: HttpRequest) => {
      await inner(req);
      return hold;
    }) as typeof transport.request;
  }
  let current: GameV2Actions | null = null;
  function Probe() {
    current = useGameV2Actions({ transport });
    return null;
  }
  await mount(
    <QueryClientProvider client={client}>
      <Probe />
    </QueryClientProvider>,
  );
  const actions = (): GameV2Actions => {
    if (current === null) throw new Error('le crochet n’est pas monté');
    return current;
  };
  const cached = (): EngagementWithGame => client.getQueryData<EngagementWithGame>(ENGAGEMENT_PROGRESS_QUERY_KEY) ?? view;
  return { actions, cached, calls: routed.calls, client };
}

const settle = () => act(() => new Promise<void>((resolve) => setTimeout(resolve, 20)));
const gameOf = (v: EngagementWithGame) => {
  if (v.game === undefined) throw new Error('bloc game attendu');
  return v.game;
};

/**
 * LES GESTES DE LA VAGUE 2 (#9481) — capturer, appliquer en local, envoyer,
 * restaurer en cas de refus. Un identifiant d’idempotence par intention, rejoué
 * après un échec réseau, renouvelé après un succès. Chaque geste compte parmi
 * les gestes du jeu (le guide et les photos attendent qu’il soit réglé).
 */
describe('le consentement à la ligue', () => {
  test('POST avec le pseudonyme choisi : la ligue s’ouvre tout de suite, le pseudonyme tiré se pose à la réponse', async () => {
    let land: (value: ApiResult<unknown>) => void = () => undefined;
    const hold = new Promise<ApiResult<unknown>>((resolve) => {
      land = resolve;
    });
    const { actions, cached, calls } = await bench(asking(), () => ok({ consent: true, pseudonym: 'Colibri-0042' }), hold);
    await act(async () => actions().consent.run({ consent: true }));
    await settle();
    expect(gameOf(cached()).league?.access).toBe('open');
    expect(gameOf(cached()).league?.pseudonym).toBeNull();
    land(ok({ consent: true, pseudonym: 'Colibri-0042' }));
    await settle();
    expect(gameOf(cached()).league?.pseudonym).toBe('Colibri-0042');
    expect(calls().map((c) => `${c.method} ${pathOf(c)}`)).toEqual(['POST /api/v1/me/game/league/consent']);
  });

  test('un refus de la passerelle restaure l’écran d’avant et dit pourquoi', async () => {
    const { actions, cached } = await bench(asking(), () => refused('LEAGUE_PSEUDONYM_TAKEN'));
    await act(async () => actions().consent.run({ consent: true, pseudonym: 'Aigrette-77' }));
    await settle();
    expect(gameOf(cached()).league?.access).toBe('consent-required');
    expect(actions().consent.error).toBe('Ce pseudonyme est déjà pris.');
  });

  test('quitter la ligue retire le classement du cache : les pseudonymes des autres ne restent pas sur l’appareil', async () => {
    const { actions, client } = await bench(seed(), () => ok({ consent: false, pseudonym: null }));
    client.setQueryData(LEAGUE_WEEK_QUERY_KEY, leagueWeekFixture());
    await act(async () => actions().consent.run({ consent: false }));
    await settle();
    expect(client.getQueryData(LEAGUE_WEEK_QUERY_KEY)).toBeUndefined();
  });

  test('l’identifiant d’idempotence est rejoué après un échec réseau, renouvelé après un succès', async () => {
    const answers: ApiResult<unknown>[] = [
      { ok: false, status: 0, error: 'réseau' },
      ok({ consent: true, pseudonym: 'Colibri-0042' }),
      ok({ consent: true, pseudonym: 'Colibri-0042' }),
    ];
    const { actions, calls } = await bench(asking(), () => answers.shift());
    await act(async () => actions().consent.run({ consent: true }));
    await settle();
    await act(async () => actions().consent.run({ consent: true }));
    await settle();
    await act(async () => actions().consent.run({ consent: true }));
    await settle();
    const ids = calls().map((c) => (c.body as { requestId: string }).requestId);
    expect(ids[1]).toBe(ids[0]);
    expect(ids[2]).not.toBe(ids[1]);
  });

  test('un geste en vol se compte parmi les gestes du jeu', async () => {
    const hold = new Promise<ApiResult<unknown>>(() => undefined);
    const { actions, client } = await bench(asking(), () => undefined, hold);
    await act(async () => actions().consent.run({ consent: true }));
    await settle();
    expect(client.isMutating({ mutationKey: GAME_MUTATION_KEY })).toBe(1);
  });
});

describe('le duo', () => {
  test('inviter : l’invitation s’affiche tout de suite, l’identifiant du duo se pose à la réponse', async () => {
    const none: EngagementWithGame = (() => {
      const v = seed();
      return v.game?.duo === undefined ? v : { ...v, game: { ...v.game, duo: { ...v.game.duo, unlocked: true, status: 'none', duoId: null, role: null, partner: null, mission: null, progress: null, reward: null } } };
    })();
    const { actions, cached, calls } = await bench(none, () => ok({ status: 'invited', duoId: 'duo-7', weekKey: '2026-11-02' }));
    await act(async () => actions().invite.run({ id: 'friend-2', displayName: 'Léa' }));
    await settle();
    expect(gameOf(cached()).duo).toMatchObject({ status: 'invited', duoId: 'duo-7', partner: { userId: 'friend-2', displayName: 'Léa' } });
    expect(calls()[0]?.body).toMatchObject({ friendId: 'friend-2' });
  });

  test('quitter le duo : POST sur le chemin du duo', async () => {
    const { actions, cached, calls } = await bench(seed(), () => ok({ status: 'abandoned', duoId: 'duo-1' }));
    await act(async () => actions().abandon.run('duo-1'));
    await settle();
    expect(gameOf(cached()).duo?.status).toBe('abandoned');
    expect(pathOf(calls()[0] as HttpRequest)).toBe('/api/v1/me/game/duo/duo-1/abandon');
  });
});

describe('la saison', () => {
  test('réclamer une étape : l’étape se marque, un refus la rend', async () => {
    const { actions, cached } = await bench(seed(), () => refused('SEASON_STEP_ALREADY_CLAIMED'));
    await act(async () => actions().claimStep.run(4));
    await settle();
    expect(gameOf(cached()).season?.claimedSteps).toEqual([1, 2, 3]);
    expect(actions().claimStep.error).toBe('Cette étape est déjà réclamée.');
  });

  test('réclamer avec succès : l’étape reste marquée, le geste porte le numéro d’étape', async () => {
    const claim = { status: 'claimed', step: 4, reward: { kind: 'points', amount: 100 }, seal: null, completed: false, gloryGained: 0, score: 1300 };
    const { actions, cached, calls } = await bench(seed(), () => ok(claim));
    await act(async () => actions().claimStep.run(4));
    await settle();
    expect(gameOf(cached()).season?.claimedSteps).toEqual([1, 2, 3, 4]);
    expect(pathOf(calls()[0] as HttpRequest)).toBe('/api/v1/me/game/season/steps/4/claim');
  });

  test('acheter le Sceau : possédé et le solde baisse', async () => {
    const { actions, cached } = await bench(seed({ balance: 12 }), () => ok({ status: 'bought', balance: 2 }));
    await act(async () => actions().buySeal.run());
    await settle();
    expect(gameOf(cached()).season?.sealOwned).toBe(true);
  });
});

describe('la vitrine, la visibilité, le Prestige', () => {
  test('ranger la vitrine : l’ordre change tout de suite', async () => {
    const { actions, cached } = await bench(seed(), () => ok({ order: ['trophy.flame.100'] }));
    await act(async () => actions().saveOrder.run(['trophy.flame.100']));
    await settle();
    expect(gameOf(cached()).trophies?.order).toEqual(['trophy.flame.100']);
  });

  test('un réglage de visibilité refusé est restauré', async () => {
    const { actions, cached } = await bench(seed(), () => ({ ok: false, status: 500, error: 'panne' }));
    await act(async () => actions().visibility.run({ showcase: 'everyone' }));
    await settle();
    expect(gameOf(cached()).visibility?.showcase).toBe('friends');
    expect(actions().visibility.error).toBe('Ça n’a pas abouti — vérifie ta connexion et réessaie.');
  });

  test('le Prestige : le niveau repart tout de suite ; refusé, il revient', async () => {
    const top = seed({ score: levelThreshold(100) + 40, prestige: 1 });
    const okRun = await bench(top, () => ok({ status: 'passed', prestige: 2, score: 0, level: 1, gloryGained: 1000, trophyKey: 'trophy.prestige.2' }));
    await act(async () => okRun.actions().prestige.run());
    await settle();
    expect(gameOf(okRun.cached()).level.level).toBe(1);
    unmountAll();
    const refusedRun = await bench(top, () => refused('PRESTIGE_LEVEL_TOO_LOW'));
    await act(async () => refusedRun.actions().prestige.run());
    await settle();
    expect(gameOf(refusedRun.cached()).level.level).toBe(100);
    expect(refusedRun.actions().prestige.error).toBe('Le Prestige s’ouvre au niveau 100.');
  });
});
