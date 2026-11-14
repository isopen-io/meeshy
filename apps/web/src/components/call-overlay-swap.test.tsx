import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { callActions } from '@/lib/calls/call-actions';
import type { ActiveCall } from '@/lib/calls/call-store';
import { loadPillMotion } from '@/lib/calls/use-pill-motion';
import { loadCallControlsCatalog } from '@/lib/i18n-call-controls-catalog';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { ActiveCallView } from './call-overlay';

/**
 * **L'ÉCRAN D'APPEL ET L'APPEL RÉDUIT S'ÉCHANGENT EN MOUVEMENT** (S1.7, S2.1, P18.4, P18.8, #17774 ; iOS #18464,
 * Android #18449) — réduire contracte l'écran VERS la capsule (au dixième, ancré en haut au centre), la toucher le
 * redéploie depuis elle ; toucher la bulle le redéploie depuis l'endroit où elle flotte. L'un repart (180 ms) pendant
 * que l'autre arrive (220 ms), la capsule par son échelle courte de 0,92 ; « Réduire les animations » les ramène à
 * un fondu de 120 ms. Le départ garde l'écran monté le temps de son mouvement, caché au lecteur d'écran mais
 * touchable (loi 17.11) : un toucher pendant la contraction la reprend et rend le plein écran.
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
    expect(screen?.hasAttribute('inert')).toBe(false);
    expect(screen?.getAttribute('aria-hidden')).toBe('true');
    expect(screen?.style.transformOrigin).toBe('50% 0%');
    const exit = motion.played.find((move) => move.element === screen);
    expect(exit?.frames).toEqual([
      { opacity: 1, transform: 'none' },
      { opacity: 0, transform: 'scale(0.1)' },
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
      { opacity: 0, transform: 'translateY(480px) scale(0.1)' },
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
    expect(bar?.hasAttribute('inert')).toBe(false);
    const exit = motion.played.find((move) => move.element === bar);
    expect(exit?.options.duration).toBe(180);
    const entry = motion.played.find((move) => move.element === view.screen());
    expect(entry?.frames[0]).toEqual({ opacity: 0, transform: 'scale(0.1)' });
    expect(view.screen()?.style.transformOrigin).toBe('50% 0%');
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

const placeBubble = (rect: { readonly left: number; readonly top: number; readonly width: number; readonly height: number }) => {
  const bubble = document.createElement('div');
  bubble.setAttribute('data-call-bubble', 'trailing');
  bubble.getBoundingClientRect = () => ({ ...rect, x: rect.left, y: rect.top, right: rect.left + rect.width, bottom: rect.top + rect.height, toJSON: () => rect }) as DOMRect;
  document.body.append(bubble);
  return () => bubble.remove();
};

describe('la bulle redéploie l’écran depuis l’endroit où elle flotte (P18.4, P18.8)', () => {
  test('toucher la bulle : l’écran grandit du dixième à la pleine taille, ancré au centre mesuré de la bulle', async () => {
    const motion = recordAnimations();
    const view = await mount(call({ display: 'bubble' }));
    const remove = placeBubble({ left: 728, top: 334, width: 80, height: 100 });
    await view.render(call({ display: 'full' }));
    remove();
    const screen = view.screen();
    expect(screen).not.toBeNull();
    expect(screen?.hasAttribute('data-leaving')).toBe(false);
    expect(screen?.style.transformOrigin).toBe('75% 50%');
    const entry = motion.played.find((move) => move.element === screen);
    expect(entry?.frames).toEqual([
      { opacity: 0, transform: 'scale(0.1)' },
      { opacity: 1, transform: 'none' },
    ]);
    expect(entry?.options.duration).toBe(220);
    await view.done();
    motion.restore();
  });

  test('sans bulle mesurée, l’écran part de la capsule : en haut au centre', async () => {
    const motion = recordAnimations();
    const view = await mount(call({ display: 'bubble' }));
    await view.render(call({ display: 'full' }));
    expect(view.screen()?.style.transformOrigin).toBe('50% 0%');
    expect(motion.played.find((move) => move.element === view.screen())?.frames[0]).toEqual({ opacity: 0, transform: 'scale(0.1)' });
    await view.done();
    motion.restore();
  });

  test('sous « Réduire les animations » : un fondu de 120 ms, aucune échelle', async () => {
    const motion = recordAnimations();
    const restore = reduceMotion(true);
    const view = await mount(call({ display: 'bubble' }));
    const remove = placeBubble({ left: 728, top: 334, width: 80, height: 100 });
    await view.render(call({ display: 'full' }));
    remove();
    const entry = motion.played.find((move) => move.element === view.screen());
    expect(entry?.frames).toEqual([{ opacity: 0 }, { opacity: 1 }]);
    expect(entry?.options.duration).toBe(120);
    await view.done();
    restore();
    motion.restore();
  });
});

describe('la contraction est interruptible (P18.8, loi 17.11)', () => {
  test('un toucher sur l’écran qui se contracte le rend au plein écran, sans déclencher le bouton touché', async () => {
    const calls: string[] = [];
    const real = { expand: callActions.expand, hangup: callActions.hangup };
    callActions.expand = () => void calls.push('expand');
    callActions.hangup = () => void calls.push('hangup');
    try {
      const motion = recordAnimations();
      const view = await mount(call());
      await view.render(call({ display: 'pill' }));
      const hangup = view.screen()?.querySelector<HTMLElement>('button[aria-label="Raccrocher"]');
      expect(hangup).not.toBeNull();
      expect(hangup?.closest('[inert]')).toBeNull();
      act(() => {
        hangup?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
        hangup?.click();
      });
      expect(calls).toEqual(['expand']);
      await view.done();
      motion.restore();
    } finally {
      callActions.expand = real.expand;
      callActions.hangup = real.hangup;
    }
  });

  test('l’écran rendu, ses boutons répondent de nouveau', async () => {
    const calls: string[] = [];
    const real = { expand: callActions.expand, hangup: callActions.hangup };
    callActions.expand = () => void calls.push('expand');
    callActions.hangup = () => void calls.push('hangup');
    try {
      const view = await mount(call());
      act(() => view.screen()?.querySelector<HTMLElement>('button[aria-label="Raccrocher"]')?.click());
      expect(calls).toEqual(['hangup']);
      await view.done();
    } finally {
      callActions.expand = real.expand;
      callActions.hangup = real.hangup;
    }
  });
});
