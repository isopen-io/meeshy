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

/**
 * `media:caption-translation-updated` CÔTÉ CACHE (#6280) — LE FIL SUIT LE
 * PIPELINE ZMQ EN DIRECT, même motif que `applyServedCount` ci-dessus : une
 * fonction PURE, appliquée à `FEED_QUERY_KEY`. La charge porte UNE traduction
 * (`{ language, translation }`), jamais la carte entière — on la FUSIONNE
 * dans `captionTranslations` par langue, remplace l'existante, ajoute la
 * nouvelle, jamais un doublon après un second passage du pipeline (miroir
 * `mergeMessageTranslations`, `api/realtime-apply.ts`).
 *
 * `mediaId` est l'identité de fusion, pas `postId` : un média de COMMENTAIRE
 * (`commentId` présent sur l'événement) vit dans le même `PostMedia`, jamais
 * dans le cache du fil — cette fonction balaie `post.media` par id sans
 * jamais lire `commentId`, donc un événement dont le média n'est pas au fil
 * (commentaire, post non chargé) ne modifie rien, sans lever.
 */
export type MediaCaptionTranslationUpdate = {
  readonly mediaId: string;
  readonly language: string;
  readonly translation: {
    readonly text: string;
    readonly translationModel: string;
    readonly confidenceScore?: number;
    readonly createdAt: string;
  };
};

function withMediaCaptionTranslation(post: FeedPost, update: MediaCaptionTranslationUpdate): FeedPost {
  const media = post.media;
  if (media === null || media === undefined) return post;
  const index = media.findIndex((m) => m.id === update.mediaId);
  if (index === -1) return post;

  const existing = media[index]?.captionTranslations;
  const record =
    existing !== null && typeof existing === 'object' && !Array.isArray(existing)
      ? (existing as Record<string, unknown>)
      : {};
  const nextTranslations = { ...record, [update.language]: update.translation };
  const nextMedia = media.map((m, i) => (i === index ? { ...m, captionTranslations: nextTranslations } : m));
  return { ...post, media: nextMedia };
}

export function applyMediaCaptionTranslation(
  data: FeedInfiniteData | undefined,
  update: MediaCaptionTranslationUpdate,
): FeedInfiniteData | undefined {
  return mapPosts(data, (post) => withMediaCaptionTranslation(post, update));
}
