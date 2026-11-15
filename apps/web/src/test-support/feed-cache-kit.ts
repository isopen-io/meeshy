import { QueryClient, type QueryKey } from '@tanstack/react-query';

import type { ApiResult, HttpRequest, HttpTransport } from '@/lib/api/http';
import type { DataSource } from '@/lib/api/config';
import type { FeedInfiniteData, FeedPost } from '@/lib/api/feed-pages';

/**
 * LE PETIT OUTILLAGE DES TÉMOINS DU FIL (#6278 c) — extrait de
 * `publication-repost.test.ts` pour que `feed-post-card-repost.test.tsx` le
 * PARTAGE plutôt que de le recopier (CLAUDE.md, motif déjà payé trois fois
 * par les résolveurs du Prisme divergés sur trois clients). Sans ambition
 * au-delà : un `QueryClient` réel semé d'une page, un transport dont la
 * réponse peut être DIFFÉRÉE (pour observer l'optimiste AVANT la résolution),
 * et le couple de dépendances `gateway` que les ports du fil attendent.
 */

export const pageOf = (posts: readonly FeedPost[]): FeedInfiniteData => ({
  pages: [{ posts, pagination: { limit: 20, hasMore: false, nextCursor: null } }],
  pageParams: [undefined],
});

export const seededOn = (queryKey: QueryKey, posts: readonly FeedPost[]): QueryClient => {
  const queryClient = new QueryClient();
  queryClient.setQueryData(queryKey, pageOf(posts));
  return queryClient;
};

export const cachedOn = (queryClient: QueryClient, queryKey: QueryKey, id = 'p1'): FeedPost | undefined =>
  queryClient.getQueryData<FeedInfiniteData>(queryKey)?.pages[0]?.posts.find((p) => p.id === id);

export const scripted = (
  respond: (req: HttpRequest) => Promise<ApiResult<unknown>>,
): { readonly requests: HttpRequest[]; readonly transport: HttpTransport } => {
  const requests: HttpRequest[] = [];
  const transport = {
    request: (req: HttpRequest) => {
      requests.push(req);
      return respond(req);
    },
  } as unknown as HttpTransport;
  return { requests, transport };
};

export type GatewayDeps = { readonly source: DataSource; readonly transport: HttpTransport; readonly queryClient: QueryClient };

export const gatewayDeps = (queryClient: QueryClient, transport: HttpTransport): GatewayDeps => ({
  source: 'gateway',
  transport,
  queryClient,
});
