import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import type { ActiveCall } from '@/lib/calls/call-store';
import { loadPillMotion } from '@/lib/calls/use-pill-motion';
import { loadCallControlsCatalog } from '@/lib/i18n-call-controls-catalog';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { ActiveCallView } from './call-overlay';

/**
 * **L'ÉCRAN D'APPEL ET LA CAPSULE S'ÉCHANGENT EN MOUVEMENT** (S1.7, S2.1, #17774 ; iOS #17765, Android #17772) —
 * lancer le partage contracte l'écran vers la capsule, la toucher le redéploie : l'un repart (180 ms) pendant que
 * l'autre arrive (220 ms), par le fondu et l'échelle de 0,92 ; « Réduire les animations » les ramène à un fondu
 * de 120 ms. Le départ garde l'écran monté, sans focus ni clic, le temps de son mouvement.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(async () => {
  await loadCallControlsCatalog('fr');
  await loadPillMotion();
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(async () => {
  await act(async () => {});
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

const call = (overrides: Partial<ActiveCall> = {}): ActiveCall => ({
  callId: 'call-swap',
  conversationId: 'c-1',
  media: 'audio',
  direction: 'outgoing',
  isGroup: false,
  title: 'Amina Diallo',
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

type Played = { readonly element: Element; readonly frames: Keyframe[]; readonly options: KeyframeAnimationOptions; finish: () => void };

function recordAnimations() {
  const played: Played[] = [];
  const real = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'animate');
  Object.defineProperty(HTMLElement.prototype, 'animate', {
    configurable: true,
    value(this: Element, frames: Keyframe[], options: KeyframeAnimationOptions) {
      let finish: () => void = () => undefined;
      const finished = new Promise<void>((resolve) => (finish = resolve));
      played.push({ element: this, frames, options, finish });
      return { finished, cancel: () => undefined, effect: null };
    },
  });
  return { played, restore: () => (real === undefined ? Reflect.deleteProperty(HTMLElement.prototype, 'animate') : Object.defineProperty(HTMLElement.prototype, 'animate', real)) };
}

const reduceMotion = (on: boolean) => {
  const real = window.matchMedia;
  window.matchMedia = ((query: string) => ({ matches: on && query.includes('reduce'), media: query, addEventListener() {}, removeEventListener() {} }) as unknown as MediaQueryList) as typeof window.matchMedia;
  return () => (window.matchMedia = real);
};

const settle = () => act(async () => void (await new Promise((resolve) => setTimeout(resolve, 30))));

async function mount(first: ActiveCall) {
  const host = document.createElement('div');
  document.body.append(host);
  const root: Root = createRoot(host);
  await act(async () => root.render(<ActiveCallView call={first} />));
  await settle();
  return {
    screen: () => host.querySelector<HTMLElement>('[data-call-screen]'),
    bar: () => host.querySelector<HTMLElement>('[data-call-pill-bar]'),
    screens: () => host.querySelectorAll('[data-call-screen]').length,
    render: async (next: ActiveCall) => {
      await act(async () => root.render(<ActiveCallView call={next} />));
      await settle();
    },
    done: async () => {
      await act(async () => root.unmount());
      host.remove();
    },
  };
}

describe('l’écran d’appel se contracte vers la capsule (S1.7)', () => {
  test('lancer mon partage : l’écran reste monté, sortant, le temps de son départ de 180 ms, pendant que la capsule arrive en 220 ms', async () => {
    const motion = recordAnimations();
    const view = await mount(call());
    motion.played.length = 0;
    await view.render(call({ display: 'pill', screenSharing: true }));
    const screen = view.screen();
    expect(screen).not.toBeNull();
    expect(screen?.hasAttribute('data-leaving')).toBe(true);
    expect(screen?.hasAttribute('inert')).toBe(true);
    expect(screen?.getAttribute('aria-hidden')).toBe('true');
    const exit = motion.played.find((move) => move.element === screen);
    expect(exit?.frames).toEqual([
      { opacity: 1, transform: 'none' },
      { opacity: 0, transform: 'scale(0.92)' },
    ]);
    expect(exit?.options.duration).toBe(180);
    const entry = motion.played.find((move) => move.element === view.bar());
    expect(entry?.frames).toEqual([
      { opacity: 0, transform: 'scale(0.92)' },
      { opacity: 1, transform: 'none' },
    ]);
    expect(entry?.options.duration).toBe(220);
    await act(async () => exit?.finish());
    await settle();
    expect(view.screen()).toBeNull();
    expect(view.bar()).not.toBeNull();
    await view.done();
    motion.restore();
  });

  test('réduit par le glissé vers le bas, l’écran se contracte là où le doigt l’a laissé, sans remonter d’abord', async () => {
    const motion = recordAnimations();
    const view = await mount(call());
    view.screen()?.style.setProperty('transform', 'translateY(480px)');
    motion.played.length = 0;
    await view.render(call({ display: 'pill' }));
    const exit = motion.played.find((move) => move.element === view.screen());
    expect(exit?.frames).toEqual([
      { opacity: 1, transform: 'translateY(480px)' },
      { opacity: 0, transform: 'translateY(480px) scale(0.92)' },
    ]);
    await view.done();
    motion.restore();
  });

  test('rouvert pendant qu’il repart, l’écran reprend sa place SANS être remonté : ni scène ni vidéo recréées', async () => {
    const motion = recordAnimations();
    const view = await mount(call());
    const first = view.screen();
    await view.render(call({ display: 'pill', screenSharing: true }));
    const exit = motion.played.find((move) => move.element === first && move.options.duration === 180);
    motion.played.length = 0;
    await view.render(call({ display: 'full', screenSharing: true }));
    expect(view.screen()).toBe(first);
    expect(first?.hasAttribute('data-leaving')).toBe(false);
    expect(motion.played.find((move) => move.element === first)?.options.duration).toBe(220);
    await act(async () => exit?.finish());
    await settle();
    expect(view.screen()).toBe(first);
    expect(view.screens()).toBe(1);
    await view.done();
    motion.restore();
  });

  test('sous « Réduire les animations » : un fondu de 120 ms, aucune échelle', async () => {
    const motion = recordAnimations();
    const restore = reduceMotion(true);
    const view = await mount(call());
    motion.played.length = 0;
    await view.render(call({ display: 'pill', screenSharing: true }));
    const exit = motion.played.find((move) => move.element === view.screen());
    expect(exit?.frames).toEqual([{ opacity: 1 }, { opacity: 0 }]);
    expect(exit?.options.duration).toBe(120);
    const entry = motion.played.find((move) => move.element === view.bar());
    expect(entry?.frames).toEqual([{ opacity: 0 }, { opacity: 1 }]);
    expect(entry?.options.duration).toBe(120);
    await view.done();
    restore();
    motion.restore();
  });
});

describe('la capsule se redéploie en écran d’appel (S2.1)', () => {
  test('toucher la capsule : elle repart pendant que l’écran arrive, sans rien d’abrupt', async () => {
    const motion = recordAnimations();
    const view = await mount(call({ display: 'pill', screenSharing: true }));
    motion.played.length = 0;
    await view.render(call({ display: 'full', screenSharing: true }));
    const bar = view.bar();
    expect(bar).not.toBeNull();
    expect(bar?.hasAttribute('data-leaving')).toBe(true);
    expect(bar?.hasAttribute('inert')).toBe(true);
    const exit = motion.played.find((move) => move.element === bar);
    expect(exit?.options.duration).toBe(180);
    const entry = motion.played.find((move) => move.element === view.screen());
    expect(entry?.frames[0]).toEqual({ opacity: 0, transform: 'scale(0.92)' });
    expect(entry?.options.duration).toBe(220);
    await act(async () => exit?.finish());
    await settle();
    expect(view.bar()).toBeNull();
    expect(view.screen()?.hasAttribute('data-leaving')).toBe(false);
    await view.done();
    motion.restore();
  });

  test('un appel qui vient de s’ouvrir ne joue rien : il n’y a rien d’où il vienne', async () => {
    const motion = recordAnimations();
    const view = await mount(call());
    expect(motion.played.filter((move) => move.element === view.screen())).toEqual([]);
    await view.done();
    motion.restore();
  });

  test('la bulle n’est pas concernée : réduire en bulle démonte la capsule à l’instant, comme avant', async () => {
    const view = await mount(call({ display: 'pill' }));
    await view.render(call({ display: 'bubble' }));
    expect(view.bar()).toBeNull();
    expect(view.screen()).toBeNull();
    await view.done();
  });
});
