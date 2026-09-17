import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useCallback, useRef } from 'react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { createFeedAutoplayStore, useFeedAutoplayRoot, useIsActiveScene, type FeedAutoplayStoreApi } from './use-feed-autoplay';

/**
 * `useFeedAutoplayRoot` — même dispositif que `use-out-of-view.test.tsx` : un
 * FAUX `IntersectionObserver` posé sur `globalThis`, dont on déclenche le
 * callback à la main avec des rectangles fabriqués, pour prouver l'ÉLECTION
 * (§ 5.3 de la spécification #6898) sans dépendre d'un calcul de mise en page
 * réel (`happy-dom` ne le fait pas).
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

type Recorded = { callback: IntersectionObserverCallback; observed: Element[]; disconnected: boolean };
let recorded: Recorded | null;
let nativeIntersectionObserver: typeof IntersectionObserver | undefined;

class FakeIntersectionObserver {
  constructor(callback: IntersectionObserverCallback) {
    recorded = { callback, observed: [], disconnected: false };
  }
  observe(el: Element) {
    recorded?.observed.push(el);
  }
  unobserve(el: Element) {
    if (recorded) recorded.observed = recorded.observed.filter((o) => o !== el);
  }
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
  (globalThis as typeof globalThis & { IntersectionObserver: unknown }).IntersectionObserver = FakeIntersectionObserver as unknown as typeof IntersectionObserver;
});

let container: HTMLDivElement;
let root: Root;

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  if (nativeIntersectionObserver !== undefined) {
    (globalThis as typeof globalThis & { IntersectionObserver: unknown }).IntersectionObserver = nativeIntersectionObserver;
  }
});

/** Une entrée fabriquée : `centre = top + height/2`, ce que le hook compare
 * à `entry.rootBounds`. */
const entry = (target: Element, centerOffset: number, intersectionRatio = 1): IntersectionObserverEntry =>
  ({
    target,
    intersectionRatio,
    boundingClientRect: { top: centerOffset, height: 0 },
    rootBounds: { top: 0, height: 0 },
  }) as unknown as IntersectionObserverEntry;

function fire(entries: readonly IntersectionObserverEntry[]): void {
  const cb = recorded?.callback;
  if (cb === undefined) throw new Error('IntersectionObserver non armé');
  act(() => {
    cb(entries as IntersectionObserverEntry[], recorded as unknown as IntersectionObserver);
  });
}

let renders: Record<string, number> = {};

function Card({ id, store }: { readonly id: string; readonly store: FeedAutoplayStoreApi }) {
  const active = useIsActiveScene(id, store);
  renders[id] = (renders[id] ?? 0) + 1;
  return <span data-testid={`active-${id}`}>{String(active)}</span>;
}

function Host({ store, showB = true }: { readonly store: FeedAutoplayStoreApi; readonly showB?: boolean }) {
  const scrollport = useRef<HTMLDivElement | null>(null);
  const { registerScene } = useFeedAutoplayRoot(scrollport, store);
  // Réfs de rappel STABLES (`useCallback`) — comme `useOutOfView.observe` :
  // une réf inline créerait une nouvelle identité à chaque rendu de `Host`,
  // ce que React traite comme un démontage/remontage de la cible (cleanup
  // puis nouvel appel), désinscrivant la scène à chaque rendu du PARENT.
  const registerA = useCallback((n: Element | null) => registerScene('a', n), [registerScene]);
  const registerB = useCallback((n: Element | null) => registerScene('b', n), [registerScene]);
  return (
    <div ref={scrollport}>
      <div ref={registerA} data-testid="scene-a">
        <Card id="a" store={store} />
      </div>
      {showB ? (
        <div ref={registerB} data-testid="scene-b">
          <Card id="b" store={store} />
        </div>
      ) : null}
    </div>
  );
}

function mount(props: { readonly store: FeedAutoplayStoreApi; readonly showB?: boolean }): HTMLDivElement {
  const c = document.createElement('div');
  document.body.appendChild(c);
  const r = createRoot(c);
  container = c;
  root = r;
  act(() => {
    r.render(<Host {...props} />);
  });
  return c;
}

describe('useFeedAutoplayRoot — un IntersectionObserver, l’élection par la distance au centre', () => {
  test('deux cartes visibles, la plus proche du centre est élue', () => {
    const store = createFeedAutoplayStore();
    renders = {};
    const el = mount({ store });
    const a = el.querySelector('[data-testid="scene-a"]') as Element;
    const b = el.querySelector('[data-testid="scene-b"]') as Element;
    fire([entry(a, 40), entry(b, 5)]);
    expect(store.getState().activeId).toBe('b');
    expect(el.querySelector('[data-testid="active-b"]')?.textContent).toBe('true');
    expect(el.querySelector('[data-testid="active-a"]')?.textContent).toBe('false');
  });

  test('useIsActiveScene ne re-rend QUE les deux cartes dont le booléen change', () => {
    const store = createFeedAutoplayStore();
    renders = {};
    const el = mount({ store });
    const a = el.querySelector('[data-testid="scene-a"]') as Element;
    const b = el.querySelector('[data-testid="scene-b"]') as Element;
    fire([entry(a, 40), entry(b, 5)]);
    expect(store.getState().activeId).toBe('b');
    const rendersAfterFirst = { ...renders };
    // Bascule : `a` devient plus proche — seules `a` (false→true) et `b`
    // (true→false) doivent re-rendre.
    fire([entry(a, 2), entry(b, 30)]);
    expect(store.getState().activeId).toBe('a');
    expect(renders.a).toBe(rendersAfterFirst.a! + 1);
    expect(renders.b).toBe(rendersAfterFirst.b! + 1);
  });

  test('la désinscription au démontage libère l’élection', () => {
    const store = createFeedAutoplayStore();
    const el = mount({ store });
    const a = el.querySelector('[data-testid="scene-a"]') as Element;
    fire([entry(a, 0)]);
    expect(store.getState().activeId).toBe('a');
    act(() => {
      root.render(<Host store={store} showB={false} />);
    });
    // `a` reste monté ; retirer `b` (jamais élu ici) ne doit rien changer.
    expect(store.getState().activeId).toBe('a');
    act(() => {
      root.unmount();
    });
    // Le démontage complet désobserve tout — un nouveau montage repart propre.
    expect(recorded?.disconnected).toBe(true);
  });
});

/** Revue-correction #6898 — un `IntersectionObserver` ne notifie qu'au
 * FRANCHISSEMENT d'un seuil : deux cartes ENTIÈREMENT visibles peuvent
 * traverser tout l'écran sans une seule notification. La distance relevée à
 * leur entrée devient alors FAUSSE, et la vidéo élue est celle qui SORT par le
 * haut pendant que l'autre occupe le centre. */
describe('useFeedAutoplayRoot — la distance se REMESURE quand le défilement s’arrête', () => {
  const rect = (top: number, height: number): DOMRect =>
    ({ top, height, bottom: top + height, left: 0, right: 0, width: 0, x: 0, y: top, toJSON: () => ({}) }) as DOMRect;

  test('deux cartes restées visibles : au repos, la plus proche du centre RÉEL est élue', async () => {
    const store = createFeedAutoplayStore();
    const el = mount({ store });
    const scrollport = el.firstElementChild as HTMLElement;
    const a = el.querySelector('[data-testid="scene-a"]') as HTMLElement;
    const b = el.querySelector('[data-testid="scene-b"]') as HTMLElement;
    fire([entry(a, 40), entry(b, 5)]);
    expect(store.getState().activeId).toBe('b');

    // Le fil a défilé SANS franchir de seuil : `a` est au centre, `b` au bord.
    scrollport.getBoundingClientRect = () => rect(0, 800);
    a.getBoundingClientRect = () => rect(300, 200);
    b.getBoundingClientRect = () => rect(620, 180);
    const settled = 'onscrollend' in window ? 'scrollend' : 'scroll';
    await act(async () => {
      scrollport.dispatchEvent(new Event(settled));
      await new Promise((resolve) => setTimeout(resolve, 200));
    });
    expect(store.getState().activeId).toBe('a');
  });

  test('le démontage de l’écran rend l’élection — aucune carte ne reste élue par un écran parti', () => {
    const store = createFeedAutoplayStore();
    const el = mount({ store });
    const a = el.querySelector('[data-testid="scene-a"]') as Element;
    fire([entry(a, 0)]);
    expect(store.getState().activeId).toBe('a');
    act(() => {
      root.unmount();
    });
    expect(store.getState().activeId).toBeNull();
  });
});

