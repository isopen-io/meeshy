import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { useStoryKeyboardShortcuts } from './use-story-keyboard-shortcuts';

/**
 * EXTRACTION PURE de `routes/story.tsx` (#7116, § budget) — la preuve que le
 * câblage clavier n'a pas changé de comportement.
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(() => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

let container: HTMLDivElement;
let root: Root;

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
});

type Calls = {
  advanced: ('previous' | 'next')[];
  paused: number;
  resumed: number;
  closed: number;
  muted: number;
};

function Harness({ calls, isPaused, showsSound, layerOpen }: { readonly calls: Calls; readonly isPaused: boolean; readonly showsSound: boolean; readonly layerOpen: boolean }) {
  useStoryKeyboardShortcuts({
    advance: (d) => calls.advanced.push(d),
    paused: isPaused,
    pause: () => calls.paused++,
    resume: () => calls.resumed++,
    closeViewer: () => calls.closed++,
    showsSound,
    onToggleMute: () => calls.muted++,
    layerOpen,
  });
  return null;
}

function mount(props: { readonly calls: Calls; readonly isPaused: boolean; readonly showsSound: boolean; readonly layerOpen: boolean }): void {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(<Harness {...props} />));
}

function key(k: string): void {
  act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: k })));
}

function newCalls(): Calls {
  return { advanced: [], paused: 0, resumed: 0, closed: 0, muted: 0 };
}

describe('useStoryKeyboardShortcuts — la navigation au clavier du lecteur', () => {
  test('Échap ferme, sans condition', () => {
    const calls = newCalls();
    mount({ calls, isPaused: false, showsSound: false, layerOpen: false });
    key('Escape');
    expect(calls.closed).toBe(1);
  });

  test('les flèches avancent / reculent', () => {
    const calls = newCalls();
    mount({ calls, isPaused: false, showsSound: false, layerOpen: false });
    key('ArrowRight');
    key('ArrowLeft');
    expect(calls.advanced).toEqual(['next', 'previous']);
  });

  test('Espace bascule pause / reprise', () => {
    const calls = newCalls();
    mount({ calls, isPaused: false, showsSound: false, layerOpen: false });
    key(' ');
    expect(calls.paused).toBe(1);
  });

  test('« m » coupe le son SEULEMENT si la story en a un', () => {
    const sans = newCalls();
    mount({ calls: sans, isPaused: false, showsSound: false, layerOpen: false });
    key('m');
    expect(sans.muted).toBe(0);

    act(() => root.unmount());
    const avec = newCalls();
    mount({ calls: avec, isPaused: false, showsSound: true, layerOpen: false });
    key('m');
    expect(avec.muted).toBe(1);
  });

  test('une COUCHE OUVERTE (commentaires OU vues) suspend les flèches — la story ne bouge pas sous elle', () => {
    const calls = newCalls();
    mount({ calls, isPaused: false, showsSound: false, layerOpen: true });
    key('ArrowRight');
    expect(calls.advanced).toEqual([]);
  });
});
