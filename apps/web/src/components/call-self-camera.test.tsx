import { act, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import { DEFAULT_SELF_TILE, selfTileStore } from '@/lib/calls/call-self-tile';
import { setLocalZoom } from '@/lib/calls/self-zoom';
import type { ActiveCall, CallMember } from '@/lib/calls/call-store';
import { loadCallControlsCatalog } from '@/lib/i18n-call-controls-catalog';

import { CallStage } from './call-stage';

/**
 * MON IMAGE PENDANT UN APPEL (#8441, #8576, #8577) — en coin, ma vignette se
 * pince en trois tailles ; en plein écran, et là seulement, le zoom de ma
 * caméra (capsule, pincement, molette) et le rail de ma caméra.
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

const fresh = () => selfTileStore.setState({ callId: null, scale: DEFAULT_SELF_TILE });

const pinchOn = (element: HTMLElement, from: number, to: number) => {
  const pointer = (type: string, pointerId: number, clientX: number) => act(() => element.dispatchEvent(new PointerEvent(type, { pointerId, clientX, clientY: 0, bubbles: true })));
  pointer('pointerdown', 1, 0);
  pointer('pointerdown', 2, from);
  pointer('pointermove', 2, to);
  pointer('pointerup', 2, to);
  pointer('pointerup', 1, 0);
  act(() => element.click());
};

function Harness({ active, layout, controls }: { readonly active: ActiveCall; readonly layout: 'video-duo' | 'grid'; readonly controls: boolean }) {
  const [full, setFull] = useState(false);
  const self = { full, onToggle: () => setFull((value) => !value), controls, row: () => <div data-test-row="" />, column: (capsule: ReactNode) => <div data-test-column="">{capsule}</div> };
  return <CallStage call={active} layout={layout} language="fr" choice={null} onChoose={() => undefined} immersive={false} onToggleImmersive={() => undefined} moderation={null} self={self} />;
}

describe('mon image pendant un appel', () => {
  const mount = (active: ActiveCall, options: { readonly layout?: 'video-duo' | 'grid'; readonly controls?: boolean } = {}) => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    act(() => root.render(<Harness active={active} layout={options.layout ?? 'video-duo'} controls={options.controls ?? true} />));
    const find = (selector: string) => host.querySelector(selector);
    const press = (selector: string) => act(() => (find(selector) as HTMLElement | null)?.click());
    const full = async () => {
      press('[data-call-corner]');
      await act(async () => {
        await import('./call-self-camera');
      });
      await act(async () => {});
    };
    const done = () => {
      act(() => root.unmount());
      host.remove();
    };
    return { find, press, full, done };
  };

  test('en coin, aucun zoom : ni capsule, ni colonne — la rangée de ma caméra est DANS ma vignette (#8626)', () => {
    fresh();
    const view = mount(call(zoomCamera()));
    expect(view.find('[data-call-zoom]')).toBeNull();
    expect(view.find('[data-test-column]')).toBeNull();
    expect(view.find('[data-call-corner-frame] [data-test-row]')).not.toBeNull();
    expect(view.find('[data-call-corner] [data-test-row]')).toBeNull();
    view.done();
  });

  test('en plein écran, la rangée quitte la vignette pour le haut ; la vignette du pair descend d’un cran (#8626)', async () => {
    fresh();
    const view = mount(call(zoomCamera()));
    const top = () => (view.find('[data-call-corner-frame]') as HTMLElement).style.top;
    const before = top();
    await view.full();
    expect(view.find('[data-test-row]')).not.toBeNull();
    expect(view.find('[data-call-corner-frame] [data-test-row]')).toBeNull();
    expect(top()).not.toBe(before);
    view.done();
  });

  test('dans un mode, la rangée de ma caméra se retire, en coin comme en plein écran (#8626)', async () => {
    fresh();
    const view = mount(call(zoomCamera()), { controls: false });
    expect(view.find('[data-test-row]')).toBeNull();
    await view.full();
    expect(view.find('[data-test-row]')).toBeNull();
    view.done();
  });

  test('toucher ma vignette met MON image en plein écran : le rail, et la capsule « 1× » sous lui', async () => {
    fresh();
    const view = mount(call(zoomCamera()));
    await view.full();
    expect(view.find('[data-test-column] [data-call-zoom]')?.getAttribute('aria-label')).toBe('Zoom de ma caméra');
    expect(view.find('[data-call-zoom]')?.getAttribute('data-call-zoom')).toBe('device');
    expect(view.find('[data-call-zoom-value]')?.textContent).toBe('1×');
    expect((view.find('[data-call-zoom-out]') as HTMLButtonElement).disabled).toBe(true);
    expect(view.find('[data-call-self-gestures]')).not.toBeNull();
    view.done();
  });

  test('+ zoome la CAMÉRA (contrainte zoom) et l’indicateur le dit', async () => {
    fresh();
    const camera = zoomCamera();
    const view = mount(call(camera));
    await view.full();
    view.press('[data-call-zoom-in]');
    await act(async () => {});
    expect(camera.applied).toEqual([1.3]);
    expect(view.find('[data-call-zoom-value]')?.textContent).toBe('1,3×');
    view.done();
  });

  test('en plein écran, la molette et le pincement sur mon image zooment', async () => {
    fresh();
    const camera = zoomCamera();
    const view = mount(call(camera));
    await view.full();
    const surface = view.find('[data-call-self-gestures]') as HTMLElement;
    act(() => surface.dispatchEvent(new WheelEvent('wheel', { deltaY: -200, bubbles: true })));
    await act(async () => {});
    expect(camera.applied.at(-1)).toBeGreaterThan(1);
    pinchOn(surface, 100, 200);
    await act(async () => {});
    expect(camera.applied.at(-1)).toBeGreaterThan(2);
    view.done();
  });

  test('dans un mode, les commandes de ma caméra se retirent — le zoom au doigt reste', async () => {
    fresh();
    const view = mount(call(zoomCamera()), { controls: false });
    await view.full();
    expect(view.find('[data-test-column]')).toBeNull();
    expect(view.find('[data-call-self-gestures]')).not.toBeNull();
    view.done();
  });

  test('sans zoom de la caméra, le zoom NUMÉRIQUE agrandit mon seul aperçu — rien ne part (#8441)', async () => {
    fresh();
    setLocalZoom('call-0', 'user', 1);
    const camera = zoomCamera(false);
    const view = mount(call(camera));
    await view.full();
    expect(view.find('[data-test-row]')).not.toBeNull();
    expect(view.find('[data-call-zoom]')?.getAttribute('data-call-zoom')).toBe('local');
    view.press('[data-call-zoom-in]');
    await act(async () => {});
    expect(camera.applied).toEqual([]);
    expect(view.find('[data-call-zoom-value]')?.textContent).toBe('1,3×');
    expect((view.find('video[data-call-mirrored]') as HTMLVideoElement).style.transform).toBe('scaleX(-1) scale(1.3)');
    view.done();
  });

  test('ma caméra arrière zoomée localement n’est pas retournée', async () => {
    fresh();
    setLocalZoom('call-1', 'environment', 2);
    const view = mount(call(zoomCamera(false), { facing: 'environment' }));
    expect((view.find('[data-call-corner] video') as HTMLVideoElement).style.transform).toBe('scale(2)');
    view.done();
  });

  test('en plein écran, la vignette montre le pair — même sans sa vidéo — et la retoucher rend le coin', async () => {
    fresh();
    const view = mount(call(zoomCamera(), { members: { 'u-peer': member({ cameraOn: false }) } }));
    await view.full();
    expect(view.find('[data-call-corner]')).not.toBeNull();
    view.press('[data-call-corner]');
    expect(view.find('[data-test-column]')).toBeNull();
    view.done();
  });

  test('en groupe, ma tuile ne porte pas de zoom', () => {
    fresh();
    const view = mount(call(zoomCamera(), { isGroup: true, members: { 'u-peer': member(), 'u-b': member({ userId: 'u-b', name: 'Bintou' }) } }), { layout: 'grid' });
    expect(view.find('[data-call-zoom]')).toBeNull();
    view.done();
  });
});

describe('ma vignette en coin se pince (#8577)', () => {
  const mount = (active: ActiveCall) => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    const toggled: string[] = [];
    const self = { full: false, onToggle: () => void toggled.push('toggle'), controls: true, row: () => null, column: () => null };
    act(() => root.render(<CallStage call={active} layout="video-duo" language="fr" choice={null} onChoose={() => undefined} immersive={false} onToggleImmersive={() => undefined} moderation={null} self={self} />));
    const corner = () => host.querySelector('[data-call-corner]') as HTMLElement;
    const frame = () => host.querySelector('[data-call-corner-frame]') as HTMLElement;
    const done = () => {
      act(() => root.unmount());
      host.remove();
    };
    return { host, corner, frame, toggled, done };
  };

  test('par défaut, x2 : la taille d’avant', () => {
    fresh();
    const view = mount(call(zoomCamera()));
    expect(view.corner().getAttribute('data-call-self-tile')).toBe('2');
    expect([view.frame().style.width, view.frame().style.height]).toEqual(['112px', '160px']);
    view.done();
  });

  test('écarter deux doigts l’accroche à x3, le dit, et ne passe pas en plein écran', () => {
    fresh();
    const view = mount(call(zoomCamera()));
    pinchOn(view.corner(), 100, 150);
    expect(view.corner().getAttribute('data-call-self-tile')).toBe('3');
    expect([view.frame().style.width, view.frame().style.height]).toEqual(['168px', '240px']);
    expect(view.host.querySelector('[data-call-self-tile-status]')?.textContent).toBe('Ma vignette : grande');
    expect(view.toggled).toEqual([]);
    view.done();
  });

  test('pincer franchement la ramène à x1 ; Ctrl + molette d’un cran, la molette seule rien', () => {
    fresh();
    const view = mount(call(zoomCamera()));
    pinchOn(view.corner(), 100, 70);
    expect(view.corner().getAttribute('data-call-self-tile')).toBe('1');
    const zoomWheel = Object.defineProperty(new WheelEvent('wheel', { deltaY: -100, bubbles: true, cancelable: true }), 'ctrlKey', { value: true });
    act(() => view.corner().dispatchEvent(zoomWheel));
    expect(view.corner().getAttribute('data-call-self-tile')).toBe('2');
    act(() => view.corner().dispatchEvent(new WheelEvent('wheel', { deltaY: -100, bubbles: true })));
    expect(view.corner().getAttribute('data-call-self-tile')).toBe('2');
    view.done();
  });

  test('la taille tient pour l’appel ; un autre appel repart de x2', () => {
    fresh();
    const first = mount(call(zoomCamera()));
    pinchOn(first.corner(), 100, 150);
    first.done();
    const again = mount(call(zoomCamera()));
    expect(again.corner().getAttribute('data-call-self-tile')).toBe('3');
    again.done();
    const other = mount(call(zoomCamera(), { callId: 'call-2' }));
    expect(other.corner().getAttribute('data-call-self-tile')).toBe('2');
    other.done();
  });

  test('un toucher, lui, met mon image en plein écran', () => {
    fresh();
    const view = mount(call(zoomCamera()));
    act(() => view.corner().click());
    expect(view.toggled).toEqual(['toggle']);
    view.done();
  });

  /* Sur un écran tactile, deux doigts levés ne font AUCUN clic : le clic que
     le pincement avale n'arrive jamais, et le toucher suivant — un geste neuf
     — ne doit pas payer pour lui (mesuré dans Chromium, pincement CDP). */
  test('après un pincement sans clic, le toucher suivant met mon image en plein écran', () => {
    fresh();
    const view = mount(call(zoomCamera()));
    const pointer = (type: string, pointerId: number, clientX: number) => act(() => view.corner().dispatchEvent(new PointerEvent(type, { pointerId, clientX, clientY: 0, bubbles: true })));
    pointer('pointerdown', 1, 0);
    pointer('pointerdown', 2, 100);
    pointer('pointermove', 2, 150);
    pointer('pointerup', 2, 150);
    pointer('pointerup', 1, 0);
    expect(view.corner().getAttribute('data-call-self-tile')).toBe('3');
    pointer('pointerdown', 3, 10);
    pointer('pointerup', 3, 10);
    act(() => view.corner().click());
    expect(view.toggled).toEqual(['toggle']);
    view.done();
  });

  /* La colonne de l'écran d'appel (en-tête, pilule, et l'espace vide qui les
     sépare) est posée PAR-DESSUS la scène : sans son propre plan, la vignette
     s'y voit mais ne reçoit ni toucher ni pincement (mesuré dans Chromium par
     `check-calls-controls.mjs`, où son espaceur interceptait chaque appui). */
  test('la vignette se pose au-dessus de la colonne de l’écran : le doigt l’atteint', () => {
    fresh();
    const view = mount(call(zoomCamera()));
    expect(view.corner().className.split(' ')).toContain('z-10');
    view.done();
  });
});
