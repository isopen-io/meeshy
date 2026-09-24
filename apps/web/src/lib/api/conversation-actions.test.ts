import { QueryClient } from '@tanstack/react-query';
import { createStore } from 'zustand/vanilla';
import { describe, expect, test } from 'bun:test';

import { performRowAction } from './conversation-actions';
import { CONVERSATIONS_QUERY_KEY, conversationQueryKey, findCachedConversation } from './conversations';
import { createHttpTransport } from './http';
import { message, VIEWER_ID } from './fixtures-base';
import { effectiveFlagsOf, effectiveUnreadOf, type ConversationStoreState } from '@/lib/conversation-store';
import { unreadBoundaryOf } from '@/lib/view/unread-boundary';
import type { Conversation, Message } from './types';

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

/**
 * `seededClient` (#6195) — sème le cache dans la forme PAGINÉE
 * (`ConversationsInfiniteData`, une seule page) : `performRowAction` lit
 * désormais `findCachedConversation`, qui ne reconnaît plus l'ancienne forme
 * (tableau) — voir son doc-comment (`conversations.ts`). Les assertions de ce
 * fichier restent inchangées, seule cette fabrique de cache change de forme.
 */
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
    const cached = findCachedConversation(queryClient, 'c1');
    expect(cached?.userPreferences).toEqual([{ isPinned: false }]);
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

    const cached = findCachedConversation(queryClient, 'c1');
    expect(effectiveFlagsOf(cached!, store.getState().overrides).isPinned).toBe(true);
    expect((cached?.userPreferences as [{ isPinned: boolean }])[0]?.isPinned).toBe(true);
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
    expect(findCachedConversation(queryClient, 'c1')?.unreadCount).toBe(0);
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

/**
 * « LU » DEPUIS LA LISTE, PUIS LE FIL ROUVERT (#7351, revue-correction) — le
 * fil calcule son séparateur sur le cache de DÉTAIL (`conversationQueryKey`)
 * ou, à défaut, sur la ligne de liste (`initialData`). Le geste confirmé ne
 * posait `unreadCount: 0` QUE sur la liste, sans avancer le curseur : un
 * détail en cache gardait son compte (repli `unreadCountHint` sans curseur),
 * et un curseur ancien gardait ses messages « non lus » (le curseur prime
 * sur le compte) — deux séparateurs sur ce qu'on venait de marquer lu.
 */
describe("performRowAction('read') 2xx — le fil rouvert ne remet pas de séparateur sur ce qui est lu", () => {
  const at = (iso: string) => new Date(iso);
  const messageOf = (id: string, iso: string): Message =>
    message({ id, conversationId: 'c1', senderId: 'u-autrui', content: id, originalLanguage: 'fr', translations: [], createdAt: at(iso) });
  const THREAD: readonly Message[] = [
    messageOf('m1', '2026-09-21T09:01:00.000Z'),
    messageOf('m2', '2026-09-21T09:02:00.000Z'),
    messageOf('m3', '2026-09-21T09:03:00.000Z'),
  ];
  const lastMessage = THREAD[2] as Message;
  const readThroughList = async (c: Conversation, withDetail: boolean) => {
    const queryClient = seededClient([c]);
    if (withDetail) queryClient.setQueryData(conversationQueryKey('c1'), c);
    const transport = createHttpTransport({ base: '', fetchImpl: fakeFetch({ status: 200, body: { success: true, data: {} } }) });
    await performRowAction({ conversationId: 'c1', action: 'read', deps: { source: 'gateway', transport, store: freshStore(), queryClient } });
    return {
      listed: findCachedConversation(queryClient, 'c1'),
      detail: queryClient.getQueryData<Conversation>(conversationQueryKey('c1')),
    };
  };

  test('sans curseur (appareil neuf) : le détail en cache ne rouvre plus « 2 messages non lus »', async () => {
    const { detail } = await readThroughList(conversation({ id: 'c1', unreadCount: 2, lastMessage }), true);

    expect(unreadBoundaryOf({ conversation: detail!, messages: THREAD, viewerId: VIEWER_ID })).toBeNull();
  });

  test('curseur ANCIEN : liste et détail avancent jusqu’au dernier message, et un message arrivé ensuite rouvre SON séparateur', async () => {
    const stale = conversation({
      id: 'c1',
      unreadCount: 2,
      lastMessage,
      lastReadMessageId: 'm1',
      lastReadMessageCreatedAt: at('2026-09-21T09:01:00.000Z'),
    });
    const { listed, detail } = await readThroughList(stale, true);
    const later = [...THREAD, messageOf('m4', '2026-09-21T09:10:00.000Z')];

    expect(unreadBoundaryOf({ conversation: listed!, messages: THREAD, viewerId: VIEWER_ID })).toBeNull();
    expect(unreadBoundaryOf({ conversation: detail!, messages: THREAD, viewerId: VIEWER_ID })).toBeNull();
    expect(unreadBoundaryOf({ conversation: detail!, messages: later, viewerId: VIEWER_ID })).toEqual({
      firstUnreadId: 'm4',
      unreadCount: 1,
    });
  });
});
