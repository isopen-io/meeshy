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
 * Resolved relationship context for the viewer, from the viewer's point of view:
 *   - friendIds             : accepted friends of the viewer (+ DM contacts, where applicable)
 *   - communityCoMemberIds  : users sharing at least one active community with the viewer
 *
 * The lists are pre-resolved by the caller (feed services cache them) so the
 * policy itself stays a pure, synchronous function.
 */
export type PostVisibilityContext = {
  viewerId: string;
  friendIds: string[];
  communityCoMemberIds: string[];
};

/**
 * Canonical query-time visibility policy — the Prisma `where` fragment that lets
 * a viewer see exactly the posts they are entitled to. This is the SINGLE source
 * of truth for the OR-clause set; PostFeedService and PostService both delegate
 * here so their filters can never drift apart (the drift was a privacy-leak class
 * of bug — see postVisibility.test.ts, which locks this to canUserViewPost).
 *
 *   author    → always sees their own posts (first clause)
 *   PUBLIC    → everyone
 *   COMMUNITY → authors sharing a community with the viewer
 *   FRIENDS   → authors who are friends of the viewer
 *   EXCEPT    → friend-authored, unless the viewer is in the exclusion list
 *   ONLY      → viewer must be in the allow list
 *   PRIVATE   → no clause ⇒ only the author (first clause) matches
 */
export function buildPostVisibilityWhere(ctx: PostVisibilityContext) {
  return {
    OR: [
      { authorId: ctx.viewerId },
      { visibility: PostVisibility.PUBLIC },
      { visibility: PostVisibility.COMMUNITY, authorId: { in: ctx.communityCoMemberIds } },
      { visibility: PostVisibility.FRIENDS, authorId: { in: ctx.friendIds } },
      { visibility: PostVisibility.EXCEPT, authorId: { in: ctx.friendIds }, NOT: { visibilityUserIds: { has: ctx.viewerId } } },
      { visibility: PostVisibility.ONLY, visibilityUserIds: { has: ctx.viewerId } },
    ],
  };
}

/**
 * Anonymous / no-viewer visibility: only PUBLIC posts are visible. Kept next to
 * the authenticated policy so the two can never diverge.
 */
export function buildAnonymousVisibilityWhere() {
  return { visibility: PostVisibility.PUBLIC };
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
