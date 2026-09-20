import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useRef, useState } from 'react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import { useReadTracking } from './use-read-tracking';

/**
 * `useReadTracking` (#7201, W1) — même motif que
 * `use-load-more-sentinel.test.tsx` : happy-dom ne calcule aucune
 * intersection réelle, un FAUX `IntersectionObserver` pose la loi à la main.
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
  observed: Element[];
  disconnected: boolean;
};

let recorded: Recorded | null;
let nativeIntersectionObserver: typeof IntersectionObserver | undefined;

class FakeIntersectionObserver {
  constructor(callback: IntersectionObserverCallback) {
    recorded = { callback, observed: [], disconnected: false };
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
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
});

let marked: { readonly conversationId: string; readonly caughtUpToMessageId: string }[] = [];
let setLastMessageIdExternal: (id: string | undefined) => void = () => {};

function Host({
  conversationId = 'c1',
  initialLastMessageId = 'm1',
  initialEnabled = true,
}: {
  readonly conversationId?: string;
  readonly initialLastMessageId?: string | undefined;
  readonly initialEnabled?: boolean;
}) {
  const scroller = useRef<HTMLElement | null>(null);
  const [lastMessageId, setLastMessageId] = useState<string | undefined>(initialLastMessageId);
  const [enabled] = useState(initialEnabled);
  setLastMessageIdExternal = setLastMessageId;
  const { sentinelRef } = useReadTracking({
    scroller,
    conversationId,
    lastMessageId,
    enabled,
    onMark: (conversationId_, caughtUpToMessageId) => marked.push({ conversationId: conversationId_, caughtUpToMessageId }),
  });
  return (
    <main ref={scroller as never}>
      <div ref={sentinelRef} data-testid="sentinel" />
    </main>
  );
}

function mount(props: Parameters<typeof Host>[0] = {}): void {
  const c = document.createElement('div');
  document.body.appendChild(c);
  const r = createRoot(c);
  container = c;
  root = r;
  marked = [];
  act(() => {
    r.render(<Host {...props} />);
  });
}

function fireEntry(isIntersecting: boolean): void {
  const cb = recorded?.callback;
  const target = recorded?.observed[0];
  if (cb === undefined || target === undefined) throw new Error('IntersectionObserver non armé');
  act(() => {
    cb([{ isIntersecting, target } as unknown as IntersectionObserverEntry], recorded as unknown as IntersectionObserver);
  });
}

describe('useReadTracking — intersection', () => {
  test('le dernier message devient visible ⇒ un appel, avec la frontière courante', () => {
    mount({ initialLastMessageId: 'm7' });
    fireEntry(true);
    expect(marked).toEqual([{ conversationId: 'c1', caughtUpToMessageId: 'm7' }]);
  });

  test('une entrée qui n’intersecte PAS ne déclenche rien', () => {
    mount();
    fireEntry(false);
    expect(marked).toEqual([]);
  });

  test('enabled:false (fil vide) ⇒ aucun observateur armé', () => {
    mount({ initialEnabled: false });
    expect(recorded).toBeNull();
  });
});

describe('useReadTracking — dédoublonnage', () => {
  test('la MÊME frontière n’est jamais renvoyée deux fois', () => {
    mount({ initialLastMessageId: 'm7' });
    fireEntry(true);
    fireEntry(true);
    expect(marked).toEqual([{ conversationId: 'c1', caughtUpToMessageId: 'm7' }]);
  });

  test('une NOUVELLE frontière, sentinelle déjà visible ⇒ un second appel', () => {
    mount({ initialLastMessageId: 'm7' });
    fireEntry(true);
    act(() => setLastMessageIdExternal('m8'));
    expect(marked).toEqual([
      { conversationId: 'c1', caughtUpToMessageId: 'm7' },
      { conversationId: 'c1', caughtUpToMessageId: 'm8' },
    ]);
  });
});

describe('useReadTracking — fenêtre cachée', () => {
  test('document.hidden ⇒ aucun appel, même si la sentinelle intersecte', () => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    mount({ initialLastMessageId: 'm7' });
    fireEntry(true);
    expect(marked).toEqual([]);
  });

  test('retour au premier plan (visibilitychange) alors que la sentinelle est DÉJÀ visible ⇒ appel', () => {
    mount({ initialLastMessageId: 'm7' });
    fireEntry(true);
    marked = [];
    // Un SECOND message arrive pendant que la fenêtre est cachée : rien ne part.
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    act(() => setLastMessageIdExternal('m8'));
    expect(marked).toEqual([]);

    // Retour au premier plan : la sentinelle est toujours visible ⇒ la
    // nouvelle frontière part enfin.
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(marked).toEqual([{ conversationId: 'c1', caughtUpToMessageId: 'm8' }]);
  });

  test('retour au premier plan (focus) alors que la sentinelle N’est PLUS visible ⇒ aucun appel', () => {
    mount({ initialLastMessageId: 'm7' });
    fireEntry(true);
    marked = [];
    fireEntry(false);
    act(() => setLastMessageIdExternal('m8'));
    act(() => {
      window.dispatchEvent(new Event('focus'));
    });
    expect(marked).toEqual([]);
  });
});
