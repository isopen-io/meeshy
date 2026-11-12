import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { callActions } from '@/lib/calls/call-actions';
import { loadPillMotion } from '@/lib/calls/use-pill-motion';
import { loadCallControlsCatalog } from '@/lib/i18n-call-controls-catalog';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import CallScreenShareBanner from './call-share-banner';

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
