import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useRef } from 'react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import { usePullToRefresh, type PullToRefresh } from './use-pull-to-refresh';

/**
 * `usePullToRefresh` (#6195) — happy-dom ne construit pas de vrai
 * `TouchEvent` exploitable ; ce témoin CAPTURE les écouteurs posés par le
 * hook (motif « AUCUN écouteur `scroll`… » de `use-out-of-view.test.tsx`) et
 * les appelle directement avec des charges synthétiques minimales.
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

type Handlers = {
  touchstart?: (e: unknown) => void;
  touchmove?: (e: unknown) => void;
  touchend?: (e: unknown) => void;
  touchcancel?: (e: unknown) => void;
};

let handlers: Handlers;
let removed: (keyof Handlers)[];
let originalAdd: typeof Element.prototype.addEventListener;
let originalRemove: typeof Element.prototype.removeEventListener;

beforeEach(() => {
  handlers = {};
  removed = [];
  originalAdd = Element.prototype.addEventListener;
  originalRemove = Element.prototype.removeEventListener;
  Element.prototype.addEventListener = function patchedAdd(this: Element, type: string, listener: unknown, options?: unknown) {
    if (type === 'touchstart' || type === 'touchmove' || type === 'touchend' || type === 'touchcancel') {
      (handlers as Record<string, unknown>)[type] = listener;
      return;
    }
    return (originalAdd as (...a: unknown[]) => void).call(this, type, listener, options);
  } as typeof Element.prototype.addEventListener;
  Element.prototype.removeEventListener = function patchedRemove(this: Element, type: string, listener: unknown, options?: unknown) {
    if (type === 'touchstart' || type === 'touchmove' || type === 'touchend' || type === 'touchcancel') {
      removed.push(type as keyof Handlers);
      return;
    }
    return (originalRemove as (...a: unknown[]) => void).call(this, type, listener, options);
  } as typeof Element.prototype.removeEventListener;
});

afterEach(() => {
  Element.prototype.addEventListener = originalAdd;
  Element.prototype.removeEventListener = originalRemove;
});

let container: HTMLDivElement;
let root: Root;
let captured!: PullToRefresh;
let scrollTopValue = 0;
let onRefreshImpl: () => Promise<void> = () => Promise.resolve();
let matchMediaReduced = false;

function Host({ threshold = 90 }: { readonly threshold?: number }) {
  const ref = useRef<HTMLDivElement | null>(null);
  captured = usePullToRefresh({ root: ref, onRefresh: () => onRefreshImpl(), threshold });
  return <div ref={ref} data-testid="root" />;
}

function mount(props: { readonly threshold?: number } = {}): HTMLDivElement {
  const c = document.createElement('div');
  document.body.appendChild(c);
  const r = createRoot(c);
  container = c;
  root = r;
  Object.defineProperty(HTMLDivElement.prototype, 'scrollTop', {
    configurable: true,
    get() {
      return scrollTopValue;
    },
  });
  act(() => {
    r.render(<Host {...props} />);
  });
  return c;
}

function touch(clientY: number) {
  return { touches: [{ clientY }], preventDefault: () => undefined };
}

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container?.remove();
  scrollTopValue = 0;
  matchMediaReduced = false;
});

let originalMatchMedia: typeof window.matchMedia;

beforeEach(() => {
  originalMatchMedia = window.matchMedia;
  (window as unknown as { matchMedia: typeof window.matchMedia }).matchMedia = ((query: string) => ({
    matches: matchMediaReduced,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
});

afterEach(() => {
  window.matchMedia = originalMatchMedia;
});

describe('usePullToRefresh', () => {
  test('touchstart avec scrollTop > 0 ⇒ idle, offsetPx 0, preventDefault jamais appelé', () => {
    scrollTopValue = 10;
    mount();
    let preventDefaultCalled = false;
    act(() => {
      handlers.touchstart?.(touch(0));
    });
    act(() => {
      handlers.touchmove?.({ touches: [{ clientY: 45 }], preventDefault: () => (preventDefaultCalled = true) });
    });
    expect(captured.phase).toEqual({ kind: 'idle' });
    expect(captured.offsetPx).toBe(0);
    expect(preventDefaultCalled).toBe(false);
  });

  test('scrollTop === 0 + touchmove +45 (seuil 90) ⇒ pulling(0.5), offsetPx 45, preventDefault appelé', () => {
    mount({ threshold: 90 });
    act(() => {
      handlers.touchstart?.(touch(100));
    });
    let preventDefaultCalled = false;
    act(() => {
      handlers.touchmove?.({ touches: [{ clientY: 145 }], preventDefault: () => (preventDefaultCalled = true) });
    });
    expect(captured.phase).toEqual({ kind: 'pulling', progress: 0.5 });
    expect(captured.offsetPx).toBe(45);
    expect(preventDefaultCalled).toBe(true);
  });

  /**
   * LE DÉFILEMENT NATIF RESTE LIBRE (revue-correction #6195, défaut
   * BLOQUANT) — au sommet de la liste, un doigt qui remonte veut DÉFILER, pas
   * tirer. `preventDefault()` sur ce geste-là fige la Lentille : plus aucune
   * rangée n'est atteignable au doigt tant qu'on n'est pas déjà défilé, ce
   * qu'aucune capture de bureau ne montre (la souris ne produit pas de
   * `touchmove`).
   */
  test('scrollTop === 0 + touchmove VERS LE HAUT ⇒ aucun preventDefault, le défilement natif reste libre', () => {
    mount({ threshold: 90 });
    act(() => {
      handlers.touchstart?.(touch(300));
    });
    let preventDefaultCalled = false;
    act(() => {
      handlers.touchmove?.({ touches: [{ clientY: 250 }], preventDefault: () => (preventDefaultCalled = true) });
    });
    expect(preventDefaultCalled).toBe(false);
    expect(captured.phase).toEqual({ kind: 'idle' });
    expect(captured.offsetPx).toBe(0);
  });

  test('un tirer qui REVIENT sous son origine rend la main au défilement natif', () => {
    mount({ threshold: 90 });
    act(() => {
      handlers.touchstart?.(touch(300));
    });
    act(() => {
      handlers.touchmove?.(touch(340));
    });
    expect(captured.phase.kind).toBe('pulling');
    let preventDefaultCalled = false;
    act(() => {
      handlers.touchmove?.({ touches: [{ clientY: 290 }], preventDefault: () => (preventDefaultCalled = true) });
    });
    expect(preventDefaultCalled).toBe(false);
    expect(captured.phase).toEqual({ kind: 'idle' });
  });

  /** Un PREMIER échantillon à distance NULLE (glissement lent) ne doit ni voler
   * le défilement ni TUER le tirer : le suivant tranche. */
  test('touchmove à distance NULLE ne bloque rien et laisse le tirer vivre', () => {
    mount({ threshold: 90 });
    act(() => {
      handlers.touchstart?.(touch(300));
    });
    let preventDefaultCalled = false;
    act(() => {
      handlers.touchmove?.({ touches: [{ clientY: 300 }], preventDefault: () => (preventDefaultCalled = true) });
    });
    expect(preventDefaultCalled).toBe(false);
    expect(captured.phase).toEqual({ kind: 'idle' });
    act(() => {
      handlers.touchmove?.(touch(400));
    });
    expect(captured.phase).toEqual({ kind: 'armed' });
  });

  test('+90 ⇒ armed', () => {
    mount({ threshold: 90 });
    act(() => {
      handlers.touchstart?.(touch(0));
    });
    act(() => {
      handlers.touchmove?.(touch(90));
    });
    expect(captured.phase).toEqual({ kind: 'armed' });
  });

  test('touchend depuis armed ⇒ onRefresh appelé UNE fois, refreshing puis completing(ok) puis idle', async () => {
    let calls = 0;
    onRefreshImpl = () => {
      calls += 1;
      return Promise.resolve();
    };
    mount({ threshold: 90 });
    act(() => {
      handlers.touchstart?.(touch(0));
    });
    act(() => {
      handlers.touchmove?.(touch(90));
    });
    act(() => {
      handlers.touchend?.({});
    });
    expect(captured.phase.kind).toBe('refreshing');
    expect(calls).toBe(1);

    for (let i = 0; i < 10 && captured.phase.kind !== 'completing'; i += 1) {
      await act(async () => {
        await Promise.resolve();
      });
    }
    expect(captured.phase).toEqual({ kind: 'completing', outcome: 'ok' });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 450));
    });
    expect(captured.phase).toEqual({ kind: 'idle' });
  });

  test('onRefresh REJETTE ⇒ completing outcome:failed puis idle, jamais de throw', async () => {
    onRefreshImpl = () => Promise.reject(new Error('offline'));
    mount({ threshold: 90 });
    act(() => {
      handlers.touchstart?.(touch(0));
    });
    act(() => {
      handlers.touchmove?.(touch(90));
    });
    expect(() => {
      act(() => {
        handlers.touchend?.({});
      });
    }).not.toThrow();

    for (let i = 0; i < 10 && captured.phase.kind !== 'completing'; i += 1) {
      await act(async () => {
        await Promise.resolve();
      });
    }
    expect(captured.phase).toEqual({ kind: 'completing', outcome: 'failed' });
  });

  test('touchend depuis pulling ⇒ idle, onRefresh jamais appelé', () => {
    let calls = 0;
    onRefreshImpl = () => {
      calls += 1;
      return Promise.resolve();
    };
    mount({ threshold: 90 });
    act(() => {
      handlers.touchstart?.(touch(0));
    });
    act(() => {
      handlers.touchmove?.(touch(30));
    });
    act(() => {
      handlers.touchend?.({});
    });
    expect(captured.phase).toEqual({ kind: 'idle' });
    expect(calls).toBe(0);
  });

  test('un second touchstart pendant refreshing est ignoré', () => {
    let calls = 0;
    onRefreshImpl = () => {
      calls += 1;
      return new Promise(() => {});
    };
    mount({ threshold: 90 });
    act(() => {
      handlers.touchstart?.(touch(0));
    });
    act(() => {
      handlers.touchmove?.(touch(90));
    });
    act(() => {
      handlers.touchend?.({});
    });
    expect(captured.phase.kind).toBe('refreshing');
    act(() => {
      handlers.touchstart?.(touch(0));
    });
    act(() => {
      handlers.touchmove?.(touch(200));
    });
    expect(captured.phase.kind).toBe('refreshing');
    expect(calls).toBe(1);
  });

  test('prefers-reduced-motion ⇒ offsetPx reste 0 à chaque phase, les phases vivent', () => {
    matchMediaReduced = true;
    mount({ threshold: 90 });
    act(() => {
      handlers.touchstart?.(touch(0));
    });
    act(() => {
      handlers.touchmove?.(touch(45));
    });
    expect(captured.phase).toEqual({ kind: 'pulling', progress: 0.5 });
    expect(captured.offsetPx).toBe(0);
    act(() => {
      handlers.touchmove?.(touch(90));
    });
    expect(captured.phase).toEqual({ kind: 'armed' });
    expect(captured.offsetPx).toBe(0);
  });

  test('démontage ⇒ les quatre écouteurs sont retirés', () => {
    mount();
    act(() => {
      root.unmount();
    });
    expect(new Set(removed)).toEqual(new Set(['touchstart', 'touchmove', 'touchend', 'touchcancel']));
  });
});
