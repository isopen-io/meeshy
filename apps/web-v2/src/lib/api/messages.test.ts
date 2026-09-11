import { afterEach, describe, expect, test } from 'bun:test';

import { loadMessages, messagesQuery, sendMessage } from './messages';
import { createHttpTransport } from './http';
import { hasOlderMessagesOf, messagesOf, resetSentMessagesForTests } from './fixtures';
import { VIEWER_ID } from './fixtures-base';

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

describe('sendMessage — gateway', () => {
  afterEach(() => resetSentMessagesForTests());

  test('POST /api/v1/conversations/:id/messages, corps EXACT, projection de l’accusé', async () => {
    const { impl, calls } = fakeFetch({
      status: 200,
      body: {
        success: true,
        data: {
          id: 'm9',
          clientMessageId: 'cid_abc',
          conversationId: 'c-a',
          senderId: 'u1',
          content: 'bonjour',
          messageType: 'text',
          createdAt: '2026-09-09T10:00:00.000Z',
          deliveredCount: 0,
          readCount: 0,
          translations: {},
          sender: { id: 'p1' },
        },
      },
    });
    const transport = createHttpTransport({ base: '', fetchImpl: impl });
    const result = await sendMessage({
      source: 'gateway',
      transport,
      conversationId: 'c-a',
      body: { content: 'bonjour', originalLanguage: 'fr', clientMessageId: 'cid_abc' },
    });

    expect(calls[0]?.url).toBe('/api/v1/conversations/c-a/messages');
    expect(calls[0]?.init.method).toBe('POST');
    const headers = calls[0]?.init.headers;
    const contentType =
      headers instanceof Headers
        ? headers.get('Content-Type')
        : ((headers as Record<string, string> | undefined)?.['Content-Type'] ?? null);
    expect(contentType).toBe('application/json');
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({
      content: 'bonjour',
      originalLanguage: 'fr',
      clientMessageId: 'cid_abc',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.id).toBe('m9');
      expect(typeof result.data.createdAt).toBe('string');
      expect(Object.keys(result.data).sort()).toEqual(
        ['id', 'clientMessageId', 'conversationId', 'senderId', 'content', 'messageType', 'createdAt', 'deliveredCount', 'readCount'].sort(),
      );
    }
  });

  test('replyToId présent ⇒ la clé est dans le corps', async () => {
    const { impl, calls } = fakeFetch({
      status: 200,
      body: { success: true, data: { id: 'm9', conversationId: 'c-a', createdAt: '2026-09-09T10:00:00.000Z' } },
    });
    const transport = createHttpTransport({ base: '', fetchImpl: impl });
    await sendMessage({
      source: 'gateway',
      transport,
      conversationId: 'c-a',
      body: { content: 'bonjour', originalLanguage: 'fr', clientMessageId: 'cid_abc', replyToId: 'm1' },
    });
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({
      content: 'bonjour',
      originalLanguage: 'fr',
      clientMessageId: 'cid_abc',
      replyToId: 'm1',
    });
  });

  test('400 ⇒ ok:false, status:400', async () => {
    const { impl } = fakeFetch({ status: 400, body: { success: false, error: 'Validation error' } });
    const transport = createHttpTransport({ base: '', fetchImpl: impl });
    const result = await sendMessage({
      source: 'gateway',
      transport,
      conversationId: 'c-a',
      body: { content: 'x', originalLanguage: 'fr', clientMessageId: 'cid_abc' },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(400);
  });

  test('403 USER_BLOCKED ⇒ status:403, code:USER_BLOCKED', async () => {
    const { impl } = fakeFetch({
      status: 403,
      body: { success: false, error: 'blocked', code: 'USER_BLOCKED' },
    });
    const transport = createHttpTransport({ base: '', fetchImpl: impl });
    const result = await sendMessage({
      source: 'gateway',
      transport,
      conversationId: 'c-a',
      body: { content: 'x', originalLanguage: 'fr', clientMessageId: 'cid_abc' },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(403);
      expect(result.code).toBe('USER_BLOCKED');
    }
  });

  test('429 ⇒ status:429', async () => {
    const { impl } = fakeFetch({ status: 429, body: { success: false, error: 'Trop de requêtes' } });
    const transport = createHttpTransport({ base: '', fetchImpl: impl });
    const result = await sendMessage({
      source: 'gateway',
      transport,
      conversationId: 'c-a',
      body: { content: 'x', originalLanguage: 'fr', clientMessageId: 'cid_abc' },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(429);
  });

  test('fetchImpl qui lance ⇒ status:0, code absent', async () => {
    const rejecting = (async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch;
    const transport = createHttpTransport({ base: '', fetchImpl: rejecting });
    const result = await sendMessage({
      source: 'gateway',
      transport,
      conversationId: 'c-a',
      body: { content: 'x', originalLanguage: 'fr', clientMessageId: 'cid_abc' },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(0);
      expect(result.code).toBeUndefined();
    }
  });

  test('délai de garde RÉEL ⇒ status:0, code:TIMEOUT', async () => {
    // Respecte le signal comme le ferait un vrai `fetch` (motif `http.test.ts`).
    const neverResolves = (async (_url: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;
        if (signal?.aborted) {
          reject(signal.reason);
          return;
        }
        signal?.addEventListener('abort', () => reject(signal.reason));
      })) as typeof fetch;
    const transport = createHttpTransport({ base: '', fetchImpl: neverResolves, timeoutMs: 20 });
    const result = await sendMessage({
      source: 'gateway',
      transport,
      conversationId: 'c-a',
      body: { content: 'x', originalLanguage: 'fr', clientMessageId: 'cid_abc' },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(0);
      expect(result.code).toBe('TIMEOUT');
    }
  });
});

describe('sendMessage — fixtures', () => {
  afterEach(() => resetSentMessagesForTests());

  test('fetchImpl jamais appelé ; le message enregistré est reservi par messagesOf', async () => {
    let calls = 0;
    const impl = (async () => {
      calls += 1;
      return new Response(null, { status: 200 });
    }) as typeof fetch;
    const transport = createHttpTransport({ base: '', fetchImpl: impl });

    const result = await sendMessage({
      source: 'fixtures',
      transport,
      conversationId: 'c-deploiement',
      body: { content: 'bonjour', originalLanguage: 'en', clientMessageId: 'cid_xyz' },
    });

    expect(calls).toBe(0);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.senderId).toBe(VIEWER_ID);

    const stored = messagesOf('c-deploiement').find((m) => m.id === result.data.id);
    expect(stored).toBeDefined();
    expect(stored?.content).toBe('bonjour');
    expect(stored?.originalLanguage).toBe('en');
    expect((stored as { readonly clientMessageId?: string } | undefined)?.clientMessageId).toBe('cid_xyz');
    expect(stored?.sender?.userId).toBe(VIEWER_ID);
  });
});
