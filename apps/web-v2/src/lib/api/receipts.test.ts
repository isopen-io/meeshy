import { QueryClient } from '@tanstack/react-query';
import { createStore } from 'zustand/vanilla';
import { describe, expect, test } from 'bun:test';

import { markCaughtUp, pushReadReceipt } from './receipts';
import { CONVERSATIONS_QUERY_KEY, findCachedConversation } from './conversations';
import { createHttpTransport } from './http';
import { effectiveUnreadOf, type ConversationStoreState } from '@/lib/conversation-store';
import type { Conversation } from './types';

/** Même magasin FRAIS que `conversation-actions.test.ts::freshStore` — une
 * instance dédiée par test, jamais le singleton partagé. */
function freshStore() {
  return createStore<ConversationStoreState>((set) => ({
    overrides: {},
    togglePin: () => {},
    toggleMute: () => {},
    toggleArchive: () => {},
    markRead: (id) => set((s) => ({ overrides: { ...s.overrides, [id]: { ...s.overrides[id], unreadCount: 0 } } })),
    markUnread: (id) => set((s) => ({ overrides: { ...s.overrides, [id]: { ...s.overrides[id], unreadCount: 1 } } })),
    clearOverride: (id, keys) =>
      set((s) => {
        const current = s.overrides[id];
        if (current === undefined) return s;
        const removeUnread = keys.includes('unreadCount');
        const next = { ...(!removeUnread && current.unreadCount !== undefined ? { unreadCount: current.unreadCount } : {}) };
        if (Object.keys(next).length === 0) {
          const { [id]: _removed, ...rest } = s.overrides;
          return { overrides: rest };
        }
        return { overrides: { ...s.overrides, [id]: next } };
      }),
  }));
}

const conversation = (partial: Partial<Conversation>): Conversation =>
  ({
    id: 'c1',
    type: 'direct',
    status: 'active',
    visibility: 'private',
    isActive: true,
    memberCount: 2,
    participants: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    unreadCount: 3,
    ...partial,
  }) as Conversation;

function seededClient(conversations: readonly Conversation[]): QueryClient {
  const queryClient = new QueryClient();
  queryClient.setQueryData(CONVERSATIONS_QUERY_KEY, {
    pages: [
      {
        conversations,
        pagination: { limit: 30, offset: 0, total: conversations.length, hasMore: false },
        cursorPagination: { limit: 30, hasMore: false, nextCursor: null },
      },
    ],
    pageParams: [undefined],
  });
  return queryClient;
}

function fakeFetch(response: { readonly status: number; readonly body?: unknown }) {
  return (async () => new Response(response.body === undefined ? null : JSON.stringify(response.body), { status: response.status })) as typeof fetch;
}

describe('pushReadReceipt', () => {
  test('POST /api/v1/conversations/:id/receipts, corps { type: "read", caughtUpToMessageId }', async () => {
    const calls: { readonly url: string; readonly init: RequestInit }[] = [];
    const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), init: init ?? {} });
      return new Response(JSON.stringify({ success: true, data: { type: 'read', markedCount: 1, unreadCount: 0 } }), { status: 200 });
    }) as typeof fetch;
    const transport = createHttpTransport({ base: '', fetchImpl: impl });

    await pushReadReceipt(transport, 'c1', 'm9');

    expect(calls[0]?.url).toBe('/api/v1/conversations/c1/receipts');
    expect(calls[0]?.init.method).toBe('POST');
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({ type: 'read', caughtUpToMessageId: 'm9' });
  });
});

describe('markCaughtUp — optimiste', () => {
  test('la pastille redescend AVANT la résolution réseau (synchrone)', () => {
    const c = conversation({ id: 'c1' });
    const queryClient = seededClient([c]);
    const store = freshStore();
    // Une promesse qui ne se résout jamais dans ce test — seul l'AVANT compte.
    const transport = createHttpTransport({ base: '', fetchImpl: (() => new Promise(() => {})) as unknown as typeof fetch });

    void markCaughtUp({ conversationId: 'c1', caughtUpToMessageId: 'm9', deps: { source: 'gateway', transport, store, queryClient } });

    expect(effectiveUnreadOf(c, store.getState().overrides)).toBe(0);
  });
});

describe('markCaughtUp — 2xx', () => {
  test('le cache prend unreadCount: 0 CONFIRMÉ, l’override disparaît', async () => {
    const c = conversation({ id: 'c1' });
    const queryClient = seededClient([c]);
    const store = freshStore();
    const transport = createHttpTransport({
      base: '',
      fetchImpl: fakeFetch({ status: 200, body: { success: true, data: { type: 'read', markedCount: 3, unreadCount: 0 } } }),
    });

    await markCaughtUp({ conversationId: 'c1', caughtUpToMessageId: 'm9', deps: { source: 'gateway', transport, store, queryClient } });

    const cached = findCachedConversation(queryClient, 'c1');
    expect(cached?.unreadCount).toBe(0);
    expect(store.getState().overrides['c1']?.unreadCount).toBeUndefined();
  });
});

describe('markCaughtUp — 4xx (refus PERMANENT)', () => {
  test('rollback : l’override disparaît, le cache reste INTACT', async () => {
    const c = conversation({ id: 'c1', unreadCount: 3 });
    const queryClient = seededClient([c]);
    const store = freshStore();
    const transport = createHttpTransport({
      base: '',
      fetchImpl: fakeFetch({ status: 404, body: { success: false, error: 'Message non trouvé' } }),
    });

    await markCaughtUp({ conversationId: 'c1', caughtUpToMessageId: 'm9', deps: { source: 'gateway', transport, store, queryClient } });

    expect(store.getState().overrides['c1']).toBeUndefined();
    const cached = findCachedConversation(queryClient, 'c1');
    expect(cached?.unreadCount).toBe(3);
  });
});

describe('markCaughtUp — panne réseau / 5xx (TRANSITOIRE)', () => {
  test('l’override RESTE', async () => {
    const c = conversation({ id: 'c1' });
    const queryClient = seededClient([c]);
    const store = freshStore();
    const rejecting = (async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch;
    const transport = createHttpTransport({ base: '', fetchImpl: rejecting });

    await markCaughtUp({ conversationId: 'c1', caughtUpToMessageId: 'm9', deps: { source: 'gateway', transport, store, queryClient } });

    expect(effectiveUnreadOf(c, store.getState().overrides)).toBe(0);
  });
});

describe('markCaughtUp — source fixtures', () => {
  test('override posé, AUCUN appel réseau', async () => {
    const c = conversation({ id: 'c1' });
    const queryClient = seededClient([c]);
    const store = freshStore();
    let called = false;
    const impl = (async () => {
      called = true;
      return new Response(null, { status: 200 });
    }) as typeof fetch;
    const transport = createHttpTransport({ base: '', fetchImpl: impl });

    await markCaughtUp({ conversationId: 'c1', caughtUpToMessageId: 'm9', deps: { source: 'fixtures', transport, store, queryClient } });

    expect(called).toBe(false);
    expect(effectiveUnreadOf(c, store.getState().overrides)).toBe(0);
  });
});
