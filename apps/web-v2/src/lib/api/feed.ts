import type { QueryClient } from '@tanstack/react-query';

import { unwrap } from './client';
import type { DataSource } from './config';
import {
  flattenFeedPages,
  nextFeedCursor,
  type FeedPage,
  type FeedPageParam,
  type FeedPost,
} from './feed-pages';
import type { ApiResult, HttpTransport } from './http';

/**
 * LE PORT DU FIL DES PUBLICATIONS (#5893) — `source` résolue ICI, jamais
 * dans le hook ni dans l'écran (même motif que `conversations.ts`) : les
 * fixtures sont servies par le MÊME chemin.
 *
 * `GET /api/v1/social/posts?scope=home&limit=20[&cursor=<c>]`
 * (`services/gateway/src/routes/posts/feed.ts:207,741-792`, `optionalAuth` à
 * la porte mais `scope=home` EXIGE une session — 401 `UNAUTHORIZED` sans
 * elle, § 3.1 de la spécification #5893). Le curseur est OPAQUE, transmis
 * TEL QUEL au tour suivant (même discipline que `before` sur les
 * conversations, `ConversationService.swift:140-143`).
 */
export const FEED_QUERY_KEY = ['feed'] as const;

/** Le défaut demandé au serveur — `LimiteSchema` (`feed.ts:171`) autorise
 * jusqu'à 50, mais 20 est la valeur que ce client a mesurée et retenue
 * (§ 3.1 de la spécification). */
export const FEED_PAGE_SIZE = 20;

export type FeedDeps = { readonly source: DataSource; readonly transport: HttpTransport };

/**
 * La forme BRUTE de `pagination` sur CETTE route — `CursorPaginationAvecForme`
 * côté serveur (`limit,hasMore,nextCursor,form`), PAS `PaginationMeta`
 * (`total`/`offset`) malgré le typage large de `ApiSuccess.pagination` : un
 * accès direct à `.hasMore`/`.nextCursor` sur ce type échouerait au
 * type-check, d'où ce recadrage EXPLICITE au seul site qui lit cette
 * enveloppe précise.
 */
type RawFeedPagination = { readonly limit?: number; readonly hasMore?: boolean; readonly nextCursor?: string | null };

export async function loadFeedPage(
  params: FeedDeps & { readonly cursor?: FeedPageParam; readonly signal?: AbortSignal },
): Promise<ApiResult<FeedPage>> {
  if (__FIXTURES__ && params.source === 'fixtures') {
    const { FEED_POSTS, pageOfFeed } = await import('./fixtures-feed');
    return {
      ok: true,
      data: pageOfFeed(FEED_POSTS, {
        ...(params.cursor !== undefined ? { cursor: params.cursor } : {}),
        limit: FEED_PAGE_SIZE,
      }),
    };
  }
  const query = new URLSearchParams({
    scope: 'home',
    limit: String(FEED_PAGE_SIZE),
    ...(params.cursor !== undefined ? { cursor: params.cursor } : {}),
  });
  const result = await params.transport.request<readonly FeedPost[]>({
    method: 'GET',
    path: `/api/v1/social/posts?${query.toString()}`,
    ...(params.signal !== undefined ? { signal: params.signal } : {}),
  });
  if (!result.ok) return result;
  const raw = result.pagination as unknown as RawFeedPagination | undefined;
  return {
    ok: true,
    data: {
      posts: result.data,
      pagination: { limit: FEED_PAGE_SIZE, hasMore: raw?.hasMore ?? false, nextCursor: raw?.nextCursor ?? null },
    },
  };
}

/** Spreadable dans `useInfiniteQuery` OU `QueryClient.fetchInfiniteQuery`,
 * SANS `select` — même motif que `conversationsInfiniteOptions`. */
export function feedInfiniteOptions(deps: FeedDeps) {
  return {
    queryKey: FEED_QUERY_KEY,
    queryFn: async ({ pageParam, signal }: { readonly pageParam?: FeedPageParam; readonly signal?: AbortSignal }) =>
      unwrap(
        await loadFeedPage({
          ...deps,
          ...(pageParam !== undefined ? { cursor: pageParam } : {}),
          ...(signal !== undefined ? { signal } : {}),
        }),
      ),
    initialPageParam: undefined as FeedPageParam,
    getNextPageParam: nextFeedCursor,
  };
}

/** FABRIQUE — `{ queryKey, queryFn, select }`, exerçable sans DOM. */
export function feedQuery(deps: FeedDeps) {
  return { ...feedInfiniteOptions(deps), select: flattenFeedPages };
}

/**
 * `refreshFeed` — le TIRER : UNE requête, page 1 seule, curseur remis à
 * zéro. Même comportement que `refreshConversations` : un échec laisse
 * `data` intact et la promesse REJETTE (`usePullToRefresh` la traduit en
 * `completing failed`).
 */
export function refreshFeed(queryClient: QueryClient, deps: FeedDeps): Promise<void> {
  return queryClient.fetchInfiniteQuery({ ...feedInfiniteOptions(deps), pages: 1, staleTime: 0 }).then(() => undefined);
}

export type { FeedAuthor, FeedMedia, FeedPage, FeedPageParam, FeedPagination, FeedPost, FeedRepostOf } from './feed-pages';
