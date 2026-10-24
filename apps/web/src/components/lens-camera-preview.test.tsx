import { act } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import type { Lens } from '@meeshy/shared/types/lens-format';

import type { CameraEffectsPort } from '@/lib/calls/camera-effects';
import type { LensSettings } from '@/lib/meeshy-lens/lens-stage';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { LensCameraPreview, type CameraPreviewPort } from './lens-camera-preview';

/**
 * W16 (#11322) — L'APERÇU CAMÉRA D'UNE LENS EN COMPOSITION : la caméra ne
 * s'ouvre qu'au geste, son image passe par le moteur des effets d'appel (le
 * worker), et chaque retouche du brouillon y est REPOSÉE sans rouvrir la
 * caméra. Quitter l'aperçu rend la caméra.
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(() => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

const mounter = createActMounter();
afterEach(() => mounter.unmountAll());

const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const until = async (ready: () => boolean) => {
  for (let i = 0; i < 60 && !ready(); i += 1) await act(settle);
  expect(ready()).toBe(true);
};

/** Une piste de caméra factice : le témoin ne lit que son identité. */
const fakeTrack = (label: string): MediaStreamTrack => ({ label, kind: 'video', readyState: 'live', stop: () => undefined }) as unknown as MediaStreamTrack;

const lensNamed = (name: string): Lens => ({
  schema: 1,
  id: 'aurore',
  name,
  credits: { author: 'Studio Nord', createdAt: '2026-10-24' },
  surfaces: ['capture'],
  cost: 'light',
  window: { startsAt: '2026-10-24T00:00:00Z', endsAt: '2026-11-23T23:59:59Z' },
  layers: [{ kind: 'particles', id: 'particles-1', preset: 'snow', density: 'low' }],
  triggers: [],
});

const settingsNamed = (name: string): LensSettings => ({ lens: lensNamed(name), languages: ['fr'], level: 'full' });

const harness = (acquire: () => Promise<MediaStreamTrack> = async () => fakeTrack('camera')) => {
  const camera = { current: null as MediaStreamTrack | null };
  const sent = fakeTrack('sent');
  const log: { wrapped: MediaStreamTrack[]; refreshed: (string | undefined)[]; released: MediaStreamTrack[]; attached: (MediaStreamTrack | null)[] } = { wrapped: [], refreshed: [], released: [], attached: [] };
  const lensGetter: { read: () => LensSettings | undefined } = { read: () => undefined };
  const port: CameraPreviewPort = {
    acquire: async () => (camera.current = await acquire()),
    effects: (lens): CameraEffectsPort => {
      lensGetter.read = lens;
      return {
        wrap: async (track) => {
          log.wrapped.push(track);
          return sent;
        },
        refresh: async (track) => {
          log.refreshed.push(lens()?.lens.name);
          return track;
        },
        release: (track) => void log.released.push(track),
        used: () => [],
      };
    },
    attach: (_video, track) => void log.attached.push(track),
  };
  return { port, log, sent, camera, lensGetter };
};

const deferred = <T,>() => {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
};

describe('LensCameraPreview — ce qui arrive pendant qu’un traitement se bâtit', () => {
  test('une retouche faite pendant l’ouverture de la caméra est reposée dès que l’aperçu vit', async () => {
    const opened = deferred<void>();
    const { port, log } = harness();
    const wrap = port.effects;
    const gated: CameraPreviewPort = {
      ...port,
      effects: (lens) => {
        const effects = wrap(lens);
        return { ...effects, wrap: async (track) => opened.promise.then(() => effects.wrap(track)) };
      },
    };
    const host = await mounter.mount(<LensCameraPreview language="fr" settings={settingsNamed('Aurore')} port={gated} />);
    await mounter.click(host.querySelector<HTMLElement>('[data-lens-preview-try]'));
    await mounter.rerender(host, <LensCameraPreview language="fr" settings={settingsNamed('Aurore boréale')} port={gated} />);
    await act(async () => opened.resolve());
    await until(() => host.querySelector('[data-lens-preview-live]') !== null);
    await until(() => log.refreshed.includes('Aurore boréale'));
  });

  test('arrêter pendant qu’une retouche bâtit son traitement rend aussi la piste bâtie', async () => {
    const built = deferred<MediaStreamTrack>();
    const { port, log, sent } = harness();
    const base = port.effects;
    const slow: CameraPreviewPort = { ...port, effects: (lens) => ({ ...base(lens), refresh: () => built.promise }) };
    const host = await mounter.mount(<LensCameraPreview language="fr" settings={settingsNamed('Aurore')} port={slow} />);
    await mounter.click(host.querySelector<HTMLElement>('[data-lens-preview-try]'));
    await until(() => host.querySelector('[data-lens-preview-live]') !== null);
    await mounter.rerender(host, <LensCameraPreview language="fr" settings={settingsNamed('Aurore boréale')} port={slow} />);
    await mounter.click(host.querySelector<HTMLElement>('[data-lens-preview-stop]'));
    const output = fakeTrack('built');
    await act(async () => built.resolve(output));
    await act(settle);
    expect(log.released).toEqual([sent, output]);
    expect(log.attached.at(-1)).toBeNull();
  });

  test('un moteur qui échoue à l’ouverture rend la caméra qu’on venait d’ouvrir', async () => {
    const stopped: string[] = [];
    const camera = { ...fakeTrack('camera'), stop: () => void stopped.push('camera') } as unknown as MediaStreamTrack;
    const { port } = harness(async () => camera);
    const broken: CameraPreviewPort = { ...port, effects: (lens) => ({ ...port.effects(lens), wrap: async () => Promise.reject(new Error('pipeline')) }) };
    const host = await mounter.mount(<LensCameraPreview language="fr" settings={settingsNamed('Aurore')} port={broken} />);
    await mounter.click(host.querySelector<HTMLElement>('[data-lens-preview-try]'));
    await until(() => host.querySelector('[data-lens-preview-refused]') !== null);
    expect(stopped).toEqual(['camera']);
  });
});

describe('LensCameraPreview', () => {
  test('la caméra ne s’ouvre qu’au geste, et son image passe par le moteur avec la lens du brouillon', async () => {
    const { port, log, sent, camera, lensGetter } = harness();
    const host = await mounter.mount(<LensCameraPreview language="fr" settings={settingsNamed('Aurore')} port={port} />);
    expect(camera.current).toBeNull();
    await mounter.click(host.querySelector<HTMLElement>('[data-lens-preview-try]'));
    await until(() => host.querySelector('[data-lens-preview-live]') !== null);
    expect(log.wrapped).toEqual([camera.current as MediaStreamTrack]);
    expect(log.attached.at(-1)).toBe(sent);
    expect(lensGetter.read()?.lens.name).toBe('Aurore');
  });

  test('une retouche du brouillon est reposée sur l’image en cours, sans rouvrir la caméra', async () => {
    const { port, log } = harness();
    const host = await mounter.mount(<LensCameraPreview language="fr" settings={settingsNamed('Aurore')} port={port} />);
    await mounter.click(host.querySelector<HTMLElement>('[data-lens-preview-try]'));
    await until(() => host.querySelector('[data-lens-preview-live]') !== null);
    await mounter.rerender(host, <LensCameraPreview language="fr" settings={settingsNamed('Aurore boréale')} port={port} />);
    await until(() => log.refreshed.includes('Aurore boréale'));
    expect(log.wrapped).toHaveLength(1);
  });

  test('arrêter ou quitter l’aperçu rend la caméra', async () => {
    const { port, log, sent } = harness();
    const host = await mounter.mount(<LensCameraPreview language="fr" settings={settingsNamed('Aurore')} port={port} />);
    await mounter.click(host.querySelector<HTMLElement>('[data-lens-preview-try]'));
    await until(() => host.querySelector('[data-lens-preview-live]') !== null);
    await mounter.click(host.querySelector<HTMLElement>('[data-lens-preview-stop]'));
    expect(log.released).toEqual([sent]);
    expect(host.querySelector('[data-lens-preview-live]')).toBeNull();

    await mounter.click(host.querySelector<HTMLElement>('[data-lens-preview-try]'));
    await until(() => host.querySelector('[data-lens-preview-live]') !== null);
    mounter.unmountAll();
    expect(log.released).toEqual([sent, sent]);
  });

  test('une caméra refusée se dit, sans rien casser', async () => {
    const { port } = harness(async () => {
      throw Object.assign(new Error('denied'), { name: 'NotAllowedError' });
    });
    const host = await mounter.mount(<LensCameraPreview language="fr" settings={settingsNamed('Aurore')} port={port} />);
    await mounter.click(host.querySelector<HTMLElement>('[data-lens-preview-try]'));
    await until(() => host.querySelector('[data-lens-preview-refused]') !== null);
    expect(host.querySelector('[data-lens-preview-refused]')?.textContent).toBe('La caméra n’est pas disponible.');
  });
});
