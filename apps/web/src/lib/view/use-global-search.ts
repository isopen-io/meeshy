import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { unwrap } from '@/lib/api/client';
import { apiDeps } from '@/lib/api/deps';
import {
  GLOBAL_SEARCH_DEBOUNCE_MS,
  globalSearchKey,
  searchableQuery,
  searchEverywhereMessages,
  searchEverywherePosts,
  type MessageSearchResults,
  type PostSearchResults,
} from '@/lib/api/global-search';
import { searchUsers } from '@/lib/api/users-search';
import { useOnline } from '@/lib/net/online';

import { searchStateOf } from './global-search-state';
import { useDebouncedValue } from './use-media-hub-index';

/**
 * LES TROIS LECTURES DE LA RECHERCHE GÉNÉRALE (#14619, #14620) — temporisées
 * (300 ms, comme la recherche des appels et iOS), muettes sous deux
 * caractères, et SERVIES DEPUIS LE CACHE pour une requête déjà faite : revenir
 * sur « plage » repeint ses résultats sans attendre le réseau.
 */

const STALE_TIME = 30_000;

function useSettledQuery(raw: string): string | null {
  return searchableQuery(useDebouncedValue(raw, GLOBAL_SEARCH_DEBOUNCE_MS));
}

export function useEverywhereMessages(raw: string, enabled = true) {
  const query = useSettledQuery(raw);
  const online = useOnline();
  const page = useInfiniteQuery({
    queryKey: globalSearchKey('messages', query ?? ''),
    enabled: enabled && query !== null,
    staleTime: STALE_TIME,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) => searchEverywhereMessages({ ...apiDeps, query: query ?? '', cursor: pageParam, signal }).then(unwrap),
    getNextPageParam: (last: MessageSearchResults) => last.nextCursor ?? undefined,
  });
  const hits = useMemo(() => (page.data?.pages ?? []).flatMap((p) => p.hits), [page.data]);
  return {
    query,
    hits,
    state: searchStateOf({ query: enabled ? query : null, isPending: page.isPending, isError: page.isError, online }),
    hasMore: page.hasNextPage,
    busy: page.isFetchingNextPage,
    more: () => void page.fetchNextPage(),
    retry: () => void page.refetch(),
  };
}

export function useEverywherePosts(raw: string, enabled = true) {
  const query = useSettledQuery(raw);
  const online = useOnline();
  const page = useInfiniteQuery({
    queryKey: globalSearchKey('posts', query ?? ''),
    enabled: enabled && query !== null,
    staleTime: STALE_TIME,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) => searchEverywherePosts({ ...apiDeps, query: query ?? '', cursor: pageParam, signal }).then(unwrap),
    getNextPageParam: (last: PostSearchResults) => last.nextCursor ?? undefined,
  });
  const posts = useMemo(() => (page.data?.pages ?? []).flatMap((p) => p.posts), [page.data]);
  return {
    query,
    posts,
    state: searchStateOf({ query: enabled ? query : null, isPending: page.isPending, isError: page.isError, online }),
    hasMore: page.hasNextPage,
    busy: page.isFetchingNextPage,
    more: () => void page.fetchNextPage(),
    retry: () => void page.refetch(),
  };
}

export function useEverywherePeople(raw: string, enabled = true) {
  const query = useSettledQuery(raw);
  const online = useOnline();
  const result = useQuery({
    queryKey: ['global-search', 'people', query?.toLocaleLowerCase() ?? ''],
    enabled: enabled && query !== null,
    staleTime: STALE_TIME,
    queryFn: async () => unwrap(await searchUsers(apiDeps, query ?? '')),
  });
  return {
    query,
    people: result.data ?? [],
    state: searchStateOf({ query: enabled ? query : null, isPending: result.isPending, isError: result.isError, online }),
    retry: () => void result.refetch(),
  };
}
