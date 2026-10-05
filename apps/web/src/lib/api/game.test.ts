import { describe, expect, test } from 'bun:test';

import { GAME_ROUTES } from '@meeshy/shared/types/game-routes';

import { claimChest, buyFlameFreeze, markGuideSeen, readGameBlock, relightFlame, rerollMission } from './game';
import { gameBlockFixture } from './game-fixture';
import { createHttpTransport } from './http';

/**
 * LE PORT DU JEU (#9383) — la garde de frontière du bloc `game` et les cinq
 * écritures, chacune avec le chemin, le verbe et l'`requestId` que la
 * passerelle attend.
 */

type Call = { readonly url: string; readonly init: RequestInit | undefined };

function transportServing(body: unknown, options: { readonly status?: number; readonly calls?: Call[] } = {}) {
  const fetchImpl: typeof fetch = async (input, init) => {
    options.calls?.push({ url: String(input), init });
    return new Response(JSON.stringify(body), {
      status: options.status ?? 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  return createHttpTransport({
    base: 'https://gate.test',
    credential: () => ({ kind: 'registered', token: 'jwt-test' }),
    fetchImpl,
    timeoutMs: 0,
  });
}

describe('readGameBlock — jamais à moitié lu', () => {
  test('le bloc que la loi partagée construit est lu tel quel', () => {
    const block = gameBlockFixture();
    expect(readGameBlock(block)).toEqual(block);
  });

  test('absent (ancien serveur) : null', () => {
    expect(readGameBlock(undefined)).toBeNull();
  });

  test('une valeur qui n’est pas un objet : null', () => {
    expect(readGameBlock('game')).toBeNull();
    expect(readGameBlock(null)).toBeNull();
  });

  test('un sous-bloc manquant refuse le bloc ENTIER', () => {
    const { flame: _flame, ...sansFlamme } = gameBlockFixture();
    expect(readGameBlock(sansFlamme)).toBeNull();
  });

  test('un niveau en chaîne refuse le bloc entier', () => {
    const block = gameBlockFixture();
    expect(readGameBlock({ ...block, level: { ...block.level, level: '14' } })).toBeNull();
  });

  test('un palier inconnu refuse le bloc : la clé est celle que chaque client habille', () => {
    const block = gameBlockFixture();
    expect(readGameBlock({ ...block, level: { ...block.level, tier: 'supernova' } })).toBeNull();
  });

  test('un gabarit de mission futur (clé libre) ne casse pas l’écran', () => {
    const block = gameBlockFixture();
    const [first, ...rest] = block.missions.items;
    if (first === undefined) throw new Error('la fixture porte des missions');
    const futur = { ...block, missions: { ...block.missions, items: [{ ...first, templateKey: 'gabarit-de-2027' }, ...rest] } };
    expect(readGameBlock(futur)?.missions.items[0]?.templateKey).toBe('gabarit-de-2027');
  });

  test('un coffre ouvert porte sa récompense, un coffre fermé non', () => {
    const open = gameBlockFixture({ chestClaimed: true, chestReward: { points: 90, fragment: true, freeze: false } });
    expect(readGameBlock(open)?.chest.reward).toEqual({ points: 90, fragment: true, freeze: false });
  });
});

describe('les écritures du jeu', () => {
  test('changer une mission : POST sur le chemin de LA mission, avec son requestId', async () => {
    const calls: Call[] = [];
    const block = gameBlockFixture();
    const mission = block.missions.items[1];
    if (mission === undefined) throw new Error('mission attendue');
    const transport = transportServing({ success: true, data: { mission, balance: 3 } }, { calls });

    const result = await rerollMission(transport, 'm-medium', 'req-0001-abcd');

    expect(calls[0]?.url).toBe(`https://gate.test/api/v1${GAME_ROUTES.missionReroll.replace(':missionId', 'm-medium')}`);
    expect(calls[0]?.init?.method).toBe('POST');
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({ requestId: 'req-0001-abcd' });
    expect(result.ok && result.data.balance).toBe(3);
  });

  test('le coffre : status et récompense relus', async () => {
    const calls: Call[] = [];
    const transport = transportServing(
      { success: true, data: { status: 'claimed', reward: { points: 120, fragment: false, freeze: true }, score: 1400 } },
      { calls },
    );
    const result = await claimChest(transport, 'req-0002-abcd');
    expect(calls[0]?.url).toBe(`https://gate.test/api/v1${GAME_ROUTES.chestClaim}`);
    expect(result.ok && result.data.reward.freeze).toBe(true);
  });

  test('un gel : solde et gels relus', async () => {
    const calls: Call[] = [];
    const transport = transportServing({ success: true, data: { status: 'bought', freezes: 2, balance: 3 } }, { calls });
    const result = await buyFlameFreeze(transport, 'req-0003-abcd');
    expect(calls[0]?.url).toBe(`https://gate.test/api/v1${GAME_ROUTES.flameFreezes}`);
    expect(result.ok && result.data.freezes).toBe(2);
  });

  test('le rallumage : série et solde relus', async () => {
    const calls: Call[] = [];
    const transport = transportServing({ success: true, data: { status: 'relit', streak: 12, balance: 1 } }, { calls });
    const result = await relightFlame(transport, 'req-0004-abcd');
    expect(calls[0]?.url).toBe(`https://gate.test/api/v1${GAME_ROUTES.flameRelight}`);
    expect(result.ok && result.data.streak).toBe(12);
  });

  test('moments vus : les clés partent, la liste relue revient', async () => {
    const calls: Call[] = [];
    const transport = transportServing({ success: true, data: { guideSeen: ['onboarding.welcome'] } }, { calls });
    const result = await markGuideSeen(transport, 'req-0005-abcd', ['onboarding.welcome']);
    expect(calls[0]?.url).toBe(`https://gate.test/api/v1${GAME_ROUTES.guideSeen}`);
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({ requestId: 'req-0005-abcd', keys: ['onboarding.welcome'] });
    expect(result.ok && result.data.guideSeen).toEqual(['onboarding.welcome']);
  });

  test('une réponse illisible est un échec nommé, pas une valeur crue', async () => {
    const transport = transportServing({ success: true, data: { status: 'claimed', reward: 'beaucoup' } });
    const result = await claimChest(transport, 'req-0006-abcd');
    expect(result.ok).toBe(false);
    expect(!result.ok && result.code).toBe('MALFORMED_PAYLOAD');
  });

  test('un refus de la passerelle garde son code (409 INSUFFICIENT_MEESHES)', async () => {
    const transport = transportServing({ success: false, error: 'Pas assez', code: 'INSUFFICIENT_MEESHES' }, { status: 409 });
    const result = await buyFlameFreeze(transport, 'req-0007-abcd');
    expect(!result.ok && result.code).toBe('INSUFFICIENT_MEESHES');
  });
});
