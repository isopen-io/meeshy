import { QueryClient } from '@tanstack/react-query';
import { describe, expect, test } from 'bun:test';

import {
  CONVERSATIONS_QUERY_KEY,
  conversationQuery,
  conversationsInfiniteOptions,
  conversationsQuery,
  createDirectConversation,
  findCachedConversation,
  loadConversation,
  loadConversationsPage,
  patchConversation,
  refreshConversations,
} from './conversations';
import type { ConversationsInfiniteData } from './conversations-pages';
import { createHttpTransport } from './http';
import { CONVERSATIONS } from './fixtures';
import { PAGINATION_CONVERSATIONS } from './fixtures-pagination';

/** Motif `http.test.ts` — un `fetchImpl` qui recopie la forme d'une route
 * réelle et enregistre les appels reçus. */
function fakeFetch(response: { readonly status: number; readonly body?: unknown }) {
  const calls: { readonly url: string; readonly init: RequestInit }[] = [];
  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init: init ?? {} });
    return new Response(response.body === undefined ? null : JSON.stringify(response.body), {
      status: response.status,
    });
  }) as typeof fetch;
  return { impl, calls };
}

/** Un transport dont la RÉPONSE dépend du `before` demandé — motif nécessaire
 * pour exercer `conversationsInfiniteOptions` sur deux pages successives. */
function pagedFetch(pages: Record<string, { readonly status: number; readonly body: unknown }>) {
  const calls: string[] = [];
  const impl = (async (input: RequestInfo | URL) => {
    const url = new URL(String(input), 'http://x');
    const before = url.searchParams.get('before') ?? '';
    calls.push(before);
    const page = pages[before];
    if (page === undefined) throw new Error(`page inattendue: ${before}`);
    return new Response(JSON.stringify(page.body), { status: page.status });
  }) as typeof fetch;
  return { impl, calls };
}

function headerOf(init: RequestInit, name: string): string | null {
  const headers = init.headers;
  if (headers instanceof Headers) return headers.get(name);
  if (headers && typeof headers === 'object') {
    const entry = Object.entries(headers as Record<string, string>).find(
      ([k]) => k.toLowerCase() === name.toLowerCase(),
    );
    return entry?.[1] ?? null;
  }
  return null;
}

const PAGE_BODY = (ids: readonly string[], overrides: Record<string, unknown> = {}) => ({
  success: true,
  data: ids.map((id) => ({ id, title: id })),
  pagination: { limit: 30, offset: 0, total: ids.length, hasMore: false },
  cursorPagination: { limit: 30, hasMore: false, nextCursor: null },
  ...overrides,
});

describe('loadConversationsPage — source fixtures', () => {
  test('rend une page mimant pageOfConversations sur le corpus 45', async () => {
    const { impl, calls } = fakeFetch({ status: 200, body: PAGE_BODY(['x']) });
    const transport = createHttpTransport({ base: '', fetchImpl: impl });
    const result = await loadConversationsPage({ source: 'fixtures', transport });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.conversations).toHaveLength(30);
      expect(result.data.cursorPagination.hasMore).toBe(true);
    }
    expect(calls.length).toBe(0);
  });

  test('before transmis à pageOfConversations', async () => {
    const transport = createHttpTransport({ base: '', fetchImpl: fakeFetch({ status: 200 }).impl });
    const page1 = await loadConversationsPage({ source: 'fixtures', transport });
    const cursor = page1.ok ? page1.data.cursorPagination.nextCursor! : '';
    const page2 = await loadConversationsPage({ source: 'fixtures', transport, before: cursor });
    expect(page2.ok).toBe(true);
    if (page2.ok) expect(page2.data.conversations).toHaveLength(15);
  });
});

describe('loadConversationsPage — source gateway', () => {
  test('URL sans `before` porte limit=30, Authorization posé', async () => {
    const { impl, calls } = fakeFetch({ status: 200, body: PAGE_BODY(['c-a', 'c-b']) });
    const transport = createHttpTransport({
      base: '',
      fetchImpl: impl,
      credential: () => ({ kind: 'registered', token: 'jwt-1' }),
    });
    const result = await loadConversationsPage({ source: 'gateway', transport });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.conversations).toEqual(PAGE_BODY(['c-a', 'c-b']).data);
    expect(calls[0]?.url).toBe('/api/v1/conversations?limit=30');
    expect(headerOf(calls[0]!.init, 'Authorization')).toBe('Bearer jwt-1');
  });

  test('URL avec `before` porte limit=30&before=c-2', async () => {
    const { impl, calls } = fakeFetch({ status: 200, body: PAGE_BODY([]) });
    const transport = createHttpTransport({ base: '', fetchImpl: impl });
    await loadConversationsPage({ source: 'gateway', transport, before: 'c-2' });
    expect(calls[0]?.url).toBe('/api/v1/conversations?limit=30&before=c-2');
  });

  test('précédence : cursorPagination.hasMore GAGNE sur pagination.hasMore (page 1 de 30, exactement pleine)', async () => {
    const body = PAGE_BODY(
      Array.from({ length: 30 }, (_, i) => `c-${i}`),
      { pagination: { limit: 30, offset: 0, total: 30, hasMore: false }, cursorPagination: { limit: 30, hasMore: true, nextCursor: 'c-29' } },
    );
    const transport = createHttpTransport({ base: '', fetchImpl: fakeFetch({ status: 200, body }).impl });
    const result = await loadConversationsPage({ source: 'gateway', transport });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.cursorPagination.hasMore).toBe(true);
  });

  test('précédence : sans cursorPagination, pagination.hasMore gagne', async () => {
    const body = { success: true, data: [{ id: 'a' }], pagination: { limit: 30, offset: 0, total: 1, hasMore: true } };
    const transport = createHttpTransport({ base: '', fetchImpl: fakeFetch({ status: 200, body }).impl });
    const result = await loadConversationsPage({ source: 'gateway', transport });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.cursorPagination.hasMore).toBe(true);
  });

  test('précédence : sans aucun bloc de pagination, data.length === PAGE_SIZE gagne', async () => {
    const body = { success: true, data: Array.from({ length: 30 }, (_, i) => ({ id: `c-${i}` })) };
    const transport = createHttpTransport({ base: '', fetchImpl: fakeFetch({ status: 200, body }).impl });
    const result = await loadConversationsPage({ source: 'gateway', transport });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.cursorPagination.hasMore).toBe(true);
  });

  test('401 ⇒ ok:false, status:401, code:UNAUTHORIZED, onUnauthorized appelé', async () => {
    const { impl } = fakeFetch({
      status: 401,
      body: { success: false, error: 'Authentication required to access conversations', code: 'UNAUTHORIZED' },
    });
    let unauthorizedCalls = 0;
    const transport = createHttpTransport({
      base: '',
      fetchImpl: impl,
      credential: () => ({ kind: 'registered', token: 'jwt-1' }),
      onUnauthorized: () => {
        unauthorizedCalls += 1;
      },
    });
    const result = await loadConversationsPage({ source: 'gateway', transport });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(401);
      expect(result.code).toBe('UNAUTHORIZED');
    }
    expect(unauthorizedCalls).toBe(1);
  });

  test('échec ⇒ ApiFailure inchangé (pas de forme de page)', async () => {
    const transport = createHttpTransport({ base: '', fetchImpl: fakeFetch({ status: 500, body: { success: false, error: 'boom' } }).impl });
    const result = await loadConversationsPage({ source: 'gateway', transport });
    expect(result.ok).toBe(false);
  });
});

describe('loadConversation(id) — gateway', () => {
  test('URL /api/v1/conversations/<id>', async () => {
    const { impl, calls } = fakeFetch({ status: 200, body: { success: true, data: { id: 'c-a' } } });
    const transport = createHttpTransport({ base: '', fetchImpl: impl });
    await loadConversation({ source: 'gateway', transport, id: 'c-a' });
    expect(calls[0]?.url).toBe('/api/v1/conversations/c-a');
  });

  test('403 ⇒ ok:false avec status et code CONVERSATION_ACCESS_DENIED', async () => {
    const { impl } = fakeFetch({
      status: 403,
      body: { success: false, error: 'Forbidden', code: 'CONVERSATION_ACCESS_DENIED' },
    });
    const transport = createHttpTransport({ base: '', fetchImpl: impl });
    const result = await loadConversation({ source: 'gateway', transport, id: 'c-a' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(403);
      expect(result.code).toBe('CONVERSATION_ACCESS_DENIED');
    }
  });

  test('404 ⇒ ok:false avec status, SANS code (code reste undefined)', async () => {
    const { impl } = fakeFetch({ status: 404, body: { success: false, error: 'Conversation not found' } });
    const transport = createHttpTransport({ base: '', fetchImpl: impl });
    const result = await loadConversation({ source: 'gateway', transport, id: 'c-a' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(404);
      expect(result.code).toBeUndefined();
    }
  });
});

describe('conversationsInfiniteOptions par QueryClient.fetchInfiniteQuery', () => {
  test('une page ⇒ 1 requête, 30 conversations ; deux pages ⇒ 45, 1 requête par page', async () => {
    const { impl, calls } = pagedFetch({
      '': { status: 200, body: PAGE_BODY(Array.from({ length: 30 }, (_, i) => `c-${i}`), { cursorPagination: { limit: 30, hasMore: true, nextCursor: 'c-29' } }) },
      'c-29': { status: 200, body: PAGE_BODY(Array.from({ length: 15 }, (_, i) => `c-${30 + i}`)) },
    });
    const transport = createHttpTransport({ base: '', fetchImpl: impl });
    const options = conversationsInfiniteOptions({ source: 'gateway', transport });
    const queryClient = new QueryClient();

    const onePage = await queryClient.fetchInfiniteQuery({ ...options, pages: 1 });
    expect(onePage.pages).toHaveLength(1);
    expect(onePage.pages[0]?.conversations).toHaveLength(30);
    expect(onePage.pageParams).toEqual([undefined]);

    queryClient.removeQueries({ queryKey: options.queryKey });
    calls.length = 0;
    const twoPages = await queryClient.fetchInfiniteQuery({ ...options, pages: 2 });
    const flat = twoPages.pages.flatMap((p) => p.conversations);
    expect(flat).toHaveLength(45);
    expect(calls).toEqual(['', 'c-29']);

    const nextParam = options.getNextPageParam(twoPages.pages[1]!, twoPages.pages, twoPages.pageParams[1] as string | undefined);
    expect(nextParam).toBeUndefined();
  });

  test('initialPageParam est undefined', () => {
    const options = conversationsInfiniteOptions({ source: 'fixtures', transport: createHttpTransport({ base: '' }) });
    expect(options.initialPageParam).toBeUndefined();
  });
});

describe('conversationsQuery().select', () => {
  test('sur des pages brutes, rend une liste APLATIE et DÉCODÉE', () => {
    const { queryKey, select } = conversationsQuery({ source: 'gateway', transport: createHttpTransport({ base: '' }) });
    expect(queryKey).toEqual(CONVERSATIONS_QUERY_KEY);
    const data: ConversationsInfiniteData = {
      pages: [
        {
          conversations: [{ ...CONVERSATIONS[0]!, createdAt: '2026-09-08T09:00:00.000Z', updatedAt: '2026-09-08T09:00:00.000Z' } as never],
          pagination: { limit: 30, offset: 0, total: 1, hasMore: false },
          cursorPagination: { limit: 30, hasMore: false, nextCursor: null },
        },
      ],
      pageParams: [undefined],
    };
    const decoded = select(data);
    expect(decoded[0]?.createdAt).toBeInstanceOf(Date);
  });

  test('la fonction select est une référence de MODULE stable entre deux fabriques', () => {
    const deps = { source: 'gateway' as const, transport: createHttpTransport({ base: '' }) };
    const a = conversationsQuery(deps);
    const b = conversationsQuery(deps);
    expect(a.select).toBe(b.select);
  });
});

function infiniteCacheOf(pages: ConversationsInfiniteData['pages']): ConversationsInfiniteData {
  return { pages, pageParams: pages.map((_, i) => (i === 0 ? undefined : `param-${i}`)) };
}

describe('conversationQuery — initialData depuis la liste en cache', () => {
  test('pose initialData quand la conversation est déjà dans une page du cache', () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(
      CONVERSATIONS_QUERY_KEY,
      infiniteCacheOf([
        { conversations: CONVERSATIONS.slice(0, 5), pagination: { limit: 30, offset: 0, total: 45, hasMore: true }, cursorPagination: { limit: 30, hasMore: true, nextCursor: 'x' } },
      ]),
    );
    const target = CONVERSATIONS[0]!;
    const options = conversationQuery({ source: 'fixtures', transport: createHttpTransport({ base: '' }) }, target.id, {
      queryClient,
    });
    expect(options.initialData).toBe(target);
  });

  test('sans queryClient, aucune initialData — la fabrique reste appelable', () => {
    const options = conversationQuery({ source: 'fixtures', transport: createHttpTransport({ base: '' }) }, 'c-a');
    expect('initialData' in options).toBe(false);
  });
});

describe('findCachedConversation', () => {
  test('trouve une rangée de la page 2', () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(
      CONVERSATIONS_QUERY_KEY,
      infiniteCacheOf([
        { conversations: [CONVERSATIONS[0]!], pagination: { limit: 30, offset: 0, total: 2, hasMore: true }, cursorPagination: { limit: 30, hasMore: true, nextCursor: 'x' } },
        { conversations: [CONVERSATIONS[1]!], pagination: { limit: 30, offset: 0, total: 0, hasMore: false }, cursorPagination: { limit: 30, hasMore: false, nextCursor: null } },
      ]),
    );
    expect(findCachedConversation(queryClient, CONVERSATIONS[1]!.id)).toBe(CONVERSATIONS[1]);
  });

  test('undefined si absente ou cache vide', () => {
    const queryClient = new QueryClient();
    expect(findCachedConversation(queryClient, 'inconnue')).toBeUndefined();
    queryClient.setQueryData(CONVERSATIONS_QUERY_KEY, infiniteCacheOf([{ conversations: [], pagination: { limit: 30, offset: 0, total: 0, hasMore: false }, cursorPagination: { limit: 30, hasMore: false, nextCursor: null } }]));
    expect(findCachedConversation(queryClient, 'inconnue')).toBeUndefined();
  });

  test('tolère un cache d’ANCIENNE forme (tableau) en rendant undefined — ne lève jamais', () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(CONVERSATIONS_QUERY_KEY, [CONVERSATIONS[0]]);
    expect(() => findCachedConversation(queryClient, CONVERSATIONS[0]!.id)).not.toThrow();
    expect(findCachedConversation(queryClient, CONVERSATIONS[0]!.id)).toBeUndefined();
  });
});

/**
 * `patchConversation` (#5813, étape 0 ; paginé #6195) — le témoin d'origine
 * (`conversation-actions.test.ts`) exerce déjà cette fonction au travers de
 * `performRowAction` ; celui-ci l'exerce directement, sur des PAGES.
 */
describe('patchConversation', () => {
  test('patch une conversation en page 2 : la page 1 et les autres rangées de la page 2 sont toBe-identiques', () => {
    const a = { ...CONVERSATIONS[0]!, id: 'c-a' };
    const b = { ...CONVERSATIONS[0]!, id: 'c-b', unreadCount: 2 };
    const c = { ...CONVERSATIONS[0]!, id: 'c-c', unreadCount: 5 };
    const page1 = { conversations: [a], pagination: { limit: 30, offset: 0, total: 3, hasMore: true }, cursorPagination: { limit: 30, hasMore: true, nextCursor: 'a' } };
    const page2 = { conversations: [b, c], pagination: { limit: 30, offset: 0, total: 0, hasMore: false }, cursorPagination: { limit: 30, hasMore: false, nextCursor: null } };
    const queryClient = new QueryClient();
    queryClient.setQueryData(CONVERSATIONS_QUERY_KEY, infiniteCacheOf([page1, page2]));

    patchConversation(queryClient, 'c-b', (conv) => ({ ...conv, unreadCount: 0 }));

    const data = queryClient.getQueryData<ConversationsInfiniteData>(CONVERSATIONS_QUERY_KEY)!;
    expect(data.pages[0]).toBe(page1);
    expect(data.pages[1]?.conversations[1]).toBe(c);
    expect(data.pages[1]?.conversations[0]?.unreadCount).toBe(0);
  });

  test('id inconnu ⇒ data toBe-identique', () => {
    const page = { conversations: [CONVERSATIONS[0]!], pagination: { limit: 30, offset: 0, total: 1, hasMore: false }, cursorPagination: { limit: 30, hasMore: false, nextCursor: null } };
    const queryClient = new QueryClient();
    const initial = infiniteCacheOf([page]);
    queryClient.setQueryData(CONVERSATIONS_QUERY_KEY, initial);
    patchConversation(queryClient, 'inconnue', (c) => c);
    expect(queryClient.getQueryData(CONVERSATIONS_QUERY_KEY)).toBe(initial);
  });

  test('cache absent ⇒ reste undefined', () => {
    const queryClient = new QueryClient();
    patchConversation(queryClient, 'c-a', (c) => c);
    expect(queryClient.getQueryData(CONVERSATIONS_QUERY_KEY)).toBeUndefined();
  });
});

describe('refreshConversations', () => {
  test('après 2 pages chargées : UNE requête, pages.length === 1, pageParams reset', async () => {
    const { impl, calls } = pagedFetch({
      '': { status: 200, body: PAGE_BODY(['c-0'], { cursorPagination: { limit: 30, hasMore: true, nextCursor: 'c-0' } }) },
      'c-0': { status: 200, body: PAGE_BODY(['c-1']) },
    });
    const transport = createHttpTransport({ base: '', fetchImpl: impl });
    const deps = { source: 'gateway' as const, transport };
    const queryClient = new QueryClient();
    await queryClient.fetchInfiniteQuery({ ...conversationsInfiniteOptions(deps), pages: 2 });
    expect(calls).toEqual(['', 'c-0']);

    await refreshConversations(queryClient, deps);
    const data = queryClient.getQueryData<ConversationsInfiniteData>(CONVERSATIONS_QUERY_KEY)!;
    expect(data.pages).toHaveLength(1);
    expect(data.pageParams).toEqual([undefined]);
    expect(calls).toEqual(['', 'c-0', '']);
  });

  test('échec ⇒ les pages RESTENT, la promesse rejette', async () => {
    let call = 0;
    const impl = (async () => {
      call += 1;
      if (call === 1) return new Response(JSON.stringify(PAGE_BODY(['c-0'])), { status: 200 });
      return new Response(JSON.stringify({ success: false, error: 'boom' }), { status: 500 });
    }) as typeof fetch;
    const transport = createHttpTransport({ base: '', fetchImpl: impl });
    const deps = { source: 'gateway' as const, transport };
    const queryClient = new QueryClient();
    await queryClient.fetchInfiniteQuery({ ...conversationsInfiniteOptions(deps) });

    let rejected = false;
    try {
      await refreshConversations(queryClient, deps);
    } catch {
      rejected = true;
    }
    expect(rejected).toBe(true);
    const data = queryClient.getQueryData<ConversationsInfiniteData>(CONVERSATIONS_QUERY_KEY)!;
    expect(data.pages).toHaveLength(1);
    expect(data.pages[0]?.conversations[0]?.id).toBe('c-0');
  });

  test('appelée deux fois de suite ⇒ deux requêtes', async () => {
    let calls = 0;
    const impl = (async () => {
      calls += 1;
      return new Response(JSON.stringify(PAGE_BODY(['c-0'])), { status: 200 });
    }) as typeof fetch;
    const transport = createHttpTransport({ base: '', fetchImpl: impl });
    const deps = { source: 'gateway' as const, transport };
    const queryClient = new QueryClient();
    await refreshConversations(queryClient, deps);
    await refreshConversations(queryClient, deps);
    expect(calls).toBe(2);
  });
});

describe('createDirectConversation', () => {
  test('en gateway, POST /api/v1/conversations avec type direct + participantIds', async () => {
    const { impl, calls } = fakeFetch({
      status: 200,
      body: { success: true, data: { id: 'c-new', title: null } },
    });
    const transport = createHttpTransport({ base: '', fetchImpl: impl, credential: () => ({ kind: 'registered', token: 'jwt-1' }) });

    const result = await createDirectConversation({ source: 'gateway', transport }, 'u-amina');

    expect(result.ok).toBe(true);
    expect(calls[0]?.url).toBe('/api/v1/conversations');
    expect(calls[0]?.init.method).toBe('POST');
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({ type: 'direct', participantIds: ['u-amina'] });
  });

  test('en fixtures, rend le direct existant avec ce participant', async () => {
    const target = CONVERSATIONS.find((c) => c.type === 'direct' && !PAGINATION_CONVERSATIONS.includes(c));
    if (target === undefined) return; // pas de fixture directe dans ce corpus — rien à prouver ici
    const participant = target.participants[0]?.userId;
    if (participant === undefined) return;
    const { impl } = fakeFetch({ status: 200, body: PAGE_BODY([]) });
    const transport = createHttpTransport({ base: '', fetchImpl: impl });
    const result = await createDirectConversation({ source: 'fixtures', transport }, participant);
    expect(result.ok).toBe(true);
  });
});
