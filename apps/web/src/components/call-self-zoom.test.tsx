import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import type { ActiveCall, CallMember } from '@/lib/calls/call-store';

import { CallStage } from './call-stage';

/**
 * LE ZOOM DE MA CAMÉRA PENDANT UN APPEL (#8441) — sur ma propre image : la
 * capsule `−  1×  +`, le pincement, la molette. Là où la caméra ne propose
 * pas de zoom, rien n'apparaît.
 */

type ZoomCamera = { kind: 'video'; readyState: 'live'; zoom: number; applied: number[]; getCapabilities: () => Record<string, unknown>; getSettings: () => Record<string, unknown>; applyConstraints: (c: { advanced: Array<{ zoom: number }> }) => Promise<void> };

const zoomCamera = (withZoom = true): ZoomCamera => {
  const self: ZoomCamera = {
    kind: 'video',
    readyState: 'live',
    zoom: 1,
    applied: [],
    getCapabilities: () => (withZoom ? { zoom: { min: 1, max: 5, step: 0.1 } } : {}),
    getSettings: () => ({ zoom: self.zoom }),
    applyConstraints: async (c) => {
      const zoom = c.advanced[0]?.zoom ?? self.zoom;
      self.zoom = zoom;
      self.applied.push(zoom);
    },
  };
  return self;
};

/* Une doublure qui PASSE pour un MediaStream (`srcObject` de happy-dom le vérifie). */
const streamOf = (camera: ZoomCamera): MediaStream => Object.assign(Object.create(MediaStream.prototype) as MediaStream, { getVideoTracks: () => [camera], getAudioTracks: () => [], getTracks: () => [camera] });

const member = (overrides: Partial<CallMember> = {}): CallMember => ({ userId: 'u-peer', name: 'Amina', avatar: null, micMuted: false, cameraOn: true, screenSharing: false, weakNetwork: false, capturing: false, link: 'connected', ...overrides });

const call = (camera: ZoomCamera, overrides: Partial<ActiveCall> = {}): ActiveCall => ({
  callId: 'call-1',
  conversationId: 'c-1',
  media: 'video',
  direction: 'outgoing',
  isGroup: false,
  title: 'Amina',
  avatar: null,
  callerName: null,
  phase: { kind: 'connected' },
  connectedAt: 0,
  endedDurationSec: null,
  micMuted: false,
  cameraOn: true,
  facing: 'user',
  screenSharing: false,
  members: { 'u-peer': member() },
  display: 'full',
  localStream: streamOf(camera),
  remoteStreams: {},
  captions: [],
  captionsMode: 'off',
  captionPeers: [],
  preview: null,
  previewed: false,
  transcription: 'idle',
  initiatorId: null,
  invitedBy: null,
  quality: null,
  ...overrides,
});

describe('le zoom de ma caméra', () => {
  const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

  beforeAll(() => {
    ensureHappyDomRegistered();
    globals.IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterAll(async () => {
    await act(async () => {});
    delete globals.IS_REACT_ACT_ENVIRONMENT;
    await releaseHappyDomIfRegistered();
  });

  const mount = (active: ActiveCall, layout: 'video-duo' | 'grid' = 'video-duo') => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    act(() => root.render(<CallStage call={active} layout={layout} language="fr" choice={null} onChoose={() => undefined} immersive={false} onToggleImmersive={() => undefined} moderation={null} />));
    const find = (selector: string) => host.querySelector(selector);
    const press = (selector: string) => act(() => (find(selector) as HTMLElement | null)?.click());
    const done = () => {
      act(() => root.unmount());
      host.remove();
    };
    return { find, press, done };
  };

  test('une caméra qui propose le zoom : la capsule « 1× », − désactivé au minimum', () => {
    const view = mount(call(zoomCamera()));
    expect(view.find('[data-call-zoom]')?.getAttribute('aria-label')).toBe('Zoom de ma caméra');
    expect(view.find('[data-call-zoom-value]')?.textContent).toBe('1×');
    expect((view.find('[data-call-zoom-out]') as HTMLButtonElement).disabled).toBe(true);
    expect(view.find('[data-call-zoom]')?.className).toContain('glass-call');
    view.done();
  });

  test('+ zoome la CAMÉRA (contrainte zoom) et l’indicateur le dit', async () => {
    const camera = zoomCamera();
    const view = mount(call(camera));
    view.press('[data-call-zoom-in]');
    await act(async () => {});
    expect(camera.applied).toEqual([1.3]);
    expect(view.find('[data-call-zoom-value]')?.textContent).toBe('1,3×');
    view.done();
  });

  test('la molette sur ma vignette zoome', async () => {
    const camera = zoomCamera();
    const view = mount(call(camera));
    act(() => view.find('[data-call-corner]')?.dispatchEvent(new WheelEvent('wheel', { deltaY: -200, bubbles: true })));
    await act(async () => {});
    expect(camera.applied.at(-1)).toBeGreaterThan(1);
    view.done();
  });

  test('pincer ma vignette zoome, et ne l’inverse pas', async () => {
    const camera = zoomCamera();
    const view = mount(call(camera));
    const corner = view.find('[data-call-corner]') as HTMLElement;
    const pointer = (type: string, pointerId: number, clientX: number) => act(() => corner.dispatchEvent(new PointerEvent(type, { pointerId, clientX, clientY: 0, bubbles: true })));
    pointer('pointerdown', 1, 0);
    pointer('pointerdown', 2, 100);
    pointer('pointermove', 2, 200);
    pointer('pointerup', 2, 200);
    pointer('pointerup', 1, 0);
    act(() => corner.click());
    await act(async () => {});
    expect(camera.applied.at(-1)).toBe(2);
    expect(view.find('[data-call-corner]')).toBe(corner);
    expect(corner.querySelector('video')).not.toBeNull();
    view.done();
  });

  test('en groupe, la capsule est sur MA tuile', () => {
    const view = mount(call(zoomCamera(), { isGroup: true, members: { 'u-peer': member(), 'u-b': member({ userId: 'u-b', name: 'Bintou' }) } }), 'grid');
    expect(view.find('[data-call-tile-self] [data-call-zoom]')).not.toBeNull();
    view.done();
  });

  test('sans zoom proposé, rien n’apparaît', () => {
    const view = mount(call(zoomCamera(false)));
    expect(view.find('[data-call-zoom]')).toBeNull();
    view.done();
  });

  test('caméra éteinte ou écran partagé, rien n’apparaît', () => {
    const off = mount(call(zoomCamera(), { cameraOn: false }));
    expect(off.find('[data-call-zoom]')).toBeNull();
    off.done();
  });
});
