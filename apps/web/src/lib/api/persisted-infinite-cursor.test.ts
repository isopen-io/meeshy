import { describe, expect, test } from 'bun:test';

import { conversationsInfiniteOptions } from './conversations';
import { createHttpTransport } from './http';
import { messagesInfiniteOptions } from './messages';
import { createAppQueryClient, type StorageLike } from './query-client';

/**
 * **UN RECHARGEMENT NE FIGE PLUS LA LISTE NI LE FIL** (#18819).
 *
 * Mesuré en production le 2026-11-16 : `?before=null` refusé en 400 sur la
 * liste et sur le fil. Le cache persisté passait par `JSON.stringify`, qui
 * rend `pageParams: [undefined]` en `[null]` ; au rafraîchissement, TanStack
 * rejoue `pageParams[0]` et le `null` finissait en `before=null` dans l'URL.
 * La liste et le fil restaient sur le cache réhydraté, jamais rafraîchis.
 */

const BUSTER = '0.0.0-test:u1';

function fakeStorage(): StorageLike & { readonly raw: Map<string, string> } {
  const raw = new Map<string, string>();
  return {
    raw,
    getItem: (key) => raw.get(key) ?? null,
    setItem: (key, value) => {
      raw.set(key, value);
    },
    removeItem: (key) => {
      raw.delete(key);
    },
  };
}

function recordingTransport(body: unknown) {
  const urls: string[] = [];
  const fetchImpl = (async (input: RequestInfo | URL) => {
    urls.push(String(input));
    return new Response(JSON.stringify(body), { status: 200 });
  }) as typeof fetch;
  return { urls, transport: createHttpTransport({ base: '', fetchImpl }) };
}

const CONVERSATIONS_BODY = { success: true, data: [{ id: 'c-1' }], cursorPagination: { limit: 30, hasMore: false, nextCursor: null } };
const MESSAGES_BODY = { success: true, data: [{ id: 'm-1' }], cursorPagination: { limit: 50, hasMore: false, nextCursor: null } };

/** Un cache écrit AVANT le correctif : la seule entrée persistée, réécrite
 * avec le `null` que `JSON.stringify` laissait à la place de chaque `pageParam`
 * absent. */
function rewriteAsLegacy(storage: ReturnType<typeof fakeStorage>): void {
  const [key, raw] = [...storage.raw.entries()][0] ?? [];
  if (key === undefined || raw === undefined) throw new Error('aucun cache persisté');
  const legacy = JSON.parse(raw, (field: string, value: unknown) =>
    field === 'pageParams' && Array.isArray(value) ? value.map(() => null) : value,
  );
  storage.setItem(key, JSON.stringify(legacy));
}

describe('persistance des requêtes infinies — le premier curseur reste ABSENT', () => {
  test('liste : persister, recharger, rafraîchir ⇒ l’URL ne porte pas `before`', async () => {
    const storage = fakeStorage();
    const first = recordingTransport(CONVERSATIONS_BODY);
    const before = createAppQueryClient({ storage, buster: BUSTER });
    await before.fetchInfiniteQuery(conversationsInfiniteOptions({ source: 'gateway', transport: first.transport }));
    before.persist();

    const reloaded = recordingTransport(CONVERSATIONS_BODY);
    const after = createAppQueryClient({ storage, buster: BUSTER });
    const options = conversationsInfiniteOptions({ source: 'gateway', transport: reloaded.transport });
    expect(after.getQueryData<{ readonly pageParams: readonly unknown[] }>(options.queryKey)?.pageParams).toEqual([undefined]);

    await after.fetchInfiniteQuery({ ...options, staleTime: 0 });
    expect(reloaded.urls).toEqual(['/api/v1/conversations?limit=30']);
  });

  test('fil : persister, recharger, rafraîchir ⇒ l’URL ne porte pas `before`', async () => {
    const storage = fakeStorage();
    const first = recordingTransport(MESSAGES_BODY);
    const before = createAppQueryClient({ storage, buster: BUSTER });
    await before.fetchInfiniteQuery(messagesInfiniteOptions({ source: 'gateway', transport: first.transport }, 'c-1'));
    before.persist();

    const reloaded = recordingTransport(MESSAGES_BODY);
    const after = createAppQueryClient({ storage, buster: BUSTER });
    const options = messagesInfiniteOptions({ source: 'gateway', transport: reloaded.transport }, 'c-1');
    await after.fetchInfiniteQuery({ ...options, staleTime: 0 });
    expect(reloaded.urls).toEqual(['/api/v1/conversations/c-1/messages?limit=50']);
  });

  test('un `initialPageParam: null` reste `null` : la persistance ne confond pas les deux absences', async () => {
    const storage = fakeStorage();
    const before = createAppQueryClient({ storage, buster: BUSTER });
    await before.fetchInfiniteQuery({
      queryKey: ['calls', 'history'],
      queryFn: async () => ({ items: [] }),
      initialPageParam: null as string | null,
      getNextPageParam: () => null,
    });
    before.persist();

    const after = createAppQueryClient({ storage, buster: BUSTER });
    expect(after.getQueryData<{ readonly pageParams: readonly unknown[] }>(['calls', 'history'])?.pageParams).toEqual([null]);
  });
});

describe('cache écrit AVANT le correctif — `pageParams: [null]` ne part plus en `before=null`', () => {
  test('liste', async () => {
    const storage = fakeStorage();
    const first = recordingTransport(CONVERSATIONS_BODY);
    const before = createAppQueryClient({ storage, buster: BUSTER });
    await before.fetchInfiniteQuery(conversationsInfiniteOptions({ source: 'gateway', transport: first.transport }));
    before.persist();
    rewriteAsLegacy(storage);

    const reloaded = recordingTransport(CONVERSATIONS_BODY);
    const after = createAppQueryClient({ storage, buster: BUSTER });
    const options = conversationsInfiniteOptions({ source: 'gateway', transport: reloaded.transport });
    expect(after.getQueryData<{ readonly pageParams: readonly unknown[] }>(options.queryKey)?.pageParams).toEqual([null]);
    await after.fetchInfiniteQuery({ ...options, staleTime: 0 });
    expect(reloaded.urls).toEqual(['/api/v1/conversations?limit=30']);
  });

  test('fil', async () => {
    const storage = fakeStorage();
    const first = recordingTransport(MESSAGES_BODY);
    const before = createAppQueryClient({ storage, buster: BUSTER });
    await before.fetchInfiniteQuery(messagesInfiniteOptions({ source: 'gateway', transport: first.transport }, 'c-1'));
    before.persist();
    rewriteAsLegacy(storage);

    const reloaded = recordingTransport(MESSAGES_BODY);
    const after = createAppQueryClient({ storage, buster: BUSTER });
    const options = messagesInfiniteOptions({ source: 'gateway', transport: reloaded.transport }, 'c-1');
    await after.fetchInfiniteQuery({ ...options, staleTime: 0 });
    expect(reloaded.urls).toEqual(['/api/v1/conversations/c-1/messages?limit=50']);
  });
});
