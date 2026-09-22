import { QueryClient } from '@tanstack/react-query';
import { createStore } from 'zustand/vanilla';
import { describe, expect, test } from 'bun:test';

import { fetchMessageReceiptsPeople, markCaughtUp, pushReadReceipt } from './receipts';
import { CONVERSATIONS_QUERY_KEY, conversationQueryKey, findCachedConversation } from './conversations';
import { createAppQueryClient, type StorageLike } from './query-client';
import { messagesQueryKey, upsertThreadMessage } from './messages';
import type { MessagesInfiniteData } from './messages-pages';
import { decodeConversation } from './decode';
import { createHttpTransport } from './http';
import { effectiveUnreadOf, type ConversationStoreState } from '@/lib/conversation-store';
import { message, VIEWER_ID } from '@/lib/api/fixtures-base';
import { unreadBoundaryOf } from '@/lib/view/unread-boundary';
import type { Conversation, Message } from './types';

function fakeStorage(): StorageLike {
  const raw = new Map<string, string>();
  return {
    getItem: (key) => raw.get(key) ?? null,
    setItem: (key, value) => {
      raw.set(key, value);
    },
    removeItem: (key) => {
      raw.delete(key);
    },
  };
}

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

  /**
   * **LE CACHE DE DÉTAIL AUSSI** (#7351, V3, critère de fin « ce qui est lu
   * ne redevient pas non lu ») — `thread.tsx` relit `conversationQueryKey`,
   * jamais la liste, pour construire `unreadBoundary`. Avant ce lot,
   * `markCaughtUp` ne patchait QUE `patchConversation` (la liste) : le
   * détail gardait son `unreadCount` réseau d'origine.
   */
  test('le cache de DÉTAIL prend aussi unreadCount: 0 CONFIRMÉ', async () => {
    const c = conversation({ id: 'c1', unreadCount: 3 });
    const queryClient = seededClient([c]);
    queryClient.setQueryData(conversationQueryKey('c1'), c);
    const store = freshStore();
    const transport = createHttpTransport({
      base: '',
      fetchImpl: fakeFetch({ status: 200, body: { success: true, data: { type: 'read', markedCount: 3, unreadCount: 0 } } }),
    });

    await markCaughtUp({ conversationId: 'c1', caughtUpToMessageId: 'm9', deps: { source: 'gateway', transport, store, queryClient } });

    expect(queryClient.getQueryData<Conversation>(conversationQueryKey('c1'))?.unreadCount).toBe(0);
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

describe('fetchMessageReceiptsPeople — gateway', () => {
  test('GET /api/v1/conversations/:id/receipts?detail=people&messageIds=<id>', async () => {
    const calls: { readonly url: string; readonly init: RequestInit }[] = [];
    const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), init: init ?? {} });
      return new Response(
        JSON.stringify({
          success: true,
          data: {
            detail: 'people',
            messageIds: ['m9'],
            people: [
              { participantId: 'p1', displayName: 'Alice', avatar: null, deliveredAt: '2026-09-21T10:00:00.000Z', receivedAt: '2026-09-21T10:00:05.000Z', readAt: '2026-09-21T10:00:30.000Z', readDevice: null },
            ],
            pagination: { total: 1, limit: 50, offset: 0, hasMore: false, nextCursor: null },
          },
        }),
        { status: 200 },
      );
    }) as typeof fetch;
    const transport = createHttpTransport({ base: '', fetchImpl: impl });

    const result = await fetchMessageReceiptsPeople({ source: 'gateway', transport, conversationId: 'c1', messageId: 'm9' });

    expect(calls[0]?.url).toBe('/api/v1/conversations/c1/receipts?detail=people&messageIds=m9&limit=100');
    expect(calls[0]?.init.method).toBe('GET');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.people).toHaveLength(1);
      expect(result.data.people[0]?.readAt).toBe('2026-09-21T10:00:30.000Z');
    }
  });

  test('404 (message hors conversation) propagé tel quel', async () => {
    const impl = (async () => new Response(JSON.stringify({ success: false, error: 'Message non trouvé' }), { status: 404 })) as typeof fetch;
    const transport = createHttpTransport({ base: '', fetchImpl: impl });

    const result = await fetchMessageReceiptsPeople({ source: 'gateway', transport, conversationId: 'c1', messageId: 'm9' });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(404);
  });
});

describe('fetchMessageReceiptsPeople — fixtures', () => {
  test('dérivée déterministe de CONVERSATIONS, aucun appel réseau', async () => {
    let called = false;
    const impl = (async () => {
      called = true;
      return new Response(null, { status: 200 });
    }) as typeof fetch;
    const transport = createHttpTransport({ base: '', fetchImpl: impl });

    const result = await fetchMessageReceiptsPeople({ source: 'fixtures', transport, conversationId: 'c-deploiement', messageId: 'm9' });

    expect(called).toBe(false);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.people.length).toBeGreaterThan(0);
      // Même conversation ⇒ même liste au second appel (déterministe). ATTENDU,
      // pas lancé : une assertion posée dans un `.then()` flottant s'exécute
      // APRÈS la fin du test et ne peut plus le faire rougir.
      const second = await fetchMessageReceiptsPeople({ source: 'fixtures', transport, conversationId: 'c-deploiement', messageId: 'm9' });
      expect(second.ok).toBe(true);
      if (second.ok) expect(second.data.people).toEqual(result.data.people);
    }
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

/**
 * **LE CLIENT FROID** (#7351, V3) — round-trip RÉEL par `createAppQueryClient`
 * (`query-client.ts`, même mécanique de persistance que la PWA : `dehydrate`/
 * `hydrate` via `localStorage`), pas une simple relecture de `QueryClient` en
 * mémoire. Scénario : un profil neuf ouvre un fil jamais lu
 * (`unreadCount: 2`, aucun autre signal — le cas de #7351), lit jusqu'au
 * bout (`markCaughtUp`), l'onglet se ferme (`persist()`, ce que `pagehide`
 * déclenche) — puis se RECHARGE : un SECOND client, même stockage, même
 * `buster`, doit voir un fil ENTIÈREMENT lu, jamais redevenu non lu.
 */
describe('markCaughtUp — client froid (rechargement réel, #7351)', () => {
  const MESSAGES: readonly Message[] = [
    message({
      id: 'nl-a',
      conversationId: 'c-froid',
      senderId: 'u-autrui',
      content: 'Premier message jamais lu',
      originalLanguage: 'fr',
      translations: [],
      createdAt: new Date('2026-09-21T09:01:00.000Z'),
    }),
    message({
      id: 'nl-b',
      conversationId: 'c-froid',
      senderId: 'u-autrui',
      content: 'Second message jamais lu',
      originalLanguage: 'fr',
      translations: [],
      createdAt: new Date('2026-09-21T09:02:00.000Z'),
    }),
  ];

  test('après lecture + persist + rechargement : le détail rechargé rend une frontière NULLE, pas les deux messages à nouveau non lus', async () => {
    const storage = fakeStorage();
    const buster = '0.0.0-test:u-froid';

    const clientAvant = createAppQueryClient({ storage, buster });
    const conversationNeuve = conversation({ id: 'c-froid', unreadCount: 2 });
    clientAvant.setQueryData(conversationQueryKey('c-froid'), conversationNeuve);

    // Avant toute lecture : la frontière du profil neuf couvre les deux messages.
    expect(unreadBoundaryOf({ conversation: conversationNeuve, messages: MESSAGES, viewerId: VIEWER_ID })).toEqual({
      firstUnreadId: 'nl-a',
      unreadCount: 2,
    });

    const store = freshStore();
    const transport = createHttpTransport({
      base: '',
      fetchImpl: fakeFetch({ status: 200, body: { success: true, data: { type: 'read', markedCount: 2, unreadCount: 0 } } }),
    });
    await markCaughtUp({
      conversationId: 'c-froid',
      caughtUpToMessageId: 'nl-b',
      deps: { source: 'gateway', transport, store, queryClient: clientAvant },
    });
    clientAvant.persist();

    // Rechargement : un SECOND client, jamais vu la session précédente.
    const clientApres = createAppQueryClient({ storage, buster });
    // Le cache persisté porte ses dates en CHAÎNES (JSON) : l'écran le lit
    // par `select: decodeConversation` (`conversationQuery`), le témoin aussi.
    const brut = clientApres.getQueryData<Conversation>(conversationQueryKey('c-froid'));
    const detailRecharge = brut === undefined ? undefined : decodeConversation(brut);

    expect(detailRecharge?.unreadCount).toBe(0);
    expect(unreadBoundaryOf({ conversation: detailRecharge!, messages: MESSAGES, viewerId: VIEWER_ID })).toBeNull();
  });
});

/**
 * **LE CLIENT CHAUD** (#7351, revue-correction) — le détail en cache survit à
 * la lecture ; un message arrive ENSUITE par le socket (`upsertThreadMessage`,
 * qui n'écrit ni `unreadCount` ni le curseur du détail) ; le fil se rouvre sur
 * ce détail sans refetch (`staleTime` de 30 s, ou cache persisté). Le curseur
 * du détail doit donc AVANCER avec la lecture : resté sur l'ancien, il
 * rendrait non lus les messages lus ; effacé par un compte à 0, il avalerait
 * le séparateur du message neuf — deux violations de D-L2.
 */
describe('markCaughtUp — client chaud (un message arrive après la lecture, #7351)', () => {
  const at = (iso: string) => new Date(iso);
  const MESSAGES: readonly Message[] = ['m1', 'm2'].map((id, i) =>
    message({
      id,
      conversationId: 'c-chaud',
      senderId: 'u-autrui',
      content: `Message ${id}`,
      originalLanguage: 'fr',
      translations: [],
      createdAt: at(`2026-09-21T09:0${i + 1}:00.000Z`),
    }),
  );
  const LATER = message({
    id: 'm3',
    conversationId: 'c-chaud',
    senderId: 'u-autrui',
    content: 'Arrivé après la lecture',
    originalLanguage: 'fr',
    translations: [],
    createdAt: at('2026-09-21T09:10:00.000Z'),
  });

  test('le séparateur se rouvre sur le message NEUF, jamais sur ce qui a été lu', async () => {
    const detail = conversation({
      id: 'c-chaud',
      unreadCount: 1,
      lastReadMessageId: 'm1',
      lastReadMessageCreatedAt: at('2026-09-21T09:01:00.000Z'),
    });
    const queryClient = seededClient([detail]);
    queryClient.setQueryData(conversationQueryKey('c-chaud'), detail);
    queryClient.setQueryData<MessagesInfiniteData>(messagesQueryKey('c-chaud'), {
      pages: [{ messages: MESSAGES, hasOlder: false, nextCursor: null }],
      pageParams: [undefined],
    });
    const transport = createHttpTransport({
      base: '',
      fetchImpl: fakeFetch({ status: 200, body: { success: true, data: { type: 'read', markedCount: 1, unreadCount: 0 } } }),
    });

    await markCaughtUp({
      conversationId: 'c-chaud',
      caughtUpToMessageId: 'm2',
      deps: { source: 'gateway', transport, store: freshStore(), queryClient },
    });
    upsertThreadMessage(queryClient, 'c-chaud', LATER);

    const reopened = queryClient.getQueryData<Conversation>(conversationQueryKey('c-chaud'));
    const listed = findCachedConversation(queryClient, 'c-chaud');
    const thread = [...MESSAGES, LATER];

    expect(unreadBoundaryOf({ conversation: reopened!, messages: thread, viewerId: VIEWER_ID })).toEqual({
      firstUnreadId: 'm3',
      unreadCount: 1,
    });
    expect(unreadBoundaryOf({ conversation: listed!, messages: thread, viewerId: VIEWER_ID })).toEqual({
      firstUnreadId: 'm3',
      unreadCount: 1,
    });
  });

  test('message rattrapé absent du cache ⇒ la frontière chronologique suit l’heure de lecture, jamais l’ancien curseur', async () => {
    const detail = conversation({
      id: 'c-chaud',
      unreadCount: 2,
      lastReadMessageId: 'm0',
      lastReadMessageCreatedAt: at('2026-09-21T08:00:00.000Z'),
    });
    const queryClient = seededClient([detail]);
    queryClient.setQueryData(conversationQueryKey('c-chaud'), detail);
    const transport = createHttpTransport({
      base: '',
      fetchImpl: fakeFetch({ status: 200, body: { success: true, data: { type: 'read', markedCount: 2, unreadCount: 0 } } }),
    });

    await markCaughtUp({
      conversationId: 'c-chaud',
      caughtUpToMessageId: 'm2',
      deps: { source: 'gateway', transport, store: freshStore(), queryClient },
    });

    const reopened = queryClient.getQueryData<Conversation>(conversationQueryKey('c-chaud'));
    expect(reopened?.lastReadMessageId).toBe('m2');
    expect(unreadBoundaryOf({ conversation: reopened!, messages: MESSAGES, viewerId: VIEWER_ID })).toBeNull();
  });
});
