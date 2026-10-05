import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { act } from 'react';

import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { Flame } from './flame';

const CSS = readFileSync(new URL('../../styles/game.css', import.meta.url), 'utf8');

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean; IntersectionObserver?: unknown };

type Observation = { readonly target: Element; readonly callback: (entries: readonly { readonly isIntersecting: boolean }[]) => void; disconnected: boolean };
const observations: Observation[] = [];
const original = globals.IntersectionObserver;

beforeAll(() => {
  ensureHappyDomRegistered({ url: 'http://localhost/game' });
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  globals.IntersectionObserver = original;
  await releaseHappyDomIfRegistered();
});

beforeEach(() => {
  observations.length = 0;
  globals.IntersectionObserver = class {
    private readonly callback: Observation['callback'];
    private current: Observation | null = null;
    constructor(callback: Observation['callback']) {
      this.callback = callback;
    }
    observe(target: Element): void {
      this.current = { target, callback: this.callback, disconnected: false };
      observations.push(this.current);
    }
    disconnect(): void {
      if (this.current !== null) this.current.disconnected = true;
    }
  };
});

const mounter = createActMounter();
afterEach(() => mounter.unmountAll());

const flameOf = (host: HTMLElement): Element => {
  const flame = host.querySelector('[data-game-flame]');
  if (flame === null) throw new Error('flamme absente');
  return flame;
};

/**
 * LA FLAMME HORS DE L'ÉCRAN (#9381) — son vacillement boucle sans fin : il se
 * met en pause dès que la Flamme quitte la fenêtre, et reprend quand elle y
 * revient. Sous « réduire les animations » il ne joue jamais.
 */
describe('la Flamme se tait hors de l’écran', () => {
  test('visible au premier rendu : le vacillement joue', async () => {
    const host = await mounter.mount(<Flame form="flamme" size={64} />);
    expect(flameOf(host).hasAttribute('data-game-offscreen')).toBe(false);
  });

  test('sortie de la fenêtre : marquée hors écran ; de retour : le marquage se retire', async () => {
    const host = await mounter.mount(<Flame form="flamme" size={64} />);
    const [observation] = observations;
    expect(observation?.target).toBe(flameOf(host));
    act(() => observation?.callback([{ isIntersecting: false }]));
    expect(flameOf(host).hasAttribute('data-game-offscreen')).toBe(true);
    act(() => observation?.callback([{ isIntersecting: true }]));
    expect(flameOf(host).hasAttribute('data-game-offscreen')).toBe(false);
  });

  test('démontée, la Flamme rend son observateur', async () => {
    await mounter.mount(<Flame form="flamme" size={64} />);
    mounter.unmountAll();
    expect(observations.every((observation) => observation.disconnected)).toBe(true);
  });

  test('sans IntersectionObserver, elle reste tenue pour visible', async () => {
    globals.IntersectionObserver = undefined;
    const host = await mounter.mount(<Flame form="flamme" size={64} />);
    expect(flameOf(host).hasAttribute('data-game-offscreen')).toBe(false);
  });
});

describe('la feuille du jeu', () => {
  test('hors écran, le vacillement est en pause', () => {
    expect(CSS).toMatch(/\[data-game-offscreen\]\s+\[data-game-flicker\]\s*\{[^}]*animation-play-state:\s*paused/);
  });

  test('le vacillement infini ne joue que sous « animations permises »', () => {
    const reduced = CSS.slice(CSS.indexOf('@media (prefers-reduced-motion: no-preference)'));
    const block = reduced.slice(0, reduced.indexOf('\n}\n') + 3);
    expect(block).toContain('animation: gameFlicker');
    const outside = CSS.replace(block, '');
    expect(outside).not.toMatch(/animation:[^;]*gameFlicker/);
  });
});
