import { act, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import { useOlderMessages } from './use-older-messages';

/**
 * `useOlderMessages` (#6972) — L'ANCRAGE, mesuré SANS navigateur.
 *
 * Ce que ces témoins peuvent prouver : que la distance au BAS du contenu est
 * CAPTURÉE au déclenchement, RESPOSÉE quand la tête du fil change, consommée
 * UNE fois, et jamais appliquée sur un changement de QUEUE. C'est
 * l'arithmétique du repère, et elle tient dans une fonction.
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

describe('useOlderMessages — l’ancrage', () => {
  test('une page INSÉRÉE EN TÊTE conserve la distance au BAS du contenu', () => {
    const h = mount({ firstMessageId: 'm10' });
    /* 5 000 px de contenu, le lecteur est à 200 : 4 800 px le séparent du bas. */
    h.scroller.setScrollHeight(5000);
    h.scroller.scrollTop = 200;
    h.reach();

    /* La page arrive : cinquante rangées estimées s'ajoutent EN TÊTE. */
    h.scroller.setScrollHeight(9400);
    h.render({ firstMessageId: 'm-plus-ancien' });

    expect(h.scroller.scrollTop).toBe(9400 - 4800);
    expect(h.programmatic()).toBe(1);
  });

  test('le repère est consommé UNE fois — un second changement de tête ne le rejoue pas', () => {
    const h = mount({ firstMessageId: 'm10' });
    h.scroller.setScrollHeight(5000);
    h.scroller.scrollTop = 200;
    h.reach();

    h.scroller.setScrollHeight(9400);
    h.render({ firstMessageId: 'm-plus-ancien' });
    const settled = h.scroller.scrollTop;

    /* Une tête qui change SANS déclenchement (une purge, un remplacement de
       page) ne doit pas reposer un repère périmé. */
    h.scroller.setScrollHeight(12_000);
    h.render({ firstMessageId: 'm-autre' });
    expect(h.scroller.scrollTop).toBe(settled);
  });

  test('la tête qui APPARAÎT au premier chargement ne repose aucun repère', () => {
    const h = mount({ firstMessageId: undefined, rowCount: 0 });
    h.scroller.setScrollHeight(5000);
    h.scroller.scrollTop = 4200;
    h.render({ firstMessageId: 'm1', rowCount: 50 });
    expect(h.scroller.scrollTop).toBe(4200);
    expect(h.programmatic()).toBe(0);
  });

  test('un message qui ARRIVE EN QUEUE ne repose aucun repère (la tête ne bouge pas)', () => {
    const h = mount({ firstMessageId: 'm1', rowCount: 50 });
    h.scroller.setScrollHeight(5000);
    h.scroller.scrollTop = 4200;
    h.render({ firstMessageId: 'm1', rowCount: 51 });
    expect(h.scroller.scrollTop).toBe(4200);
    expect(h.programmatic()).toBe(0);
  });
});
