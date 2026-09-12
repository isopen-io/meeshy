import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import { createDraftStore, type StorageLike } from '@/lib/send/draft-store';

import { DRAFT_DEBOUNCE_MS, useComposerDraft } from './use-draft';
import type { ComposerDraftReport } from './use-draft';

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

function fakeStorage(): StorageLike & { readonly data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
    removeItem: (key) => {
      data.delete(key);
    },
  };
}

let container: HTMLDivElement;
let root: Root;

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
});

type Handle = ReturnType<typeof useComposerDraft>;

function mount(props: { readonly conversationId: string | undefined; readonly backend?: ReturnType<typeof fakeStorage> }) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  const backend = props.backend ?? fakeStorage();
  const store = createDraftStore(backend);
  let captured!: Handle;

  function Harness(p: { readonly conversationId: string | undefined }) {
    captured = useComposerDraft({ store, scope: 'u_a', conversationId: p.conversationId });
    return null;
  }

  act(() => {
    root.render(<Harness conversationId={props.conversationId} />);
  });

  return {
    rerender: (next: { readonly conversationId: string | undefined }) => {
      act(() => {
        root.render(<Harness conversationId={next.conversationId} />);
      });
    },
    handle: () => captured,
    backend,
    store,
  };
}

const reportOf = (overrides: Partial<ComposerDraftReport> = {}): ComposerDraftReport => ({
  text: 'bonjour',
  language: 'fr',
  protection: {},
  ...overrides,
});

describe('useComposerDraft — lecture une fois par (scope, conversation)', () => {
  test('conversationId undefined : aucune lecture', () => {
    const { handle, backend } = mount({ conversationId: undefined });
    expect(handle().initial).toBeNull();
    expect(backend.data.size).toBe(0);
  });

  test('conversationId résolu : une graine lue depuis le magasin', () => {
    const backend = fakeStorage();
    backend.setItem('meeshy.draft.u_a.c1', JSON.stringify({ text: 'Hallo', language: 'de', protection: {} }));
    const { handle } = mount({ conversationId: 'c1', backend });
    expect(handle().initial).toEqual({ text: 'Hallo', language: 'de', protection: {} });
  });

  test('des re-rendus à identité inchangée ne relisent pas une deuxième fois', () => {
    const backend = fakeStorage();
    const { rerender, handle } = mount({ conversationId: 'c1', backend });
    const firstInitial = handle().initial;
    backend.setItem('meeshy.draft.u_a.c1', JSON.stringify({ text: 'changé après coup', language: 'fr', protection: {} }));
    rerender({ conversationId: 'c1' });
    // Le hook ne relit PAS : `initial` reste la graine du premier montage.
    expect(handle().initial).toBe(firstInitial);
  });
});

describe('useComposerDraft — politique de persistance (fin de mot / milieu de mot / vidage)', () => {
  test('milieu de mot : aucune écriture avant le débounce', () => {
    const { handle, backend } = mount({ conversationId: 'c1' });
    act(() => {
      handle().report(reportOf({ text: 'bonjou' }));
    });
    expect(backend.data.has('meeshy.draft.u_a.c1')).toBe(false);
  });

  test('milieu de mot : écrit après le débounce', async () => {
    const { handle, backend } = mount({ conversationId: 'c1' });
    act(() => {
      handle().report(reportOf({ text: 'bonjou' }));
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, DRAFT_DEBOUNCE_MS + 20));
    });
    expect(JSON.parse(backend.data.get('meeshy.draft.u_a.c1') ?? 'null')).toEqual({
      text: 'bonjou',
      language: 'fr',
      protection: {},
    });
  });

  test('fin de mot (espace) : écriture SYNCHRONE, pas de débounce', () => {
    const { handle, backend } = mount({ conversationId: 'c1' });
    act(() => {
      handle().report(reportOf({ text: 'bonjour ' }));
    });
    expect(backend.data.has('meeshy.draft.u_a.c1')).toBe(true);
  });

  test('champ vidé : purge SYNCHRONE, même après une écriture précédente', () => {
    const { handle, backend } = mount({ conversationId: 'c1' });
    act(() => {
      handle().report(reportOf({ text: 'bonjour ' }));
    });
    expect(backend.data.has('meeshy.draft.u_a.c1')).toBe(true);
    act(() => {
      handle().report(reportOf({ text: '' }));
    });
    expect(backend.data.has('meeshy.draft.u_a.c1')).toBe(false);
  });

  test('flush() écrit immédiatement une valeur en attente (sortie de vue)', () => {
    const { handle, backend } = mount({ conversationId: 'c1' });
    act(() => {
      handle().report(reportOf({ text: 'bonjou' }));
    });
    expect(backend.data.has('meeshy.draft.u_a.c1')).toBe(false);
    act(() => {
      handle().flush();
    });
    expect(backend.data.has('meeshy.draft.u_a.c1')).toBe(true);
  });

  test('texte ET langue ET protection voyagent ensemble dans la même écriture', () => {
    const { handle, backend } = mount({ conversationId: 'c1' });
    act(() => {
      handle().report({ text: 'wie geht es ', language: 'de', protection: { blurred: true }, replyToId: 'm1' });
    });
    expect(JSON.parse(backend.data.get('meeshy.draft.u_a.c1') ?? 'null')).toEqual({
      text: 'wie geht es ',
      language: 'de',
      protection: { blurred: true },
      replyToId: 'm1',
    });
  });
});
