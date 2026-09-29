import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { CallButton } from '@/components/call-glass-button';
import { CALL_VIEW_GLYPHS } from '@/components/glyphs-call-view';
import type { CallPanels } from '@/lib/calls/call-screen-layer';
import type { ActiveCall } from '@/lib/calls/call-store';
import { localZoomFor, selfZoomStore, setLocalZoom } from '@/lib/calls/self-zoom';
import { loadCallControlsCatalog } from '@/lib/i18n-call-controls-catalog';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { CallCameraControls, type CallRowsKit } from './call-control-actions';

/**
 * LE CRAN DU ZOOM DANS MA VIGNETTE (#8441) — « 1× » à côté de Retourner : un
 * toucher passe au cran suivant (1× · 2× · 5×, puis 1×), par le zoom de la
 * caméra quand elle en a un, sinon par le zoom numérique de mon seul aperçu.
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

const kit: CallRowsKit = {
  Button: CallButton,
  glyphs: CALL_VIEW_GLYPHS,
  onRowKeyDown: () => undefined,
  onRowWheel: () => undefined,
  rowItem: 'data-row-item',
  actionsId: 'actions',
  panelIds: { people: 'p', react: 'r', record: 'rec', journal: 'j' } as CallRowsKit['panelIds'],
};

const panels = { open: null, toggle: () => undefined, enter: () => undefined } as unknown as CallPanels;

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

const mount = (camera: FakeCamera, place: 'tile' | 'top') => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  const active = { callId: 'call-z', cameraOn: true, facing: 'user', screenSharing: false, localStream: streamOf(camera) } as unknown as ActiveCall;
  act(() => root.render(<CallCameraControls call={active} set={{ mine: ['flip', 'camera'], call: [] }} language="fr" panels={panels} kit={kit} place={place} />));
  const step = () => host.querySelector<HTMLButtonElement>('[data-call-self-control="zoom"]');
  const done = () => {
    act(() => root.unmount());
    host.remove();
  };
  return { step, done };
};

describe('le cran du zoom dans ma vignette', () => {
  test('dans ma vignette, un cran « 1× » ; un toucher zoome la caméra à 2×, puis 5×', async () => {
    const camera = fakeCamera(true);
    const view = mount(camera, 'tile');
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

  test('sans zoom de la caméra, le cran agrandit mon seul aperçu : rien ne part', async () => {
    setLocalZoom('call-z', 'user', 1);
    const camera = fakeCamera(false);
    const view = mount(camera, 'tile');
    act(() => view.step()?.click());
    await act(async () => {});
    expect(camera.applied).toEqual([]);
    expect(localZoomFor(selfZoomStore.getState(), 'call-z', 'user')).toBe(2);
    view.done();
  });

  test('en haut (mon image en plein écran), pas de cran : la capsule s’en charge', () => {
    const view = mount(fakeCamera(true), 'top');
    expect(view.step()).toBeNull();
    view.done();
  });
});
