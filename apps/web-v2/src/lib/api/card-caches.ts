import type { QueryClient, QueryKey } from '@tanstack/react-query';

import { dropCardPost, mapCardPosts, type CardPages } from '@/lib/feed/interactions';

import { BOOKMARKS_QUERY_KEY } from './bookmarked-posts';
import { FEED_QUERY_KEY } from './feed';
import type { FeedPost } from './feed-pages';
import { postQueryKey } from './publication-detail';
/* `./reels-query-key`, jamais `./reels` : ce module est atteint par le chunk
 * `realtime` (via `feed-realtime.ts` et `publication-comments.ts`) — voir le
 * doc-comment de `reels-query-key.ts`. */
import { REELS_QUERY_ROOT } from './reels-query-key';

/**
 * **LE REGISTRE DES CAISSES QUI PEIGNENT UNE CARTE DE PUBLICATION** (#7341).
 *
 * Six écrans montent la MÊME carte (`FeedPostCard`), et chacun la peint depuis
 * SA caisse : le Flux, les Réels, les enregistrées, la page d'un hashtag, les
 * publications d'un profil, et la fiche `/post/$post`. Tout ce qui change une
 * carte — un cœur, un signet, un compteur, une modification, une suppression,
 * une traduction livrée en direct — doit atteindre CHACUNE de ces caisses, sans quoi l'écran qui lit la caisse
 * oubliée montre un contrôle inerte : la requête part, la carte ne bouge pas.
 *
 * La liste vivait RECOPIÉE à trois sites (`feed-gestures.ts#setOn`,
 * `feed-realtime.ts#applyToPostCaches`, `publication-comments.ts`), et chaque
 * recopie avait sa propre longueur : le hashtag et le profil n'étaient dans
 * aucune, les enregistrées manquaient aux compteurs de commentaires. Elle vit
 * ICI, et ces sites la LISENT — un écran qui peint une carte depuis une caisse
 * absente de cette liste est un défaut de CE fichier, pas de ses appelants.
 *
 * **HASHTAG ET PROFIL DÉCLARENT LEUR RACINE ICI**, pas dans leur port : ce
 * registre est atteint par le chunk `realtime` et par le geste, et y tirer
 * `hashtag-posts.ts` ou `author-posts.ts` y porterait leur code réseau. Les
 * ports construisent leur clé DEPUIS ces racines, donc elles ne peuvent pas
 * diverger (même raison de poids que `reels-query-key.ts`).
 */
export const HASHTAG_QUERY_ROOT = ['hashtag'] as const;
export const AUTHOR_POSTS_QUERY_ROOT = ['author-posts'] as const;

type CardList = {
  readonly queryKey: QueryKey;
  /**
   * `exact` quand la racine est PARTAGÉE avec une requête qui ne tient pas de
   * cartes : `['feed', 'new-count']` est un ENTIER (`feed-new-count.ts`), et
   * TanStack compare les clés par préfixe. Sans cette borne, la première
   * écriture lèverait sur `data.pages`.
   */
  readonly exact: boolean;
  /**
   * **LE FIL DES RÉELS EST COMPOSÉ À L'OUVERTURE** (D-66) : son ordre est
   * gelé, il ne se relit ni au focus ni à la reconnexion. Il reçoit donc
   * l'état du LECTEUR, les compteurs et les retraits — exactement ce qu'iOS y
   * câble (`ReelsViewModel.swift:95-183` : `postLiked`, `postUnliked`,
   * `postBookmarked`, `postDeleted`) —, jamais une relecture ni un contenu
   * neuf (`postUpdated` n'y est pas câblé).
   *
   * Une TRADUCTION livrée en direct (#7383, #7382) n'est pas un contenu
   * neuf : elle sert au lecteur le MÊME texte dans sa langue, et ne touche
   * pas l'ordre du fil. Elle passe donc par `updateCardPost` (iOS la pose
   * dans toutes ses caisses, pager des Réels compris —
   * `FeedViewModel.swift`, `feedCache.patchEverywhere`).
   */
  readonly frozen: boolean;
};

const CARD_LISTS: readonly CardList[] = [
  { queryKey: FEED_QUERY_KEY, exact: true, frozen: false },
  { queryKey: REELS_QUERY_ROOT, exact: false, frozen: true },
  { queryKey: BOOKMARKS_QUERY_KEY, exact: true, frozen: false },
  { queryKey: HASHTAG_QUERY_ROOT, exact: false, frozen: false },
  { queryKey: AUTHOR_POSTS_QUERY_ROOT, exact: false, frozen: false },
];

const UNFROZEN_LISTS = CARD_LISTS.filter((list) => !list.frozen);

const filtersOf = (list: CardList) => ({ queryKey: list.queryKey, exact: list.exact });

/**
 * **UNE CAISSE QUE LA LOI NE CHANGE PAS N'EST PAS RÉÉCRITE.** Réécrire une
 * donnée IDENTIQUE n'est pas neutre chez TanStack : `setQueryData` pose
 * `isInvalidated: false` et une date neuve (`successState`, query-core). Une
 * caisse qu'un écho venait de rendre PÉRIMÉE — les enregistrées après un
 * `post:bookmarked` — redevenait fraîche au premier geste posé sur une AUTRE
 * publication, et son écran s'ouvrait sans relire. Rendre `undefined` à
 * l'updater est le « rien à écrire » de TanStack.
 */
const unlessSame =
  <T>(update: (data: T | undefined) => T | undefined) =>
  (data: T | undefined): T | undefined => {
    const next = update(data);
    return next === data ? undefined : next;
  };

export function writeCardCache<T>(queryClient: QueryClient, queryKey: QueryKey, update: (data: T | undefined) => T | undefined): void {
  queryClient.setQueryData<T>(queryKey, unlessSame(update));
}

const writeLists = (queryClient: QueryClient, lists: readonly CardList[], update: (data: CardPages | undefined) => CardPages | undefined): void => {
  lists.forEach((list) => queryClient.setQueriesData<CardPages>(filtersOf(list), unlessSame(update)));
};

const cardsOf = (queryClient: QueryClient, lists: readonly CardList[]) =>
  lists.flatMap((list) => queryClient.getQueriesData<CardPages>(filtersOf(list)));

const cardIn = (data: CardPages | undefined, postId: string): FeedPost | undefined =>
  data?.pages.flatMap((page) => page.posts).find((post) => post.id === postId);

const holds = (data: CardPages | undefined, postId: string): boolean => cardIn(data, postId) !== undefined;

/** Une carte TROUVÉE, et la date à laquelle sa caisse l'a reçue. */
export type CachedCard = { readonly post: FeedPost; readonly updatedAt: number };

const datedIn = (queryClient: QueryClient, queryKey: QueryKey, post: FeedPost | undefined): readonly CachedCard[] =>
  post === undefined ? [] : [{ post, updatedAt: queryClient.getQueryState(queryKey)?.dataUpdatedAt ?? 0 }];

/**
 * LA CARTE TELLE QU'UN ÉCRAN LA MONTRE, ET SA DATE — la SEULE recherche d'une
 * carte à travers les caisses. Une publication peut n'être peinte QUE par un
 * écran : enregistrée il y a trois jours (#7286), trouvée sous un hashtag,
 * ouverte sur un profil. N'y lire qu'une caisse déduisait « pas aimée » et
 * envoyait `POST` sur le geste qui voulait RETIRER (#7341), et ouvrait la
 * fiche sur un squelette alors que l'écran précédent AFFICHAIT la carte
 * (#7384). La fiche vient en dernier : un lien DIRECT n'a rempli qu'elle.
 *
 * La DATE est celle de la caisse qui a FOURNI la carte : un écran qui s'en
 * amorce la déclare comme la sienne (`initialDataUpdatedAt`), et sa règle de
 * fraîcheur juge alors l'âge réel de la donnée, pas l'instant de l'ouverture.
 */
export function findCachedCard(queryClient: QueryClient, postId: string): CachedCard | undefined {
  const detailKey = postQueryKey(postId);
  const [listed] = cardsOf(queryClient, CARD_LISTS).flatMap(([queryKey, data]) => datedIn(queryClient, queryKey, cardIn(data, postId)));
  return listed ?? datedIn(queryClient, detailKey, queryClient.getQueryData<FeedPost>(detailKey))[0];
}

/** L'état « AVANT » d'un geste — la carte seule, sans sa date. */
export function findCardPost(queryClient: QueryClient, postId: string): FeedPost | undefined {
  return findCachedCard(queryClient, postId)?.post;
}

/**
 * **OUVRIR UNE PUBLICATION DÉJÀ PEINTE LA PEINT TOUT DE SUITE** (#7384) — ce
 * qu'un écran qui OUVRE une publication (la fiche `usePost`, la graine du
 * lecteur des Réels) répand dans sa requête `postQueryKey` : la carte de
 * N'IMPORTE QUELLE caisse du registre, datée de cette caisse. Sa requête naît
 * alors RÉUSSIE — jamais de squelette sur une carte que l'écran précédent
 * montrait — et sa règle de fraîcheur décide seule de la relecture en fond.
 *
 * Aucune caisse ne la porte (lien direct, notification d'une publication
 * jamais vue) : `undefined`, la requête naît en attente et le squelette est
 * juste. Rien n'est inventé.
 *
 * Les deux fonctions sont appelées par TanStack dans le MÊME tour synchrone
 * (`getDefaultState`), sur le même cache : elles trouvent la même carte.
 */
export function cachedCardSeed(queryClient: QueryClient, postId: string) {
  return {
    initialData: (): FeedPost | undefined => findCachedCard(queryClient, postId)?.post,
    initialDataUpdatedAt: (): number | undefined => findCachedCard(queryClient, postId)?.updatedAt,
  };
}

const writeCard = (queryClient: QueryClient, lists: readonly CardList[], postId: string, apply: (post: FeedPost) => FeedPost): void => {
  const update = (post: FeedPost) => (post.id === postId ? apply(post) : post);
  writeLists(queryClient, lists, (data) => mapCardPosts(data, update));
  writeCardCache<FeedPost>(queryClient, postQueryKey(postId), (post) => (post === undefined ? post : apply(post)));
};

/**
 * L'ÉTAT DU LECTEUR ET LES COMPTEURS — un cœur, un signet, un compte servi, un
 * commentaire, un partage. La loi ne reçoit que la carte VISÉE ; chaque caisse
 * qui la montre bascule UNE fois (la même publication ne peut pas porter deux
 * cœurs selon l'écran qui la montre), et celles qui ne la montrent pas restent
 * intactes.
 */
export function updateCardPost(queryClient: QueryClient, postId: string, apply: (post: FeedPost) => FeedPost): void {
  writeCard(queryClient, CARD_LISTS, postId, apply);
}

/** LE CONTENU que l'auteur a écrit (`post:updated`) — partout, sauf le fil
 * GELÉ des Réels (voir `frozen`). */
export function replaceCardContent(queryClient: QueryClient, postId: string, apply: (post: FeedPost) => FeedPost): void {
  writeCard(queryClient, UNFROZEN_LISTS, postId, apply);
}

/** LA CARTE QUITTE TOUS LES ÉCRANS (`post:deleted`), les Réels compris. */
export function removeCardPost(queryClient: QueryClient, postId: string): void {
  writeLists(queryClient, CARD_LISTS, (data) => dropCardPost(data, postId));
  queryClient.removeQueries({ queryKey: postQueryKey(postId) });
}

/**
 * LES CAISSES QUI MONTRENT LA CARTE SONT PÉRIMÉES (un 409 sur « aimer » : le
 * lecteur avait déjà réagi ailleurs) — celles-là seulement, et jamais le fil
 * GELÉ des Réels, que le retour en arrière a déjà remis.
 */
export function invalidateCardPost(queryClient: QueryClient, postId: string): void {
  cardsOf(queryClient, UNFROZEN_LISTS)
    .filter(([, data]) => holds(data, postId))
    .forEach(([queryKey]) => void queryClient.invalidateQueries({ queryKey, exact: true }));
  void queryClient.invalidateQueries({ queryKey: postQueryKey(postId) });
}
