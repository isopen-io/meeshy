import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import type { ActiveCall, CallMember } from '@/lib/calls/call-store';
import { loadPillMotion } from '@/lib/calls/use-pill-motion';
import { loadCallControlsCatalog } from '@/lib/i18n-call-controls-catalog';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { CallScreen, loadColdCallViews } from './call-screen';

/**
 * **LA SCÈNE D'UN GROUPE, DANS L'ÉCRAN D'APPEL** (#17699, #17548) — la grille suit l'ordre d'arrivée, lit son
 * orientation sur la SCÈNE (la colonne du journal ouverte, une fenêtre large peut porter une scène plus haute
 * que large), garde ses 140 de haut, et un toucher, contrôles rangés, ne fait que les rendre.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

const member = (overrides: Partial<CallMember> = {}): CallMember => ({ userId: 'u-peer', name: 'Amina Diallo', avatar: null, micMuted: false, cameraOn: false, screenSharing: false, weakNetwork: false, capturing: false, link: 'connected', ...overrides });

const call = (overrides: Partial<ActiveCall> = {}): ActiveCall => ({
  callId: 'call-group-stage',
  conversationId: 'c-1',
  media: 'audio',
  direction: 'outgoing',
  isGroup: true,
  title: 'Équipe',
  avatar: null,
  callerName: null,
  phase: { kind: 'connected' },
  connectedAt: 0,
  endedDurationSec: null,
  micMuted: false,
  cameraOn: false,
  facing: 'user',
  screenSharing: false,
  members: {},
  display: 'full',
  localStream: null,
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

const peers = { 'u-peer': member(), 'u-b': member({ userId: 'u-b', name: 'Bintou' }) };

beforeAll(async () => {
  await loadPillMotion();
  await loadCallControlsCatalog('fr');
  await loadColdCallViews();
  renderToStaticMarkup(<CallScreen call={call({ members: peers })} canShare initiallyExpanded />);
  await import('./call-control-actions');
  await new Promise((resolve) => setTimeout(resolve, 0));
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(async () => {
  await act(async () => {});
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

const mount = (overrides: Partial<ActiveCall> = {}) => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => root.render(<CallScreen call={call(overrides)} canShare effectsSupport={{ color: false, blur: false }} />));
  const find = (selector: string) => [...host.querySelectorAll(selector)].find((node) => node.closest('[data-call-pill-ghost]') === null) ?? null;
  return {
    host,
    find,
    press: (selector: string) => act(() => (find(selector) as HTMLElement | null)?.click()),
    rerender: (next: Partial<ActiveCall>) => root.render(<CallScreen call={call(next)} canShare effectsSupport={{ color: false, blur: false }} />),
    done: () => {
      act(() => root.unmount());
      host.remove();
    },
  };
};

type View = ReturnType<typeof mount>;

const tapStage = (view: View) => act(() => (view.find('[data-call-stage-surface]') as HTMLElement | null)?.click());

const windowOf = (width: number, height: number) => {
  Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: width });
  Object.defineProperty(window, 'innerHeight', { configurable: true, writable: true, value: height });
};

describe('CallScreen — la scène d’un groupe (#17699)', () => {
  test('en hauteur compacte (iPhone en paysage), les rangées de la pilule d’un groupe se replient en UNE ligne sans légendes, et la grille garde ses 140 (P12.7)', async () => {
    const real = window.innerHeight;
    const heightOf = (value: number) => Object.defineProperty(window, 'innerHeight', { configurable: true, writable: true, value });
    heightOf(390);
    const compact = mount({ members: peers });
    compact.press('[data-call-more]');
    await act(async () => {});
    expect(compact.find('[data-call-deck]')?.hasAttribute('data-call-compact')).toBe(true);
    expect(compact.host.querySelectorAll('[data-call-deck] [data-call-row-title]')).toHaveLength(2);
    expect(compact.find('[data-call-stage-surface]')?.className).toContain('min-h-[140px]');
    compact.done();
    heightOf(844);
    const tall = mount({ members: peers });
    tall.press('[data-call-more]');
    await act(async () => {});
    expect(tall.find('[data-call-deck]')?.hasAttribute('data-call-compact')).toBe(false);
    tall.done();
    heightOf(real);
  });

  test('la grille lit son orientation sur la SCÈNE, pas sur la fenêtre : la colonne du journal ouverte (W1), une fenêtre large garde 2 × 3, et la scène qui s’élargit passe en 3 × 2 (P11.1, `GroupCallStageView` d’iOS)', () => {
    const real = { width: window.innerWidth, height: window.innerHeight, rect: Object.getOwnPropertyDescriptor(Element.prototype, 'getBoundingClientRect'), observer: globalThis.ResizeObserver };
    const boxOf = (width: number, height: number) => ({ width, height, left: 0, top: 0, x: 0, y: 0, right: width, bottom: height, toJSON: () => ({}) });
    let stage = boxOf(560, 700);
    const observers: ResizeObserverCallback[] = [];
    windowOf(1280, 800);
    Object.defineProperty(Element.prototype, 'getBoundingClientRect', {
      configurable: true,
      value(this: Element) {
        return this.hasAttribute('data-call-grid-frame') ? stage : boxOf(0, 0);
      },
    });
    globalThis.ResizeObserver = class {
      constructor(notify: ResizeObserverCallback) {
        observers.push(notify);
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
    const five = Object.fromEntries(['a', 'b', 'c', 'd', 'e'].map((id) => [`u-${id}`, member({ userId: `u-${id}`, name: `Membre ${id}` })]));
    const view = mount({ members: five });
    const columns = () => /repeat\((\d)/.exec((view.host.querySelector('[data-call-grid-frame] [style*="grid-template-columns"]') as HTMLElement | null)?.style.gridTemplateColumns ?? '')?.[1] ?? null;
    expect(columns()).toBe('2');
    stage = boxOf(1000, 700);
    act(() => observers.forEach((notify) => notify([{ contentRect: stage } as unknown as ResizeObserverEntry], {} as ResizeObserver)));
    expect(columns()).toBe('3');
    view.done();
    windowOf(real.width, real.height);
    if (real.rect === undefined) Reflect.deleteProperty(Element.prototype, 'getBoundingClientRect');
    else Object.defineProperty(Element.prototype, 'getBoundingClientRect', real.rect);
    globalThis.ResizeObserver = real.observer;
  });

  test('en groupe, chrome rangé, le doigt posé sur une vignette la focalise (Chromium) : le toucher rend les contrôles SANS la mettre à la une, grille comme bandeau (#17548, P11.10, P14.6)', () => {
    const view = mount({ members: peers, cameraOn: true });
    const chrome = () => view.find('[data-call-screen]')?.getAttribute('data-call-chrome');
    const finger = (selector: string) => {
      const tile = view.find(selector) as HTMLElement;
      act(() => {
        tile.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 6, clientX: 4, clientY: 4, button: 0, bubbles: true }));
        tile.focus();
      });
      act(() => {
        tile.dispatchEvent(new PointerEvent('pointerup', { pointerId: 6, clientX: 4, clientY: 4, button: 0, bubbles: true }));
        tile.click();
      });
    };
    tapStage(view);
    expect(chrome()).toBe('hidden');
    finger('[data-call-tile="u-b"]');
    expect(chrome()).toBe('shown');
    expect(view.find('[data-call-spotlight]')).toBeNull();
    view.press('[data-call-tile="u-b"]');
    expect(view.find('[data-call-spotlight]')?.getAttribute('data-call-spotlight')).toBe('u-b');
    tapStage(view);
    expect(chrome()).toBe('hidden');
    finger('[data-call-strip] [data-call-tile="u-peer"]');
    expect(chrome()).toBe('shown');
    expect(view.find('[data-call-spotlight]')?.getAttribute('data-call-spotlight')).toBe('u-b');
    view.done();
  });

  test('#17948 — toucher la vignette À LA UNE range les contrôles, capsule comprise, et le suivant les rend ; la grille ne revient que par « Revenir à la grille » (loi 11, loi 15, P14, U1 ; `onStageTap` d’iOS)', () => {
    const view = mount({ members: peers, cameraOn: true });
    const chrome = () => view.find('[data-call-screen]')?.getAttribute('data-call-chrome');
    const spotlight = () => view.find('[data-call-spotlight]')?.getAttribute('data-call-spotlight') ?? null;
    const featured = () => act(() => (view.find('[data-call-spotlight] [data-call-slot="u-b"] [data-call-tile="u-b"]') as HTMLElement | null)?.click());
    view.press('[data-call-tile="u-b"]');
    expect(spotlight()).toBe('u-b');
    expect(view.find('[data-call-spotlight] [data-call-slot="u-b"] button[data-call-tile="u-b"]')).toBeNull();
    featured();
    expect(chrome()).toBe('hidden');
    expect(spotlight()).toBe('u-b');
    const capsule = view.find('[data-call-spotlight-capsule]')?.closest('[data-call-chrome-fade]');
    expect(capsule?.hasAttribute('data-call-chrome-keep')).toBe(false);
    featured();
    expect(chrome()).toBe('shown');
    expect(spotlight()).toBe('u-b');
    view.press('[data-call-grid-back]');
    expect(spotlight()).toBeNull();
    view.done();
  });

  test('#17945 (extension du 2026-11-13) — en groupe SANS AUCUNE caméra, un toucher sur le fond range en-tête et pilule, un autre les rend ; une vignette touchée, commandes visibles, passe toujours à la une', () => {
    const view = mount({ members: peers });
    const chrome = () => view.find('[data-call-screen]')?.getAttribute('data-call-chrome');
    tapStage(view);
    expect(chrome()).toBe('hidden');
    expect(view.find('[data-call-header]')?.closest('[aria-hidden="true"]')).not.toBeNull();
    expect(view.find('[data-call-controls]')?.getAttribute('aria-hidden')).toBe('true');
    tapStage(view);
    expect(chrome()).toBe('shown');
    view.press('[data-call-tile="u-b"]');
    expect(chrome()).toBe('shown');
    expect(view.find('[data-call-spotlight]')?.getAttribute('data-call-spotlight')).toBe('u-b');
    view.done();
  });

  test('#17949 — la grille s’arrête au-dessus de la pilule, au repos comme agrandie : deux étages du même flux, jamais l’un sur l’autre (P11, P12 ; la mesure est dans `check-calls-controls.mjs`)', async () => {
    const view = mount({ members: peers });
    const stage = view.find('[data-call-stage-surface]') as HTMLElement;
    const plane = view.find('[data-call-controls]')?.closest('[data-call-plane]') as HTMLElement;
    const inFlow = (node: Element | null | undefined) => node instanceof HTMLElement && !/(^|\s)(absolute|fixed)(\s|$)/.test(node.className);
    expect(stage.className).toContain('flex-1');
    expect(inFlow(stage) && inFlow(plane)).toBe(true);
    expect(stage.parentElement).toBe(plane.parentElement);
    expect(stage.compareDocumentPosition(plane) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    view.press('[data-call-more]');
    await act(async () => {});
    const pill = view.find('[data-call-control-pill="grown"]');
    expect(pill?.closest('[data-call-plane]')).toBe(plane);
    expect([pill, view.find('[data-call-deck]'), view.find('[data-call-controls]')].every(inFlow)).toBe(true);
    view.done();
  });

  test('en groupe, la grille suit l’ORDRE D’ARRIVÉE, ma vignette en dernier : un pair qui se reconnecte garde sa case (P11.3)', () => {
    const arrived = { 'u-z': member({ userId: 'u-z', name: 'Zoé' }), 'u-b': member({ userId: 'u-b', name: 'Bob' }), 'u-a': member({ userId: 'u-a', name: 'Ana' }) };
    const order = (view: View) => [...view.host.querySelectorAll('[data-call-slot]')].map((slot) => slot.getAttribute('data-call-slot'));
    const view = mount({ members: arrived });
    expect(order(view)).toEqual(['u-z', 'u-b', 'u-a', 'self']);
    act(() => view.rerender({ members: { ...arrived, 'u-b': { ...arrived['u-b'], link: 'reconnecting' } } }));
    expect(order(view)).toEqual(['u-z', 'u-b', 'u-a', 'self']);
    view.done();
  });
});

const liveScreen = () => Object.defineProperty(new MediaStream(), 'getVideoTracks', { value: () => [{ readyState: 'live' }] });

describe('CallScreen — une personne qui repartage remonte à la une (U2.1)', () => {
  test('« Revenir à la grille » congédie CE partage : à sa fin, puis au repartage de la même personne, son écran remonte seul (`GroupCallSpotlight.choice(afterSharerChangedFrom:)` d’iOS)', () => {
    const stream = liveScreen();
    const sharing = { ...peers, 'u-peer': member({ screenSharing: true }) };
    const view = mount({ members: sharing, remoteStreams: { 'u-peer': stream } });
    expect(view.find('[data-call-shared-screen]')).not.toBeNull();
    view.press('[data-call-grid-back]');
    expect(view.find('[data-call-shared-screen]')).toBeNull();
    act(() => view.rerender({ members: peers, remoteStreams: {} }));
    act(() => view.rerender({ members: sharing, remoteStreams: { 'u-peer': stream } }));
    expect(view.find('[data-call-shared-screen]')).not.toBeNull();
    view.done();
  });

  test('tant que le même partage dure, la grille congédiée reste la grille', () => {
    const stream = liveScreen();
    const sharing = { ...peers, 'u-peer': member({ screenSharing: true }) };
    const view = mount({ members: sharing, remoteStreams: { 'u-peer': stream } });
    view.press('[data-call-grid-back]');
    act(() => view.rerender({ members: { ...sharing, 'u-b': member({ userId: 'u-b', name: 'Bintou', micMuted: true }) }, remoteStreams: { 'u-peer': stream } }));
    expect(view.find('[data-call-shared-screen]')).toBeNull();
    view.done();
  });
});

describe('CallScreen — le plein écran d’un groupe (U2.8, U2.9)', () => {
  const sharing = { ...peers, 'u-peer': member({ screenSharing: true }) };

  test('sans API Fullscreen (Safari iPhone), un groupe qui retombe en duo pendant un partage sort de l’immersion (`isStageFullScreen = false` d’iOS)', () => {
    const stream = liveScreen();
    const view = mount({ members: sharing, remoteStreams: { 'u-peer': stream } });
    view.press('[data-call-fullscreen]');
    expect(view.find('[data-call-screen]')?.getAttribute('data-call-chrome')).toBe('hidden');
    act(() => view.rerender({ members: { 'u-peer': member({ screenSharing: true }) }, remoteStreams: { 'u-peer': stream } }));
    expect(view.find('[data-call-grid-frame]')).toBeNull();
    expect(view.find('[data-call-screen]')?.getAttribute('data-call-chrome')).toBe('shown');
    view.done();
  });

  test('avec l’API Fullscreen, ce que le navigateur montre porte aussi la pilule et ses sous-titres : l’écran d’appel entier, jamais la seule scène', () => {
    const shown: Element[] = [];
    const real = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'requestFullscreen');
    Object.defineProperty(HTMLElement.prototype, 'requestFullscreen', { configurable: true, value(this: Element) { shown.push(this); return Promise.resolve(); } });
    Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, value: true });
    const view = mount({ members: sharing, remoteStreams: { 'u-peer': liveScreen() }, captionsMode: 'translated' });
    view.press('[data-call-fullscreen]');
    const target = shown[0];
    expect(target?.contains(view.find('[data-call-controls]'))).toBe(true);
    expect(target?.contains(view.find('[data-call-stage-surface]'))).toBe(true);
    view.done();
    Reflect.deleteProperty(document, 'fullscreenEnabled');
    if (real === undefined) Reflect.deleteProperty(HTMLElement.prototype, 'requestFullscreen');
    else Object.defineProperty(HTMLElement.prototype, 'requestFullscreen', real);
  });

  test('dans la couche d’appel, la scène plein écran est l’hôte qui porte aussi la carte d’accord (le <dialog> ne peut pas l’être)', () => {
    const shown: Element[] = [];
    const real = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'requestFullscreen');
    Object.defineProperty(HTMLElement.prototype, 'requestFullscreen', { configurable: true, value(this: Element) { shown.push(this); return Promise.resolve(); } });
    Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, value: true });
    const layer = document.createElement('div');
    layer.setAttribute('data-call-fullscreen-host', '');
    document.body.appendChild(layer);
    const root = createRoot(layer);
    act(() => root.render(<CallScreen call={call({ members: sharing, remoteStreams: { 'u-peer': liveScreen() } })} canShare effectsSupport={{ color: false, blur: false }} />));
    const sibling = document.createElement('div');
    layer.appendChild(sibling);
    act(() => (layer.querySelector('[data-call-fullscreen]') as HTMLElement | null)?.click());
    expect(shown[0]).toBe(layer);
    expect(shown[0]?.contains(sibling)).toBe(true);
    act(() => root.unmount());
    layer.remove();
    Reflect.deleteProperty(document, 'fullscreenEnabled');
    if (real === undefined) Reflect.deleteProperty(HTMLElement.prototype, 'requestFullscreen');
    else Object.defineProperty(HTMLElement.prototype, 'requestFullscreen', real);
  });
});

describe('CallScreen — la rangée de pastilles sort par le haut en plein écran, sans être démontée (U2.10)', () => {
  test('en plein écran la rangée reste montée, rangée vers le bord haut avec l’en-tête (le fondu court sous Réduire les animations est celui de tout le chrome) ; quitter la rend', () => {
    const view = mount({ members: { ...peers, 'u-peer': member({ screenSharing: true }) }, remoteStreams: { 'u-peer': liveScreen() } });
    const host = () => view.find('[data-call-stage-surface]')?.previousElementSibling;
    expect(host()?.getAttribute('data-call-stow')).toBe('top');
    expect(host()?.getAttribute('aria-hidden')).toBeNull();
    view.press('[data-call-fullscreen]');
    expect(host()?.getAttribute('aria-hidden')).toBe('true');
    expect(view.find('[data-call-screen]')?.getAttribute('data-call-chrome')).toBe('hidden');
    view.press('[data-call-fullscreen]');
    expect(host()?.getAttribute('aria-hidden')).toBeNull();
    view.done();
  });
});
