import { act, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import type { SwipeDownOutcome } from './call-swipe-down';
import { useCallChrome } from './use-call-chrome';
import { useCallSwipeDown } from './use-call-swipe-down';

/**
 * LE GLISSÉ VERS LE BAS, BRANCHÉ SUR L'ÉCRAN (#9096) — au doigt comme à la
 * souris : l'écran suit, puis, relâché assez bas, réduit l'appel. Et
 * l'ARBITRAGE avec `useCallChrome` : le clic que la souris émet en fin de
 * glissé n'est pas un toucher, il ne range pas les commandes ; un vrai
 * toucher, lui, les range toujours.
 */

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

type Harness = { readonly allowed?: boolean; readonly canPip?: boolean; readonly reducedMotion?: boolean };

function Screen({ allowed = true, canPip = false, reducedMotion = false, outcomes }: Harness & { readonly outcomes: SwipeDownOutcome[] }) {
  const root = useRef<HTMLDivElement>(null);
  const swipe = useCallSwipeDown({ root, allowed, canPip, reducedMotion, onOutcome: (outcome) => outcomes.push(outcome) });
  const visibility = useCallChrome({ videoScene: true, root, swallowTap: swipe.swallowTap });
  return (
    <div ref={root} data-visibility={visibility} data-offset={String(swipe.offset)}>
      <div data-stage="" />
      <button type="button" data-micro="">
        Micro
      </button>
    </div>
  );
}

const mount = (harness: Harness = {}) => {
  const outcomes: SwipeDownOutcome[] = [];
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => root.render(<Screen {...harness} outcomes={outcomes} />));
  const at = (selector: string) => host.querySelector(selector) as HTMLElement;
  const clock = { now: 0 };
  /* Un doigt posé à 60 i/s : chaque événement 16 ms après le précédent, sauf un `step` plus long — un glissé LENT. */
  const pointer = (type: string, target: EventTarget, y: number, step = 16) => {
    clock.now += step;
    const event = new PointerEvent(type, { bubbles: true, clientX: 100, clientY: y, pointerId: 1, isPrimary: true, button: 0, pointerType: 'touch' });
    Object.defineProperty(event, 'timeStamp', { value: clock.now });
    act(() => void target.dispatchEvent(event));
  };
  const drag = (selector: string, to: number, { click = false, step = 16 } = {}) => {
    const target = at(selector);
    pointer('pointerdown', target, 100);
    pointer('pointermove', target, 100 + to / 2, step);
    pointer('pointermove', target, 100 + to, step);
    pointer('pointerup', target, 100 + to, step);
    if (click) act(() => target.click());
  };
  const offset = () => Number(at('[data-offset]').getAttribute('data-offset'));
  const visibility = () => at('[data-visibility]').getAttribute('data-visibility');
  const done = () => {
    act(() => root.unmount());
    host.remove();
  };
  return { outcomes, at, pointer, drag, offset, visibility, done };
};

describe('useCallSwipeDown', () => {
  test('glissé aux trois quarts puis relâché : l’appel se réduit en bulle', () => {
    const view = mount();
    view.drag('[data-stage]', 260);
    expect(view.outcomes).toEqual(['pill']);
    expect(view.offset()).toBe(0);
    view.done();
  });

  test('… ou passe dans l’image dans l’image quand le navigateur l’offre', () => {
    const view = mount({ canPip: true });
    view.drag('[data-stage]', 260);
    expect(view.outcomes).toEqual(['pip']);
    view.done();
  });

  test('pendant le geste, l’écran suit le doigt ; relâché trop tôt, il revient', () => {
    const view = mount();
    const stage = view.at('[data-stage]');
    view.pointer('pointerdown', stage, 100);
    view.pointer('pointermove', stage, 220, 400);
    expect(view.offset()).toBe(120);
    view.pointer('pointerup', stage, 220, 400);
    expect(view.offset()).toBe(0);
    expect(view.outcomes).toEqual([]);
    view.done();
  });

  test('mouvement réduit : l’écran ne suit pas, mais le geste réduit quand même', () => {
    const view = mount({ reducedMotion: true });
    const stage = view.at('[data-stage]');
    view.pointer('pointerdown', stage, 100);
    view.pointer('pointermove', stage, 360);
    expect(view.offset()).toBe(0);
    view.pointer('pointerup', stage, 360);
    expect(view.outcomes).toEqual(['pill']);
    view.done();
  });

  test('un glissé qui part d’un bouton appartient au bouton', () => {
    const view = mount();
    view.drag('[data-micro]', 300);
    expect(view.outcomes).toEqual([]);
    view.done();
  });

  test('là où le geste n’existe pas (groupe, menu ouvert), rien ne bouge', () => {
    const view = mount({ allowed: false });
    view.drag('[data-stage]', 300);
    expect(view.outcomes).toEqual([]);
    expect(view.offset()).toBe(0);
    view.done();
  });
});

describe('arbitrage toucher / glissé avec useCallChrome', () => {
  test('le clic qui suit un glissé à la souris ne range pas les commandes', () => {
    const view = mount();
    view.drag('[data-stage]', 120, { click: true, step: 400 });
    expect(view.visibility()).toBe('shown');
    view.done();
  });

  test('un lancer franc vers le bas conclut avant les trois quarts', () => {
    const view = mount();
    view.drag('[data-stage]', 120);
    expect(view.outcomes).toEqual(['pill']);
    view.done();
  });

  test('un toucher reste un toucher : il range, le suivant rend', () => {
    const view = mount();
    view.drag('[data-stage]', 120, { click: true, step: 400 });
    view.drag('[data-stage]', 0, { click: true });
    expect(view.visibility()).toBe('dismissed');
    view.drag('[data-stage]', 4, { click: true });
    expect(view.visibility()).toBe('shown');
    expect(view.outcomes).toEqual([]);
    view.done();
  });
});
