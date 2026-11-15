import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { PlaybackStallIndicator, STALL_INDICATOR_GRACE_MS } from './playback-stall-indicator';

/**
 * L'ATTENTE SE DIT, MAIS PAS POUR UN MICRO-BUFFER (#9277) — miroir de
 * `StoryPlaybackStallIndicator` d'iOS : une image figée muette est
 * indiscernable d'un gel ; un buffer de moins de 350 ms (un seek, un tour de
 * boucle) ne fait pas clignoter de roue. La disparition est immédiate.
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

let container: HTMLDivElement;
let root: Root;
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('PlaybackStallIndicator', () => {
  test('paraît après la grâce, disparaît tout de suite à la reprise', async () => {
    container = window.document.createElement('div');
    window.document.body.appendChild(container);
    root = createRoot(container);
    const shown = () => container.querySelector('[data-playback-stall]') !== null;
    act(() => root.render(<PlaybackStallIndicator stalled language="fr" />));
    expect(shown()).toBe(false);
    await act(() => wait(STALL_INDICATOR_GRACE_MS + 50));
    expect(shown()).toBe(true);
    expect(container.querySelector('[role="status"]')?.getAttribute('aria-label')).toBe('Chargement…');
    act(() => root.render(<PlaybackStallIndicator stalled={false} language="fr" />));
    expect(shown()).toBe(false);
  });

  test('un micro-buffer plus court que la grâce ne montre rien', async () => {
    container = window.document.createElement('div');
    window.document.body.appendChild(container);
    root = createRoot(container);
    act(() => root.render(<PlaybackStallIndicator stalled language="fr" />));
    await act(() => wait(STALL_INDICATOR_GRACE_MS / 3));
    act(() => root.render(<PlaybackStallIndicator stalled={false} language="fr" />));
    await act(() => wait(STALL_INDICATOR_GRACE_MS));
    expect(container.querySelector('[data-playback-stall]')).toBeNull();
  });
});
