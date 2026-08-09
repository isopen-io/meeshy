/**
 * Post visibility ACL helper
 *
 * Shared between CommentReactionHandler and PostReactionHandler (and any future
 * handler that needs to gate access by post visibility).
 */

import { PrismaClient, PostVisibility } from '@meeshy/shared/prisma/client';
import { doUsersShareCommunity } from './communityVisibility';
import { doUsersShareDirectConversation } from './directContactVisibility';
import { NOT_DELETED } from './softDelete';

export type PostVisibilityRecord = {
  authorId: string;
  visibility: PostVisibility;
  visibilityUserIds: string[];
};

/**
 * Les seuls délégués Prisma qu'une décision d'ACL touche. `Pick` plutôt que
 * `PrismaClient` entier, pour la raison écrite dans `postAudience.ts` : un
 * appelant qui ne porte qu'une tranche du client doit pouvoir la passer sans
 * `as PrismaClient` — l'assertion sur un sous-type structurel est exactement ce
 * que ce dépôt refuse.
 */
export type PostAclPrisma = Pick<
  PrismaClient,
  'post' | 'postComment' | 'friendRequest' | 'communityMember' | 'participant'
>;

/**
 * G5 — canonical Prisma OR-filter for post visibility, the single source both
 * PostFeedService and PostService import (they used to carry private copies;
 * drift between them = documented leak/hole risk).
 *
 * `audienceIds` is the FRIENDS/EXCEPT audience and is intentionally a
 * parameter. Both call sites — `PostFeedService.buildVisibilityFilter` (feed)
 * and `PostService.buildVisibilityFilter` (single-post fetch + view recording)
 * — now pass friends ∪ DM-contacts, so what a viewer can SEE and what they can
 * be RECORDED as having viewed are one audience (story-sota §4 divergence
 * resolved: a DM-contact who can open a story now also registers as a viewer).
 *
 * ASYMÉTRIE VOLONTAIRE voir ⊇ interagir : ce filtre (ce qu'un viewer peut VOIR
 * / dont la vue est ENREGISTRÉE) admet friends ∪ DM-contacts, tandis que
 * l'audience d'INTERACTION (RÉAGIR / COMMENTER) reste amis stricts. Un
 * DM-contact peut donc ouvrir une story FRIENDS et compter comme viewer, mais
 * pas y réagir. C'est un choix produit (décision 2026-07-08) — les deux ne sont
 * PAS identiques ; ne pas « réaligner » l'un sur l'autre sans re-décider l'ACL
 * d'interaction.
 *
 * Les deux côtés de l'asymétrie ont chacun leur verdict unitaire en bas de
 * fichier — `canUserConsumePost` et `canUserInteractWithPost` — et c'est par
 * eux que passent les points d'entrée. Ce filtre ne sert qu'aux requêtes de
 * LISTE (feed, post unique) qui ne peuvent pas trancher post par post.
 *
 * Le côté CONSOMMATION a une troisième forme, pour juger un LOT de candidats
 * arbitraires en une requête bornée : `filterPostConsumers` (`postAudience.ts`),
 * qui garde les notifications de mention. Trois formes, une seule audience —
 * l'accord des deux formes unitaire/lot est verrouillé cas par cas dans
 * `__tests__/unit/services/posts/postAudienceConsumption.test.ts`.
 */
export function buildPostVisibilityOrFilter(
  viewerId: string,
  audienceIds: string[],
  communityCoMemberIds: string[] = []
) {
  return {
    OR: [
      { authorId: viewerId },
      { visibility: PostVisibility.PUBLIC },
      { visibility: PostVisibility.COMMUNITY, authorId: { in: communityCoMemberIds } },
      { visibility: PostVisibility.FRIENDS, authorId: { in: audienceIds } },
      { visibility: PostVisibility.EXCEPT, authorId: { in: audienceIds }, NOT: { visibilityUserIds: { has: viewerId } } },
      { visibility: PostVisibility.ONLY, visibilityUserIds: { has: viewerId } },
    ],
  };
}

/**
 * Checks whether `userId` is allowed to see `post` based on its visibility setting.
 *
 * PUBLIC    → everyone
 * COMMUNITY → author + members sharing at least one community with the author
 * FRIENDS   → post author + accepted friends of author
 * PRIVATE   → author only
 * ONLY      → userId must be in visibilityUserIds
 * EXCEPT    → userId must NOT be in visibilityUserIds, AND must be a friend
 *
 * `options.includeDirectContacts` élargit la seule branche FRIENDS/EXCEPT à
 * l'audience de CONSOMMATION du feed (amis ∪ contacts DM). C'est le paramètre
 * qui rend EXÉCUTABLE l'asymétrie « voir ⊇ interagir » documentée en tête de
 * fichier, au lieu de la laisser en prose : les deux verdicts nommés
 * ci-dessous (`canUserConsumePost` / `canUserInteractWithPost`) ne diffèrent
 * que par lui. Ne pas l'appeler directement depuis un point d'entrée — passer
 * par le verdict nommé d'après ce qu'il autorise.
 */
export async function canUserViewPost(
  prisma: PostAclPrisma,
  post: PostVisibilityRecord,
  userId: string,
  options: { includeDirectContacts?: boolean } = {}
): Promise<boolean> {
  if (post.authorId === userId) return true;

  switch (post.visibility) {
    case PostVisibility.PUBLIC:
      return true;

    case PostVisibility.PRIVATE:
      return false;

    case PostVisibility.ONLY:
      return post.visibilityUserIds.includes(userId);

    case PostVisibility.COMMUNITY:
      return doUsersShareCommunity(prisma, post.authorId, userId);

    case PostVisibility.FRIENDS:
    case PostVisibility.EXCEPT: {
      // EXCEPT exclut nommément AVANT toute lecture du graphe : un utilisateur
      // sur la liste noire est refusé quelle que soit la relation, donc
      // interroger l'amitié (puis les DM) ne changerait pas le verdict.
      if (post.visibility === PostVisibility.EXCEPT && post.visibilityUserIds.includes(userId)) {
        return false;
      }
      const friendship = await prisma.friendRequest.findFirst({
        where: {
          status: 'accepted',
          OR: [
            { senderId: post.authorId, receiverId: userId },
            { senderId: userId, receiverId: post.authorId },
          ],
        },
        select: { id: true },
      });
      if (friendship !== null) return true;
      // Le contact DM n'est consulté qu'en second — l'amitié est le cas
      // dominant et coûte une seule requête bornée.
      return options.includeDirectContacts === true
        && doUsersShareDirectConversation(prisma, post.authorId, userId);
    }

    default:
      return false;
  }
}

/**
 * La tranche minimale d'un post qui suffit à trancher son ACL. Le `deletedAt`
 * vit dans le `where` des chargeurs ci-dessous, pas dans le verdict : un post
 * supprimé n'a pas d'audience, il n'existe pas.
 */
const POST_ACL_SELECT = {
  authorId: true,
  visibility: true,
  visibilityUserIds: true,
} as const;

/**
 * Charge la tranche ACL d'un post. `null` si le post est absent OU supprimé —
 * les deux cas sont volontairement indiscernables, comme dans
 * `PostService.recordMediaDownloads` : distinguer révélerait l'existence d'un
 * post que l'appelant n'a pas le droit de voir.
 */
export async function loadPostAcl(
  prisma: PostAclPrisma,
  postId: string,
): Promise<PostVisibilityRecord | null> {
  const post = await prisma.post.findFirst({
    where: { id: postId, deletedAt: NOT_DELETED },
    select: POST_ACL_SELECT,
  });
  return post ?? null;
}

/**
 * Charge la tranche ACL du post PORTANT `commentId`, et rend son identifiant
 * réel.
 *
 * Les routes du fil sont montées sous `/posts/:postId/comments/:commentId/…`
 * mais n'adressent le commentaire que par `commentId` — un appelant peut donc
 * annoncer le `postId` d'un post public tout en visant le commentaire d'un post
 * privé. Résoudre le post DEPUIS le commentaire ferme cet écart : l'id d'URL
 * n'est jamais cru, il n'est plus qu'un segment de chemin.
 */
export async function loadCommentPostAcl(
  prisma: PostAclPrisma,
  commentId: string,
): Promise<{ postId: string; post: PostVisibilityRecord } | null> {
  const comment = await prisma.postComment.findFirst({
    where: { id: commentId, deletedAt: NOT_DELETED },
    select: { postId: true, post: { select: POST_ACL_SELECT } },
  });
  if (!comment?.post) return null;
  return { postId: comment.postId, post: comment.post };
}

/**
 * A-t-il le droit de CONSOMMER ce post et le contenu qui y est attaché (lire
 * le fil de commentaires, les réponses) ?
 *
 * Audience = amis ∪ contacts DM, celle de `buildPostVisibilityOrFilter` — donc
 * exactement ce que le feed lui montre. Un contact DM non-ami qui voit une
 * story `FRIENDS` dans son feed doit pouvoir en lire les commentaires ; le
 * verdict d'interaction (amis stricts) le refuserait et transformerait un
 * lecteur légitime en 404.
 *
 * `userId` absent = visiteur non identifié : seul un post `PUBLIC` lui est
 * ouvert, et aucune requête de graphe n'est émise pour l'établir.
 */
export async function canUserConsumePost(
  prisma: PostAclPrisma,
  post: PostVisibilityRecord,
  userId?: string,
): Promise<boolean> {
  if (!userId) return post.visibility === PostVisibility.PUBLIC;
  return canUserViewPost(prisma, post, userId, { includeDirectContacts: true });
}

/**
 * A-t-il le droit d'INTERAGIR avec ce post (commenter, liker un commentaire,
 * réagir) ?
 *
 * Audience = amis stricts. C'est la règle que ce fichier documente depuis
 * toujours — « `canUserViewPost` (amis stricts) garde RÉAGIR / COMMENTER » —
 * mais qu'aucune route du fil n'appliquait. L'asymétrie voir ⊇ interagir est un
 * choix produit (décision 2026-07-08) : ne pas réaligner l'un sur l'autre sans
 * re-décider l'ACL.
 */
export async function canUserInteractWithPost(
  prisma: PostAclPrisma,
  post: PostVisibilityRecord,
  userId?: string,
): Promise<boolean> {
  if (!userId) return false;
  return canUserViewPost(prisma, post, userId);
}
