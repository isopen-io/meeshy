import type { FeedInfiniteData, FeedPost } from '@/lib/api/feed-pages';

/**
 * LES GESTES DU FIL, CÔTÉ CACHE (#6278) — PURS : `applyPostToggle` rend le
 * cache paginé du fil (`FEED_QUERY_KEY`) avec UN post basculé, et rien
 * d'autre. L'écriture optimiste, le rollback ET la réconciliation temps réel
 * passent tous par cette fonction : il n'existe qu'une façon de dire
 * « ce post est aimé ».
 *
 * LE COMPTE NE BOUGE QUE SI L'ÉTAT BASCULE — un double tap, ou une
 * confirmation qui arrive après un optimiste déjà posé, ne compte jamais deux
 * fois. Et un post servi sur DEUX pages (curseur qui chevauche) bascule
 * partout : `flattenFeedPages` garde la PREMIÈRE occurrence, qui ne doit pas
 * être la seule restée ancienne.
 */
export type PostToggleKind = 'like' | 'bookmark';

export type PostToggle = { readonly postId: string; readonly kind: PostToggleKind; readonly on: boolean };

const shifted = (count: number | null | undefined, on: boolean): number => {
  const current = typeof count === 'number' && Number.isFinite(count) ? count : 0;
  return Math.max(0, current + (on ? 1 : -1));
};

export function togglePost(post: FeedPost, change: PostToggle): FeedPost {
  if (post.id !== change.postId) return post;
  if (change.kind === 'like') {
    if ((post.isLikedByMe === true) === change.on) return post;
    return { ...post, isLikedByMe: change.on, likeCount: shifted(post.likeCount, change.on) };
  }
  if ((post.isBookmarkedByMe === true) === change.on) return post;
  return { ...post, isBookmarkedByMe: change.on, bookmarkCount: shifted(post.bookmarkCount, change.on) };
}

function mapPosts(data: FeedInfiniteData | undefined, update: (post: FeedPost) => FeedPost): FeedInfiniteData | undefined {
  if (data === undefined) return data;
  const pages = data.pages.map((page) => {
    const posts = page.posts.map(update);
    return posts.every((p, i) => p === page.posts[i]) ? page : { ...page, posts };
  });
  return pages.every((page, i) => page === data.pages[i]) ? data : { ...data, pages };
}

export function applyPostToggle(data: FeedInfiniteData | undefined, change: PostToggle): FeedInfiniteData | undefined {
  return mapPosts(data, (post) => togglePost(post, change));
}

/** LE COMPTE ABSOLU SERVI remplace l'estimation optimiste — la passerelle le
 * rend sur `POST|DELETE /posts/:id/bookmark` et le diffuse sur `post:liked` /
 * `post:unliked` / `post:bookmarked` : un compte servi fait foi, un ±1 local
 * n'est qu'une avance. */
const SERVED_COUNT_FIELD = { like: 'likeCount', bookmark: 'bookmarkCount', share: 'shareCount' } as const;

export type ServedCount = { readonly postId: string; readonly kind: PostToggleKind | 'share'; readonly count: number };

export function withServedCount(post: FeedPost, served: ServedCount): FeedPost {
  const field = SERVED_COUNT_FIELD[served.kind];
  return post.id !== served.postId || post[field] === served.count ? post : { ...post, [field]: served.count };
}

export function applyServedCount(data: FeedInfiniteData | undefined, served: ServedCount): FeedInfiniteData | undefined {
  return mapPosts(data, (post) => withServedCount(post, served));
}
