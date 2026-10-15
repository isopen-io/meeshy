import { act } from 'react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test';

import type { LottieHandle, LottiePlayer } from '@/lib/lottie/engine';
import { createActMounter } from '@/test-support/act-mount';
import { createFakeIntersectionObservers } from '@/test-support/fake-intersection-observer';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { LottieLayer } from './lottie-layer';

/**
 * LA COUCHE ANIMÉE NE COÛTE RIEN TANT QU'ELLE NE SERT PAS (#10638) — montage
 * paresseux, image fixe sous « Réduire les animations », destruction au
 * démontage, repli silencieux sur un JSON refusé. Le moteur est un faux : le
 * témoin mesure le CONTRAT de la couche, pas le rendu de `lottie-web`.
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const observers = createFakeIntersectionObservers();
const mounter = createActMounter();
let nativeObserver: typeof IntersectionObserver | undefined;
let nativeMatchMedia: typeof window.matchMedia | undefined;

const animation = { v: '5.7.0', fr: 30, ip: 0, op: 60, w: 100, h: 100, layers: [{ ty: 4 }] };
const bytesOf = (value: unknown): Uint8Array => new TextEncoder().encode(JSON.stringify(value));

type Probe = { loads: number; engineLoads: number; created: number; plays: number; pauses: number; destroys: number; lastData: unknown };
const probe = (): Probe => ({ loads: 0, engineLoads: 0, created: 0, plays: 0, pauses: 0, destroys: 0, lastData: null });

function fakeEngine(state: Probe) {
  const handle: LottieHandle = { play: () => void (state.plays += 1), pause: () => void (state.pauses += 1), destroy: () => void (state.destroys += 1) };
  const player: LottiePlayer = {
    loadAnimation: (args) => {
      state.created += 1;
      state.lastData = args.animationData;
      return handle;
    },
  };
  return async () => {
    state.engineLoads += 1;
    return player;
  };
}

const setReducedMotion = (reduced: boolean): void => {
  window.matchMedia = ((query: string) => ({ matches: reduced && query.includes('reduced-motion'), media: query, addEventListener: () => undefined, removeEventListener: () => undefined })) as unknown as typeof window.matchMedia;
};

beforeAll(() => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  nativeObserver = globalThis.IntersectionObserver;
  nativeMatchMedia = window.matchMedia;
});

afterAll(async () => {
  await act(async () => {});
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

beforeEach(() => {
  observers.reset();
  globalThis.IntersectionObserver = observers.FakeIntersectionObserver as unknown as typeof IntersectionObserver;
  setReducedMotion(false);
});

afterEach(() => {
  mounter.unmountAll();
  if (nativeObserver !== undefined) globalThis.IntersectionObserver = nativeObserver;
  if (nativeMatchMedia !== undefined) window.matchMedia = nativeMatchMedia;
});

const mountLayer = async (state: Probe, data: unknown = animation) =>
  mounter.mount(
    <LottieLayer
      sourceKey="test"
      load={async () => {
        state.loads += 1;
        return bytesOf(data);
      }}
      player={fakeEngine(state)}
    />,
  );

const becomeVisible = async (ratio = 1): Promise<void> => {
  await act(async () => {
    observers.emitAll(ratio);
  });
  await mounter.settle();
};

describe('la couche animée Lottie', () => {
  test('montage paresseux : ni octets ni moteur avant la première visibilité', async () => {
    const state = probe();
    const host = await mountLayer(state);
    expect(host.querySelector('[data-lottie-layer]')).not.toBeNull();
    expect(state).toMatchObject({ loads: 0, engineLoads: 0, created: 0 });
    await becomeVisible();
    expect(state).toMatchObject({ loads: 1, engineLoads: 1, created: 1, plays: 1 });
    expect(state.lastData).toEqual(animation);
  });

  test('hors écran, la lecture se met en pause ; de retour, elle reprend', async () => {
    const state = probe();
    await mountLayer(state);
    await becomeVisible();
    await becomeVisible(0);
    expect(state.pauses).toBeGreaterThanOrEqual(1);
    const playsBefore = state.plays;
    await becomeVisible(1);
    expect(state.plays).toBe(playsBefore + 1);
    expect(state.created).toBe(1);
  });

  test('un onglet caché met la lecture en pause', async () => {
    const state = probe();
    await mountLayer(state);
    await becomeVisible();
    const pausesBefore = state.pauses;
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    Reflect.deleteProperty(document, 'hidden');
    expect(state.pauses).toBe(pausesBefore + 1);
  });

  test('sous « Réduire les animations », rien ne se charge ni ne se monte : l’image fixe reste', async () => {
    setReducedMotion(true);
    const state = probe();
    const host = await mountLayer(state);
    await becomeVisible();
    expect(state).toMatchObject({ loads: 0, engineLoads: 0, created: 0 });
    expect(observers.live()).toHaveLength(0);
    expect(host.querySelector('svg')).toBeNull();
  });

  test('le démontage détruit l’animation et libère l’observateur', async () => {
    const state = probe();
    await mountLayer(state);
    await becomeVisible();
    expect(observers.live()).toHaveLength(1);
    mounter.unmountAll();
    expect(state.destroys).toBe(1);
    expect(observers.live()).toHaveLength(0);
  });

  test('un démontage avant l’arrivée des octets ne crée aucune animation', async () => {
    const state = probe();
    let release: (bytes: Uint8Array) => void = () => undefined;
    await mounter.mount(<LottieLayer sourceKey="lent" load={() => new Promise<Uint8Array>((resolve) => (release = resolve))} player={fakeEngine(state)} />);
    await becomeVisible();
    mounter.unmountAll();
    await act(async () => {
      release(bytesOf(animation));
    });
    await mounter.settle();
    expect(state.created).toBe(0);
  });

  test('un JSON invalide est rejeté en silence : aucun moteur chargé, aucune erreur', async () => {
    const state = probe();
    await mountLayer(state, { ...animation, fr: 500 });
    await becomeVisible();
    expect(state.loads).toBe(1);
    expect(state).toMatchObject({ engineLoads: 0, created: 0 });
  });

  test('des octets absents (réseau, empreinte) laissent l’image fixe, sans bruit', async () => {
    const state = probe();
    await mounter.mount(<LottieLayer sourceKey="vide" load={async () => null} player={fakeEngine(state)} />);
    await becomeVisible();
    expect(state).toMatchObject({ engineLoads: 0, created: 0 });
  });
});
