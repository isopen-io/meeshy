import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import { createDraftStore, type StorageLike } from '@/lib/send/draft-store';
import type { Message } from '@/lib/api/types';

import { useThreadCompose, type ThreadComposeState } from './use-thread-compose';

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

function messageOf(overrides: Partial<Message> & { readonly id: string }): Message {
  return {
    conversationId: 'c-1',
    senderId: 'u-2',
    content: 'salut',
    originalLanguage: 'fr',
    translations: [],
    createdAt: new Date('2026-09-24T10:00:00.000Z'),
    updatedAt: new Date('2026-09-24T10:00:00.000Z'),
    messageType: 'text',
    ...overrides,
  } as unknown as Message;
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
  readonly messages: readonly Message[];
  readonly send: (
    text: string,
    attachments: readonly unknown[],
    replyTo: Message | null,
    language: string,
    protection: unknown,
    place: unknown,
  ) => void;
}): {
  readonly state: () => ThreadComposeState;
  readonly rerender: () => void;
} {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  const backend = fakeStorage();
  const store = createDraftStore(backend);
  let captured!: ThreadComposeState;

  function Harness() {
    captured = useThreadCompose({
      store,
      scope: 'u_v1',
      conversationId: 'c-1',
      messages: initial.messages,
      readerLanguages: ['fr'],
      send: initial.send as never,
    });
    return null;
  }

  act(() => {
    root.render(<Harness />);
  });

  return {
    state: () => captured,
    rerender: () => {
      act(() => {
        root.render(<Harness />);
      });
    },
  };
}

describe('useThreadCompose — brouillon, citation, envoi (#7429, extrait de routes/thread.tsx)', () => {
  test('sans citation, onSend remet null en 3e argument et les six arguments dans l’ordre de useSend', () => {
    const calls: unknown[][] = [];
    const send = (...args: unknown[]) => calls.push(args);
    const { state } = mount({ messages: [], send });

    act(() => {
      state().onSend({ text: 'bonjour', attachments: [], language: 'fr', protection: {}, place: null });
    });

    expect(calls).toEqual([['bonjour', [], null, 'fr', {}, null]]);
  });

  test('avec citation, onSend remet le MESSAGE ENTIER, puis efface la cible', () => {
    const m1 = messageOf({ id: 'm1', content: 'un message cité' });
    const calls: unknown[][] = [];
    const send = (...args: unknown[]) => calls.push(args);
    const { state } = mount({ messages: [m1], send });

    act(() => {
      state().setReplyTarget('m1');
    });
    expect(state().replyTo?.excerpt).toBe('un message cité');

    act(() => {
      state().onSend({ text: 'réponse', attachments: [], language: 'fr', protection: {}, place: null });
    });

    expect(calls).toEqual([['réponse', [], m1, 'fr', {}, null]]);
    expect(state().replyTarget).toBeNull();
    expect(state().replyTo).toBeUndefined();
  });

  test('une cible qui a quitté le cache ne monte AUCUNE citation (fail-closed)', () => {
    const { state } = mount({ messages: [], send: () => {} });
    act(() => {
      state().setReplyTarget('ghost');
    });
    expect(state().replyTo).toBeUndefined();
  });

  test('onCancelReply efface la cible', () => {
    const m1 = messageOf({ id: 'm1' });
    const { state } = mount({ messages: [m1], send: () => {} });
    act(() => {
      state().setReplyTarget('m1');
    });
    expect(state().replyTarget).toBe('m1');
    act(() => {
      state().onCancelReply();
    });
    expect(state().replyTarget).toBeNull();
  });

  test('onSend garde son identité entre deux rendus sans changement — il est prop de Composer, re-rendu à chaque image', () => {
    const { state, rerender } = mount({ messages: [], send: () => {} });
    const first = state().onSend;
    rerender();
    const second = state().onSend;
    expect(Object.is(first, second)).toBe(true);
  });
});
