import { act, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import { headAnchorOf, useHeadAnchor, useOlderMessages } from './use-older-messages';

/**
 * `useOlderMessages` (#6972) — L'ANCRAGE, mesuré SANS navigateur.
 *
 * Ce que ces témoins peuvent prouver : que la sentinelle demande la page, que
 * le virtualiseur reçoit `anchorTo: 'end'` au SEUL rendu où la tête est
 * remplacée (`headAnchorOf`, `useHeadAnchor`), que l'arrivée d'une page
 * demandée est annoncée comme un défilement programmé UNE fois, jamais sur un
 * changement de QUEUE — et que ce hook n'écrit plus `scrollTop` (#9216, #9219 :
 * son écriture absolue effaçait les compensations du virtualiseur).
 *
 * Ce qu'ils ne peuvent PAS prouver : que le lecteur ne voit rien bouger.
 * happy-dom ne fait aucune mise en page — `scrollHeight` y est ce qu'on lui
 * dit. C'est `scripts/check-thread-virtualization.mjs` (critère 5) qui mesure
 * la dérive réelle, en pixels, dans un vrai navigateur. Les deux témoins sont
 * nécessaires et aucun ne remplace l'autre.
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

type Recorded = { callback: IntersectionObserverCallback; observed: Element[] };
let recorded: Recorded | null = null;
let nativeIntersectionObserver: typeof IntersectionObserver | undefined;

class FakeIntersectionObserver {
  constructor(callback: IntersectionObserverCallback) {
    recorded = { callback, observed: [] };
  }
  observe(el: Element) {
    recorded?.observed.push(el);
  }
  unobserve() {}
  disconnect() {}
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

/** UN DÉFILEUR DONT LA GÉOMÉTRIE EST DICTÉE — happy-dom ne met rien en page,
 * donc `scrollHeight` est une valeur qu'on pose, exactement comme le
 * virtualiseur la ferait grandir en insérant des rangées estimées. */
function geometricScroller(): HTMLDivElement & { setScrollHeight(value: number): void } {
  const el = document.createElement('div') as HTMLDivElement & { setScrollHeight(value: number): void };
  let scrollHeight = 0;
  Object.defineProperty(el, 'scrollHeight', { get: () => scrollHeight, configurable: true });
  let scrollTop = 0;
  Object.defineProperty(el, 'scrollTop', {
    get: () => scrollTop,
    set: (v: number) => {
      scrollTop = v;
    },
    configurable: true,
  });
  el.setScrollHeight = (value: number) => {
    scrollHeight = value;
  };
  return el;
}

type Harness = {
  readonly scroller: HTMLDivElement & { setScrollHeight(value: number): void };
  readonly fetches: () => number;
  readonly programmatic: () => number;
  render(props: {
    readonly state?: 'idle' | 'loading-more' | 'exhausted' | 'error';
    readonly firstMessageId?: string | undefined;
    readonly rowCount?: number;
  }): void;
  reach(): void;
  retry(): void;
};

function mount(initial: { readonly firstMessageId?: string | undefined; readonly rowCount?: number } = {}): Harness {
  const scroller = geometricScroller();
  document.body.appendChild(scroller);
  let fetches = 0;
  let programmatic = 0;
  let sentinel: (node: Element | null) => void = () => {};
  let retryFn: () => void = () => {};

  function Host(props: {
    readonly state: 'idle' | 'loading-more' | 'exhausted' | 'error';
    readonly firstMessageId: string | undefined;
    readonly rowCount: number;
  }) {
    const ref = useRef<HTMLElement | null>(scroller);
    const older = useOlderMessages({
      scroller: ref,
      state: props.state,
      rowCount: props.rowCount,
      firstMessageId: props.firstMessageId,
      fetchOlder: () => {
        fetches += 1;
      },
      noteProgrammaticScroll: () => {
        programmatic += 1;
      },
    });
    sentinel = older.sentinelRef;
    retryFn = older.retry;
    return <div ref={older.sentinelRef} data-state={older.state} />;
  }

  const c = document.createElement('div');
  document.body.appendChild(c);
  const r = createRoot(c);
  container = c;
  root = r;

  const render = (props: {
    readonly state?: 'idle' | 'loading-more' | 'exhausted' | 'error';
    readonly firstMessageId?: string | undefined;
    readonly rowCount?: number;
  }): void => {
    act(() => {
      r.render(
        <Host
          state={props.state ?? 'idle'}
          firstMessageId={props.firstMessageId}
          rowCount={props.rowCount ?? 50}
        />,
      );
    });
  };

  render({ ...initial });

  return {
    scroller,
    fetches: () => fetches,
    programmatic: () => programmatic,
    render,
    reach: () => {
      const cb = recorded?.callback;
      const target = recorded?.observed[0];
      if (cb === undefined || target === undefined) throw new Error('sentinelle non armée');
      act(() => {
        cb([{ isIntersecting: true, target } as unknown as IntersectionObserverEntry], recorded as unknown as IntersectionObserver);
      });
    },
    retry: () => {
      act(() => {
        retryFn();
      });
      void sentinel;
    },
  };
}

describe('useOlderMessages — le déclencheur', () => {
  test('la sentinelle atteinte DEMANDE une page ancienne', () => {
    const h = mount({ firstMessageId: 'm10' });
    h.scroller.setScrollHeight(5000);
    h.scroller.scrollTop = 200;
    h.reach();
    expect(h.fetches()).toBe(1);
  });

  test('`retry` demande la MÊME page — le refus offre son rejeu (loi 4)', () => {
    const h = mount({ firstMessageId: 'm10', rowCount: 50 });
    h.render({ state: 'error', firstMessageId: 'm10' });
    h.retry();
    expect(h.fetches()).toBe(1);
  });

  test('un fil VIDE n’arme rien — une sentinelle immédiatement intersectée sur un écran sans rangée déclencherait une rafale', () => {
    const h = mount({ firstMessageId: undefined, rowCount: 0 });
    h.reach();
    expect(h.fetches()).toBe(0);
  });

  test('une page EN VOL n’arme rien', () => {
    const h = mount({ firstMessageId: 'm10' });
    h.render({ state: 'loading-more', firstMessageId: 'm10' });
    h.reach();
    expect(h.fetches()).toBe(0);
  });
});

describe('useOlderMessages — l’ancre appartient au virtualiseur (#9216, #9219)', () => {
  test('la page demandée qui change la tête est ANNONCÉE comme un défilement programmé', () => {
    const h = mount({ firstMessageId: 'm10' });
    h.reach();
    h.render({ firstMessageId: 'm-plus-ancien' });
    expect(h.programmatic()).toBe(1);
  });

  /* L'écriture ABSOLUE de `scrollTop` effaçait les compensations relatives
     que le virtualiseur venait d'écrire dans le même commit : le fil glissait
     de la croissance des rangées préfixées. Plus aucune écriture ici. */
  test('le hook n’écrit plus `scrollTop` — c’est le virtualiseur qui repose la rangée lue', () => {
    const h = mount({ firstMessageId: 'm10' });
    h.scroller.setScrollHeight(5000);
    h.scroller.scrollTop = 200;
    h.reach();
    h.scroller.setScrollHeight(9400);
    h.render({ firstMessageId: 'm-plus-ancien' });
    expect(h.scroller.scrollTop).toBe(200);
  });

  test('l’annonce est consommée UNE fois — une tête qui change ensuite sans demande n’annonce rien', () => {
    const h = mount({ firstMessageId: 'm10' });
    h.reach();
    h.render({ firstMessageId: 'm-plus-ancien' });
    h.render({ firstMessageId: 'm-autre' });
    expect(h.programmatic()).toBe(1);
  });

  test('le rejeu d’un refus annonce aussi l’arrivée de sa page', () => {
    const h = mount({ firstMessageId: 'm10' });
    h.render({ state: 'error', firstMessageId: 'm10' });
    h.retry();
    h.render({ state: 'idle', firstMessageId: 'm-plus-ancien' });
    expect(h.programmatic()).toBe(1);
  });

  test('la tête qui APPARAÎT au premier chargement n’annonce rien', () => {
    const h = mount({ firstMessageId: undefined, rowCount: 0 });
    h.render({ firstMessageId: 'm1', rowCount: 50 });
    expect(h.programmatic()).toBe(0);
  });

  test('un message qui ARRIVE EN QUEUE n’annonce rien (la tête ne bouge pas)', () => {
    const h = mount({ firstMessageId: 'm1', rowCount: 50 });
    h.reach();
    h.render({ firstMessageId: 'm1', rowCount: 51 });
    expect(h.programmatic()).toBe(0);
  });
});

describe('headAnchorOf — le virtualiseur tient la rangée lue au seul rendu où la tête est REMPLACÉE', () => {
  test('une page préfixée remplace la tête : ancre', () => {
    expect(headAnchorOf('m10', 'm-plus-ancien')).toBe('end');
  });

  test('la tête qui apparaît au premier chargement : rien à tenir', () => {
    expect(headAnchorOf(undefined, 'm1')).toBe('start');
  });

  test('le fil qui se vide : rien à tenir', () => {
    expect(headAnchorOf('m1', undefined)).toBe('start');
  });

  test('la même tête (un message arrivé en queue) : rien à tenir', () => {
    expect(headAnchorOf('m1', 'm1')).toBe('start');
  });
});

describe('useHeadAnchor — la tête de référence est la dernière COMMISE', () => {
  function mountAnchor(first: string | undefined) {
    const seen: string[] = [];
    function Host(props: { readonly first: string | undefined }) {
      seen.push(useHeadAnchor(props.first));
      return null;
    }
    const c = document.createElement('div');
    document.body.appendChild(c);
    const r = createRoot(c);
    container = c;
    root = r;
    const render = (next: string | undefined) => {
      act(() => {
        r.render(<Host first={next} />);
      });
    };
    render(first);
    return { seen, render };
  }

  test('ancre au rendu qui remplace la tête, et à lui seul', () => {
    const h = mountAnchor('m10');
    h.render('m-plus-ancien');
    h.render('m-plus-ancien');
    expect(h.seen).toEqual(['start', 'end', 'start']);
  });
});
