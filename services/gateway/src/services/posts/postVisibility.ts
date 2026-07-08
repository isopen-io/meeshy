/**
 * Post visibility ACL helper
 *
 * Shared between CommentReactionHandler and PostReactionHandler (and any future
 * handler that needs to gate access by post visibility).
 */

import { PrismaClient, PostVisibility } from '@meeshy/shared/prisma/client';
import { doUsersShareCommunity } from './communityVisibility';

export type PostVisibilityRecord = {
  authorId: string;
  visibility: PostVisibility;
  visibilityUserIds: string[];
};

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
 * `canUserViewPost` ci-dessous (qui garde RÉAGIR / COMMENTER) reste amis stricts.
 * Un DM-contact peut donc ouvrir une story FRIENDS et compter comme viewer, mais
 * pas y réagir. C'est un choix produit (décision 2026-07-08) — les deux ne sont
 * PAS identiques ; ne pas « réaligner » l'un sur l'autre sans re-décider l'ACL
 * d'interaction.
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
 */
export async function canUserViewPost(
  prisma: PrismaClient,
  post: PostVisibilityRecord,
  userId: string
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
      const isFriend = friendship !== null;
      if (post.visibility === PostVisibility.FRIENDS) return isFriend;
      // EXCEPT: friends who are NOT in the exclusion list
      return isFriend && !post.visibilityUserIds.includes(userId);
    }

    default:
      return false;
  }
}
