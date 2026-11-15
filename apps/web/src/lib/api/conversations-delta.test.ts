import { QueryClient } from '@tanstack/react-query';
import { describe, expect, test } from 'bun:test';

import { CONVERSATIONS_QUERY_KEY, conversationsInfiniteOptions, refreshConversations } from './conversations';
import { DELTA_WATERMARK_LAG_MS, FULL_RECONCILE_INTERVAL_MS } from './conversations-delta';
import type { ConversationsInfiniteData } from './conversations-pages';
import { createHttpTransport } from './http';

type Row = { readonly id: string; readonly title: string; readonly updatedAt: string };

const T0 = '2026-10-01T10:00:00.000Z';
const T_LATEST = '2026-10-01T12:00:00.000Z';

const row = (id: string, updatedAt = T0, title = id): Row => ({ id, title, updatedAt });

const ids = (from: number, count: number) => Array.from({ length: count }, (_, i) => `c-${from + i}`);

function pageBody(rows: readonly Row[], cursor: { readonly hasMore: boolean; readonly nextCursor: string | null }) {
  return {
    success: true,
    data: rows,
    pagination: { limit: 30, offset: 0, total: rows.length, hasMore: cursor.hasMore },
    cursorPagination: { limit: 30, ...cursor },
  };
}

function deltaBody(rows: readonly Row[], meta: { readonly deleted?: readonly string[]; readonly hasMore?: boolean; readonly truncated?: boolean } = {}) {
  return {
    success: true,
    data: rows,
    pagination: { limit: 100, offset: 0, total: rows.length, hasMore: meta.hasMore ?? false },
    cursorPagination: { limit: 100, hasMore: meta.hasMore ?? false, nextCursor: null },
    meta: { deletedConversationIds: meta.deleted ?? [], deletedConversationIdsTruncated: meta.truncated ?? false },
  };
}

/** Trois pages de la Lentille, la plus récente portant `T_LATEST`. */
const THREE_PAGES = {
  '': pageBody([row('c-0', T_LATEST), ...ids(1, 29).map((id) => row(id))], { hasMore: true, nextCursor: 'c-29' }),
  'c-29': pageBody(ids(30, 30).map((id) => row(id)), { hasMore: true, nextCursor: 'c-59' }),
  'c-59': pageBody(ids(60, 10).map((id) => row(id)), { hasMore: false, nextCursor: null }),
};

type Call = { readonly before: string; readonly updatedSince: string | null; readonly limit: string | null };

/** Un transport qui rend une page selon `before`, ou le delta quand
 * `updatedSince` est posé — et qui enregistre chaque requête émise. */
function gateway(pages: Record<string, unknown>, delta: () => unknown) {
  const calls: Call[] = [];
  const impl = (async (input: RequestInfo | URL) => {
    const url = new URL(String(input), 'http://x');
    const call = {
      before: url.searchParams.get('before') ?? '',
      updatedSince: url.searchParams.get('updatedSince'),
      limit: url.searchParams.get('limit'),
    };
    calls.push(call);
    if (call.updatedSince !== null) return new Response(JSON.stringify(delta()), { status: 200 });
    const page = pages[call.before];
    if (page === undefined) throw new Error(`page inattendue: ${call.before}`);
    return new Response(JSON.stringify(page), { status: 200 });
  }) as typeof fetch;
  return { transport: createHttpTransport({ base: '', fetchImpl: impl }), calls };
}

async function loadedThreePages(delta: () => unknown, clock: { now: number }) {
  const { transport, calls } = gateway(THREE_PAGES, delta);
  const deps = { source: 'gateway' as const, transport, now: () => clock.now };
  const queryClient = new QueryClient();
  await queryClient.fetchInfiniteQuery({ ...conversationsInfiniteOptions(deps), pages: 3 });
  calls.length = 0;
  return { queryClient, calls, deps };
}

const cached = (queryClient: QueryClient) => queryClient.getQueryData<ConversationsInfiniteData>(CONVERSATIONS_QUERY_KEY)!;
const flat = (data: ConversationsInfiniteData) => data.pages.flatMap((p) => p.conversations.map((c) => c.id));
const refetch = (queryClient: QueryClient) => queryClient.refetchQueries({ queryKey: CONVERSATIONS_QUERY_KEY, exact: true });

describe('rafraîchir une Lentille de trois pages (#6261)', () => {
  test('émet UNE requête delta, bornée par le plus récent updatedAt servi moins le retrait', async () => {
    const clock = { now: Date.parse(T_LATEST) };
    const { queryClient, calls } = await loadedThreePages(() => deltaBody([]), clock);

    await refetch(queryClient);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.before).toBe('');
    expect(calls[0]?.updatedSince).toBe(new Date(Date.parse(T_LATEST) - DELTA_WATERMARK_LAG_MS).toISOString());
    expect(calls[0]?.limit).toBe('100');
  });

  test('garde les trois pages et leurs curseurs, remplace les lignes changées, ajoute les nouvelles, retire les sorties', async () => {
    const clock = { now: Date.parse(T_LATEST) };
    const changed = row('c-45', '2026-10-01T12:05:00.000Z', 'renommée');
    const arrived = row('c-new', '2026-10-01T12:06:00.000Z');
    const { queryClient } = await loadedThreePages(() => deltaBody([changed, arrived], { deleted: ['c-61'] }), clock);
    const before = cached(queryClient);

    await refetch(queryClient);

    const after = cached(queryClient);
    expect(after.pages).toHaveLength(3);
    expect(after.pageParams).toEqual(before.pageParams);
    expect(after.pages[0]?.conversations[0]?.id).toBe('c-new');
    expect(after.pages[1]?.conversations.find((c) => c.id === 'c-45')?.title).toBe('renommée');
    expect(flat(after)).not.toContain('c-61');
    expect(flat(after)).toHaveLength(70);
    expect(after.pages[2]?.cursorPagination).toEqual(before.pages[2]!.cursorPagination);
  });

  test('une ligne servie en delta qui portait le curseur de sa page cède le curseur à la dernière ligne inchangée', async () => {
    const clock = { now: Date.parse(T_LATEST) };
    const { queryClient, calls } = await loadedThreePages(() => deltaBody([row('c-29', '2026-10-01T12:05:00.000Z')]), clock);

    await refetch(queryClient);

    const after = cached(queryClient);
    expect(calls).toHaveLength(1);
    expect(after.pages[0]?.cursorPagination.nextCursor).toBe('c-28');
    expect(after.pageParams).toEqual([undefined, 'c-28', 'c-59']);
    expect(flat(after)).toContain('c-29');
  });

  test('un delta qui ne prouve pas sa complétude retombe sur la relecture page par page', async () => {
    const clock = { now: Date.parse(T_LATEST) };
    const { queryClient, calls } = await loadedThreePages(() => deltaBody([], { hasMore: true }), clock);

    await refetch(queryClient);

    expect(calls.map((c) => c.updatedSince === null ? c.before : 'delta')).toEqual(['delta', '', 'c-29', 'c-59']);
    expect(flat(cached(queryClient))).toHaveLength(70);
  });

  test('des sorties tronquées retombent aussi sur la relecture complète', async () => {
    const clock = { now: Date.parse(T_LATEST) };
    const { queryClient, calls } = await loadedThreePages(() => deltaBody([], { truncated: true }), clock);

    await refetch(queryClient);

    expect(calls.filter((c) => c.updatedSince === null)).toHaveLength(3);
  });

  test('passé l’intervalle de réconciliation, le rafraîchissement relit tout, puis redevient delta', async () => {
    const clock = { now: Date.parse(T_LATEST) };
    const { queryClient, calls } = await loadedThreePages(() => deltaBody([]), clock);

    clock.now += FULL_RECONCILE_INTERVAL_MS + 1;
    await refetch(queryClient);
    expect(calls.filter((c) => c.updatedSince !== null)).toHaveLength(0);
    expect(calls).toHaveLength(3);

    calls.length = 0;
    await refetch(queryClient);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.updatedSince).not.toBeNull();
  });

  test('un delta en échec laisse les trois pages intactes et rejette', async () => {
    const clock = { now: Date.parse(T_LATEST) };
    let failing = true;
    const { transport } = gateway(THREE_PAGES, () => {
      if (failing) throw new Error('réseau coupé');
      return deltaBody([]);
    });
    const deps = { source: 'gateway' as const, transport, now: () => clock.now };
    const queryClient = new QueryClient();
    await queryClient.fetchInfiniteQuery({ ...conversationsInfiniteOptions(deps), pages: 3 });
    const before = cached(queryClient);

    const outcome = await queryClient
      .fetchInfiniteQuery({ ...conversationsInfiniteOptions(deps), staleTime: 0, retry: false })
      .then(() => 'resolved', () => 'rejected');

    expect(outcome).toBe('rejected');
    expect(cached(queryClient)).toBe(before);
    failing = false;
  });

  test('le tirer-pour-rafraîchir reste une relecture de la page 1, jamais un delta', async () => {
    const clock = { now: Date.parse(T_LATEST) };
    const { queryClient, calls, deps } = await loadedThreePages(() => deltaBody([]), clock);

    await refreshConversations(queryClient, deps);

    expect(calls).toEqual([{ before: '', updatedSince: null, limit: '30' }]);
    expect(cached(queryClient).pages).toHaveLength(1);
  });
});
