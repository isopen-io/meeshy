import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { CallButton } from '@/components/call-glass-button';
import { localZoomFor, selfZoomStore, setLocalZoom, useLocalZoom } from '@/lib/calls/self-zoom';
import { loadCallControlsCatalog } from '@/lib/i18n-call-controls-catalog';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { CallZoomStep } from './call-self-camera';

/**
 * LE CRAN DU ZOOM DANS MA VIGNETTE (#8441) — « 1× » à côté de Retourner : un
 * toucher passe au cran suivant (1× · 2× · 5×, puis 1×), par le zoom de la
 * caméra quand elle en a un, sinon par le zoom numérique de l'image ENVOYÉE —
 * et pas de cran du tout là où l'image envoyée ne peut pas être recadrée.
 */

type FakeCamera = { kind: 'video'; readyState: 'live'; zoom: number; applied: number[]; getCapabilities: () => Record<string, unknown>; getSettings: () => Record<string, unknown>; applyConstraints: (c: { advanced: Array<{ zoom: number }> }) => Promise<void> };

const fakeCamera = (withZoom: boolean): FakeCamera => {
  const self: FakeCamera = {
    kind: 'video',
    readyState: 'live',
    zoom: 1,
    applied: [],
    getCapabilities: () => (withZoom ? { zoom: { min: 1, max: 10, step: 0.1 } } : {}),
    getSettings: () => ({ zoom: self.zoom }),
    applyConstraints: async (c) => {
      self.zoom = c.advanced[0]?.zoom ?? self.zoom;
      self.applied.push(self.zoom);
    },
  };
  return self;
};

const streamOf = (camera: FakeCamera): MediaStream => ({ getVideoTracks: () => [camera], getAudioTracks: () => [], getTracks: () => [camera] }) as unknown as MediaStream;

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(async () => {
  await loadCallControlsCatalog('fr');
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(async () => {
  await act(async () => {});
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

function Step({ stream }: { readonly stream: MediaStream }) {
  const local = useLocalZoom('call-z', 'user');
  return <CallZoomStep stream={stream} local={local} language="fr" Button={CallButton} rowItem="data-row-item" />;
}

const mount = (camera: FakeCamera) => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => root.render(<Step stream={streamOf(camera)} />));
  const step = () => host.querySelector<HTMLButtonElement>('[data-call-self-control="zoom"]');
  const done = () => {
    act(() => root.unmount());
    host.remove();
  };
  return { step, done };
};

describe('le cran du zoom dans ma vignette', () => {
  test('caméra coupée : pas de cran', () => {
    const host = document.createElement('div');
    const root = createRoot(host);
    act(() => root.render(<CallZoomStep stream={null} local={{ value: 1, set: () => undefined }} language="fr" Button={CallButton} rowItem="data-row-item" />));
    expect(host.querySelector('[data-call-self-control="zoom"]')).toBeNull();
    act(() => root.unmount());
  });

  test('dans ma vignette, un cran « 1× » ; un toucher zoome la caméra à 2×, puis 5×', async () => {
    const camera = fakeCamera(true);
    const view = mount(camera);
    expect(view.step()?.textContent).toBe('1×');
    expect(view.step()?.getAttribute('aria-label')).toBe('Zoom de ma caméra, 1×');
    act(() => view.step()?.click());
    await act(async () => {});
    act(() => view.step()?.click());
    await act(async () => {});
    expect(camera.applied).toEqual([2, 5]);
    expect(view.step()?.textContent).toBe('5×');
    view.done();
  });

  test('sans zoom de la caméra, le cran règle le zoom NUMÉRIQUE de l’image envoyée (#8441)', async () => {
    const asked: number[] = [];
    const camera = fakeCamera(false);
    const host = document.createElement('div');
    const root = createRoot(host);
    act(() => root.render(<CallZoomStep stream={streamOf(camera)} local={{ value: 1, sends: true, set: (next) => void asked.push(next) }} language="fr" Button={CallButton} rowItem="data-row-item" />));
    const step = host.querySelector<HTMLButtonElement>('[data-call-self-control="zoom"]');
    expect(step?.getAttribute('data-call-zoom-mode')).toBe('local');
    act(() => step?.click());
    expect(asked).toEqual([2]);
    expect(camera.applied).toEqual([]);
    act(() => root.unmount());
  });

  test('sans zoom de la caméra ni traitement des images, aucun cran : un zoom qui ne partirait pas n’est pas offert', () => {
    setLocalZoom('call-z', 'user', 1);
    const view = mount(fakeCamera(false));
    expect(view.step()).toBeNull();
    expect(localZoomFor(selfZoomStore.getState(), 'call-z', 'user')).toBe(1);
    view.done();
  });
});
