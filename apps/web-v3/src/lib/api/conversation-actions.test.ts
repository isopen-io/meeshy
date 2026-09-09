import { QueryClient } from '@tanstack/react-query';
import { createStore } from 'zustand/vanilla';
import { describe, expect, test } from 'bun:test';

import { performRowAction } from './conversation-actions';
import { CONVERSATIONS_QUERY_KEY } from './conversations';
import { createHttpTransport } from './http';
import { effectiveFlagsOf, effectiveUnreadOf, type ConversationStoreState } from '@/lib/conversation-store';
import type { Conversation } from './types';

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
    unreadCount: 2,
    ...partial,
  }) as Conversation;

/** Un magasin FRAIS — même motif que `conversation-store.test.ts::freshStore`,
 * mais une instance DÉDIÉE par test plutôt que le singleton partagé : deux
 * tests de ce fichier ne doivent jamais se voir l'un l'autre. */
function freshStore() {
  return createStore<ConversationStoreState>((set) => ({
    overrides: {},
    togglePin: (id, current) =>
      set((s) => ({ overrides: { ...s.overrides, [id]: { ...s.overrides[id], flags: { ...s.overrides[id]?.flags, isPinned: !current } } } })),
    toggleMute: (id, current) =>
      set((s) => ({ overrides: { ...s.overrides, [id]: { ...s.overrides[id], flags: { ...s.overrides[id]?.flags, isMuted: !current } } } })),
    toggleArchive: (id, current) =>
      set((s) => ({ overrides: { ...s.overrides, [id]: { ...s.overrides[id], flags: { ...s.overrides[id]?.flags, isArchived: !current } } } })),
    markRead: (id) => set((s) => ({ overrides: { ...s.overrides, [id]: { ...s.overrides[id], unreadCount: 0 } } })),
    markUnread: (id) => set((s) => ({ overrides: { ...s.overrides, [id]: { ...s.overrides[id], unreadCount: 1 } } })),
    clearOverride: (id, keys) =>
      set((s) => {
        const current = s.overrides[id];
        if (current === undefined) return s;
        const removeFlags = new Set(keys.filter((k) => k !== 'unreadCount'));
        const removeUnread = keys.includes('unreadCount');
        const remainingFlags = current.flags === undefined ? [] : Object.entries(current.flags).filter(([k]) => !removeFlags.has(k as never));
        const next = {
          ...(remainingFlags.length > 0 ? { flags: Object.fromEntries(remainingFlags) } : {}),
          ...(!removeUnread && current.unreadCount !== undefined ? { unreadCount: current.unreadCount } : {}),
        };
        if (Object.keys(next).length === 0) {
          const { [id]: _removed, ...rest } = s.overrides;
          return { overrides: rest };
        }
        return { overrides: { ...s.overrides, [id]: next } };
      }),
  }));
}

function fakeFetch(response: { readonly status: number; readonly body?: unknown }) {
  const impl = (async () => new Response(response.body === undefined ? null : JSON.stringify(response.body), { status: response.status })) as typeof fetch;
  return impl;
}

function seededClient(conversations: readonly Conversation[]): QueryClient {
  const queryClient = new QueryClient();
  queryClient.setQueryData(CONVERSATIONS_QUERY_KEY, conversations);
  return queryClient;
}

describe("performRowAction('pin') — 4xx", () => {
  test('AVANT: effectiveFlagsOf rend true (optimiste) ; APRÈS: false, et le cache est INTACT', async () => {
    const c = conversation({ id: 'c1', userPreferences: [{ isPinned: false }] });
    const queryClient = seededClient([c]);
    const store = freshStore();
    const transport = createHttpTransport({
      base: '',
      fetchImpl: fakeFetch({ status: 403, body: { success: false, error: 'Not a member of this conversation' } }),
    });

    const promise = performRowAction({
      conversationId: 'c1',
      action: 'pin',
      deps: { source: 'gateway', transport, store, queryClient },
    });

    // Optimiste appliqué SYNCHRONEMENT, avant le règlement du réseau.
    expect(effectiveFlagsOf(c, store.getState().overrides).isPinned).toBe(true);

    await promise;

    expect(effectiveFlagsOf(c, store.getState().overrides).isPinned).toBe(false);
    const cached = queryClient.getQueryData<readonly Conversation[]>(CONVERSATIONS_QUERY_KEY);
    expect(cached?.[0]?.userPreferences).toEqual([{ isPinned: false }]);
  });
});

describe("performRowAction('pin') — 2xx", () => {
  test('effectiveFlagsOf rend true, le cache prend la valeur confirmée, l’override disparaît', async () => {
    const c = conversation({ id: 'c1', userPreferences: [{ isPinned: false }] });
    const queryClient = seededClient([c]);
    const store = freshStore();
    const transport = createHttpTransport({
      base: '',
      fetchImpl: fakeFetch({ status: 200, body: { success: true, data: { isPinned: true, isMuted: false, isArchived: false, isDefault: false } } }),
    });

    await performRowAction({ conversationId: 'c1', action: 'pin', deps: { source: 'gateway', transport, store, queryClient } });

    const cached = queryClient.getQueryData<readonly Conversation[]>(CONVERSATIONS_QUERY_KEY);
    expect(effectiveFlagsOf(cached![0]!, store.getState().overrides).isPinned).toBe(true);
    expect((cached?.[0]?.userPreferences as [{ isPinned: boolean }])[0]?.isPinned).toBe(true);
    expect(store.getState().overrides['c1']?.flags?.isPinned).toBeUndefined();
  });
});

describe("performRowAction('pin') — réseau (status 0) et 5xx", () => {
  test('l’override RESTE (transient)', async () => {
    const c = conversation({ id: 'c1', userPreferences: [{ isPinned: false }] });
    for (const status of [500]) {
      const queryClient = seededClient([c]);
      const store = freshStore();
      const transport = createHttpTransport({ base: '', fetchImpl: fakeFetch({ status, body: { success: false, error: 'panne' } }) });
      await performRowAction({ conversationId: 'c1', action: 'pin', deps: { source: 'gateway', transport, store, queryClient } });
      expect(effectiveFlagsOf(c, store.getState().overrides).isPinned).toBe(true);
    }

    // Panne réseau (fetch qui rejette) — même sémantique : override RESTE.
    const queryClient = seededClient([c]);
    const store = freshStore();
    const rejecting = (async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch;
    const transport = createHttpTransport({ base: '', fetchImpl: rejecting });
    await performRowAction({ conversationId: 'c1', action: 'pin', deps: { source: 'gateway', transport, store, queryClient } });
    expect(effectiveFlagsOf(c, store.getState().overrides).isPinned).toBe(true);
  });
});

describe('mute / archive / read / unread — corps EXACTS', () => {
  test('mute ⇒ PUT { isMuted: true }', async () => {
    const c = conversation({ id: 'c1', userPreferences: [{ isMuted: false }] });
    const queryClient = seededClient([c]);
    const store = freshStore();
    const calls: { readonly url: string; readonly init: RequestInit }[] = [];
    const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), init: init ?? {} });
      return new Response(JSON.stringify({ success: true, data: { isMuted: true } }), { status: 200 });
    }) as typeof fetch;
    const transport = createHttpTransport({ base: '', fetchImpl: impl });

    await performRowAction({ conversationId: 'c1', action: 'mute', deps: { source: 'gateway', transport, store, queryClient } });

    expect(calls[0]?.url).toBe('/api/v1/user-preferences/conversations/c1');
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({ isMuted: true });
  });

  test('archive ⇒ PUT { isArchived: true }', async () => {
    const c = conversation({ id: 'c1', userPreferences: [{ isArchived: false }] });
    const queryClient = seededClient([c]);
    const store = freshStore();
    const calls: { readonly url: string; readonly init: RequestInit }[] = [];
    const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), init: init ?? {} });
      return new Response(JSON.stringify({ success: true, data: { isArchived: true } }), { status: 200 });
    }) as typeof fetch;
    const transport = createHttpTransport({ base: '', fetchImpl: impl });

    await performRowAction({ conversationId: 'c1', action: 'archive', deps: { source: 'gateway', transport, store, queryClient } });

    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({ isArchived: true });
  });

  test('read (conversation non lue) ⇒ POST …/receipts { type: "read" }, cache unreadCount:0', async () => {
    const c = conversation({ id: 'c1', unreadCount: 3 });
    const queryClient = seededClient([c]);
    const store = freshStore();
    expect(effectiveUnreadOf(c, store.getState().overrides)).toBe(3);
    const calls: { readonly url: string; readonly init: RequestInit }[] = [];
    const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), init: init ?? {} });
      return new Response(JSON.stringify({ success: true, data: {} }), { status: 200 });
    }) as typeof fetch;
    const transport = createHttpTransport({ base: '', fetchImpl: impl });

    // Avant l'await : l'optimiste passe le compteur effectif à 0.
    const promise = performRowAction({ conversationId: 'c1', action: 'read', deps: { source: 'gateway', transport, store, queryClient } });
    expect(effectiveUnreadOf(c, store.getState().overrides)).toBe(0);
    await promise;

    expect(calls[0]?.url).toBe('/api/v1/conversations/c1/receipts');
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({ type: 'read' });
    expect(queryClient.getQueryData<readonly Conversation[]>(CONVERSATIONS_QUERY_KEY)?.[0]?.unreadCount).toBe(0);
  });

  test('read (conversation déjà lue) ⇒ POST …/mark-unread SANS corps', async () => {
    const c = conversation({ id: 'c1', unreadCount: 0 });
    const queryClient = seededClient([c]);
    const store = freshStore();
    const calls: { readonly url: string; readonly init: RequestInit }[] = [];
    const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), init: init ?? {} });
      return new Response(JSON.stringify({ success: true, data: {} }), { status: 200 });
    }) as typeof fetch;
    const transport = createHttpTransport({ base: '', fetchImpl: impl });

    await performRowAction({ conversationId: 'c1', action: 'read', deps: { source: 'gateway', transport, store, queryClient } });

    expect(calls[0]?.url).toBe('/api/v1/conversations/c1/mark-unread');
    expect(calls[0]?.init.body).toBeUndefined();
  });
});

describe('source fixtures — fetchImpl JAMAIS appelé', () => {
  test('pin en source fixtures : override reste, aucun appel réseau', async () => {
    const c = conversation({ id: 'c1', userPreferences: [{ isPinned: false }] });
    const queryClient = seededClient([c]);
    const store = freshStore();
    let calls = 0;
    const impl = (async () => {
      calls += 1;
      return new Response(null, { status: 200 });
    }) as typeof fetch;
    const transport = createHttpTransport({ base: '', fetchImpl: impl });

    await performRowAction({ conversationId: 'c1', action: 'pin', deps: { source: 'fixtures', transport, store, queryClient } });

    expect(calls).toBe(0);
    expect(effectiveFlagsOf(c, store.getState().overrides).isPinned).toBe(true);
  });
});
