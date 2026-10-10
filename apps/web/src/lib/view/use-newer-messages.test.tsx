import { act, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test';

import type { ListPaginationState } from '@/lib/lens/pagination';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { useNewerMessages } from './use-newer-messages';

/**
 * #7420 — LE BAS D'UNE FENÊTRE ANCRÉE REDESCEND VERS LE PRÉSENT. Une sentinelle
 * de pied, symétrique de la tête (`useOlderMessages`) : à l'approche du bas,
 * la page plus récente se demande — une seule à la fois, jamais pendant
 * qu'une page est en vol ou après un refus, jamais sur un fil vide.
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

let reach: (() => void) | null = null;
let native: typeof IntersectionObserver | undefined;

class FakeIntersectionObserver {
  constructor(private readonly callback: IntersectionObserverCallback) {}
  observe(el: Element) {
    reach = () => this.callback([{ isIntersecting: true, target: el } as IntersectionObserverEntry], this as unknown as IntersectionObserver);
  }
  unobserve() {}
  disconnect() {
    reach = null;
  }
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
  readonly root = null;
  readonly rootMargin = '';
  readonly thresholds: ReadonlyArray<number> = [];
}

beforeEach(() => {
  reach = null;
  native = globalThis.IntersectionObserver;
  (globalThis as typeof globalThis & { IntersectionObserver: unknown }).IntersectionObserver = FakeIntersectionObserver as unknown as typeof IntersectionObserver;
});

let container: HTMLDivElement;
let root: Root;

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  if (native !== undefined) (globalThis as typeof globalThis & { IntersectionObserver: unknown }).IntersectionObserver = native;
});

function mount(state: ListPaginationState, rowCount: number) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  let fetches = 0;
  function Host() {
    const scroller = useRef<HTMLElement | null>(null);
    const newer = useNewerMessages({ scroller, state, rowCount, fetchNewer: () => (fetches += 1) });
    return (
      <main ref={scroller as never}>
        <div ref={newer.sentinelRef} />
      </main>
    );
  }
  act(() => {
    root.render(<Host />);
  });
  return { fetches: () => fetches };
}

describe('useNewerMessages — la sentinelle de pied d’une fenêtre ancrée (#7420)', () => {
  test('atteinte au repos : la page plus récente se demande', () => {
    const h = mount('idle', 30);
    act(() => reach?.());
    expect(h.fetches()).toBe(1);
  });

  test('une page en vol, un refus, un présent atteint ou un fil vide : rien ne part', () => {
    for (const [state, rows] of [['loading-more', 30], ['error', 30], ['exhausted', 30], ['idle', 0]] as const) {
      const h = mount(state, rows);
      act(() => reach?.());
      expect(h.fetches()).toBe(0);
      act(() => root.unmount());
      container.remove();
      container = document.createElement('div');
      root = createRoot(container);
    }
  });
});
