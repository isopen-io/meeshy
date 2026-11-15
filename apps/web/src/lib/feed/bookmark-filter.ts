import type { FeedPost } from '@/lib/api/feed-pages';

/**
 * **LA FACETTE DE L'ÉCRAN DES ENREGISTRÉES** (#7286) — miroir exact de
 * `BookmarksView.BookmarkFilter` (`BookmarksView.swift`).
 *
 * `scope=bookmarks` ne filtre pas par type : un réel enregistré revient dans
 * la même page qu'un post. iOS offre donc trois facettes — et ne MONTRE le
 * sélecteur que si la liste porte bien les deux natures, parce que
 * « proposer « Réels » sur une liste sans réel n'offre qu'un moyen de vider
 * l'écran » (son doc-comment, mot pour mot).
 *
 * La règle vit ici, en fonctions PURES, plutôt que dans le JSX de l'écran :
 * c'est elle qu'on exerce, et c'est ce qui évite qu'une seconde surface
 * (Réels, profil) la réécrive de travers. `type === 'REEL'` est la SEULE
 * distinction que le client fait sur le type d'une publication
 * (`lib/reels/thread.ts`, `lib/profile/posts-filter.ts`) — elle est reprise
 * telle quelle, jamais redécidée.
 */

export const BOOKMARK_FILTERS = ['all', 'posts', 'reels'] as const;

export type BookmarkFilter = (typeof BOOKMARK_FILTERS)[number];

const isReel = (post: FeedPost): boolean => post.type === 'REEL';

export function visibleBookmarks(posts: readonly FeedPost[], filter: BookmarkFilter): readonly FeedPost[] {
  if (filter === 'all') return posts;
  return posts.filter((post) => (filter === 'reels' ? isReel(post) : !isReel(post)));
}

/** iOS : `viewModel.posts.contains(where: \.isReel) && viewModel.posts.contains(where: { !$0.isReel })`. */
export function offersBookmarkFilter(posts: readonly FeedPost[]): boolean {
  return posts.some(isReel) && posts.some((post) => !isReel(post));
}

/**
 * La facette APPLIQUÉE : celle choisie tant que le sélecteur est offert,
 * « Tout » sinon. Retirer le dernier réel pendant que « Réels » est choisi
 * éteint le sélecteur — garder la facette viderait l'écran sans laisser
 * aucun moyen d'en sortir.
 */
export function effectiveBookmarkFilter(posts: readonly FeedPost[], filter: BookmarkFilter): BookmarkFilter {
  return offersBookmarkFilter(posts) ? filter : 'all';
}
