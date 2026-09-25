import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import { createDraftStore, type StorageLike } from '@/lib/send/draft-store';
import { VIEWER_ID, message } from '@/lib/api/fixtures-base';
import type { Message } from '@/lib/api/types';

import { mentionSourceStore } from './mention-source';
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
  return message({
    senderId: 'u-2',
    content: 'salut',
    originalLanguage: 'fr',
    translations: [],
    createdAt: new Date('2026-09-24T10:00:00.000Z'),
    ...overrides,
  });
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
      send: initial.send,
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
    expect(Object.is(calls[0]?.[2], m1)).toBe(true);
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
    expect(state().replyTo).toBeDefined();
    act(() => {
      state().onCancelReply();
    });
    expect(state().replyTo).toBeUndefined();
  });

  test('onSend garde son identité entre deux rendus sans changement — il est prop de Composer, re-rendu à chaque image', () => {
    const { state, rerender } = mount({ messages: [], send: () => {} });
    const first = state().onSend;
    rerender();
    const second = state().onSend;
    expect(Object.is(first, second)).toBe(true);
  });
});

describe('useThreadCompose — publie la source des mentions du fil (#7826)', () => {
  const sender = (userId: string, username: string): NonNullable<Message['sender']> =>
    ({
      id: `p-${userId}`,
      conversationId: 'c-1',
      type: 'user',
      userId,
      displayName: username,
      role: 'member',
      language: 'fr',
      isActive: true,
      isOnline: false,
      joinedAt: new Date(0),
      user: { id: userId, username },
    }) as NonNullable<Message['sender']>;

  test('le fil ouvert publie ses expéditeurs, hors lecteur ; le démontage retire la source', () => {
    mount({
      messages: [
        messageOf({ id: 'm1', senderId: 'u-2', sender: sender('u-2', 'alice') }),
        messageOf({ id: 'm2', senderId: VIEWER_ID, sender: sender(VIEWER_ID, 'moi') }),
      ],
      send: () => {},
    });
    const published = mentionSourceStore.getState().source;
    expect(published?.selfId).toBe(VIEWER_ID);
    expect(published?.locals.map((c) => c.username)).toEqual(['alice']);

    act(() => {
      root.unmount();
    });
    expect(mentionSourceStore.getState().source).toBeNull();
    root = createRoot(container);
  });
});
