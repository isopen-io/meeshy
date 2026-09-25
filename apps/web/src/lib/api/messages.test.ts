import { QueryClient } from '@tanstack/react-query';
import { afterEach, describe, expect, test } from 'bun:test';

import {
  cachedThreadConversationIds,
  findCachedThreadMessage,
  loadMessages,
  messagesInfiniteOptions,
  messagesQuery,
  messagesQueryKey,
  patchThreadMessages,
  sendMessage,
  upsertThreadMessage,
} from './messages';
import { flattenMessagePages, nextMessagesCursor, type MessagesInfiniteData } from './messages-pages';
import { CONVERSATIONS_QUERY_KEY, conversationQueryKey } from './conversations';
import { createHttpTransport } from './http';
import { hasOlderMessagesOf, messagesOf, resetSentMessagesForTests } from './fixtures';
import { VIEWER_ID, message } from './fixtures-base';
import type { Message } from './types';

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

  /**
   * LA FICTION DE `hasOlderMessagesOf` SURVIT À LA PAGINATION (#6972) — le
   * corpus de `c-rattrapage` compte TRENTE messages, sous la limite de 50 :
   * la loi de fenêtrage seule (`pageOfMessages`) rendrait `hasOlder` faux, et
   * le Résumé Vivant perdrait « Sur les N derniers messages », le seul état
   * que cette conversation existe pour rendre atteignable.
   *
   * `hasOlder` SANS CURSEUR : le fil DÉCLARE un historique et n'offre AUCUNE
   * descente. Lui rendre le curseur du plus ancien message chargé faisait
   * revenir une page VIDE, dont le `hasOlder` faux bordait alors la fenêtre —
   * la fiction se falsifiait elle-même dès qu'on touchait le haut du fil.
   */
  test('c-rattrapage ⇒ hasOlder DÉCLARÉ, SANS curseur — la fiction ne se falsifie pas elle-même', async () => {
    const transport = createHttpTransport({ base: '' });
    const result = await loadMessages({ source: 'fixtures', transport, conversationId: 'c-rattrapage' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.hasOlder).toBe(true);
      expect(result.data.nextCursor).toBe(null);
      /* Et la sentinelle reste DÉSARMÉE : aucune requête ne part. */
      expect(nextMessagesCursor(result.data, [result.data], undefined)).toBeUndefined();
    }
  });

  test('c-deploiement ⇒ hasOlder false', async () => {
    const transport = createHttpTransport({ base: '' });
    const result = await loadMessages({ source: 'fixtures', transport, conversationId: 'c-deploiement' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.hasOlder).toBe(hasOlderMessagesOf('c-deploiement'));
      expect(result.data.nextCursor).toBe(null);
    }
  });

  test('`before` = le plus ancien message ⇒ page VIDE, et la fiction ne s’y applique PAS', async () => {
    const transport = createHttpTransport({ base: '' });
    const oldest = messagesOf('c-rattrapage')[0]!.id;
    const result = await loadMessages({ source: 'fixtures', transport, conversationId: 'c-rattrapage', before: oldest });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.messages).toEqual([]);
      expect(result.data.hasOlder).toBe(false);
    }
  });

  test('id inconnu ⇒ messages: []', async () => {
    const transport = createHttpTransport({ base: '' });
    const result = await loadMessages({ source: 'fixtures', transport, conversationId: 'c-inexistant' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.messages).toEqual([]);
  });
});

describe('loadMessages — gateway', () => {
  test('data en DESC ⇒ messages ASCENDANT ; hasOlder ET nextCursor lus ; URL ?limit=50', async () => {
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
      /* LA MOITIÉ JETÉE (#6972) — `nextCursor` était LU dans la charge et
         jamais porté : la moitié utile du curseur mourait ici. */
      expect(result.data.nextCursor).toBe('m1');
    }
    expect(calls[0]?.url).toBe('/api/v1/conversations/c-a/messages?limit=50');
  });

  test('`before` est CONCATÉNÉ à l’URL (miroir `conversations.ts`)', async () => {
    const { impl, calls } = fakeFetch({
      status: 200,
      body: { success: true, data: [], cursorPagination: { limit: 50, hasMore: false, nextCursor: null } },
    });
    const transport = createHttpTransport({ base: '', fetchImpl: impl });
    await loadMessages({ source: 'gateway', transport, conversationId: 'c-a', before: 'm1' });
    expect(calls[0]?.url).toBe('/api/v1/conversations/c-a/messages?limit=50&before=m1');
  });

  test('`cursorPagination` absent ⇒ hasOlder faux, aucun curseur (fail-closed)', async () => {
    const { impl } = fakeFetch({ status: 200, body: { success: true, data: [{ id: 'm1' }] } });
    const transport = createHttpTransport({ base: '', fetchImpl: impl });
    const result = await loadMessages({ source: 'gateway', transport, conversationId: 'c-a' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.hasOlder).toBe(false);
      expect(result.data.nextCursor).toBe(null);
    }
  });

  /* LE PSEUDO SERVI À PLAT (#7991) — `messageSchema.sender` est
     `userMinimalSchema` : `username` y voyage à la racine et le `user`
     imbriqué, non déclaré, est retiré par la sérialisation. Le fil lit
     `sender.user.username` : sans ce repli, aucun nom d'historique ne menait
     au profil. */
  test('`sender.username` servi à plat ⇒ `sender.user.username` ; jamais pour un anonyme', async () => {
    const { impl } = fakeFetch({
      status: 200,
      body: {
        success: true,
        data: [
          { id: 'm3', sender: { id: 'p-ano', type: 'anonymous', displayName: 'Invité', username: 'ano_x1' } },
          { id: 'm2', sender: { id: 'p-kwame', userId: 'u-kwame', type: 'user', displayName: 'Kwame', username: 'kwame' } },
          { id: 'm1', sender: { id: 'p-amina', userId: 'u-amina', displayName: 'Amina', user: { id: 'u-amina', username: 'amina' } } },
        ],
      },
    });
    const transport = createHttpTransport({ base: '', fetchImpl: impl });
    const result = await loadMessages({ source: 'gateway', transport, conversationId: 'c-a' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.messages.map((m: Message) => m.sender?.user?.username)).toEqual(['amina', 'kwame', undefined]);
      expect(result.data.messages[1]?.sender?.user?.id).toBe('u-kwame');
    }
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
  test('aplatit ET décode messages[].createdAt via select ; `hasOlder` vient de la page qui BORDE la fenêtre', () => {
    const { queryKey, select } = messagesQuery({ source: 'fixtures', transport: createHttpTransport({ base: '' }) }, 'c-a');
    expect(queryKey).toEqual(['conversations', 'c-a', 'messages']);
    const window = select({
      pages: [
        { messages: [{ ...messagesOf('c-deploiement')[0]!, createdAt: '2026-09-08T09:00:00.000Z' }], hasOlder: true, nextCursor: 'x' },
        { messages: [], hasOlder: true, nextCursor: 'y' },
      ],
      pageParams: [undefined, 'x'],
    } as unknown as Parameters<typeof select>[0]);
    expect(window.messages[0]?.createdAt).toBeInstanceOf(Date);
    expect(window.hasOlder).toBe(true);
  });

  test('`select` est la MÊME référence entre deux fabriques (fonction de MODULE)', () => {
    const deps = { source: 'fixtures' as const, transport: createHttpTransport({ base: '' }) };
    expect(messagesQuery(deps, 'c-a').select).toBe(messagesQuery(deps, 'c-b').select);
  });

  test('`initialPageParam` est undefined — la page 1 ne porte AUCUN `before`', () => {
    const options = messagesInfiniteOptions({ source: 'fixtures', transport: createHttpTransport({ base: '' }) }, 'c-a');
    expect(options.initialPageParam).toBeUndefined();
    expect(options.getNextPageParam).toBe(nextMessagesCursor);
  });
});

/**
 * LE DÉFILEMENT INFINI DU FIL, DE BOUT EN BOUT (#6972) — `fetchInfiniteQuery`
 * joue la MÊME mécanique que la sentinelle : `pages: 2` ⇒ deux requêtes, la
 * seconde portant le `before` rendu par `getNextPageParam`. Motif
 * `conversations.test.ts` § `conversationsInfiniteOptions`.
 */
describe('messagesInfiniteOptions par QueryClient.fetchInfiniteQuery', () => {
  const pagedFetch = (byBefore: Readonly<Record<string, readonly string[]>>, hasMoreOf: Readonly<Record<string, string | null>>) => {
    const calls: string[] = [];
    const impl = (async (input: RequestInfo | URL) => {
      const url = new URL(String(input), 'http://x');
      const before = url.searchParams.get('before') ?? '';
      calls.push(before);
      const ids = byBefore[before] ?? [];
      const nextCursor = hasMoreOf[before] ?? null;
      return new Response(
        JSON.stringify({
          success: true,
          /* la passerelle sert DESC */
          data: [...ids].reverse().map((id) => ({ id })),
          cursorPagination: { limit: 50, hasMore: nextCursor !== null, nextCursor },
        }),
        { status: 200 },
      );
    }) as typeof fetch;
    return { impl, calls };
  };

  test('deux pages ⇒ deux requêtes, la seconde avec `before`, et un fil ASCENDANT', async () => {
    const { impl, calls } = pagedFetch(
      { '': ['m3', 'm4', 'm5'], m3: ['m1', 'm2'] },
      { '': 'm3', m3: null },
    );
    const transport = createHttpTransport({ base: '', fetchImpl: impl });
    const options = messagesInfiniteOptions({ source: 'gateway', transport }, 'c-a');
    const client = new QueryClient();

    const twoPages = await client.fetchInfiniteQuery({ ...options, pages: 2 });
    expect(calls).toEqual(['', 'm3']);
    expect(twoPages.pageParams).toEqual([undefined, 'm3']);
    expect(flattenMessagePages(twoPages).map((m) => m.id)).toEqual(['m1', 'm2', 'm3', 'm4', 'm5']);
    expect(options.getNextPageParam(twoPages.pages[1]!, twoPages.pages, twoPages.pageParams[1])).toBeUndefined();
  });

  test('`before` INCONNU resservi par la passerelle ⇒ le 5e refus ARRÊTE la boucle', async () => {
    /* La passerelle ne valide pas `before` : elle ressert la page récente,
       `hasMore: true` et le même curseur. Sans le refus « aucun message
       neuf », `fetchInfiniteQuery({ pages: 3 })` rejouerait le début du fil
       indéfiniment. */
    const { impl, calls } = pagedFetch({ '': ['m2', 'm3'], m2: ['m2', 'm3'] }, { '': 'm2', m2: 'm2' });
    const transport = createHttpTransport({ base: '', fetchImpl: impl });
    const options = messagesInfiniteOptions({ source: 'gateway', transport }, 'c-a');
    const client = new QueryClient();

    const pages = await client.fetchInfiniteQuery({ ...options, pages: 5 });
    expect(calls).toEqual(['', 'm2']);
    expect(pages.pages).toHaveLength(2);
    expect(flattenMessagePages(pages).map((m) => m.id)).toEqual(['m2', 'm3']);
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

  test('deux rendus successifs rendent la MÊME référence de fil', async () => {
    const { InfiniteQueryObserver } = await import('@tanstack/react-query');
    const { impl } = fakeFetch({
      status: 200,
      body: { success: true, data: WIRE, cursorPagination: { limit: 50, hasMore: false, nextCursor: null } },
    });
    const deps = { source: 'gateway' as const, transport: createHttpTransport({ base: '', fetchImpl: impl }) };
    const client = new QueryClient();
    const render = () => client.defaultQueryOptions(messagesQuery(deps, 'c-a') as never);

    const observer = new InfiniteQueryObserver(client, render() as never);
    const unsubscribe = observer.subscribe(() => {});
    await observer.refetch();

    const first = observer.getOptimisticResult(render() as never).data;
    const second = observer.getOptimisticResult(render() as never).data;
    unsubscribe();

    expect(first).toBeDefined();
    expect(second).toBe(first);
  });
});

/**
 * LES QUATRE ACCÈS AU CACHE DU FIL (#6972, étape 1) — le coût caché que la
 * pagination devait solder AVANT de toucher au hook : la forme de la page
 * était écrite EN DIRECT par six sites (`realtime-apply.ts` ×2,
 * `reactions.ts`, `perform-send.ts`, `routes/thread.tsx`), donc le passage en
 * `InfiniteData` les cassait tous. Motif D-44 (`findCachedConversation` /
 * `patchConversation`) : **un site lit, un site patche**.
 *
 * `seedThread`/`readThread` sont les DEUX seuls endroits de ce fichier qui
 * connaissent la forme — c'est délibéré : les témoins ci-dessous mesurent la
 * RÈGLE (upsert, dédoublonnage, portée), jamais la structure, et survivent
 * donc au changement de forme qu'ils existent pour protéger.
 */
const seedThread = (client: QueryClient, conversationId: string, messages: readonly Message[], hasOlder = false): void => {
  client.setQueryData<MessagesInfiniteData>(messagesQueryKey(conversationId), {
    pages: [{ messages, hasOlder, nextCursor: null }],
    pageParams: [undefined],
  });
};

/** Lit le fil du cache SANS passer par `flattenMessagePages` (qui décode et
 * dédoublonne) : les témoins ci-dessous mesurent ce qui est ÉCRIT, pas ce qui
 * est servi. */
const readThread = (client: QueryClient, conversationId: string): readonly Message[] | undefined => {
  const cached = client.getQueryData<MessagesInfiniteData>(messagesQueryKey(conversationId));
  return cached === undefined ? undefined : cached.pages.flatMap((p) => [...p.messages]);
};

const msg = (id: string, extra: Partial<Message> = {}): Message =>
  message({
    id,
    conversationId: 'c-a',
    senderId: 'u1',
    content: `contenu ${id}`,
    originalLanguage: 'fr',
    translations: [],
    createdAt: new Date(1_757_000_000_000),
    ...extra,
  });

describe('patchThreadMessages — le SITE UNIQUE qui patche un fil', () => {
  test('applique le réducteur au fil visé ; les autres messages restent toBe-identiques', () => {
    const client = new QueryClient();
    const [m1, m2] = [msg('m1'), msg('m2')];
    seedThread(client, 'c-a', [m1, m2]);

    patchThreadMessages(client, 'c-a', (messages) =>
      messages.map((m) => (m.id === 'm2' ? { ...m, content: 'patché' } : m)),
    );

    const after = readThread(client, 'c-a');
    expect(after?.[0]).toBe(m1);
    expect(after?.[1]?.content).toBe('patché');
  });

  test('fil ABSENT du cache ⇒ RIEN n’est créé (le fil n’est pas ouvert)', () => {
    const client = new QueryClient();
    patchThreadMessages(client, 'c-fermee', (messages) => [...messages, msg('m9')]);
    expect(client.getQueryData(messagesQueryKey('c-fermee'))).toBeUndefined();
  });

  test('ne touche jamais un AUTRE fil', () => {
    const client = new QueryClient();
    seedThread(client, 'c-a', [msg('m1')]);
    seedThread(client, 'c-b', [msg('m2')]);
    patchThreadMessages(client, 'c-a', (messages) => messages.map((m) => ({ ...m, content: 'x' })));
    expect(readThread(client, 'c-b')?.[0]?.content).toBe('contenu m2');
  });
});

describe('upsertThreadMessage — id OU clientMessageId, une seule loi', () => {
  test('id inconnu ⇒ APPEND en queue (l’ordre ASCENDANT du fil)', () => {
    const client = new QueryClient();
    seedThread(client, 'c-a', [msg('m1')]);
    upsertThreadMessage(client, 'c-a', msg('m2'));
    expect(readThread(client, 'c-a')?.map((m) => m.id)).toEqual(['m1', 'm2']);
  });

  test('même id ⇒ REMPLACE EN PLACE, sans doubler la rangée', () => {
    const client = new QueryClient();
    seedThread(client, 'c-a', [msg('m1'), msg('m2')]);
    upsertThreadMessage(client, 'c-a', msg('m1', { content: 'écho' }));
    const after = readThread(client, 'c-a');
    expect(after?.map((m) => m.id)).toEqual(['m1', 'm2']);
    expect(after?.[0]?.content).toBe('écho');
  });

  test('même clientMessageId ⇒ PROMEUT la rangée optimiste en place (D-11/D-28)', () => {
    const client = new QueryClient();
    const local = { ...msg('local-1'), clientMessageId: 'cid_abc' } as Message;
    seedThread(client, 'c-a', [local]);
    upsertThreadMessage(client, 'c-a', { ...msg('m-serveur'), clientMessageId: 'cid_abc' } as Message);
    const after = readThread(client, 'c-a');
    expect(after?.map((m) => m.id)).toEqual(['m-serveur']);
  });

  test('charge SANS clientMessageId ⇒ ne matche pas une rangée qui n’en porte pas (piège undefined === undefined)', () => {
    const client = new QueryClient();
    seedThread(client, 'c-a', [msg('m1')]);
    upsertThreadMessage(client, 'c-a', msg('m2'));
    expect(readThread(client, 'c-a')?.map((m) => m.id)).toEqual(['m1', 'm2']);
  });

  test('fil ABSENT du cache ⇒ RIEN n’est créé', () => {
    const client = new QueryClient();
    upsertThreadMessage(client, 'c-fermee', msg('m1'));
    expect(client.getQueryData(messagesQueryKey('c-fermee'))).toBeUndefined();
  });
});

describe('cachedThreadConversationIds / findCachedThreadMessage — le SITE UNIQUE qui lit', () => {
  test('n’énumère QUE les fils, jamais la liste ni la case d’une conversation', () => {
    const client = new QueryClient();
    client.setQueryData(CONVERSATIONS_QUERY_KEY, { pages: [], pageParams: [] });
    client.setQueryData(conversationQueryKey('c-a'), { id: 'c-a' });
    seedThread(client, 'c-a', [msg('m1')]);
    seedThread(client, 'c-b', [msg('m2')]);
    expect([...cachedThreadConversationIds(client)].sort()).toEqual(['c-a', 'c-b']);
  });

  test('rend le message du fil, `undefined` s’il n’y est pas, `undefined` si le fil n’est pas ouvert', () => {
    const client = new QueryClient();
    seedThread(client, 'c-a', [msg('m1')]);
    expect(findCachedThreadMessage(client, 'c-a', 'm1')?.id).toBe('m1');
    expect(findCachedThreadMessage(client, 'c-a', 'm404')).toBeUndefined();
    expect(findCachedThreadMessage(client, 'c-fermee', 'm1')).toBeUndefined();
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
