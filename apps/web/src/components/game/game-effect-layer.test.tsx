import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import type { EffectEnv } from '@/lib/game/gl/effect-runner';
import type { GameGl } from '@/lib/game/gl/engine';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { GameEffectLayer } from './game-effect-layer';

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(() => {
  ensureHappyDomRegistered({ url: 'http://localhost/game' });
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

const mounter = createActMounter();
afterEach(() => mounter.unmountAll());

const harness = (o: { readonly gl?: boolean; readonly reduced?: boolean } = {}) => {
  const stats = { disposed: 0, rafRequests: 0, created: 0 };
  const gl: GameGl = { programCount: 3, render: () => undefined, clear: () => undefined, resize: () => undefined, dispose: () => void (stats.disposed += 1) };
  const env: EffectEnv = {
    reducedMotion: o.reduced ?? false,
    createGl: () => {
      stats.created += 1;
      return o.gl === false ? null : gl;
    },
    raf: () => (stats.rafRequests += 1),
    cancelRaf: () => undefined,
    observeVisibility: () => () => undefined,
    observeOrientation: () => null,
  };
  return { stats, createEnv: () => env };
};

describe('GameEffectLayer — le canvas des effets', () => {
  test('un canvas décoratif, posé sur son hôte sans jamais intercepter un geste', async () => {
    const h = harness();
    const host = await mounter.mount(<GameEffectLayer effect="sheen" circle createEnv={h.createEnv} />);
    const canvas = host.querySelector('canvas');
    expect(canvas?.getAttribute('aria-hidden')).toBe('true');
    expect(canvas?.getAttribute('data-game-effect')).toBe('sheen');
    expect(canvas?.style.pointerEvents).toBe('none');
    expect(canvas?.style.position).toBe('absolute');
  });

  test('WebGL2 disponible : l’hôte le dit (le trait SVG du repli se tait) ; le démontage nettoie tout', async () => {
    const h = harness();
    const host = await mounter.mount(<GameEffectLayer effect="sheen" createEnv={h.createEnv} />);
    expect(host.getAttribute('data-game-gl')).toBe('on');
    expect(h.stats.rafRequests).toBeGreaterThan(0);
    mounter.unmountAll();
    expect(h.stats.disposed).toBe(1);
  });

  test('WebGL2 absent : l’hôte le dit — le repli CSS joue', async () => {
    const h = harness({ gl: false });
    const host = await mounter.mount(<GameEffectLayer effect="sheen" createEnv={h.createEnv} />);
    expect(host.getAttribute('data-game-gl')).toBe('off');
    expect(h.stats.rafRequests).toBe(0);
  });

  test('animations réduites : aucun contexte créé, l’hôte dit « off »', async () => {
    const h = harness({ reduced: true });
    const host = await mounter.mount(<GameEffectLayer effect="shockwave" createEnv={h.createEnv} />);
    expect(host.getAttribute('data-game-gl')).toBe('off');
    expect(h.stats.created).toBe(0);
  });

  test('replayKey qui change : l’effet repart ; inchangé, il ne repart pas', async () => {
    const h = harness();
    const host = await mounter.mount(<GameEffectLayer effect="sheen" replayKey={0} createEnv={h.createEnv} />);
    const requested = h.stats.rafRequests;
    await mounter.rerender(host, <GameEffectLayer effect="sheen" replayKey={0} createEnv={h.createEnv} />);
    expect(h.stats.rafRequests).toBe(requested);
    await mounter.rerender(host, <GameEffectLayer effect="sheen" replayKey={1} createEnv={h.createEnv} />);
    expect(h.stats.created).toBe(1);
  });

  test('changer d’effet libère le contexte de l’ancien avant d’en créer un autre', async () => {
    const h = harness();
    const host = await mounter.mount(<GameEffectLayer effect="sheen" createEnv={h.createEnv} />);
    await mounter.rerender(host, <GameEffectLayer effect="shockwave" createEnv={h.createEnv} />);
    expect(h.stats.disposed).toBe(1);
    expect(h.stats.created).toBe(2);
  });
});
