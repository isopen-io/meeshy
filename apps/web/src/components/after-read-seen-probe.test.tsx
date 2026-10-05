import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test';

import { openModalLayer } from '@/lib/view/modal-layers';
import { AfterReadSeenContext } from '@/lib/view/use-after-read-consumption';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { AFTER_READ_SEEN_DWELL_MS, AfterReadSeenProbe } from './after-read-seen-probe';

/**
 * UNE FLAMME-ŒIL VUE AU MILIEU DU FIL COMPTE COMME VUE (#8343) — la frontière
 * de lecture ne bouge qu'en BAS du fil ; une rangée lue en remontant
 * l'historique restait « jamais vue ». La sonde la déclare vue quand elle est
 * RÉELLEMENT à l'écran : visible pendant un court instant, onglet au premier
 * plan, aucune couche par-dessus. happy-dom ne calcule aucune intersection :
 * un faux `IntersectionObserver` pose la géométrie à la main.
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

type Observed = { readonly callback: IntersectionObserverCallback };
let observed: Observed | null = null;
let native: typeof IntersectionObserver | undefined;

class FakeIntersectionObserver {
  constructor(callback: IntersectionObserverCallback) {
    observed = { callback };
  }
  observe() {}
  unobserve() {}
  disconnect() {
    observed = null;
  }
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
  readonly root = null;
  readonly rootMargin = '';
  readonly thresholds: ReadonlyArray<number> = [];
}

beforeAll(() => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(async () => {
  await act(async () => {});
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

beforeEach(() => {
  native = globalThis.IntersectionObserver;
  (globalThis as { IntersectionObserver: unknown }).IntersectionObserver = FakeIntersectionObserver;
});

let cleanup: (() => void) | null = null;
afterEach(() => {
  cleanup?.();
  cleanup = null;
  (globalThis as { IntersectionObserver: unknown }).IntersectionObserver = native;
});

function mount(): string[] {
  const seen: string[] = [];
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() =>
    root.render(
      <AfterReadSeenContext.Provider value={(id) => seen.push(id)}>
        <div style={{ position: 'relative' }}>
          <AfterReadSeenProbe messageId="m-flamme" />
        </div>
      </AfterReadSeenContext.Provider>,
    ),
  );
  cleanup = () => {
    act(() => root.unmount());
    container.remove();
  };
  return seen;
}

const intersect = (isIntersecting: boolean) =>
  act(() => {
    observed?.callback([{ isIntersecting, intersectionRatio: isIntersecting ? 1 : 0 } as IntersectionObserverEntry], {} as IntersectionObserver);
  });

const wait = (ms: number) => act(async () => new Promise((resolve) => setTimeout(resolve, ms)));

describe('AfterReadSeenProbe — vue = à l’écran assez longtemps', () => {
  test('visible au-delà du seuil ⇒ déclarée vue, une seule fois', async () => {
    const seen = mount();
    intersect(true);
    await wait(AFTER_READ_SEEN_DWELL_MS + 50);
    intersect(false);
    intersect(true);
    await wait(AFTER_READ_SEEN_DWELL_MS + 50);
    expect(seen).toEqual(['m-flamme']);
  });

  test('traversée au défilement, plus courte que le seuil ⇒ pas vue', async () => {
    const seen = mount();
    intersect(true);
    await wait(AFTER_READ_SEEN_DWELL_MS / 3);
    intersect(false);
    await wait(AFTER_READ_SEEN_DWELL_MS);
    expect(seen).toEqual([]);
  });

  test('sous une couche modale ⇒ pas vue ; la couche refermée, la rangée toujours là compte', async () => {
    const close = openModalLayer();
    const seen = mount();
    intersect(true);
    await wait(AFTER_READ_SEEN_DWELL_MS + 50);
    expect(seen).toEqual([]);
    close();
    await wait(AFTER_READ_SEEN_DWELL_MS + 50);
    expect(seen).toEqual(['m-flamme']);
  });

  test('onglet masqué ⇒ pas vue', async () => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    const seen = mount();
    intersect(true);
    await wait(AFTER_READ_SEEN_DWELL_MS + 50);
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    expect(seen).toEqual([]);
  });
});
