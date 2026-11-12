import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import type { ActiveCall, CallMember } from '@/lib/calls/call-store';
import { loadCallControlsCatalog } from '@/lib/i18n-call-controls-catalog';

import { DOUBLE_TAP_MS } from '@/lib/view/tap-gate';

import { CallStage, screenZoomSurfaceView } from './call-stage';

/**
 * L'ÉCRAN REÇU EN DUO SE ZOOME (P15.11) — jusqu'à 4× au pincement, à Ctrl + molette, se déplace une fois
 * zoomé, et ne se rend entier que par un double toucher qui n'agit QU'une fois zoomé. Un seul calque GPU
 * (`translate3d` + `scale`) porte l'image : ma vignette et le bouton de plein écran, eux, ne bougent jamais.
 * Et l'ARBITRAGE avec l'écran d'appel, qui range ses commandes au toucher (écouteur de clic en capture sur sa
 * racine, `use-call-chrome.ts`) : un glissé n'est pas un toucher, et zoomé, deux touchers rendent 1× sans
 * ranger puis rendre les commandes.
 */

const camera = { kind: 'video', readyState: 'live', getCapabilities: () => ({}), getSettings: () => ({}), applyConstraints: async () => undefined };
const stream = (): MediaStream => Object.assign(Object.create(MediaStream.prototype) as MediaStream, { getVideoTracks: () => [camera], getAudioTracks: () => [], getTracks: () => [camera] });
const member = (overrides: Partial<CallMember> = {}): CallMember => ({ userId: 'u-peer', name: 'Amina', avatar: null, micMuted: false, cameraOn: false, screenSharing: true, weakNetwork: false, capturing: false, link: 'connected', ...overrides });

const sharing = (overrides: Partial<ActiveCall> = {}): ActiveCall => ({
  callId: 'call-screen',
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
  localStream: stream(),
  remoteStreams: { 'u-peer': stream() },
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
  await screenZoomSurfaceView.load();
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(async () => {
  await act(async () => {});
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

const mount = () => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const taps: Event[] = [];
  host.addEventListener('click', (event) => taps.push(event), { capture: true });
  const root = createRoot(host);
  act(() => root.render(<CallStage call={sharing()} layout="screen" language="fr" choice={null} onChoose={() => undefined} immersive={false} onToggleImmersive={() => undefined} moderation={null} self={{ full: false, onToggle: () => undefined, zoom: 'step' as const, column: () => null }} />));
  const find = (selector: string) => host.querySelector(selector) as HTMLElement | null;
  const layer = () => find('[data-call-screen-layer]') as HTMLElement;
  const screen = () => find('[data-call-screen-surface]') as HTMLElement;
  const pointer = (type: string, id: number, x: number, y: number, pointerType = 'touch', button = 0) => act(() => void screen().dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: id, clientX: x, clientY: y, pointerType, button })));
  const click = () => act(() => void layer().dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 })));
  const frame = () => Object.defineProperty(screen(), 'getBoundingClientRect', { value: () => ({ left: 0, top: 0, right: 400, bottom: 200, width: 400, height: 200, x: 0, y: 0, toJSON: () => ({}) }) });
  const wheel = (deltaY: number) => act(() => void screen().dispatchEvent(Object.defineProperty(new WheelEvent('wheel', { deltaY, bubbles: true, cancelable: true }), 'ctrlKey', { value: true })));
  const flush = () => act(async () => void (await new Promise((resolve) => requestAnimationFrame(() => resolve(null)))));
  const done = () => {
    act(() => root.unmount());
    host.remove();
  };
  return { find, layer, screen, pointer, click, frame, taps, wheel, flush, done };
};

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const scaleOf = (element: HTMLElement): number => Number(/scale\(([\d.]+)\)/.exec(element.style.transform)?.[1] ?? 1);

describe('le zoom de l’écran reçu en duo (P15.11)', () => {
  test('au repos : 1×, aucune transformation, aucun will-change', () => {
    const view = mount();
    expect(view.layer()).not.toBeNull();
    expect(view.layer().style.transform).toBe('');
    expect(view.layer().style.willChange).toBe('');
    view.done();
  });

  test('Ctrl + molette zoome, borné à 4×, par une matrice translate3d + scale', () => {
    const view = mount();
    view.wheel(-200);
    expect(view.layer().style.transform).toMatch(/^translate3d\(.*\) scale\(/);
    expect(scaleOf(view.layer())).toBeGreaterThan(1);
    view.wheel(-100000);
    expect(scaleOf(view.layer())).toBe(4);
    view.done();
  });

  test('le pincement grandit en direct (calque écrit par image), garde will-change le temps du geste, puis le rend', async () => {
    const view = mount();
    view.pointer('pointerdown', 1, 100, 100);
    view.pointer('pointerdown', 2, 200, 100);
    view.pointer('pointermove', 2, 300, 100);
    await view.flush();
    expect(scaleOf(view.layer())).toBe(2);
    expect(view.layer().style.willChange).toBe('transform');
    view.pointer('pointerup', 2, 300, 100);
    view.pointer('pointerup', 1, 100, 100);
    expect(scaleOf(view.layer())).toBe(2);
    expect(view.layer().style.willChange).toBe('');
    view.done();
  });

  test('le double clic ne fait rien à 1×, et rend 1× une fois zoomé', () => {
    const view = mount();
    act(() => void view.screen().dispatchEvent(new MouseEvent('dblclick', { bubbles: true })));
    expect(view.layer().style.transform).toBe('');
    view.wheel(-300);
    expect(scaleOf(view.layer())).toBeGreaterThan(1);
    act(() => void view.screen().dispatchEvent(new MouseEvent('dblclick', { bubbles: true })));
    expect(view.layer().style.transform).toBe('');
    view.done();
  });

  test('un doigt déplace l’image une fois zoomé, jamais à 1×', async () => {
    const view = mount();
    Object.defineProperty(view.screen(), 'getBoundingClientRect', { value: () => ({ left: 0, top: 0, right: 400, bottom: 200, width: 400, height: 200, x: 0, y: 0, toJSON: () => ({}) }) });
    view.pointer('pointerdown', 1, 200, 100);
    view.pointer('pointermove', 1, 260, 100);
    await view.flush();
    view.pointer('pointerup', 1, 260, 100);
    expect(view.layer().style.transform).toBe('');
    view.wheel(-69.3 * 3);
    view.pointer('pointerdown', 1, 200, 100);
    view.pointer('pointermove', 1, 260, 90);
    await view.flush();
    view.pointer('pointerup', 1, 260, 90);
    expect(view.layer().style.transform).toMatch(/translate3d\(60px, -10px, 0\)/);
    view.done();
  });

  test('sous le seuil d’un glissé, l’image ne bouge pas et le toucher reste un toucher', async () => {
    const view = mount();
    view.frame();
    view.wheel(-69.3 * 3);
    const zoomed = view.layer().style.transform;
    view.pointer('pointerdown', 1, 200, 100);
    view.pointer('pointermove', 1, 203, 101);
    await view.flush();
    view.pointer('pointerup', 1, 203, 101);
    expect(view.layer().style.transform).toBe(zoomed);
    view.done();
  });

  test('le bouton droit de la souris ne déplace pas l’image', async () => {
    const view = mount();
    view.frame();
    view.wheel(-69.3 * 3);
    const zoomed = view.layer().style.transform;
    view.pointer('pointerdown', 1, 200, 100, 'mouse', 2);
    view.pointer('pointermove', 1, 260, 100, 'mouse', 2);
    await view.flush();
    view.pointer('pointerup', 1, 260, 100, 'mouse', 2);
    expect(view.layer().style.transform).toBe(zoomed);
    view.done();
  });

  test('le clic qui suit un glissé à la souris n’est pas un toucher : il ne range pas les commandes', async () => {
    const view = mount();
    view.frame();
    view.wheel(-69.3 * 3);
    view.pointer('pointerdown', 1, 200, 100, 'mouse');
    view.pointer('pointermove', 1, 260, 100, 'mouse');
    await view.flush();
    view.pointer('pointerup', 1, 260, 100, 'mouse');
    view.click();
    await pause(DOUBLE_TAP_MS + 50);
    expect(view.taps).toHaveLength(0);
    view.done();
  });

  test('zoomée, la surface garde le doigt : le glissé vers le bas de l’écran d’appel ne le prend pas', () => {
    const view = mount();
    expect(view.screen().hasAttribute('data-call-owns-drag')).toBe(false);
    view.wheel(-300);
    expect(view.screen().hasAttribute('data-call-owns-drag')).toBe(true);
    view.done();
  });

  test('à 1×, un toucher range les commandes aussitôt : rien n’attend un second toucher', () => {
    const view = mount();
    view.click();
    expect(view.taps).toHaveLength(1);
    view.done();
  });

  test('zoomé, un toucher seul range les commandes une fois passé le délai du double toucher', async () => {
    const view = mount();
    view.wheel(-300);
    view.click();
    expect(view.taps).toHaveLength(0);
    await act(() => pause(DOUBLE_TAP_MS + 50));
    expect(view.taps).toHaveLength(1);
    expect(view.layer().style.transform).not.toBe('');
    view.done();
  });

  test('zoomé, deux touchers rendent 1× sans ranger puis rendre les commandes', async () => {
    const view = mount();
    view.wheel(-300);
    view.click();
    view.click();
    expect(view.layer().style.transform).toBe('');
    await act(() => pause(DOUBLE_TAP_MS + 50));
    expect(view.taps).toHaveLength(0);
    view.done();
  });

  test('le lecteur d’écran apprend le geste, dans la langue de l’interface', () => {
    const view = mount();
    const described = view.screen().getAttribute('aria-describedby');
    expect(described).not.toBeNull();
    expect(view.find(`[id="${described}"]`)?.textContent).toContain('pincez ou Ctrl + molette');
    view.done();
  });

  test('ma vignette et le plein écran restent hors du calque : ils ne se zooment ni ne se déplacent', () => {
    const view = mount();
    expect(view.layer().querySelector('[data-call-corner]')).toBeNull();
    expect(view.layer().querySelector('[data-call-fullscreen]')).toBeNull();
    view.done();
  });
});
