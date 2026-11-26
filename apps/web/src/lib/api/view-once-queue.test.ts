import { QueryClient } from '@tanstack/react-query';
import { describe, expect, test } from 'bun:test';

import { message } from './fixtures-base';
import { messagesQueryKey } from './messages';
import type { MessagesInfiniteData } from './messages-pages';
import type { Message } from './types';
import { consumeViewOnceOptimistic } from './view-once';
import { createViewOnceQueue, sealPendingViewOnce, type ViewOnceQueueStorage } from './view-once-queue';
import { createHttpTransport } from './http';

/**
 * UNE VUE UNIQUE FERMÉE HORS LIGNE EST CONSOMMÉE QUAND LE RÉSEAU REVIENT
 * (#8015) — la consommation qui n'a pas pu partir entre dans une file
 * PERSISTÉE, rejouée dans l'ordre au retour du réseau ; tant qu'elle n'est
 * pas confirmée, la rangée servie par le serveur reste « déjà ouverte »,
 * rechargement compris.
 */
function memoryStorage(): ViewOnceQueueStorage & { readonly dump: () => ReadonlyMap<string, string> } {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
    dump: () => map,
  };
}

const KEY = 'meeshy.viewOnceConsume.u-me';

const viewOnce = (id: string, conversationId = 'c-a'): Message =>
  message({
    id,
    conversationId,
    senderId: 'u-other',
    content: `secret ${id}`,
    originalLanguage: 'fr',
    translations: [],
    createdAt: new Date(1_757_000_000_000),
    isViewOnce: true,
    viewOnceCount: 0,
    maxViewOnceCount: 1,
  });

const seedThread = (client: QueryClient, conversationId: string, messages: readonly Message[]): void => {
  client.setQueryData<MessagesInfiniteData>(messagesQueryKey(conversationId), {
    pages: [{ messages, hasOlder: false, nextCursor: null }],
    pageParams: [undefined],
  });
};

const respondingWith = (status: number, body: unknown) =>
  createHttpTransport({
    base: '',
    fetchImpl: (async () => new Response(JSON.stringify(body), { status })) as typeof fetch,
  });

const offline = createHttpTransport({
  base: '',
  fetchImpl: (async () => {
    throw new TypeError('Failed to fetch');
  }) as typeof fetch,
});

describe('createViewOnceQueue — la file des consommations non confirmées (#8015)', () => {
  test('une consommation mise en file SURVIT à une nouvelle file sur le même stockage (rechargement)', () => {
    const storage = memoryStorage();
    createViewOnceQueue({ storage, key: KEY, send: async () => ({ ok: true, status: 200 }) }).enqueue('c-a', 'm1');

    const reloaded = createViewOnceQueue({ storage, key: KEY, send: async () => ({ ok: true, status: 200 }) });

    expect([...reloaded.pendingFor('c-a')]).toEqual(['m1']);
    expect(reloaded.pendingFor('c-b').size).toBe(0);
  });

  test('le rejeu part dans l ORDRE d entrée (FIFO) et vide la file sur succès', async () => {
    const storage = memoryStorage();
    const sent: string[] = [];
    const queue = createViewOnceQueue({
      storage,
      key: KEY,
      send: async (entry) => {
        sent.push(`${entry.conversationId}/${entry.messageId}`);
        return { ok: true, status: 200 };
      },
    });
    queue.enqueue('c-b', 'm2');
    queue.enqueue('c-a', 'm1');
    queue.enqueue('c-b', 'm2');

    await queue.flush();

    expect(sent).toEqual(['c-b/m2', 'c-a/m1']);
    expect(queue.pendingFor('c-a').size).toBe(0);
    expect(storage.dump().has(KEY)).toBe(false);
  });

  test('une panne pendant le rejeu GARDE l entrée et celles qui la suivent, dans l ordre', async () => {
    const storage = memoryStorage();
    const sent: string[] = [];
    let failing = true;
    const queue = createViewOnceQueue({
      storage,
      key: KEY,
      send: async (entry) => {
        sent.push(entry.messageId);
        if (failing) throw new Error('offline');
        return { ok: true, status: 200 };
      },
    });
    queue.enqueue('c-a', 'm1');
    queue.enqueue('c-a', 'm2');

    await queue.flush();
    expect(sent).toEqual(['m1']);
    expect([...queue.pendingFor('c-a')]).toEqual(['m1', 'm2']);

    failing = false;
    await queue.flush();
    expect(sent).toEqual(['m1', 'm1', 'm2']);
    expect(queue.pendingFor('c-a').size).toBe(0);
  });

  test('un 5xx garde l entrée ; un refus PERMANENT la retire sans bloquer la suite', async () => {
    const responses: Record<string, unknown> = { m1: { ok: false, status: 503 }, m2: { ok: false, status: 404 } };
    const queue = createViewOnceQueue({ storage: memoryStorage(), key: KEY, send: async (entry) => responses[entry.messageId] });
    queue.enqueue('c-a', 'm2');
    queue.enqueue('c-a', 'm1');

    await queue.flush();

    expect([...queue.pendingFor('c-a')]).toEqual(['m1']);
  });

  test('un stockage illisible ou refusé retombe sur une file vide en mémoire, sans lever', () => {
    const storage = memoryStorage();
    storage.setItem(KEY, '{pas du json');
    const queue = createViewOnceQueue({ storage, key: KEY, send: async () => ({ ok: true, status: 200 }) });
    expect(queue.pendingFor('c-a').size).toBe(0);

    const refused = createViewOnceQueue({ storage: null, key: KEY, send: async () => ({ ok: true, status: 200 }) });
    refused.enqueue('c-a', 'm1');
    expect([...refused.pendingFor('c-a')]).toEqual(['m1']);
  });
});

describe('sealPendingViewOnce — « déjà ouvert » survit au rechargement (#8015)', () => {
  test('la rangée servie OUVRABLE d une consommation en attente est scellée ; les autres gardent leur référence', () => {
    const messages = [viewOnce('m1'), viewOnce('m2')];
    const sealed = sealPendingViewOnce(messages, new Set(['m1']));

    expect(sealed[0]?.consumedByMe).toBe(true);
    expect(sealed[0]?.content).toBe('');
    expect(sealed[0]?.viewOnceCount).toBe(1);
    expect(sealed[1]).toBe(messages[1]);
  });

  test('rien à sceller ⇒ le MÊME tableau (aucun re-rendu, aucune boucle)', () => {
    const messages = [viewOnce('m2')];
    expect(sealPendingViewOnce(messages, new Set(['m1']))).toBe(messages);
    const already = sealPendingViewOnce([viewOnce('m1')], new Set(['m1']));
    expect(sealPendingViewOnce(already, new Set(['m1']))).toBe(already);
  });
});

describe('consumeViewOnceOptimistic + file (#8015)', () => {
  test('fermée HORS LIGNE : la consommation entre en file, puis part au retour du réseau', async () => {
    const client = new QueryClient();
    seedThread(client, 'c-a', [viewOnce('m1')]);
    const storage = memoryStorage();
    const replayed: string[] = [];
    const queue = createViewOnceQueue({
      storage,
      key: KEY,
      send: async (entry) => {
        replayed.push(entry.messageId);
        return { ok: true, status: 200 };
      },
    });

    const revealed = await consumeViewOnceOptimistic({
      conversationId: 'c-a',
      messageId: 'm1',
      deps: { source: 'gateway', transport: offline, queryClient: client, viewOnceQueue: queue },
    });

    expect(revealed).toBe(true);
    expect([...queue.pendingFor('c-a')]).toEqual(['m1']);

    await queue.flush();
    expect(replayed).toEqual(['m1']);
    expect(queue.pendingFor('c-a').size).toBe(0);
  });

  test('une panne TRANSITOIRE (503) entre aussi en file ; un succès n y entre pas', async () => {
    const client = new QueryClient();
    seedThread(client, 'c-a', [viewOnce('m1'), viewOnce('m2')]);
    const queue = createViewOnceQueue({ storage: memoryStorage(), key: KEY, send: async () => ({ ok: true, status: 200 }) });
    const unavailable = respondingWith(503, { success: false, error: 'Service unavailable' });
    const fine = respondingWith(200, { success: true, data: { messageId: 'm2', viewOnceCount: 1, maxViewOnceCount: 1, isFullyConsumed: true } });

    await consumeViewOnceOptimistic({ conversationId: 'c-a', messageId: 'm1', deps: { source: 'gateway', transport: unavailable, queryClient: client, viewOnceQueue: queue } });
    await consumeViewOnceOptimistic({ conversationId: 'c-a', messageId: 'm2', deps: { source: 'gateway', transport: fine, queryClient: client, viewOnceQueue: queue } });

    expect([...queue.pendingFor('c-a')]).toEqual(['m1']);
  });
});

describe('fermée HORS LIGNE — le moment du geste décide (#8015, revue)', () => {
  const network: string[] = [];
  const neverCalled = createHttpTransport({
    base: '',
    fetchImpl: (async (input: RequestInfo | URL) => {
      network.push(String(input));
      throw new TypeError('Failed to fetch');
    }) as typeof fetch,
  });

  test('la FERMETURE d un média vu hors ligne est consommée en file, sans appel réseau, et la rangée passe « déjà ouverte »', async () => {
    const client = new QueryClient();
    seedThread(client, 'c-a', [viewOnce('m1')]);
    const queue = createViewOnceQueue({ storage: memoryStorage(), key: KEY, send: async () => ({ ok: true, status: 200 }) });

    const recorded = await consumeViewOnceOptimistic({
      conversationId: 'c-a',
      messageId: 'm1',
      moment: 'close',
      online: false,
      deps: { source: 'gateway', transport: neverCalled, queryClient: client, viewOnceQueue: queue },
    });

    expect(recorded).toBe(true);
    expect(network).toEqual([]);
    expect([...queue.pendingFor('c-a')]).toEqual(['m1']);
    const row = client.getQueryData<MessagesInfiniteData>(messagesQueryKey('c-a'))?.pages[0]?.messages[0];
    expect(row?.consumedByMe).toBe(true);
  });

  test('l OUVERTURE hors ligne reste refusée (D-16) : rien n est consommé ni mis en file', async () => {
    const client = new QueryClient();
    seedThread(client, 'c-a', [viewOnce('m1')]);
    const queue = createViewOnceQueue({ storage: memoryStorage(), key: KEY, send: async () => ({ ok: true, status: 200 }) });

    const revealed = await consumeViewOnceOptimistic({
      conversationId: 'c-a',
      messageId: 'm1',
      moment: 'open',
      online: false,
      deps: { source: 'gateway', transport: neverCalled, queryClient: client, viewOnceQueue: queue },
    });

    expect(revealed).toBe(false);
    expect(queue.pendingFor('c-a').size).toBe(0);
    const row = client.getQueryData<MessagesInfiniteData>(messagesQueryKey('c-a'))?.pages[0]?.messages[0];
    expect(row?.consumedByMe).not.toBe(true);
  });
});
