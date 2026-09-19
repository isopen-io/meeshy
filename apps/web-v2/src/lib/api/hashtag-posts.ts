import { unwrap } from './client';
import type { DataSource } from './config';
import { CANVAS_CAPS_HEADERS, type FeedPost } from './feed-pages';
import type { ApiResult, HttpTransport } from './http';

/**
 * **LE PORT D'UN HASHTAG** (#7032) — `GET /api/v1/social/posts?scope=hashtag&tag=<tag>`
 * (`services/gateway/src/routes/posts/feed.ts:239,840`, noyau partagé
 * `chargerPostsParHashtag`, `routes/posts/hashtag.ts`).
 *
 * L'union `scope=` est l'adresse NEUVE ; `GET /posts/hashtag/:tag` en est
 * l'alias DÉPRÉCIÉ (`depreciee(...)` posé sur sa route) — un client neuf ne
 * s'inscrit pas sur un alias en sursis (même arbitrage que `users-search.ts`).
 *
 * **LE CURSEUR EST UN ENTIER, pas une chaîne opaque.** `HashtagPostsQuerySchema`
 * déclare `cursor: z.coerce.number().int().min(0).default(0)` — c'est un
 * DÉCALAGE, contrairement au curseur keyset du fil personnalisé
 * (`feed-pages.ts`). Le lire comme opaque rendrait `cursor=[object Object]` et
 * une seconde page identique à la première.
 *
 * **LA VISIBILITÉ EST PLUS ÉTROITE QUE LE FIL**, et c'est une décision du
 * serveur, pas un manque : PUBLIC + COMMUNITY (co-membre) uniquement, jamais
 * FRIENDS-only, parce qu'un hashtag est une surface de DÉCOUVERTE. Un lecteur
 * peut donc voir moins de publications ici que dans son fil — ce n'est pas un
 * défaut de ce port.
 *
 * **UN HASHTAG INCONNU N'EST PAS UNE ERREUR** : le serveur rend une page VIDE
 * (`if (!hashtag) return { data: [], … }`). L'écran peint donc un état vide
 * nommé, jamais une panne.
 */

export type HashtagDeps = { readonly source: DataSource; readonly transport: HttpTransport };

export const HASHTAG_PAGE_SIZE = 20;

/** Normalise comme le serveur (`normalizeTag`) : sans `#`, en minuscules,
 * rogné — une seule forme de clé de cache pour `#Projet` et `#projet`. */
export const normalizeHashtag = (raw: string): string => raw.trim().toLowerCase().replace(/^#/, '');

export const hashtagQueryKey = (tag: string) => ['hashtag', normalizeHashtag(tag)] as const;

export type HashtagPage = { readonly posts: readonly FeedPost[]; readonly nextCursor: number | null };

type RawPagination = { readonly hasMore?: boolean; readonly nextCursor?: string | number | null };

export async function loadHashtagPage(
  params: HashtagDeps & { readonly tag: string; readonly cursor?: number; readonly signal?: AbortSignal },
): Promise<ApiResult<HashtagPage>> {
  const tag = normalizeHashtag(params.tag);
  const cursor = params.cursor ?? 0;
  if (__FIXTURES__ && params.source === 'fixtures') {
    const { fixtureHashtagPosts } = await import('./fixtures-rich-text');
    return { ok: true, data: fixtureHashtagPosts(tag, cursor, HASHTAG_PAGE_SIZE) };
  }
  const query = new URLSearchParams({
    scope: 'hashtag',
    tag,
    limit: String(HASHTAG_PAGE_SIZE),
    cursor: String(cursor),
  });
  const result = await params.transport.request<readonly FeedPost[]>({
    method: 'GET',
    path: `/api/v1/social/posts?${query.toString()}`,
    headers: CANVAS_CAPS_HEADERS,
    ...(params.signal !== undefined ? { signal: params.signal } : {}),
  });
  if (!result.ok) return result;
  const raw = result.pagination as unknown as RawPagination | undefined;
  const next = Number(raw?.nextCursor);
  return {
    ok: true,
    data: {
      posts: result.data,
      // Une page qui n'annonce PAS de suite, ou dont le curseur ne PROGRESSE
      // pas, s'arrête : la même garde « zéro progrès » que `nextFeedCursor`,
      // sans quoi une passerelle qui répète son décalage ferait tourner la
      // pagination sans fin.
      nextCursor: raw?.hasMore === true && Number.isFinite(next) && next > cursor ? next : null,
    },
  };
}

export const HASHTAG_STALE_TIME = 60_000;

export function hashtagInfiniteOptions(deps: HashtagDeps & { readonly tag: string }) {
  return {
    queryKey: hashtagQueryKey(deps.tag),
    staleTime: HASHTAG_STALE_TIME,
    initialPageParam: 0,
    queryFn: ({ pageParam, signal }: { readonly pageParam: number; readonly signal: AbortSignal }) =>
      loadHashtagPage({ ...deps, cursor: pageParam, signal }).then(unwrap),
    getNextPageParam: (lastPage: HashtagPage) => lastPage.nextCursor ?? undefined,
  };
}
