import { QueryClient } from '@tanstack/react-query';
import { describe, expect, test } from 'bun:test';

import {
  CONVERSATIONS_QUERY_KEY,
  conversationQuery,
  conversationsQuery,
  createDirectConversation,
  loadConversation,
  loadConversations,
  patchConversation,
} from './conversations';
import { decodeConversations as decodeConversationsRef } from './decode';
import { createHttpTransport } from './http';
import { CONVERSATIONS } from './fixtures';

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

const CONVERSATIONS_LIST_BODY = {
  success: true,
  data: [
    { id: 'c-a', title: 'A' },
    { id: 'c-b', title: 'B' },
  ],
  pagination: { limit: 30, offset: 0, total: 2, hasMore: false },
};

describe('loadConversations — source fixtures', () => {
  test('rend ok:true, data === CONVERSATIONS (même référence), fetchImpl jamais appelé', async () => {
    const { impl, calls } = fakeFetch({ status: 200, body: CONVERSATIONS_LIST_BODY });
    const transport = createHttpTransport({ base: '', fetchImpl: impl });
    const result = await loadConversations({ source: 'fixtures', transport });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toBe(CONVERSATIONS);
    expect(calls.length).toBe(0);
  });
});

describe('loadConversations — source gateway', () => {
  test('URL sans paramètre, Authorization posé, data + pagination propagées', async () => {
    const { impl, calls } = fakeFetch({ status: 200, body: CONVERSATIONS_LIST_BODY });
    const transport = createHttpTransport({
      base: '',
      fetchImpl: impl,
      credential: () => ({ kind: 'registered', token: 'jwt-1' }),
    });
    const result = await loadConversations({ source: 'gateway', transport });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual(CONVERSATIONS_LIST_BODY.data);
      expect(result.pagination).toEqual(CONVERSATIONS_LIST_BODY.pagination);
    }
    expect(calls[0]?.url).toBe('/api/v1/conversations');
    expect(headerOf(calls[0]!.init, 'Authorization')).toBe('Bearer jwt-1');
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
    const result = await loadConversations({ source: 'gateway', transport });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(401);
      expect(result.code).toBe('UNAUTHORIZED');
    }
    expect(unauthorizedCalls).toBe(1);
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

describe('conversationsQuery().select', () => {
  test('sur un tableau du fil (chaînes ISO), rend des Date', () => {
    const { queryKey, select } = conversationsQuery({ source: 'gateway', transport: createHttpTransport({ base: '' }) });
    expect(queryKey).toEqual(CONVERSATIONS_QUERY_KEY);
    const wire = [
      { ...CONVERSATIONS[0]!, createdAt: '2026-09-08T09:00:00.000Z', updatedAt: '2026-09-08T09:00:00.000Z' },
    ] as unknown as Parameters<typeof select>[0];
    const decoded = select(wire);
    expect(decoded[0]?.createdAt).toBeInstanceOf(Date);
  });

  test('la fonction select est une référence de MODULE stable entre deux fabriques — ce que TanStack mémorise', () => {
    const deps = { source: 'gateway' as const, transport: createHttpTransport({ base: '' }) };
    const a = conversationsQuery(deps);
    const b = conversationsQuery(deps);
    expect(a.select).toBe(b.select);
    expect(a.select).toBe(decodeConversationsRef);
  });
});

describe('conversationQuery — initialData depuis la liste en cache', () => {
  test('pose initialData quand la conversation est déjà dans la liste', () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(CONVERSATIONS_QUERY_KEY, CONVERSATIONS);
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

/**
 * `patchConversation` (#5813, étape 0 — extraction de
 * `conversation-actions.ts:50-58`, aucun changement de règle) — le témoin
 * d'origine (`conversation-actions.test.ts`) exerce déjà cette fonction au
 * travers de `performRowAction` ; celui-ci l'exerce directement.
 */
describe('patchConversation', () => {
  test('patch UNE conversation ⇒ les autres sont toBe-identiques', () => {
    const a = { ...CONVERSATIONS[0]!, id: 'c-a', unreadCount: 1 };
    const b = { ...CONVERSATIONS[0]!, id: 'c-b', unreadCount: 2 };
    const queryClient = new QueryClient();
    queryClient.setQueryData(CONVERSATIONS_QUERY_KEY, [a, b]);

    patchConversation(queryClient, 'c-a', (c) => ({ ...c, unreadCount: 0 }));

    const list = queryClient.getQueryData<readonly (typeof a)[]>(CONVERSATIONS_QUERY_KEY);
    expect(list?.[0]?.unreadCount).toBe(0);
    expect(list?.[1]).toBe(b);
  });

  test('cache absent ⇒ reste undefined', () => {
    const queryClient = new QueryClient();
    patchConversation(queryClient, 'c-a', (c) => c);
    expect(queryClient.getQueryData(CONVERSATIONS_QUERY_KEY)).toBeUndefined();
  });
});

/**
 * `createDirectConversation` (#5652, bloc D) — `POST /api/v1/conversations`
 * (§ 3.5 de la spécification). Idempotent côté serveur : ce port ne fait
 * qu'un appel réseau, la distinction « créé » vs « déjà existant » est
 * invisible depuis ce client.
 */
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
    const target = CONVERSATIONS.find((c) => c.type === 'direct');
    if (target === undefined) return; // pas de fixture directe dans ce corpus — rien à prouver ici
    const participant = target.participants[0]?.userId;
    if (participant === undefined) return;
    const { impl } = fakeFetch({ status: 200, body: CONVERSATIONS_LIST_BODY });
    const transport = createHttpTransport({ base: '', fetchImpl: impl });
    const result = await createDirectConversation({ source: 'fixtures', transport }, participant);
    expect(result.ok).toBe(true);
  });
});
