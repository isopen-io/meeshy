import * as socialEndpoints from '@meeshy/shared/api/endpoints/social';

import { holdViewerPoints } from '@/lib/feed/viewer-points';

import { COMMUNITY_POSTS_QUERY_ROOT } from './card-caches';
import { unwrap } from './client';
import type { DataSource } from './config';
import {
  CANVAS_CAPS_HEADERS,
  flattenFeedPages,
  nextFeedCursor,
  type FeedPage,
  type FeedPageParam,
  type FeedPagination,
  type FeedPost,
} from './feed-pages';
import type { ApiResult, HttpTransport } from './http';

/**
 * **LE PORT DES PUBLICATIONS D'UNE COMMUNAUTÉ** (#6379) —
 * `GET social.posts?scope=community&communityId=<id>`
 * (`services/gateway/src/routes/posts/feed.ts`, lecture
 * `services/posts/communityFeed.ts`). Jumeau d'`author-posts.ts` : même
 * curseur OPAQUE (keyset `createdAt + id`), même garde « zéro progrès ».
 *
 * **CE QUE LA PASSERELLE SERT** : rien pour une communauté désactivée ou
 * privée dont le lecteur n'est pas membre ; les publications PUBLIC à un
 * non-membre d'une publique ; PUBLIC et COMMUNITY à un membre ou au créateur ;
 * jamais l'auteur qu'un blocage sépare du lecteur. Une liste vide n'est donc
 * pas un défaut de ce port.
 *
 * **LA RACINE VIT AU REGISTRE DES CARTES** (`card-caches.ts`) : un cœur, un
 * signet, une suppression ou une traduction livrée en direct atteint cette
 * caisse comme celle du Flux.
 */

export type CommunityPostsDeps = { readonly source: DataSource; readonly transport: HttpTransport };

export const COMMUNITY_POSTS_PAGE_SIZE = 20;

export const COMMUNITY_POSTS_STALE_TIME = 60_000;

export const communityPostsQueryKey = (communityId: string) => [...COMMUNITY_POSTS_QUERY_ROOT, communityId] as const;

const paginationOf = (raw: unknown): FeedPagination => {
  const wire = (raw ?? {}) as { readonly limit?: unknown; readonly hasMore?: unknown; readonly nextCursor?: unknown };
  return {
    limit: typeof wire.limit === 'number' ? wire.limit : COMMUNITY_POSTS_PAGE_SIZE,
    hasMore: wire.hasMore === true,
    nextCursor: typeof wire.nextCursor === 'string' && wire.nextCursor !== '' ? wire.nextCursor : null,
  };
};

export async function loadCommunityPosts(
  params: CommunityPostsDeps & { readonly communityId: string; readonly cursor?: string; readonly signal?: AbortSignal },
): Promise<ApiResult<FeedPage>> {
  if (__FIXTURES__ && params.source === 'fixtures') {
    const { fixtureCommunityPosts } = await import('./fixtures-communities');
    return { ok: true, data: await fixtureCommunityPosts(params.communityId, { ...(params.cursor !== undefined ? { cursor: params.cursor } : {}), limit: COMMUNITY_POSTS_PAGE_SIZE }) };
  }
  const query = new URLSearchParams({ scope: 'community', communityId: params.communityId, limit: String(COMMUNITY_POSTS_PAGE_SIZE) });
  if (params.cursor !== undefined) query.set('cursor', params.cursor);
  const result = await params.transport.request<readonly FeedPost[]>({
    method: 'GET',
    path: `${socialEndpoints.posts}?${query.toString()}`,
    headers: CANVAS_CAPS_HEADERS,
    ...(params.signal !== undefined ? { signal: params.signal } : {}),
  });
  if (!result.ok) return result;
  return { ok: true, data: { posts: result.data, pagination: paginationOf(result.pagination) } };
}

export function communityPostsInfiniteOptions(deps: CommunityPostsDeps & { readonly communityId: string }) {
  return {
    queryKey: communityPostsQueryKey(deps.communityId),
    structuralSharing: holdViewerPoints,
    staleTime: COMMUNITY_POSTS_STALE_TIME,
    initialPageParam: undefined as FeedPageParam,
    queryFn: ({ pageParam, signal }: { readonly pageParam: FeedPageParam; readonly signal: AbortSignal }) =>
      loadCommunityPosts({ ...deps, ...(pageParam === undefined ? {} : { cursor: pageParam }), signal }).then(unwrap),
    getNextPageParam: nextFeedCursor,
  };
}

export const flattenCommunityPosts = (data: { readonly pages: readonly FeedPage[] } | undefined): readonly FeedPost[] =>
  data === undefined ? [] : flattenFeedPages(data);
