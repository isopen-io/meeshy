import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useRef, useState } from 'react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import { useLoadMoreSentinel } from './use-load-more-sentinel';

/**
 * `useLoadMoreSentinel` (#6195) — motif `use-out-of-view.test.tsx` : happy-dom
 * ne calcule aucune intersection réelle, donc un FAUX `IntersectionObserver`
 * pose la loi à la main.
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

type Recorded = {
  callback: IntersectionObserverCallback;
  options: IntersectionObserverInit | undefined;
  observed: Element[];
  disconnected: boolean;
};

let recorded: Recorded | null;
const lastObserver = (): Recorded | null => recorded;
let nativeIntersectionObserver: typeof IntersectionObserver | undefined;

class FakeIntersectionObserver {
  constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
    recorded = { callback, options, observed: [], disconnected: false };
  }
  observe(el: Element) {
    recorded?.observed.push(el);
  }
  unobserve() {}
  disconnect() {
    if (recorded) recorded.disconnected = true;
  }
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
  readonly root = null;
  readonly rootMargin = '';
  readonly thresholds: ReadonlyArray<number> = [];
}

beforeEach(() => {
  recorded = null;
  nativeIntersectionObserver = globalThis.IntersectionObserver;
  (globalThis as typeof globalThis & { IntersectionObserver: unknown }).IntersectionObserver =
    FakeIntersectionObserver as unknown as typeof IntersectionObserver;
});

let container: HTMLDivElement;
let root: Root;

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  if (nativeIntersectionObserver !== undefined) {
    (globalThis as typeof globalThis & { IntersectionObserver: unknown }).IntersectionObserver =
      nativeIntersectionObserver;
  }
});

let reachCount = 0;
let setEnabledExternal: (enabled: boolean) => void = () => {};
let setTargetPresentExternal: (present: boolean) => void = () => {};

function Host({ rootMargin = '0px 0px 420px 0px', initialEnabled = true }: { readonly rootMargin?: string; readonly initialEnabled?: boolean }) {
  const scrollport = useRef<HTMLDivElement | null>(null);
  const [enabled, setEnabled] = useState(initialEnabled);
  const [present, setPresent] = useState(true);
  setEnabledExternal = setEnabled;
  setTargetPresentExternal = setPresent;
  const { observe } = useLoadMoreSentinel({ root: scrollport, rootMargin, enabled, onReach: () => (reachCount += 1) });
  return (
    <div ref={scrollport} data-testid="root">
      {present ? <div ref={observe} data-testid="target" /> : null}
    </div>
  );
}

function mount(props: { readonly rootMargin?: string; readonly initialEnabled?: boolean } = {}): HTMLDivElement {
  const c = document.createElement('div');
  document.body.appendChild(c);
  const r = createRoot(c);
  container = c;
  root = r;
  reachCount = 0;
  act(() => {
    r.render(<Host {...props} />);
  });
  return c;
}

function fireEntry(isIntersecting: boolean): void {
  const cb = recorded?.callback;
  const target = recorded?.observed[0];
  if (cb === undefined || target === undefined) throw new Error('IntersectionObserver non armé');
  act(() => {
    cb([{ isIntersecting, target } as unknown as IntersectionObserverEntry], recorded as unknown as IntersectionObserver);
  });
}

describe('useLoadMoreSentinel', () => {
  test('observe la cible avec `root.current` et le `rootMargin` reçu', () => {
    const el = mount({ rootMargin: '0px 0px 420px 0px' });
    expect(recorded?.observed).toEqual([el.querySelector('[data-testid="target"]')]);
    expect(recorded?.options?.root).toBe(el.querySelector('[data-testid="root"]'));
    expect(recorded?.options?.rootMargin).toBe('0px 0px 420px 0px');
    expect(recorded?.options?.threshold).toBe(0);
  });

  test('intersection & enabled ⇒ onReach UNE fois', () => {
    mount();
    fireEntry(true);
    expect(reachCount).toBe(1);
  });

  test('enabled:false ⇒ onReach jamais', () => {
    mount({ initialEnabled: false });
    fireEntry(true);
    expect(reachCount).toBe(0);
  });

  test('une entrée qui n’intersecte PAS ne déclenche rien', () => {
    mount();
    fireEntry(false);
    expect(reachCount).toBe(0);
  });

  test('`enabled` repasse à true alors que la cible intersecte ENCORE ⇒ onReach rejoue', () => {
    mount({ initialEnabled: false });
    fireEntry(true);
    expect(reachCount).toBe(0);
    act(() => {
      setEnabledExternal(true);
    });
    fireEntry(true);
    expect(reachCount).toBe(1);
  });

  test('démontage ⇒ disconnect', () => {
    mount();
    expect(recorded?.disconnected).toBe(false);
    act(() => {
      root.unmount();
    });
    expect(recorded?.disconnected).toBe(true);
  });

  test('la cible qui disparaît puis revient est ré-observée', () => {
    mount();
    act(() => {
      setTargetPresentExternal(false);
    });
    recorded = null;
    act(() => {
      setTargetPresentExternal(true);
    });
    const reobserved = lastObserver();
    expect(reobserved).not.toBeNull();
    expect(reobserved?.observed).toHaveLength(1);
  });
});
