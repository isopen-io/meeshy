import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import { message } from '@/lib/api/fixtures-base';
import type { PlacedMessage } from '@/lib/grouping';
import type { ListPaginationState } from '@/lib/lens/pagination';

import { MAX_SEEK_PAGES, useThreadJump, type ThreadJump } from './use-thread-jump';

/**
 * #8320 — LE RESTE D'UNE CITATION RAMÈNE AU MESSAGE D'ORIGINE, MÊME QUAND IL
 * N'EST PAS CHARGÉ.
 *
 * Un saut vers un message absent de la fenêtre chargée était SANS EFFET : le
 * bouton de citation promettait une navigation et ne faisait rien. Il charge
 * désormais les pages plus anciennes, UNE à la fois, jusqu'à trouver le
 * message (puis saute et surligne), jusqu'à épuiser le fil, ou jusqu'à un
 * plafond de pages — jamais une boucle sans fin.
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

const placedOf = (ids: readonly string[]): readonly PlacedMessage[] =>
  ids.map((id) => ({
    message: message({ id, senderId: 'u-2', content: id, originalLanguage: 'fr', translations: [], createdAt: new Date('2026-09-24T10:00:00.000Z') }),
    head: true,
    tail: true,
    opensDay: null,
  }));

let container: HTMLDivElement;
let root: Root;

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
});

type Page = { readonly placed: readonly PlacedMessage[]; readonly olderState: ListPaginationState };

function mount(initial: Page) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  const scrolls: number[] = [];
  let fetches = 0;
  const virtualizer = { scrollToIndex: (index: number) => scrolls.push(index) };
  const noteProgrammaticScroll = () => {};
  const fetchOlder = () => {
    fetches += 1;
  };
  let captured!: ThreadJump;

  function Harness(props: Page) {
    captured = useThreadJump({
      placed: props.placed,
      virtualizer,
      noteProgrammaticScroll,
      mode: 'focal',
      older: { state: props.olderState, fetchOlder },
    });
    return null;
  }

  act(() => {
    root.render(<Harness {...initial} />);
  });

  return {
    state: () => captured,
    rerender: (page: Page) => {
      act(() => {
        root.render(<Harness {...page} />);
      });
    },
    scrolls,
    fetches: () => fetches,
  };
}

describe('useThreadJump — le message cité HORS de la fenêtre chargée (#8320)', () => {
  test('charge les pages plus anciennes jusqu’à le trouver, puis saute et le surligne', () => {
    const h = mount({ placed: placedOf(['m5', 'm6']), olderState: 'idle' });
    act(() => {
      h.state().jumpToMessage('m1');
    });
    expect(h.fetches()).toBe(1);
    expect(h.scrolls).toEqual([]);

    h.rerender({ placed: placedOf(['m5', 'm6']), olderState: 'loading-more' });
    h.rerender({ placed: placedOf(['m3', 'm4', 'm5', 'm6']), olderState: 'idle' });
    expect(h.fetches()).toBe(2);
    expect(h.scrolls).toEqual([]);

    h.rerender({ placed: placedOf(['m3', 'm4', 'm5', 'm6']), olderState: 'loading-more' });
    h.rerender({ placed: placedOf(['m1', 'm2', 'm3', 'm4', 'm5', 'm6']), olderState: 'idle' });
    expect(h.scrolls).toEqual([0]);
    expect(h.state().highlightedId).toBe('m1');
    expect(h.fetches()).toBe(2);
  });

  test('un fil ÉPUISÉ sans le message arrête la recherche, sans saut', () => {
    const h = mount({ placed: placedOf(['m5']), olderState: 'idle' });
    act(() => {
      h.state().jumpToMessage('ghost');
    });
    h.rerender({ placed: placedOf(['m4', 'm5']), olderState: 'exhausted' });
    h.rerender({ placed: placedOf(['m4', 'm5']), olderState: 'exhausted' });
    expect(h.fetches()).toBe(1);
    expect(h.scrolls).toEqual([]);
    expect(h.state().highlightedId).toBeNull();
  });

  test('la recherche est BORNÉE : jamais plus de MAX_SEEK_PAGES pages pour un seul saut', () => {
    const h = mount({ placed: placedOf(['m0']), olderState: 'idle' });
    act(() => {
      h.state().jumpToMessage('ghost');
    });
    for (let page = 1; page <= MAX_SEEK_PAGES + 5; page += 1) {
      h.rerender({ placed: placedOf(Array.from({ length: page + 1 }, (_, i) => `p${page}-${i}`)), olderState: 'idle' });
    }
    expect(h.fetches()).toBe(MAX_SEEK_PAGES);
  });

  test('un message déjà chargé saute tout de suite, sans rien charger', () => {
    const h = mount({ placed: placedOf(['m1', 'm2']), olderState: 'idle' });
    act(() => {
      h.state().jumpToMessage('m2');
    });
    expect(h.scrolls).toEqual([1]);
    expect(h.fetches()).toBe(0);
  });
});
