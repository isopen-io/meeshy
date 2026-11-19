import { InfiniteQueryObserver, type QueryClient } from '@tanstack/react-query';
import { describe, expect, test } from 'bun:test';

import { createConversationStore } from '@/lib/conversation-store';
import { createOutboxStore } from '@/lib/send/outbox-store';
import { deferred, settle, socketMessage } from '@/test-support/live-relecture';
import { liveQueryClient } from '@/test-support/live-query-client';
import { routedTransport } from '@/test-support/routed-transport';
import { localMessage } from '@/test-support/thread-cache';

import type { ApiResult, HttpRequest } from './http';
import { messagesInfiniteOptions, messagesQueryKey } from './messages';
import type { MessagesInfiniteData, MessagesPage } from './messages-pages';
import { createPreferencesSync } from './conversation-preferences-sync';
import { applyMessageNew } from './realtime-apply';
import type { Message } from './types';

/**
 * **REVENIR SUR UN FIL LONG NE RELIT QUE SA PAGE LA PLUS RÉCENTE** (#18918,
 * WEB-09 volet fil). La requête infinie du fil relisait TOUTES ses pages, une
 * par une (~1 s chacune, #9637), à chaque revalidation — réveil, reconnexion,
 * retour sur l'écran. Elle relit désormais la page 1, recollée à `pages[0]` ;
 * l'historique déjà chargé reste tel quel. Si plus d'une page est arrivée
 * depuis (aucun recouvrement), la relecture redevient complète : jamais de trou.
 *
 * Ni `maxPages` (il jetterait `pages[0]`, la page du PRÉSENT, où le temps réel
 * ajoute), ni une relecture à une seule page (elle REBÂTIRAIT les données, et
 * l'historique disparaîtrait sous le doigt du lecteur).
 */

const PAGE = 50;
const at = (n: number): string => new Date(Date.UTC(2026, 10, 17, 8, 0, n)).toISOString();
const id = (n: number): string => `m-${String(n).padStart(3, '0')}`;
const message = (n: number): Message => localMessage({ id: id(n), conversationId: 'c-a', senderId: 'u-other', content: `n°${n}`, createdAt: new Date(at(n)) });

/** La passerelle : les messages numérotés de `floor` (1 par défaut) à `newest`, servis par pages de 50, du plus récent au plus ancien. */
function gateway(server: { newest: number; floor?: number }) {
  const { transport, calls } = routedTransport((req: HttpRequest): ApiResult<unknown> | undefined => {
    if (req.method !== 'GET' || !req.path.includes('/messages')) return undefined;
    const floor = server.floor ?? 1;
    const before = new URL(req.path, 'https://gate.test').searchParams.get('before');
    const ceiling = before === null ? server.newest + 1 : Number(before.slice(2));
    const from = Math.max(floor, ceiling - PAGE);
    const rows = Array.from({ length: Math.max(0, ceiling - from) }, (_, i) => message(ceiling - 1 - i));
    const hasMore = from > floor;
    return { ok: true, data: rows, cursorPagination: { limit: PAGE, hasMore, nextCursor: hasMore ? id(from) : null } } as ApiResult<unknown>;
  });
  return { transport, reads: () => calls().filter((call) => call.method === 'GET').length };
}

function openThread(queryClient: QueryClient, transport: ReturnType<typeof gateway>['transport']) {
  const observer = new InfiniteQueryObserver(queryClient, { ...messagesInfiniteOptions({ source: 'gateway', transport }, 'c-a'), staleTime: 60_000 });
  return { observer, stop: observer.subscribe(() => undefined) };
}

const pages = (queryClient: QueryClient): readonly MessagesPage[] => queryClient.getQueryData<MessagesInfiniteData>(messagesQueryKey('c-a'))?.pages ?? [];
/** Le fil dans l'ordre de lecture, page la plus ancienne d'abord — SANS dédoublonner : un doublon entre deux pages se verrait. */
const ids = (queryClient: QueryClient): readonly string[] => [...pages(queryClient)].reverse().flatMap((page) => page.messages.map((m) => m.id));

/** Le fil chargé sur TROIS pages, comme un lecteur qui a remonté l'historique. */
async function threeLoadedPages(server: { newest: number; floor?: number }) {
  const queryClient = liveQueryClient({ defaultOptions: { queries: { retry: false } } });
  const api = gateway(server);
  const thread = openThread(queryClient, api.transport);
  await settle(queryClient);
  await thread.observer.fetchNextPage();
  await thread.observer.fetchNextPage();
  await settle(queryClient);
  return { queryClient, api, thread };
}

describe('la revalidation d’un fil ne relit que sa page 1, recollée au présent (#18918)', () => {
  test('fil à 3 pages : UNE requête, les 3 pages toujours là, les messages nouveaux en tête', async () => {
    const server = { newest: 200 };
    const { queryClient, api, thread } = await threeLoadedPages(server);
    expect(pages(queryClient)).toHaveLength(3);
    const readsBefore = api.reads();

    server.newest = 205;
    await thread.observer.refetch();
    await settle(queryClient);

    expect(api.reads() - readsBefore).toBe(1);
    expect(pages(queryClient)).toHaveLength(3);
    const served = ids(queryClient);
    expect(served.slice(-5)).toEqual([id(201), id(202), id(203), id(204), id(205)]);
    expect(served[0]).toBe(id(51));
    expect(new Set(served).size).toBe(served.length);
    thread.stop();
  });

  test('plus de 50 messages arrivés pendant l’absence : la relecture redevient complète, sans trou', async () => {
    const server = { newest: 200 };
    const { queryClient, thread } = await threeLoadedPages(server);

    server.newest = 290;
    await thread.observer.refetch();
    await settle(queryClient);

    const served = ids(queryClient);
    const numbers = served.map((value) => Number(value.slice(2)));
    expect(numbers.at(-1)).toBe(290);
    expect(numbers.every((n, i) => i === 0 || n === (numbers[i - 1] ?? 0) + 1)).toBe(true);
    thread.stop();
  });

  test('un fil d’une seule page se relit comme avant : une requête', async () => {
    const server = { newest: 30 };
    const queryClient = liveQueryClient({ defaultOptions: { queries: { retry: false } } });
    const api = gateway(server);
    const thread = openThread(queryClient, api.transport);
    await settle(queryClient);
    const readsBefore = api.reads();

    server.newest = 32;
    await thread.observer.refetch();
    await settle(queryClient);

    expect(api.reads() - readsBefore).toBe(1);
    expect(ids(queryClient).slice(-2)).toEqual([id(31), id(32)]);
    thread.stop();
  });

  test('un historique vidé sur un autre appareil relit TOUT le fil : rien d’avant la date ne reste', async () => {
    const server: { newest: number; floor?: number } = { newest: 200 };
    const { queryClient, thread } = await threeLoadedPages(server);
    const sync = createPreferencesSync({ queryClient, conversations: createConversationStore() });

    server.floor = 120;
    sync({ userId: 'u-viewer', conversationId: 'c-a', version: 9, preferences: { clearHistoryBefore: at(120) } });
    await settle(queryClient);
    await settle(queryClient);

    const served = ids(queryClient).map((value) => Number(value.slice(2)));
    expect(served[0]).toBe(120);
    expect(served.at(-1)).toBe(200);
    thread.stop();
  });

  test('un message reçu pendant la revalidation reste dans le fil (journal des écritures vives)', async () => {
    const server = { newest: 200 };
    const { queryClient, thread } = await threeLoadedPages(server);
    const held = deferred<void>();
    const api = gateway(server);
    const slowTransport = {
      ...api.transport,
      request: async <T,>(req: HttpRequest): Promise<ApiResult<T>> => {
        await held.promise;
        return api.transport.request<T>(req);
      },
    } as typeof api.transport;
    thread.stop();
    const reopened = openThread(queryClient, slowTransport);

    const refetch = reopened.observer.refetch();
    applyMessageNew(queryClient, createOutboxStore(), { ...socketMessage('m-recu'), createdAt: new Date(at(400)) });
    held.resolve();
    await refetch;
    await settle(queryClient);

    expect(ids(queryClient)).toContain('m-recu');
    expect(pages(queryClient)).toHaveLength(3);
    reopened.stop();
  });
});
