import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import { message } from '@/lib/api/fixtures-base';
import type { PlacedMessage } from '@/lib/grouping';

import { HIGHLIGHT_MS, useThreadJump, type ThreadJump } from './use-thread-jump';

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

function placedOf(ids: readonly string[]): readonly PlacedMessage[] {
  return ids.map((id) => ({
    message: message({ id, senderId: 'u-2', content: id, originalLanguage: 'fr', translations: [], createdAt: new Date('2026-09-24T10:00:00.000Z') }),
    head: true,
    tail: true,
    opensDay: null,
  }));
}

let container: HTMLDivElement;
let root: Root;

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
});

function mount(initial: {
  readonly placed: readonly PlacedMessage[];
  readonly mode: 'focal' | 'script' | 'bubbles' | 'summary';
  readonly journal: string[];
}): {
  readonly state: () => ThreadJump;
  readonly rerender: (next: { readonly mode: 'focal' | 'script' | 'bubbles' | 'summary' }) => void;
  readonly scrollToIndexCalls: readonly [number, unknown][];
} {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  const scrollToIndexCalls: [number, unknown][] = [];
  const virtualizer = {
    scrollToIndex: (index: number, options: unknown) => {
      initial.journal.push('scroll');
      scrollToIndexCalls.push([index, options]);
    },
  };
  const noteProgrammaticScroll = () => initial.journal.push('note');

  let captured!: ThreadJump;

  function Harness(props: { readonly mode: 'focal' | 'script' | 'bubbles' | 'summary' }) {
    captured = useThreadJump({ placed: initial.placed, virtualizer, noteProgrammaticScroll, mode: props.mode });
    return null;
  }

  act(() => {
    root.render(<Harness mode={initial.mode} />);
  });

  return {
    state: () => captured,
    rerender: (next) => {
      act(() => {
        root.render(<Harness mode={next.mode} />);
      });
    },
    scrollToIndexCalls,
  };
}

describe('useThreadJump — le saut de citation et sa mise en évidence (#7429, extrait de routes/thread.tsx)', () => {
  test('un identifiant absent de `placed` ne déclenche rien', () => {
    const journal: string[] = [];
    const { state } = mount({ placed: placedOf(['m1', 'm2']), mode: 'focal', journal });
    act(() => {
      state().jumpToMessage('ghost');
    });
    expect(journal).toEqual([]);
    expect(state().highlightedId).toBeNull();
  });

  test('un identifiant présent : l’annonce du défilement programmé PRÉCÈDE scrollToIndex(index, {align: "center"}), et la rangée est surlignée', () => {
    const journal: string[] = [];
    const { state, scrollToIndexCalls } = mount({ placed: placedOf(['m1', 'm2', 'm3']), mode: 'focal', journal });
    act(() => {
      state().jumpToMessage('m3');
    });
    expect(journal).toEqual(['note', 'scroll']);
    expect(scrollToIndexCalls).toEqual([[2, { align: 'center' }]]);
    expect(state().highlightedId).toBe('m3');
  });

  test('le surlignage s’efface de lui-même après HIGHLIGHT_MS (1600 ms), et un second saut réarme le minuteur', () => {
    const journal: string[] = [];
    const { state } = mount({ placed: placedOf(['m1', 'm2']), mode: 'focal', journal });

    /* Registre de minuteurs en mémoire — motif `use-live-announcer.test.tsx`
       (#5888) : le réarmement se prouve par son EFFET, jamais par l'écoulement
       d'un temps réel ou proportionnel. */
    const pending = new Map<number, () => void>();
    const cleared: number[] = [];
    let nextId = 0;
    const realSetTimeout = globalThis.setTimeout;
    const realClearTimeout = globalThis.clearTimeout;
    const delays: number[] = [];
    globalThis.setTimeout = ((cb: () => void, delay: number) => {
      nextId += 1;
      pending.set(nextId, cb);
      delays.push(delay);
      return nextId;
    }) as unknown as typeof setTimeout;
    globalThis.clearTimeout = ((id?: number) => {
      if (id === undefined) return;
      cleared.push(id);
      pending.delete(id);
    }) as unknown as typeof clearTimeout;

    try {
      act(() => {
        state().jumpToMessage('m1');
      });
      expect(pending.size).toBe(1);
      expect(delays).toEqual([HIGHLIGHT_MS]);
      expect(HIGHLIGHT_MS).toBe(1600);
      const firstEntry = pending.entries().next();
      if (firstEntry.done) throw new Error('aucun minuteur programmé après le premier saut');
      const [firstId] = firstEntry.value;

      act(() => {
        state().jumpToMessage('m2'); // un second saut, avant l'échéance du premier
      });
      expect(cleared).toContain(firstId);
      expect(pending.has(firstId)).toBe(false);
      expect(pending.size).toBe(1);
      expect(state().highlightedId).toBe('m2');

      const secondEntry = pending.entries().next();
      if (secondEntry.done) throw new Error('aucun minuteur programmé après le réarmement');
      const [, secondCb] = secondEntry.value;
      act(() => {
        secondCb();
      });
      expect(state().highlightedId).toBeNull();
    } finally {
      globalThis.setTimeout = realSetTimeout;
      globalThis.clearTimeout = realClearTimeout;
    }
  });

  test('le saut DIFFÉRÉ attend la rangée plate (#5695)', () => {
    const journal: string[] = [];
    const { state, rerender } = mount({ placed: placedOf(['m1', 'm2', 'm3']), mode: 'summary', journal });

    act(() => {
      state().requestJump('m3');
    });
    expect(journal).toEqual([]); // `summary` : `<ol>` n'est pas monté, aucun saut

    rerender({ mode: 'script' });
    expect(journal).toEqual(['note', 'scroll']); // consommée au passage en rangée plate

    /* La demande est CONSOMMÉE, et ça ne se prouve qu'en rejouant l'effet :
       un rendu au MÊME mode ne le relance pas (dépendances inchangées), donc
       il ne pourrait pas rougir. Passer à `focal` — autre rangée plate —
       relance l'effet : une demande restée posée resauterait ici. */
    rerender({ mode: 'focal' });
    expect(journal).toEqual(['note', 'scroll']);
  });

  test('`jumpToMessage` garde son identité tant que `placed`, `virtualizer` et `noteProgrammaticScroll` ne changent pas', () => {
    const journal: string[] = [];
    const { state, rerender } = mount({ placed: placedOf(['m1']), mode: 'focal', journal });
    const first = state().jumpToMessage;
    rerender({ mode: 'focal' });
    const second = state().jumpToMessage;
    expect(Object.is(first, second)).toBe(true);
  });

  test('le démontage annule le minuteur en vol', () => {
    const journal: string[] = [];
    const cleared: number[] = [];
    const realClearTimeout = globalThis.clearTimeout;
    globalThis.clearTimeout = ((id?: number) => {
      if (id !== undefined) cleared.push(id);
      return realClearTimeout(id as never);
    }) as unknown as typeof clearTimeout;
    try {
      const { state } = mount({ placed: placedOf(['m1']), mode: 'focal', journal });
      act(() => {
        state().jumpToMessage('m1');
      });
      act(() => {
        root.unmount();
      });
      expect(cleared.length).toBeGreaterThan(0);
      // `afterEach` unmonte à nouveau `root` — on lui donne une racine FRAÎCHE,
      // jamais celle déjà démontée par ce test (un second `unmount()` avertit
      // React sans y avoir de raison).
      container = document.createElement('div');
      document.body.appendChild(container);
      root = createRoot(container);
    } finally {
      globalThis.clearTimeout = realClearTimeout;
    }
  });
});
