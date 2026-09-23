import type { PrismaClient, PostType } from '@meeshy/shared/prisma/client';
import { NOT_DELETED } from './softDelete';
import { isEphemeralPostType } from './postVisibility';
import { withAudienceListFor, type ServedAudienceList } from './audienceList';

/**
 * L'ÉTAT DU LECTEUR sur une page de publications — la SEULE fonction qui le
 * pose sur une LISTE (#7396).
 *
 * `isLikedByMe` / `currentUserReactions` / `isBookmarkedByMe` /
 * `isRepostedByMe` ne décrivent pas la publication : ils décrivent la relation
 * du LECTEUR à la publication. Ils n'ont de sens que servis ENSEMBLE — un
 * client qui en reçoit un et pas les autres décode les absents en `false`
 * (SDK : `isBookmarkedByMe ?? false`) et affiche « pas en favori » d'une
 * publication qui l'est, ou envoie `POST` sur un cœur déjà allumé (409).
 *
 * Cette fonction existe parce que la RECOPIE a produit la divergence, deux
 * fois : le 2026-08-25, sur six méthodes servant des publications, seule
 * `getFeed` posait les trois flags ; le 2026-09-21, la page d'un hashtag n'en
 * posait aucun (#7396), et la liste d'un auteur lue sans compte oubliait
 * `isLikedByMe`. Toute lecture qui sert une liste de publications passe par
 * ici ; aucune ne réécrit les requêtes.
 *
 * ## Coût : TROIS requêtes GROUPÉES par page, jamais une par publication
 *
 * Réactions, favoris et republications du lecteur sont lus chacun par UN
 * `findMany … { in: ids }` sur la page entière, en parallèle. Sans lecteur (ou
 * page vide), AUCUNE requête : les quatre clés partent à faux.
 *
 * ## Ce qui part À CÔTÉ
 *
 * Chaque requête est filtrée par `userId`/`authorId` = le LECTEUR : les
 * réactions, favoris et republications des AUTRES ne sont jamais lus, donc
 * jamais servis. La fonction n'ajoute que les quatre clés ci-dessous.
 *
 * Elle en RETIRE une : la liste d'audience (`visibilityUserIds`), que la page
 * charge pour toutes ses publications et qui ne part qu'à leur AUTEUR (#7407,
 * `audienceList.ts`). C'est ici qu'elle se projette parce que c'est le seul
 * point où une liste connaît à la fois sa page et son lecteur ; sans lecteur,
 * elle ne part pour personne. Une lecture dont le résultat ROUTE encore une
 * diffusion ne doit donc pas passer par ici telle quelle : `getPostById` nourrit
 * la relecture d'une création (`routes/posts/core.ts`, `onDuplicate` →
 * `runPublicationEffects`), qui adresse la diffusion avec cette liste.
 *
 * ## Republication simple → l'état sur l'ORIGINAL
 *
 * `isLikedByMe`/`currentUserReactions` d'un repost `isQuote:false` reflètent
 * l'état du lecteur sur la RACINE (`originalRepostOfId ?? repostOfId`) — un
 * repost simple n'a pas de vie sociale propre (chantier reposts cohérents &
 * watermark, tâche 9, même règle que `PostService.getPostById`). Une citation
 * garde son propre état. Deux reposts du même original convergent sur la même
 * racine, donc montrent la même réaction — l'invariant d'idempotence de
 * l'écriture (like/unlike). EXCLUSION ÉPHÉMÈRE : quand `repostOf.type` est
 * STORY/STATUS, le repost garde SA PROPRE réaction — sinon lecture (ce flag)
 * et écriture (like/unlike posés sur le repost lui-même) divergeraient.
 * Favori et `isRepostedByMe` restent ceux de la publication AFFICHÉE.
 *
 * `isLikedByMe` dérive de la table `PostReaction`, jamais du Json legacy
 * `post.reactions` (jamais mis à jour par le chemin socket : `isLikedByMe`
 * était faux après un like socket, et iOS lit `isLiked = isLikedByMe`).
 */
export type ViewerPostState = {
  readonly isLikedByMe: boolean;
  readonly currentUserReactions: string[];
  readonly isBookmarkedByMe: boolean;
  readonly isRepostedByMe: boolean;
};

export type ViewerStateSubject = {
  readonly id: string;
  readonly authorId?: string | null;
  readonly isQuote?: boolean | null;
  readonly repostOfId?: string | null;
  readonly originalRepostOfId?: string | null;
  readonly repostOf?: { readonly type?: string | null } | null;
};

type ViewerStatePrisma = Pick<PrismaClient, 'postReaction' | 'postBookmark' | 'post'>;

/** `isLikedByMe` se lit sur les réactions du lecteur — la même règle pour toute publication servie. */
export const likedFromReactions = (reactions: readonly string[]): boolean => reactions.length > 0;

export type ViewerServedPost<T> = ServedAudienceList<T> & ViewerPostState;

const withoutViewer = <T extends ViewerStateSubject>(post: T): ViewerServedPost<T> => ({
  ...withAudienceListFor(post, undefined),
  isLikedByMe: false,
  currentUserReactions: [],
  isBookmarkedByMe: false,
  isRepostedByMe: false,
});

function reactionTargetId(post: ViewerStateSubject): string {
  const repostRootIsEphemeral = post.repostOf?.type != null && isEphemeralPostType(post.repostOf.type as PostType);
  const isSimpleRepost = !post.isQuote && Boolean(post.repostOfId) && !repostRootIsEphemeral;
  return isSimpleRepost ? (post.originalRepostOfId ?? post.repostOfId!) : post.id;
}

export async function withViewerPostState<T extends ViewerStateSubject>(
  prisma: ViewerStatePrisma,
  viewerUserId: string | undefined,
  posts: readonly T[],
): Promise<Array<ViewerServedPost<T>>> {
  if (!viewerUserId || posts.length === 0) return posts.map(withoutViewer);

  const postIds = posts.map((post) => post.id);
  const targetIds = [...new Set(posts.map(reactionTargetId))];

  const [reactions, bookmarks, reposts] = await Promise.all([
    prisma.postReaction.findMany({
      where: { userId: viewerUserId, postId: { in: targetIds } },
      select: { postId: true, emoji: true },
    }),
    prisma.postBookmark.findMany({
      where: { userId: viewerUserId, postId: { in: postIds } },
      select: { postId: true },
    }),
    prisma.post.findMany({
      where: { authorId: viewerUserId, repostOfId: { in: postIds }, deletedAt: NOT_DELETED },
      select: { repostOfId: true },
    }),
  ]);

  const emojisByTarget = reactions.reduce((byTarget, reaction) => {
    byTarget.set(reaction.postId, [...(byTarget.get(reaction.postId) ?? []), reaction.emoji]);
    return byTarget;
  }, new Map<string, string[]>());
  const bookmarkedIds = new Set(bookmarks.map((bookmark) => bookmark.postId));
  const repostedIds = new Set(reposts.flatMap((repost) => (repost.repostOfId ? [repost.repostOfId] : [])));

  return posts.map((post) => {
    const currentUserReactions = [...(emojisByTarget.get(reactionTargetId(post)) ?? [])];
    return {
      ...withAudienceListFor(post, viewerUserId),
      isLikedByMe: likedFromReactions(currentUserReactions),
      currentUserReactions,
      isBookmarkedByMe: bookmarkedIds.has(post.id),
      isRepostedByMe: repostedIds.has(post.id),
    };
  });
}
