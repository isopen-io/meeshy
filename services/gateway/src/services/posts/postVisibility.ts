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
