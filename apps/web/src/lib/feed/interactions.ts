import type { FeedPost } from '@/lib/api/feed-pages';

/**
 * LES GESTES DU FIL, CÔTÉ CACHE (#6278) — PURS : `togglePost` rend UNE carte
 * basculée, et rien d'autre ; `mapCardPosts` la porte à travers les pages de
 * n'importe quelle caisse de cartes. L'écriture optimiste, le rollback ET la
 * réconciliation temps réel passent tous par ces deux fonctions : il n'existe
 * qu'une façon de dire « ce post est aimé ». D'OÙ on l'écrit — quelles
 * caisses — se lit dans le registre (`lib/api/card-caches.ts`, #7341).
 *
 * LE COMPTE NE BOUGE QUE SI L'ÉTAT BASCULE — un double tap, ou une
 * confirmation qui arrive après un optimiste déjà posé, ne compte jamais deux
 * fois. Et un post servi sur DEUX pages (curseur qui chevauche) bascule
 * partout : `flattenFeedPages` garde la PREMIÈRE occurrence, qui ne doit pas
 * être la seule restée ancienne.
 */
export type PostToggleKind = 'like' | 'bookmark';

export type PostToggle = { readonly postId: string; readonly kind: PostToggleKind; readonly on: boolean };

/**
 * LA BORNE BASSE, SITE UNIQUE — un compteur servi à 0 puis réaffiché après un
 * retrait tardif ne passe JAMAIS à −1. C'est très exactement ce que la
 * duplication avait coûté à iOS avant l'extraction de `PostLikeMutation.swift`
 * (« `FeedViewModel` par un `+= isLiked ? 1 : -1` sans borne basse »), et c'est
 * pourquoi tout compteur de publication — aimes, enregistrements, commentaires
 * — passe par cette seule ligne plutôt que par sa propre addition.
 */
export const shiftedCount = (count: number | null | undefined, delta: 1 | -1): number => {
  const current = typeof count === 'number' && Number.isFinite(count) ? count : 0;
  return Math.max(0, current + delta);
};

const shifted = (count: number | null | undefined, on: boolean): number => shiftedCount(count, on ? 1 : -1);

export function togglePost(post: FeedPost, change: PostToggle): FeedPost {
  if (post.id !== change.postId) return post;
  if (change.kind === 'like') {
    if ((post.isLikedByMe === true) === change.on) return post;
    return { ...post, isLikedByMe: change.on, likeCount: shifted(post.likeCount, change.on) };
  }
  if ((post.isBookmarkedByMe === true) === change.on) return post;
  return { ...post, isBookmarkedByMe: change.on, bookmarkCount: shifted(post.bookmarkCount, change.on) };
}

/**
 * **LA FORME COMMUNE DES CAISSES DE CARTES** (#7341) — ce que le Flux, les
 * Réels, les enregistrées, un hashtag et un profil ont en commun : des pages
 * qui portent des `posts`. Le RESTE d'une page diffère (le hashtag pagine par
 * décalage, `nextCursor: number | null` ; les autres par curseur keyset,
 * `pagination`) et n'est jamais lu ici — il est RÉPANDU tel quel. Typer ces
 * lois sur `FeedInfiniteData` les aurait fait mentir sur deux caisses sur
 * cinq.
 */
export type CardPage = { readonly posts: readonly FeedPost[] };
export type CardPages = { readonly pages: readonly CardPage[] };

/**
 * LE PARCOURS UNIQUE DES PAGES D'UNE CAISSE DE CARTES. La MÊME référence
 * revient quand rien ne change — c'est ce qui permet au registre
 * (`lib/api/card-caches.ts`) de ne RÉÉCRIRE aucune caisse qui ne montre pas
 * la publication, et à l'écran de ne pas se repeindre (§ Zero Unnecessary
 * Re-render).
 */
export function mapCardPosts<T extends CardPages>(data: T | undefined, update: (post: FeedPost) => FeedPost): T | undefined {
  if (data === undefined) return data;
  const pages = data.pages.map((page) => {
    const posts = page.posts.map(update);
    return posts.every((p, i) => p === page.posts[i]) ? page : { ...page, posts };
  });
  return pages.every((page, i) => page === data.pages[i]) ? data : { ...data, pages };
}

/** RETIRER une carte de TOUTES les pages : un curseur qui chevauche peut
 * servir la même publication deux fois, et n'en ôter qu'une la ferait
 * réapparaître au premier aplatissement. Même référence si elle n'y est pas. */
export function dropCardPost<T extends CardPages>(data: T | undefined, postId: string): T | undefined {
  if (data === undefined) return data;
  const pages = data.pages.map((page) => {
    const posts = page.posts.filter((post) => post.id !== postId);
    return posts.length === page.posts.length ? page : { ...page, posts };
  });
  return pages.every((page, i) => page === data.pages[i]) ? data : { ...data, pages };
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

/**
 * LE COMPTEUR DE COMMENTAIRES (#7135) — écrire ou retirer un commentaire bouge
 * le compte de la PUBLICATION, et ce compte se lit sur plusieurs écrans : la
 * rangée de statistiques d'une carte du Flux, la même carte servie par un fil
 * de Réels, la fiche `/post/$post`, la pastille du rail d'une story. La règle
 * vit donc ICI, à côté de `togglePost`, et non dans le port des
 * commentaires : une règle recopiée diverge, et celle-ci avait déjà commencé à
 * le faire — seuls la fiche et le rail bougeaient, si bien qu'on supprimait son
 * commentaire et que la carte du fil gardait l'ancien chiffre.
 *
 * `mapCardPosts` n'opère que sur des pages EXISTANTES : une publication
 * qu'une racine n'a jamais servie n'y apparaît pas.
 */
export type CommentCountDelta = { readonly postId: string; readonly delta: 1 | -1 };

export function withCommentCount(post: FeedPost, change: CommentCountDelta): FeedPost {
  if (post.id !== change.postId) return post;
  return { ...post, commentCount: shiftedCount(post.commentCount, change.delta) };
}

/**
 * LE REPARTAGE, CÔTÉ CACHE (#6484) — APPEND-ONLY côté geste utilisateur, comme
 * iOS (`ReelsViewModel.repostedIds`, commentaire « pas d'un-repost ») : rien
 * dans ce module n'offre de retirer un repost posé. `unmarkReposted` existe
 * quand même, pour UNE seule raison — le ROLLBACK d'un optimiste que la
 * passerelle a refusé (`performRepost`, `lib/api/publication-repost.ts`) :
 * ce n'est pas « défaire un repost », c'est corriger une supposition locale
 * qui ne s'est jamais produite côté serveur.
 *
 * `postId !== ...` n'est PAS testé ici, à la différence de `withCommentCount` —
 * ces deux fonctions ne reçoivent que la carte DÉJÀ appariée (`updateCardPost`
 * filtre par id avant d'appeler `apply`), et une seconde garde y serait morte.
 */
export function markReposted(post: FeedPost): FeedPost {
  if (post.isRepostedByMe === true) return post;
  return { ...post, isRepostedByMe: true, repostCount: shiftedCount(post.repostCount, 1) };
}

export function unmarkReposted(post: FeedPost): FeedPost {
  if (post.isRepostedByMe !== true) return post;
  return { ...post, isRepostedByMe: false, repostCount: shiftedCount(post.repostCount, -1) };
}
