/**
 * CE QU'UN COMMENTAIRE APPREND AUX DÉFIS (#9635), posé au point unique du geste — la route de création :
 *
 *  - « commenter le post de quelqu'un d'autre » (`comment-others-post`) : jamais son propre post ;
 *  - « commenter le post PUBLIC de quelqu'un qu'on ne connaît pas » (`comment-stranger-public-post`) : un post
 *    `PUBLIC` dont l'auteur n'est pas un ami accepté.
 *
 * La clé est le POST : N défis, N posts différents — dix commentaires sous le même post n'en font qu'un.
 */

import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { MissionFactSignal } from '@meeshy/shared/utils/game/missions';

export type CommentFactsPort = {
  recordGameSignal(userId: string, signal: MissionFactSignal, options?: { readonly key?: string }): Promise<void>;
};

export async function recordCommentFacts(params: {
  readonly prisma: Pick<PrismaClient, 'friendRequest'>;
  readonly engagement: CommentFactsPort;
  readonly commenterId: string;
  readonly postId: string;
  readonly post: { readonly authorId: string; readonly visibility: string | null } | null | undefined;
}): Promise<void> {
  const { prisma, engagement, commenterId, postId, post } = params;
  if (!post || post.authorId === commenterId) return;
  await engagement.recordGameSignal(commenterId, 'comment-others-post', { key: postId });
  if (post.visibility !== 'PUBLIC') return;
  const friends = await prisma.friendRequest.findFirst({
    where: {
      status: 'accepted',
      OR: [
        { senderId: commenterId, receiverId: post.authorId },
        { senderId: post.authorId, receiverId: commenterId },
      ],
    },
    select: { id: true },
  });
  if (friends === null) await engagement.recordGameSignal(commenterId, 'comment-stranger-public-post', { key: postId });
}
