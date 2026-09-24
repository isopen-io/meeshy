import type { FeedPost } from '@/lib/api/feed-pages';

/**
 * **LE FILTRE DU BANDEAU DE COMPTEURS** (#7083) — miroir de `ProfilePostsFilter`
 * (`apps/ios/Meeshy/Features/Main/Views/ProfileUserPostsList.swift:90-99`).
 *
 * Les tuiles « Postes » et « Réels » ne sont pas des étiquettes : elles
 * FILTRENT le listing, et re-toucher celle qui est active rétablit tout
 * (`toggled`). Un contrôle qui n'aurait pas cet effet serait un contrôle qui
 * ment (loi 4) — c'est pourquoi la loi vit ici, pure et mesurée, plutôt que
 * dans un `useState` de l'écran.
 *
 * **« Stories » N'EN EST PAS**, et c'est la même loi qui le dit : la liste
 * servie par `scope=author` porte `type: { in: [POST, REEL] }`
 * (`PostFeedService.ts:871`) — jamais une story. Une tuile « Stories » tapable
 * n'aurait donc rien à filtrer, et la v3.1 n'a pas d'écran « stories
 * d'autrui » où l'envoyer : elle informe, elle n'est pas un bouton.
 */

export const PROFILE_POSTS_FILTERS = ['all', 'posts', 'reels'] as const;
export type ProfilePostsFilter = (typeof PROFILE_POSTS_FILTERS)[number];

/** Les deux tuiles TAPABLES du bandeau — l'union est plus étroite que celle du
 * filtre, parce que « tout » ne se touche pas : il se RÉTABLIT. */
export type ProfilePostsFilterTap = 'posts' | 'reels';

export const toggledFilter = (current: ProfilePostsFilter, tapped: ProfilePostsFilterTap): ProfilePostsFilter =>
  current === tapped ? 'all' : tapped;

/** `type` est une union OUVERTE côté serveur (`PostType`, `schema.prisma`) ;
 * ce client ne distingue que `REEL` du reste, exactement comme
 * `lib/feed/card-model.ts`. */
const isReel = (post: FeedPost): boolean => post.type === 'REEL';

export const filterPosts = (posts: readonly FeedPost[], filter: ProfilePostsFilter): readonly FeedPost[] => {
  if (filter === 'all') return posts;
  return posts.filter((post) => (filter === 'reels' ? isReel(post) : !isReel(post)));
};

/**
 * **UNE ABSENCE NE S'AFFIRME QUE QUAND PLUS RIEN N'EST À LIRE** (revue #7083) —
 * miroir EXACT de `filteredEmptyState` (`ProfileUserPostsList.swift:497-510`) :
 * `if !viewModel.hasMore { … }`, et le doc-comment iOS en donne la raison.
 *
 * Le filtre est CLIENT, sur les pages DÉJÀ lues ; la tuile qui l'arme annonce
 * un compte SERVEUR. Tant qu'une page reste à lire, « Aucun réel » est une
 * affirmation que la tuile voisine — « 2 Réels » — et le bouton d'en dessous
 * — « Charger plus » — démentent dans la MÊME image. Le geste qui trouverait
 * les réels était alors présenté comme l'alternative à une phrase jurant qu'il
 * n'y en a pas.
 *
 * **Le vide du COMPTE, lui, se dit tout de suite** : `filter === 'all'` et zéro
 * ligne servie, c'est la réponse de la passerelle, pas un artefact de filtre —
 * et le premier jet la peignait déjà ainsi.
 *
 * Deux booléens et une longueur : la loi vit ici, pure, parce que c'est la
 * COEXISTENCE de deux branches disjointes du rendu (`models.length === 0` d'un
 * côté, `hasNextPage` de l'autre) qui produisait le défaut — un gate qui
 * mesure chaque branche séparément ne la voit jamais.
 */
export const showsEmptyState = (params: {
  readonly visible: number;
  readonly filter: ProfilePostsFilter;
  readonly hasNextPage: boolean;
}): boolean => params.visible === 0 && (params.filter === 'all' || !params.hasNextPage);
