import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { act, useEffect } from 'react';

import type { CameraEngine } from '@/lib/stories/studio-camera-engine';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { useStudioQuickCapture } from './use-studio-quick-capture';

/**
 * #10307 — **LA CAMÉRA S'ARME VITE** : le flux est demandé AU GESTE qui ouvre
 * la caméra, pendant que son écran se charge, et l'écran le reprend — une
 * seule demande, jamais deux ; un flux que personne n'a repris est relâché.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
beforeAll(async () => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await import('@/routes/story-compose-camera');
});
afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});
const mounter = createActMounter();
afterEach(() => mounter.unmountAll());

function fakeEngine() {
  const journal: string[] = [];
  const stream = new MediaStream();
  const engine: CameraEngine = {
    open: async (facing) => {
      journal.push(`open:${facing}`);
      return { ok: true, stream, torch: false, zoom: { mode: 'preview', min: 1, max: 1, step: 0 } };
    },
    live: async () => undefined,
    lit: async () => undefined,
    setTorch: async () => undefined,
    photo: async () => null,
    setZoom: async () => undefined,
    startRecording: () => undefined,
    stopRecording: async () => null,
    release: () => {
      journal.push('release');
    },
    maxBrightness: async () => null,
  };
  return { engine, journal };
}

type Opener = { current: (() => void) | null };

function Probe({ engine, opener }: { readonly engine: CameraEngine; readonly opener: Opener }) {
  const quick = useStudioQuickCapture({
    lang: 'fr',
    kind: 'STORY',
    scene: { pageBlank: true, toolOpen: false, timelineOpen: false, retouching: false, locked: false },
    onTake: () => undefined,
    engine,
  });
  useEffect(() => {
    opener.current = quick.capture?.onTap ?? null;
  });
  return <div>{quick.cameraLayer}</div>;
}

async function settle() {
  for (let i = 0; i < 8; i += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

describe('useStudioQuickCapture — le flux demandé au geste (#10307)', () => {
  test('le toucher qui ouvre la caméra demande le flux AUSSITÔT, et l’écran chargé le reprend sans en redemander', async () => {
    const { engine, journal } = fakeEngine();
    const opener: Opener = { current: null };
    await mounter.mount(<Probe engine={engine} opener={opener} />);
    act(() => opener.current?.());
    expect(journal).toEqual(['open:environment']);
    await settle();
    expect(document.querySelector('[data-story-camera="live"]')).not.toBeNull();
    expect(journal).toEqual(['open:environment']);
  });

  test('ouverte puis quittée : le flux est relâché une fois', async () => {
    const { engine, journal } = fakeEngine();
    const opener: Opener = { current: null };
    await mounter.mount(<Probe engine={engine} opener={opener} />);
    act(() => opener.current?.());
    await settle();
    act(() => document.querySelector<HTMLButtonElement>('[data-story-camera-close]')?.click());
    await settle();
    expect(journal).toEqual(['open:environment', 'release']);
  });

  test('l’écran disparu avant d’avoir repris le flux : il est relâché quand même', async () => {
    const { engine, journal } = fakeEngine();
    const opener: Opener = { current: null };
    await mounter.mount(<Probe engine={engine} opener={opener} />);
    act(() => opener.current?.());
    mounter.unmountAll();
    await settle();
    expect(journal).toEqual(['open:environment', 'release']);
  });
});

function ArmedProbe() {
  const quick = useStudioQuickCapture({
    lang: 'fr',
    kind: 'STORY',
    scene: { pageBlank: true, toolOpen: false, timelineOpen: false, retouching: false, locked: false },
    onTake: () => undefined,
    armsOnOpen: true,
  });
  return <div>{quick.cameraLayer}</div>;
}

describe('useStudioQuickCapture — le moteur du navigateur, chargé à la demande (#10322)', () => {
  test('sans moteur injecté, la caméra ouverte armée se monte une fois le moteur chargé', async () => {
    await mounter.mount(<ArmedProbe />);
    for (let i = 0; i < 40 && document.querySelector('[data-story-camera]') === null; i += 1) await settle();
    expect(document.querySelector('[data-story-camera]')).not.toBeNull();
  });
});
