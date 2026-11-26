import { QueryClient } from '@tanstack/react-query';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { message } from '@/lib/api/fixtures-base';
import { messagesQueryKey } from '@/lib/api/messages';
import type { MessagesInfiniteData } from '@/lib/api/messages-pages';
import type { Message } from '@/lib/api/types';
import { createViewOnceQueue, type ViewOnceQueue, type ViewOnceQueueStorage } from '@/lib/api/view-once-queue';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { useViewOnceQueue } from './use-view-once-queue';

/**
 * `useViewOnceQueue` (#8015) — le fil rejoue les consommations de vue unique
 * restées en file au retour du réseau, et garde « déjà ouvert » sur la rangée
 * que la passerelle sert encore ouvrable tant que la file la retient.
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

function memoryStorage(): ViewOnceQueueStorage {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
}

const served = (id: string): Message =>
  message({
    id,
    conversationId: 'c-a',
    senderId: 'u-other',
    content: `secret ${id}`,
    originalLanguage: 'fr',
    translations: [],
    createdAt: new Date(1_757_000_000_000),
    isViewOnce: true,
    viewOnceCount: 0,
    maxViewOnceCount: 1,
  });

const settle = () => act(async () => new Promise((resolve) => setTimeout(resolve, 0)));

function mount(queue: ViewOnceQueue, messages: readonly Message[]) {
  const queryClient = new QueryClient();
  queryClient.setQueryData<MessagesInfiniteData>(messagesQueryKey('c-a'), {
    pages: [{ messages, hasOlder: false, nextCursor: null }],
    pageParams: [undefined],
  });
  function Harness() {
    useViewOnceQueue({ conversationId: 'c-a', messages, viewerId: 'u-me', queryClient, queue });
    return null;
  }
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  act(() => root.render(<Harness />));
  const rowOf = (id: string) =>
    queryClient
      .getQueryData<MessagesInfiniteData>(messagesQueryKey('c-a'))
      ?.pages.flatMap((p) => [...p.messages])
      .find((m) => m.id === id);
  return {
    rowOf,
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

describe('useViewOnceQueue — la vue unique fermée hors ligne (#8015)', () => {
  test('après rechargement HORS LIGNE, la rangée servie ouvrable reste « déjà ouverte » et son contenu est purgé', async () => {
    const storage = memoryStorage();
    const offline = async (): Promise<never> => {
      throw new Error('offline');
    };
    createViewOnceQueue({ storage, key: 'k', send: offline }).enqueue('c-a', 'm1');
    const reloaded = createViewOnceQueue({ storage, key: 'k', send: offline });

    const view = mount(reloaded, [served('m1'), served('m2')]);
    await settle();

    expect(view.rowOf('m1')?.consumedByMe).toBe(true);
    expect(view.rowOf('m1')?.content).toBe('');
    expect(view.rowOf('m2')?.consumedByMe).not.toBe(true);
    view.unmount();
  });

  test('le retour du réseau rejoue la consommation en file', async () => {
    const sent: string[] = [];
    let online = false;
    const queue = createViewOnceQueue({
      storage: memoryStorage(),
      key: 'k',
      send: async (entry) => {
        if (!online) throw new Error('offline');
        sent.push(entry.messageId);
        return { ok: true, status: 200 };
      },
    });
    queue.enqueue('c-a', 'm1');

    const view = mount(queue, [served('m1')]);
    await settle();
    expect(sent).toEqual([]);

    online = true;
    await act(async () => {
      window.dispatchEvent(new Event('online'));
    });
    await settle();

    expect(sent).toEqual(['m1']);
    expect(queue.pendingFor('c-a').size).toBe(0);
    view.unmount();
  });
});
