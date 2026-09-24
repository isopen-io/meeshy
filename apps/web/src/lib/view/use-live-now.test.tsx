import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import type { IntervalClock } from './interval-clock';
import { useLiveNow } from './use-live-now';

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

function manualClock(): IntervalClock & { tick: (now: number) => void; readonly subscribers: () => number } {
  const listeners = new Set<(now: number) => void>();
  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    tick: (now) => [...listeners].forEach((l) => l(now)),
    subscribers: () => listeners.size,
  };
}

/**
 * L'HORLOGE D'UNE LIGNE ÉPHÉMÈRE (#7547) — la ligne dont le dernier message
 * décompte tique à la seconde jusqu'à son échéance, puis se DÉSABONNE : la
 * bascule vers « expiré » arrive sans aucun autre événement, et aucune autre
 * ligne (ni celle-ci après l'échéance) ne se repeint.
 */
describe('useLiveNow (#7547)', () => {
  test('tique jusqu’à l’échéance, rend l’instant de l’échéance, puis se désabonne', () => {
    const clock = manualClock();
    const seen: number[] = [];
    function Probe() {
      seen.push(useLiveNow(10_000, clock, () => 1_000));
      return null;
    }
    const container = document.createElement('div');
    const root = createRoot(container);
    act(() => {
      root.render(<Probe />);
    });

    expect(seen.at(-1)).toBe(1_000);
    expect(clock.subscribers()).toBe(1);

    act(() => clock.tick(5_000));
    expect(seen.at(-1)).toBe(5_000);

    act(() => clock.tick(10_000));
    expect(seen.at(-1)).toBe(10_000);
    expect(clock.subscribers()).toBe(0);

    act(() => {
      root.unmount();
    });
  });

  test('sans échéance (ou échéance passée) : aucun abonnement', () => {
    const clock = manualClock();
    function Probe(p: { readonly deadline: number | undefined }) {
      useLiveNow(p.deadline, clock, () => 20_000);
      return null;
    }
    const root = createRoot(document.createElement('div'));
    act(() => {
      root.render(<Probe deadline={undefined} />);
    });
    expect(clock.subscribers()).toBe(0);
    act(() => {
      root.render(<Probe deadline={10_000} />);
    });
    expect(clock.subscribers()).toBe(0);
    act(() => {
      root.unmount();
    });
  });
});
