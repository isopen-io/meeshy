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
