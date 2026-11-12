import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { loadPillMotion } from '@/lib/calls/use-pill-motion';
import { loadCallControlsCatalog } from '@/lib/i18n-call-controls-catalog';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import type { CallMember } from '@/lib/calls/call-store';

import { CallGrid, type CallGridProps } from './call-grid';
import { CALL_GRID_KIT } from './call-stage';

/**
 * **RIEN NE DISPARAÎT D'UN COUP, SUR LA UNE D'UN GROUPE** (U1.12, U2.5, U2.10 ; #17406) — la capsule « Revenir à la
 * grille · Plein écran » repart en fondu quand la grille revient, le bandeau des autres repart par son bord quand
 * l'écran devient plein, et revient par le même chemin ; la puce « Écran de X · 2× » est un verre en haut à
 * gauche, avec l'icône de l'écran partagé et le facteur du zoom.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

const member = (userId: string, name: string, overrides: Partial<CallMember> = {}): CallMember => ({ userId, name, avatar: null, micMuted: false, cameraOn: false, screenSharing: false, weakNetwork: false, capturing: false, link: 'connected', ...overrides });

const liveVideo = { getVideoTracks: () => [{ readyState: 'live' }], getTracks: () => [] } as unknown as MediaStream;

const props = (overrides: Partial<CallGridProps> = {}): CallGridProps => ({
  kit: CALL_GRID_KIT,
  members: [member('u-a', 'Awa'), member('u-b', 'Bintou')],
  remoteStreams: {},
  self: { stream: null, cameraOn: false, mirrored: true, micMuted: false },
  choice: { kind: 'self' },
  onChoose: () => undefined,
  immersive: false,
  onToggleImmersive: () => undefined,
  moderation: null,
  language: 'fr',
  ...overrides,
});

const sharing = { members: [member('u-a', 'Awa'), member('u-k', 'Kofi', { screenSharing: true })], remoteStreams: { 'u-k': liveVideo }, choice: null };

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
  return {
    played,
    restore: () => (real === undefined ? Reflect.deleteProperty(HTMLElement.prototype, 'animate') : Object.defineProperty(HTMLElement.prototype, 'animate', real)),
  };
}

const mount = (overrides: Partial<CallGridProps>) => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => root.render(<CallGrid {...props(overrides)} />));
  return {
    host,
    render: (next: Partial<CallGridProps>) => act(() => root.render(<CallGrid {...props(next)} />)),
    done: () => {
      act(() => root.unmount());
      host.remove();
    },
  };
};

describe('CallGrid — la capsule repart en fondu au retour à la grille (U1.12)', () => {
  test('« Revenir à la grille » : la capsule reste le temps de son fondu, sans prendre le doigt, puis se démonte', async () => {
    const motion = recordAnimations();
    const view = mount({});
    expect(view.host.querySelector('[data-call-spotlight-capsule]')).not.toBeNull();
    motion.played.length = 0;
    view.render({ choice: { kind: 'grid', dismissedSharer: null } });
    const leaving = view.host.querySelector('[data-call-spotlight-capsule]');
    expect(view.host.querySelector('[data-call-spotlight]')).toBeNull();
    expect(leaving).not.toBeNull();
    expect(leaving?.hasAttribute('data-leaving')).toBe(true);
    expect(leaving?.hasAttribute('inert')).toBe(true);
    expect(leaving?.getAttribute('aria-hidden')).toBe('true');
    const fade = motion.played.find((move) => move.element === leaving);
    expect(fade?.frames).toEqual([{ opacity: 1 }, { opacity: 0 }]);
    await act(async () => fade?.finish());
    expect(view.host.querySelector('[data-call-spotlight-capsule]')).toBeNull();
    view.done();
    motion.restore();
  });

  test('sans API d’animation, elle repart d’un coup plutôt que de rester', () => {
    const real = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'animate');
    Object.defineProperty(HTMLElement.prototype, 'animate', { configurable: true, value: undefined });
    const view = mount({});
    view.render({ choice: { kind: 'grid', dismissedSharer: null } });
    expect(view.host.querySelector('[data-call-spotlight-capsule]')).toBeNull();
    view.done();
    if (real === undefined) Reflect.deleteProperty(HTMLElement.prototype, 'animate');
    else Object.defineProperty(HTMLElement.prototype, 'animate', real);
  });

  test('une grille montée à froid ne porte aucune capsule qui repart', () => {
    const view = mount({ choice: { kind: 'grid', dismissedSharer: null } });
    expect(view.host.querySelector('[data-call-spotlight-capsule]')).toBeNull();
    view.done();
  });

  test('revenir à la une pendant le fondu remplace la capsule qui repart par la vraie', () => {
    const motion = recordAnimations();
    const view = mount({});
    view.render({ choice: { kind: 'grid', dismissedSharer: null } });
    view.render({ choice: { kind: 'self' } });
    const capsules = view.host.querySelectorAll('[data-call-spotlight-capsule]');
    expect(capsules).toHaveLength(1);
    expect(capsules[0]?.hasAttribute('data-leaving')).toBe(false);
    view.done();
    motion.restore();
  });
});

describe('CallGrid — le bandeau des autres sort par son bord et revient par lui (U2.10)', () => {
  test('plein écran : le bandeau quitte la mise en page à l’instant et repart vers le bas, tuiles comprises, sans prendre le doigt', async () => {
    const motion = recordAnimations();
    const view = mount({ members: [member('u-a', 'Awa'), member('u-b', 'Bintou')] });
    expect(view.host.querySelector('[data-call-strip]')?.getAttribute('data-call-strip-edge')).toBe('bottom');
    motion.played.length = 0;
    view.render({ immersive: true });
    const strip = view.host.querySelector('[data-call-strip]');
    expect(strip?.hasAttribute('data-leaving')).toBe(true);
    expect(strip?.hasAttribute('inert')).toBe(true);
    const out = motion.played.find((move) => move.element === strip);
    expect(out?.frames).toEqual([
      { opacity: 1, transform: 'translateY(0)' },
      { opacity: 0, transform: 'translateY(100%)' },
    ]);
    await act(async () => out?.finish());
    expect(view.host.querySelector('[data-call-strip]')).toBeNull();
    view.done();
    motion.restore();
  });

  test('en paysage, la colonne repart par le bord de fin de l’écran, à gauche en droite à gauche', async () => {
    const motion = recordAnimations();
    const view = mount({ landscape: true });
    motion.played.length = 0;
    view.host.style.direction = 'rtl';
    view.render({ landscape: true, immersive: true });
    const strip = view.host.querySelector('[data-call-strip]');
    expect(strip?.getAttribute('data-call-strip-edge')).toBe('trailing');
    expect(motion.played.find((move) => move.element === strip)?.frames[1]).toEqual({ opacity: 0, transform: 'translateX(-100%)' });
    view.done();
    motion.restore();
  });

  test('quitter le plein écran : le bandeau revient par son bord', () => {
    const motion = recordAnimations();
    const view = mount({ immersive: true });
    expect(view.host.querySelector('[data-call-strip]')).toBeNull();
    motion.played.length = 0;
    view.render({ immersive: false });
    const strip = view.host.querySelector('[data-call-strip]');
    expect(strip?.hasAttribute('data-leaving')).toBe(false);
    expect(motion.played.find((move) => move.element === strip)?.frames[0]).toEqual({ opacity: 0, transform: 'translateY(100%)' });
    view.done();
    motion.restore();
  });
});

describe('CallGrid — la puce « Écran de X · 2× » (U2.5)', () => {
  const chip = (html: string) => /<span[^>]*data-call-screen-banner[^>]*>[\s\S]*?<\/span>/.exec(html)?.[0] ?? '';
  const html = () => renderToStaticMarkup(<CallGrid {...props(sharing)} />);

  test('un verre en haut à gauche, du côté du début, jamais en bas', () => {
    expect(chip(html())).toMatch(/glass-call-prominent[^"]*absolute start-2 top-2/);
    expect(html()).not.toContain('bottom-2 left-2');
  });

  test('l’icône de l’écran partagé précède le nom', () => {
    expect(chip(html())).toMatch(/<svg[\s\S]*Écran de Kofi/);
  });

  test('au zoom 1, aucun facteur ; zoomé, la puce le dit', () => {
    expect(chip(html())).not.toContain('×');
    const view = mount({ ...sharing, remoteStreams: { 'u-k': Object.defineProperty(new MediaStream(), 'getVideoTracks', { value: () => [{ readyState: 'live' }] }) } });
    const screen = () => view.host.querySelector('[data-call-shared-screen]') as HTMLElement;
    const wheel = Object.defineProperty(new WheelEvent('wheel', { deltaY: -208, bubbles: true, cancelable: true }), 'ctrlKey', { value: true });
    act(() => void screen().dispatchEvent(wheel));
    expect(view.host.querySelector('[data-call-screen-banner]')?.textContent).toMatch(/^Écran de Kofi · 2×$/);
    view.done();
  });
});
