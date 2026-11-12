import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { callActions } from '@/lib/calls/call-actions';
import { NO_LIVE_FRAME } from '@/lib/calls/call-live-frame-store';
import type { ActiveCall } from '@/lib/calls/call-store';
import { loadPillMotion } from '@/lib/calls/use-pill-motion';
import { loadCallControlsCatalog } from '@/lib/i18n-call-controls-catalog';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import CallScreenShareBanner from './call-share-banner';
import { CallTopBannerStack } from './call-screen';

/**
 * **LE BANDEAU « VOUS PARTAGEZ VOTRE ÉCRAN · ARRÊTER »** (P16.4 à P16.12, #17746) — un verre rouge
 * pâle sous l'en-tête, « Arrêter » en bouton blanc de 44 px, qui entre et repart par le haut et
 * se range avec les commandes.
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

type Played = { readonly element: Element; readonly frames: Keyframe[]; finish: () => void };

/** `Element.animate` n'existe pas dans happy-dom : une doublure qui note chaque mouvement et le laisse finir à la main. */
function recordAnimations() {
  const played: Played[] = [];
  const real = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'animate');
  Object.defineProperty(HTMLElement.prototype, 'animate', {
    configurable: true,
    value(this: Element, frames: Keyframe[]) {
      let finish: () => void = () => undefined;
      const finished = new Promise<void>((resolve) => (finish = resolve));
      played.push({ element: this, frames, finish });
      return { finished, cancel: () => undefined, effect: null };
    },
  });
  return { played, restore: () => (real === undefined ? Reflect.deleteProperty(HTMLElement.prototype, 'animate') : Object.defineProperty(HTMLElement.prototype, 'animate', real)) };
}

const mount = (sharing: boolean, hidden = false) => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  const render = (next: boolean, nextHidden = hidden) => act(() => root.render(<CallScreenShareBanner sharing={next} language="fr" hidden={nextHidden} />));
  render(sharing);
  return {
    host,
    render,
    find: (selector: string) => host.querySelector<HTMLElement>(selector),
    done: () => {
      act(() => root.unmount());
      host.remove();
    },
  };
};

describe('le bandeau de partage', () => {
  test('un verre teinté de rouge : l’icône d’écran, « Vous partagez votre écran », et Arrêter en bouton de 44 px au moins', () => {
    const view = mount(true);
    const banner = view.find('[data-call-screen-share-banner] [role="status"]');
    expect(banner?.className.split(' ')).toContain('glass-call-danger');
    expect(banner?.textContent).toBe('Vous partagez votre écranArrêter');
    expect(banner?.querySelector('svg')).not.toBeNull();
    const stop = view.find('[data-call-screen-share-stop]');
    expect(stop?.getAttribute('aria-label')).toBe('Arrêter le partage d’écran');
    expect(stop?.className).toContain('min-h-11');
    view.done();
  });

  test('Arrêter arrête le partage', () => {
    const original = callActions.toggleScreen;
    const taps: number[] = [];
    callActions.toggleScreen = () => void taps.push(1);
    const view = mount(true);
    act(() => view.find('[data-call-screen-share-stop]')?.click());
    expect(taps).toHaveLength(1);
    view.done();
    callActions.toggleScreen = original;
  });

  test('il se range vers le haut avec les commandes (data-call-stow="top") et se cache au lecteur d’écran', () => {
    const view = mount(true, true);
    const banner = view.find('[role="status"]');
    expect(banner?.getAttribute('data-call-stow')).toBe('top');
    expect(banner?.getAttribute('aria-hidden')).toBe('true');
    view.done();
  });

  test('il repart par le HAUT, le temps de son mouvement, sans prendre le doigt, puis se démonte (P16.6)', async () => {
    const motion = recordAnimations();
    const view = mount(true);
    motion.played.length = 0;
    view.render(false);
    const leaving = view.find('[data-call-screen-share-banner]');
    expect(leaving).not.toBeNull();
    expect(leaving?.hasAttribute('data-leaving')).toBe(true);
    expect(leaving?.hasAttribute('inert')).toBe(true);
    const exit = motion.played.find((move) => move.element === leaving);
    expect(exit?.frames[1]).toEqual({ opacity: 0, transform: 'translateY(-100%)' });
    await act(async () => exit?.finish());
    expect(view.find('[data-call-screen-share-banner]')).toBeNull();
    view.done();
    motion.restore();
  });

  test('pas de partage : rien', () => {
    const view = mount(false);
    expect(view.find('[data-call-screen-share-banner]')).toBeNull();
    view.done();
  });
});

/**
 * **LA PILE SE REFERME EN MOUVEMENT** (S2.6, #17774 ; `CallTopBannerStack` d'iOS anime sa VStack, `shrinkVertically`
 * d'Android) — le bandeau de partage qui repart quitte la mise en page à l'instant (il glisse vers le haut sans plus
 * tenir de place) et les bandeaux qui le suivaient remontent de la place qu'ils avaient, par la transformation seule,
 * au lieu de sauter. L'arrivée du bandeau les repousse de même.
 */
const call = (): ActiveCall => ({
  callId: 'call-stack',
  conversationId: 'c-1',
  media: 'audio',
  direction: 'outgoing',
  isGroup: false,
  title: 'Amina',
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
});

/** Où se voit la place de l'enregistrement : sous le bandeau tant qu'il tient sa place, juste sous l'en-tête sinon. */
function layOutStack() {
  const real = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'getBoundingClientRect');
  Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', {
    configurable: true,
    value(this: HTMLElement) {
      const held = document.querySelector('[data-call-screen-share-banner]:not([data-leaving])') !== null;
      const top = this.matches('[data-call-banner-slot]') ? (held ? 100 : 40) : 0;
      return { top, left: 0, right: 0, bottom: top, width: 0, height: 0, x: 0, y: top, toJSON: () => ({}) };
    },
  });
  return () => (real === undefined ? Reflect.deleteProperty(HTMLElement.prototype, 'getBoundingClientRect') : Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', real));
}

const mountStack = async (sharing: boolean) => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  const render = (next: boolean) =>
    act(async () => {
      root.render(<CallTopBannerStack call={call()} present={{ 'screen-share': next, recording: true }} language="fr" hidden={false} liveFrame={NO_LIVE_FRAME} />);
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
  await render(sharing);
  return {
    host,
    render,
    done: () => {
      act(() => root.unmount());
      host.remove();
    },
  };
};

describe('la pile des bandeaux du haut se referme en mouvement (S2.6)', () => {
  test('le bandeau de partage qui repart cède sa place à l’instant : les suivants remontent de ses 60 px, en transformation seule', async () => {
    const motion = recordAnimations();
    const unlay = layOutStack();
    const view = await mountStack(true);
    motion.played.length = 0;
    await view.render(false);
    const slot = view.host.querySelector('[data-call-banner-slot="recording"]');
    const rise = motion.played.find((move) => move.element === slot);
    expect(rise?.frames).toEqual([{ transform: 'translateY(60px)' }, { transform: 'none' }]);
    expect(view.host.querySelector('[data-call-screen-share-banner]')?.hasAttribute('data-leaving')).toBe(true);
    view.done();
    unlay();
    motion.restore();
  });

  test('le bandeau qui arrive repousse les suivants de la même façon, sans les faire sauter', async () => {
    const motion = recordAnimations();
    const unlay = layOutStack();
    const view = await mountStack(false);
    motion.played.length = 0;
    await view.render(true);
    const slot = view.host.querySelector('[data-call-banner-slot="recording"]');
    const fall = motion.played.find((move) => move.element === slot);
    expect(fall?.frames).toEqual([{ transform: 'translateY(-60px)' }, { transform: 'none' }]);
    view.done();
    unlay();
    motion.restore();
  });

  test('la feuille sort le bandeau sortant de la mise en page, pour que la pile se referme sans l’attendre', () => {
    const sheet = readFileSync(new URL('../styles/call-motion.css', import.meta.url), 'utf8');
    expect(sheet).toMatch(/\[data-call-banner-stack\]\s*>\s*\[data-call-screen-share-banner\]\[data-leaving\]\s*\{[^}]*position:\s*absolute/);
  });
});
