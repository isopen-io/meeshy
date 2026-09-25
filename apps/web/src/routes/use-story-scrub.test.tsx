import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import type { SceneClockHandle } from '@/components/scene-clock';

import { useStoryScrub, type StoryScrub } from './use-story-scrub';

/**
 * LE SEGMENT ACTIF SE PARCOURT AU DOIGT (#7879) — la loi d'hôte du lecteur de
 * story : pendant le glissé, l'avance automatique est SUSPENDUE ; le minuteur
 * de diapositive (`elapsedRef` + `startTsRef`, `story.tsx`) repart DEPUIS le
 * temps pointé ; la scène est redessinée par l'horloge de son moteur.
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
  act(() => {
    root.unmount();
  });
  container.remove();
});

type Timer = { readonly elapsedRef: { current: number }; readonly startTsRef: { current: number } };

function fakeClock(): { readonly clock: SceneClockHandle; readonly seeks: number[] } {
  const seeks: number[] = [];
  const clock: SceneClockHandle = {
    subscribe: () => () => undefined,
    subscribeSeek: () => () => undefined,
    seek: (t) => seeks.push(t),
    now: () => 0,
  };
  return { clock, seeks };
}

function Harness({ storyId, timer, expose }: { readonly storyId: string; readonly timer: Timer; readonly expose: (s: StoryScrub) => void }) {
  expose(useStoryScrub({ storyId, elapsedRef: timer.elapsedRef, startTsRef: timer.startTsRef }));
  return null;
}

function mountScrub(storyId = 'st-1'): { readonly scrub: () => StoryScrub; readonly timer: Timer; readonly rerender: (id: string) => void } {
  const timer: Timer = { elapsedRef: { current: 0 }, startTsRef: { current: 0 } };
  let latest: StoryScrub | null = null;
  container = window.document.createElement('div');
  window.document.body.appendChild(container);
  root = createRoot(container);
  const render = (id: string) =>
    act(() => {
      root.render(<Harness storyId={id} timer={timer} expose={(s) => (latest = s)} />);
    });
  render(storyId);
  return {
    scrub: () => {
      if (latest === null) throw new Error('hook absent');
      return latest;
    },
    timer,
    rerender: render,
  };
}

describe('useStoryScrub (#7879)', () => {
  test('le doigt posé SUSPEND l’avance ; relâcher la rend', () => {
    const { scrub } = mountScrub();
    expect(scrub().scrubbing).toBe(false);
    act(() => scrub().onScrubStart());
    expect(scrub().scrubbing).toBe(true);
    act(() => scrub().onScrubEnd(2));
    expect(scrub().scrubbing).toBe(false);
  });

  test('chaque temps pointé REPOSE le minuteur de la diapositive et redessine la scène', () => {
    const { scrub, timer } = mountScrub();
    const { clock, seeks } = fakeClock();
    act(() => scrub().onClock(clock));
    const before = performance.now();
    act(() => scrub().onScrubStart());
    act(() => scrub().onScrub(1.5));
    act(() => scrub().onScrubEnd(2.25));
    expect(seeks).toEqual([1.5, 2.25]);
    expect(timer.elapsedRef.current).toBe(2250);
    expect(timer.startTsRef.current).toBeGreaterThanOrEqual(before);
  });

  test('sans scène (story d’image ou de texte), le temps pointé règle la progression seule', () => {
    const { scrub, timer } = mountScrub();
    act(() => scrub().onScrub(4));
    expect(timer.elapsedRef.current).toBe(4000);
  });

  test('changer de story oublie un glissé en cours — l’avance de la suivante n’est pas suspendue', () => {
    const { scrub, rerender } = mountScrub('st-1');
    act(() => scrub().onScrubStart());
    rerender('st-2');
    expect(scrub().scrubbing).toBe(false);
  });

  test('changer de story oublie l’horloge de la précédente', () => {
    const { scrub, rerender, timer } = mountScrub('st-1');
    const { clock, seeks } = fakeClock();
    act(() => scrub().onClock(clock));
    rerender('st-2');
    act(() => scrub().onScrub(1));
    expect(seeks).toEqual([]);
    expect(timer.elapsedRef.current).toBe(1000);
  });
});
