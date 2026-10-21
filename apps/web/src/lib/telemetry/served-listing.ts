import type { ListingContext, RankingSource } from '@/lib/api/social-events-v2-types';

/**
 * **LE LISTING SERVI** (#10501, décision § 3) — `meta.feedRequestId` (opaque,
 * relie l'impression à la page servie et à la version du classement) et la
 * source de classement, par item ou par page. Le client ne fabrique ni l'un
 * ni l'autre ; un serveur qui ne les sert pas laisse les posts intacts.
 */
export type ServedListing = { readonly feedRequestId?: string; readonly rankingSource?: RankingSource };

const RANKING_SOURCES: ReadonlySet<string> = new Set<RankingSource>([
  'following',
  'for_you',
  'trending',
  'nearby',
  'search',
  'hashtag',
  'sound',
  'profile',
  'bookmarks',
  'other',
]);

const OPAQUE_ID_MAX = 64;

const rankingOf = (value: unknown): RankingSource | undefined => {
  if (typeof value !== 'string') return undefined;
  return RANKING_SOURCES.has(value) ? (value as RankingSource) : 'other';
};

export function servedListingOf(meta: Readonly<Record<string, unknown>> | undefined, item: { readonly rankingSource?: unknown }): ServedListing {
  const requestId = meta?.feedRequestId;
  const feedRequestId = typeof requestId === 'string' && requestId.length > 0 && requestId.length <= OPAQUE_ID_MAX ? requestId : undefined;
  const rankingSource = rankingOf(item.rankingSource) ?? rankingOf(meta?.rankingSource);
  return {
    ...(feedRequestId === undefined ? {} : { feedRequestId }),
    ...(rankingSource === undefined ? {} : { rankingSource }),
  };
}

const says = (meta: Readonly<Record<string, unknown>> | undefined): boolean =>
  meta !== undefined && (meta.feedRequestId !== undefined || meta.rankingSource !== undefined);

/** Les posts d'une page, chacun avec son listing servi — les MÊMES posts si le serveur ne dit rien. */
export function withServedListing<P extends { readonly id: string; readonly rankingSource?: unknown }>(
  posts: readonly P[],
  meta: Readonly<Record<string, unknown>> | undefined,
): readonly (P & { readonly servedListing?: ServedListing })[] {
  if (!says(meta) && !posts.some((post) => post.rankingSource !== undefined)) return posts;
  return posts.map((post) => ({ ...post, servedListing: servedListingOf(meta, post) }));
}

export function listingAt(params: {
  readonly position: number;
  readonly served?: ServedListing | undefined;
  readonly fallbackSource: RankingSource;
  readonly listingSessionId?: string;
}): ListingContext {
  return {
    position: params.position,
    ...(params.served?.feedRequestId === undefined ? {} : { feedRequestId: params.served.feedRequestId }),
    rankingSource: params.served?.rankingSource ?? params.fallbackSource,
    ...(params.listingSessionId === undefined ? {} : { listingSessionId: params.listingSessionId }),
  };
}
