import { unwrap } from './client';
import type { DataSource } from './config';
import { CANVAS_CAPS_HEADERS, flattenFeedPages, nextFeedCursor, type FeedPage, type FeedPageParam, type FeedPost } from './feed-pages';
import type { ApiResult, HttpTransport } from './http';
import { reelsQueryKey } from './reels-query-key';

export { REELS_QUERY_ROOT, reelsQueryKey } from './reels-query-key';

/**
 * LE PORT DES RÉELS (#6457) — miroir de `PostService.getReels(seedReelId:)`
 * qu'appelle `ReelsViewModel.fetch(reset:)`, par la route UNIFIÉE :
 * `GET /api/v1/social/posts?scope=reels&limit=20[&seed=<reelId>][&cursor=<c>]`
 * (`services/gateway/src/routes/posts/feed.ts`, `chargerReels`).
 * `/posts/feed/reels` en est l'ALIAS DÉPRÉCIÉ (en-têtes `Deprecation`/`Link`) :
 * un client neuf n'adopte pas une adresse que la passerelle annonce en retrait,
 * et les deux lisent la MÊME fonction `chargerReels`.
 *
 * `seed` sème le fil d'AFFINITÉ du réel touché dans le Flux et en est EXCLU par
 * la passerelle (« le seed est déjà affiché par le client ») ; sans graine, le
 * fil « Pour toi ». Les réels du lecteur n'y figurent jamais. La page porte
 * `isLikedByMe`/`isBookmarkedByMe` : les gestes s'y peignent sans relecture.
 *
 * `source` résolue ICI, jamais dans l'écran : les fixtures passent par le MÊME
 * chemin (motif `feed.ts`).
 *
 * `REELS_QUERY_ROOT` / `reelsQueryKey` vivent dans `reels-query-key.ts` (une
 * raison de POIDS, pas de sens — voir son doc-comment) et sont RÉ-EXPORTÉS
 * ci-dessus pour que ce module en reste la référence de lecture.
 */

/** `limit: 20` — la valeur qu'iOS demande (`ReelsViewModel.fetch`). */
export const REELS_PAGE_SIZE = 20;

export type ReelsDeps = { readonly source: DataSource; readonly transport: HttpTransport };

type RawPagination = { readonly hasMore?: unknown; readonly nextCursor?: unknown };

/**
 * LA FRONTIÈRE DU RÉSEAU — la passerelle est une source NON FIABLE : un élément
 * sans identifiant, sans date, ou d'un autre type que `REEL` ne franchit pas ce
 * site. Même garde-fou qu'iOS (`FeedPost.reels(from:)`, « la réponse est déjà
 * `type: REEL`, on filtre par sécurité »), posé au seul endroit qui lit le fil.
 */
function servedReels(data: unknown): readonly FeedPost[] {
  if (!Array.isArray(data)) return [];
  return data.filter((item: unknown): item is FeedPost => {
    if (typeof item !== 'object' || item === null) return false;
    const candidate = item as { readonly id?: unknown; readonly type?: unknown; readonly createdAt?: unknown };
    return typeof candidate.id === 'string' && candidate.type === 'REEL' && typeof candidate.createdAt === 'string';
  });
}

function servedPagination(raw: unknown): FeedPage['pagination'] {
  const pagination = (typeof raw === 'object' && raw !== null ? raw : {}) as RawPagination;
  return {
    limit: REELS_PAGE_SIZE,
    hasMore: pagination.hasMore === true,
    nextCursor: typeof pagination.nextCursor === 'string' ? pagination.nextCursor : null,
  };
}

export async function loadReelsPage(
  params: ReelsDeps & { readonly seed?: string; readonly cursor?: FeedPageParam; readonly signal?: AbortSignal },
): Promise<ApiResult<FeedPage>> {
  if (__FIXTURES__ && params.source === 'fixtures') {
    const { REEL_POSTS, pageOfReels } = await import('./fixtures-reels');
    return {
      ok: true,
      data: pageOfReels(REEL_POSTS, {
        ...(params.seed !== undefined ? { seed: params.seed } : {}),
        ...(params.cursor !== undefined ? { cursor: params.cursor } : {}),
        limit: REELS_PAGE_SIZE,
      }),
    };
  }
  const query = new URLSearchParams({
    scope: 'reels',
    limit: String(REELS_PAGE_SIZE),
    ...(params.seed !== undefined ? { seed: params.seed } : {}),
    ...(params.cursor !== undefined ? { cursor: params.cursor } : {}),
  });
  const result = await params.transport.request<unknown>({
    method: 'GET',
    path: `/api/v1/social/posts?${query.toString()}`,
    // `X-Canvas-Caps: 3` (#6903) : sans lui, la passerelle omet la scène
    // d'un réel composé (table O17, `storyEffectsV3.ts:776-791`) — un réel
    // à média arriverait SANS son `storyEffects`.
    headers: CANVAS_CAPS_HEADERS,
    ...(params.signal !== undefined ? { signal: params.signal } : {}),
  });
  if (!result.ok) return result;
  return { ok: true, data: { posts: servedReels(result.data), pagination: servedPagination(result.pagination) } };
}

/** Spreadable dans `useInfiniteQuery`, SANS `select` — motif `feedInfiniteOptions`. */
export function reelsInfiniteOptions(deps: ReelsDeps, seed?: string) {
  return {
    queryKey: reelsQueryKey(seed),
    queryFn: async ({ pageParam, signal }: { readonly pageParam?: FeedPageParam; readonly signal?: AbortSignal }) =>
      unwrap(
        await loadReelsPage({
          ...deps,
          ...(seed !== undefined ? { seed } : {}),
          ...(pageParam !== undefined ? { cursor: pageParam } : {}),
          ...(signal !== undefined ? { signal } : {}),
        }),
      ),
    initialPageParam: undefined as FeedPageParam,
    getNextPageParam: nextFeedCursor,
  };
}

/** FABRIQUE — `{ queryKey, queryFn, select }`, exerçable sans DOM. */
export function reelsQuery(deps: ReelsDeps, seed?: string) {
  return { ...reelsInfiniteOptions(deps, seed), select: flattenFeedPages };
}
