import { describe, expect, test } from 'bun:test';

import { loadMessages, messagesQuery } from './messages';
import { createHttpTransport } from './http';
import { hasOlderMessagesOf, messagesOf } from './fixtures';

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

describe('loadMessages — fixtures', () => {
  test('rend { messages, hasOlder } depuis les fixtures', async () => {
    const transport = createHttpTransport({ base: '' });
    const result = await loadMessages({ source: 'fixtures', transport, conversationId: 'c-rattrapage' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.messages).toEqual(messagesOf('c-rattrapage'));
      expect(result.data.hasOlder).toBe(true);
    }
  });

  test('c-deploiement ⇒ hasOlder false', async () => {
    const transport = createHttpTransport({ base: '' });
    const result = await loadMessages({ source: 'fixtures', transport, conversationId: 'c-deploiement' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.hasOlder).toBe(hasOlderMessagesOf('c-deploiement'));
  });

  test('id inconnu ⇒ messages: []', async () => {
    const transport = createHttpTransport({ base: '' });
    const result = await loadMessages({ source: 'fixtures', transport, conversationId: 'c-inexistant' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.messages).toEqual([]);
  });
});

describe('loadMessages — gateway', () => {
  test('data en DESC ⇒ messages ASCENDANT ; hasOlder = cursorPagination.hasMore ; URL ?limit=50', async () => {
    const { impl, calls } = fakeFetch({
      status: 200,
      body: {
        success: true,
        data: [{ id: 'm3' }, { id: 'm2' }, { id: 'm1' }],
        cursorPagination: { limit: 50, hasMore: true, nextCursor: 'm1' },
        meta: { userLanguage: 'fr' },
      },
    });
    const transport = createHttpTransport({ base: '', fetchImpl: impl });
    const result = await loadMessages({ source: 'gateway', transport, conversationId: 'c-a' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.messages.map((m: { readonly id: string }) => m.id)).toEqual(['m1', 'm2', 'm3']);
      expect(result.data.hasOlder).toBe(true);
    }
    expect(calls[0]?.url).toBe('/api/v1/conversations/c-a/messages?limit=50');
  });

  test('401 (sans-session) propagé', async () => {
    const { impl } = fakeFetch({
      status: 401,
      body: { success: false, error: 'Authentication required', code: 'UNAUTHORIZED' },
    });
    const transport = createHttpTransport({ base: '', fetchImpl: impl });
    const result = await loadMessages({ source: 'gateway', transport, conversationId: 'c-a' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(401);
  });

  test('403 (non-membre) propagé', async () => {
    const { impl } = fakeFetch({
      status: 403,
      body: { success: false, error: 'Unauthorized access to this conversation' },
    });
    const transport = createHttpTransport({ base: '', fetchImpl: impl });
    const result = await loadMessages({ source: 'gateway', transport, conversationId: 'c-a' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(403);
  });
});

describe('messagesQuery — la fabrique', () => {
  test('décode messages[].createdAt via select', () => {
    const { queryKey, select } = messagesQuery({ source: 'fixtures', transport: createHttpTransport({ base: '' }) }, 'c-a');
    expect(queryKey).toEqual(['conversations', 'c-a', 'messages']);
    const page = {
      messages: [{ ...messagesOf('c-deploiement')[0]!, createdAt: '2026-09-08T09:00:00.000Z' }],
      hasOlder: false,
    } as unknown as Parameters<typeof select>[0];
    const decoded = select(page);
    expect(decoded.messages[0]?.createdAt).toBeInstanceOf(Date);
    expect(decoded.hasOlder).toBe(false);
  });
});

/**
 * REVUE-CORRECTION (#5650) — L'IDENTITÉ DU RÉSULTAT DE `select` ENTRE DEUX
 * RENDUS. `useBaseQuery` appelle `observer.getOptimisticResult(options)` à
 * CHAQUE rendu (`@tanstack/react-query/build/modern/useBaseQuery.js`), et
 * `QueryObserver#createResult` ne réutilise le résultat mémorisé que si
 * `options.select === this.#selectFn` (`query-core/queryObserver.js:219`).
 *
 * Une `select` écrite EN LIGNE dans la fabrique est donc une fonction NEUVE
 * à chaque rendu : elle re-décode les 50 messages à chaque image, et le
 * partage structurel ne rattrape rien — `replaceEqualDeep` compare les
 * `Date` par IDENTITÉ, et le décodage d'une chaîne ISO en fabrique une
 * nouvelle à chaque passage. `threadData.messages` changeait donc
 * d'identité à chaque rendu, ce qui défait `useMemo([messages])`, `place()`
 * et toute la mémoïsation du fil virtualisé — exactement ce que le
 * doc-comment de `thread.tsx` § `placed` interdit.
 *
 * Le témoin ne tombe QUE sur la source `gateway` (des chaînes ISO sur le
 * fil) : en `fixtures`, `toDate` rend la MÊME instance de `Date` et le
 * partage structurel masque le défaut. C'est la leçon « un corpus qui ne
 * peut pas faire ÉCHOUER un test ne peut pas le VALIDER ».
 */
describe('messagesQuery — identité du résultat entre deux rendus (source gateway)', () => {
  const WIRE = Array.from({ length: 12 }, (_, i) => ({
    id: `m${i}`,
    conversationId: 'c-a',
    senderId: 'u1',
    content: `msg ${i}`,
    originalLanguage: 'fr',
    messageType: 'text',
    translations: [],
    createdAt: new Date(1_757_000_000_000 - i * 60_000).toISOString(),
    updatedAt: new Date(1_757_000_000_000 - i * 60_000).toISOString(),
  }));

  test('deux rendus successifs rendent la MÊME référence de page', async () => {
    const { QueryClient, QueryObserver } = await import('@tanstack/react-query');
    const { impl } = fakeFetch({
      status: 200,
      body: { success: true, data: WIRE, cursorPagination: { limit: 50, hasMore: false } },
    });
    const deps = { source: 'gateway' as const, transport: createHttpTransport({ base: '', fetchImpl: impl }) };
    const client = new QueryClient();
    const render = () => client.defaultQueryOptions(messagesQuery(deps, 'c-a') as never);

    const observer = new QueryObserver(client, render());
    const unsubscribe = observer.subscribe(() => {});
    await observer.refetch();

    const first = observer.getOptimisticResult(render()).data;
    const second = observer.getOptimisticResult(render()).data;
    unsubscribe();

    expect(first).toBeDefined();
    expect(second).toBe(first);
  });
});
