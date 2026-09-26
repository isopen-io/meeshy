import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import type { Conversation } from '@/lib/api/types';

import { createReadingModeStore, type StorageLike } from './store';
import { useThreadReadingMode, type ThreadReadingModeState } from './use-thread-reading-mode';

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

/** Motif `use-persisted-mode.test.tsx` — un `StorageLike` en mémoire qui
 * COMPTE ses appels, pour prouver « conversation non résolue ⇒ aucune
 * lecture ni écriture ». */
function fakeStorage(): StorageLike & { readonly data: Map<string, string>; readonly calls: { getItem: number; setItem: number } } {
  const data = new Map<string, string>();
  const calls = { getItem: 0, setItem: 0 };
  return {
    data,
    calls,
    getItem: (key) => {
      calls.getItem += 1;
      return data.get(key) ?? null;
    },
    setItem: (key, value) => {
      calls.setItem += 1;
      data.set(key, value);
    },
    removeItem: (key) => {
      data.delete(key);
    },
  };
}

function conversationOf(overrides: Partial<Conversation> = {}): Conversation {
  return {
    id: 'c-1',
    type: 'group',
    status: 'active',
    visibility: 'private',
    isActive: true,
    memberCount: 3,
    participants: [],
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    unreadCount: 0,
    ...overrides,
  } as unknown as Conversation;
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
  readonly conversation: Conversation | undefined;
  readonly isAnonymous?: boolean;
  readonly backend?: ReturnType<typeof fakeStorage>;
}): {
  readonly rerender: (next: { readonly conversation: Conversation | undefined; readonly isAnonymous?: boolean }) => void;
  readonly state: () => ThreadReadingModeState;
  readonly backend: ReturnType<typeof fakeStorage>;
} {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  const backend = initial.backend ?? fakeStorage();
  const store = createReadingModeStore(backend);
  let captured!: ThreadReadingModeState;

  function Harness(props: { readonly conversation: Conversation | undefined; readonly isAnonymous: boolean }) {
    captured = useThreadReadingMode({ store, scope: 'u_v1', conversation: props.conversation, isAnonymous: props.isAnonymous });
    return null;
  }

  act(() => {
    root.render(<Harness conversation={initial.conversation} isAnonymous={initial.isAnonymous ?? false} />);
  });

  return {
    rerender: (next) => {
      act(() => {
        root.render(<Harness conversation={next.conversation} isAnonymous={next.isAnonymous ?? false} />);
      });
    },
    state: () => captured,
    backend,
  };
}

describe('useThreadReadingMode — orchestration du mode de lecture (#7429, extrait de routes/thread.tsx)', () => {
  test('un invité perd `summary` — la loi le retire de `availableModes`, la ligne reste listée et motivée', () => {
    const conversation = conversationOf({ unreadCount: 30 });
    const { state } = mount({ conversation, isAnonymous: true });
    expect(state().readingCapabilities.availableModes).not.toContain('summary');
    const summaryRow = state().readingMenuRows.find((row) => row.mode === 'summary');
    expect(summaryRow?.isAvailable).toBe(false);
    expect(state().readingDecision.mode).not.toBe('summary');
  });

  test('le sticky gagne, et `isAuto` (readingDecision.reason !== \'sticky\') le dit', () => {
    const conversation = conversationOf();
    const { state } = mount({ conversation });
    act(() => {
      state().selectReadingMode('script');
    });
    expect(state().readingDecision.mode).toBe('script');
    expect(state().readingDecision.reason).toBe('sticky');

    act(() => {
      state().resetReadingModeToAuto();
    });
    expect(state().readingDecision.reason).not.toBe('sticky');
  });

  test('les lignes du menu et la décision gardent leur IDENTITÉ d’un rendu à l’autre sans rien changer — le virtualiseur re-rend l’écran à chaque image', () => {
    const conversation = conversationOf();
    const { state, rerender } = mount({ conversation });
    const first = state();
    rerender({ conversation });
    const second = state();
    expect(Object.is(first.readingMenuRows, second.readingMenuRows)).toBe(true);
    expect(Object.is(first.readingDecision, second.readingDecision)).toBe(true);
  });

  test('conversation non résolue (undefined) ⇒ `script` (défaut, #8147), sans lecture ni écriture du magasin', () => {
    const { state, backend } = mount({ conversation: undefined });
    expect(state().readingDecision.mode).toBe('script');
    expect(backend.calls.getItem).toBe(0);
    expect(backend.calls.setItem).toBe(0);
  });

  test('l’instant d’ouverture est FIGÉ — un délai réel entre deux rendus, sans autre changement, ne fait PAS varier la décision', async () => {
    const conversation = conversationOf();
    const { state, rerender } = mount({ conversation });
    const first = state();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
    rerender({ conversation });
    const second = state();
    expect(Object.is(first.readingDecision, second.readingDecision)).toBe(true);
  });
});
