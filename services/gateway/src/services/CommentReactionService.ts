/**
 * Service de gestion des réactions emoji sur les commentaires de posts
 *
 * Mirrors ReactionService exactly — uses userId (not participantId) and
 * verifies comment existence instead of conversation-participant membership.
 */

import { PrismaClient, CommentReaction } from '@meeshy/shared/prisma/client';
import { sanitizeEmoji, isValidEmoji } from '@meeshy/shared/types/reaction';
import type { CommentReactionAggregation } from '@meeshy/shared/types/post';

export interface CommentReactionData {
  readonly id: string;
  readonly commentId: string;
  readonly userId: string;
  readonly emoji: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CommentReactionSync {
  readonly commentId: string;
  readonly postId: string;
  readonly reactions: readonly CommentReactionAggregationWithUsers[];
  readonly totalCount: number;
  readonly userReactions: readonly string[];
}

export interface CommentReactionAggregationWithUsers extends CommentReactionAggregation {
  readonly users: readonly {
    readonly userId: string;
    readonly username: string;
    readonly avatar: string | null;
    readonly createdAt: string;
  }[];
}

export interface CommentReactionUpdateEvent {
  readonly commentId: string;
  readonly postId: string;
  readonly userId: string;
  readonly emoji: string;
  readonly action: 'add' | 'remove';
  readonly aggregation: CommentReactionAggregation;
  readonly timestamp: Date;
}

export interface AddCommentReactionOptions {
  commentId: string;
  userId: string;
  emoji: string;
}

export interface RemoveCommentReactionOptions {
  commentId: string;
  userId: string;
  emoji: string;
}

export interface GetCommentReactionsOptions {
  commentId: string;
  currentUserId?: string;
}

export class CommentReactionService {
  private static readonly OBJECT_ID_REGEX = /^[0-9a-fA-F]{24}$/;

  private validateCommentId(commentId: string): void {
    if (!commentId || !CommentReactionService.OBJECT_ID_REGEX.test(commentId)) {
      throw new Error(`Invalid comment ID format: ${commentId.substring(0, 20)}`);
    }
  }

  constructor(private readonly prisma: PrismaClient) {}

  async addReaction(options: AddCommentReactionOptions): Promise<CommentReactionData | null> {
    const { commentId, userId, emoji } = options;

    this.validateCommentId(commentId);

    const sanitized = sanitizeEmoji(emoji);
    if (!sanitized) {
      throw new Error('Invalid emoji format');
    }

    if (!userId) {
      throw new Error('userId must be provided');
    }

    const comment = await this.prisma.postComment.findUnique({
      where: { id: commentId }
    });

    if (!comment) {
      throw new Error('Comment not found');
    }

    if (comment.deletedAt) {
      throw new Error('Comment has been deleted');
    }

    const MAX_REACTIONS_PER_USER = 1;

    const userExistingReactions = await this.prisma.commentReaction.findMany({
      where: {
        commentId,
        userId
      },
      select: { emoji: true }
    });

    const uniqueEmojis = new Set(userExistingReactions.map(r => r.emoji));

    if (uniqueEmojis.size >= MAX_REACTIONS_PER_USER && !uniqueEmojis.has(sanitized)) {
      throw new Error(`Maximum ${MAX_REACTIONS_PER_USER} different reactions per comment reached`);
    }

    const existingReaction = await this.prisma.commentReaction.findFirst({
      where: {
        commentId,
        userId,
        emoji: sanitized
      }
    });

    if (existingReaction) {
      return this.mapReactionToData(existingReaction);
    }

    try {
      const reaction = await this.prisma.commentReaction.create({
        data: {
          commentId,
          userId,
          emoji: sanitized
        }
      });

      await this.updateCommentReactionSummary(commentId);

      return this.mapReactionToData(reaction);
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'code' in err && err.code === 'P2002') {
        // Concurrent insert race: treat as idempotent success, summary already correct.
        const existing = await this.prisma.commentReaction.findFirst({
          where: { commentId, userId, emoji: sanitized }
        });
        if (existing) return this.mapReactionToData(existing);
      }
      throw err;
    }
  }

  async removeReaction(options: RemoveCommentReactionOptions): Promise<boolean> {
    const { commentId, userId, emoji } = options;

    this.validateCommentId(commentId);

    const sanitized = sanitizeEmoji(emoji);
    if (!sanitized) {
      throw new Error('Invalid emoji format');
    }

    const result = await this.prisma.commentReaction.deleteMany({
      where: {
        commentId,
        userId,
        emoji: sanitized
      }
    });

    if (result.count > 0) {
      await this.updateCommentReactionSummary(commentId);
    }

    return result.count > 0;
  }

  async getCommentReactions(options: GetCommentReactionsOptions): Promise<CommentReactionSync> {
    const { commentId, currentUserId } = options;

    this.validateCommentId(commentId);

    const comment = await this.prisma.postComment.findUnique({
      where: { id: commentId },
      select: { postId: true }
    });

    const reactions = await this.prisma.commentReaction.findMany({
      where: { commentId },
      orderBy: { createdAt: 'asc' }
    });

    const aggregationMap = new Map<string, CommentReactionAggregation>();

    reactions.forEach(reaction => {
      const existing = aggregationMap.get(reaction.emoji);

      if (existing) {
        const userIds = [...existing.userIds];
        userIds.push(reaction.userId);

        let hasCurrentUser = existing.hasCurrentUser;
        if (currentUserId && reaction.userId === currentUserId) {
          hasCurrentUser = true;
        }

        aggregationMap.set(reaction.emoji, {
          emoji: reaction.emoji,
          count: existing.count + 1,
          userIds,
          hasCurrentUser
        });
      } else {
        const hasCurrentUser = !!(currentUserId && reaction.userId === currentUserId);

        aggregationMap.set(reaction.emoji, {
          emoji: reaction.emoji,
          count: 1,
          userIds: [reaction.userId],
          hasCurrentUser
        });
      }
    });

    const aggregations = Array.from(aggregationMap.values());

    const allUserIds = new Set<string>();
    aggregations.forEach(a => a.userIds.forEach((uid: string) => allUserIds.add(uid)));

    const users = allUserIds.size > 0
      ? await this.prisma.user.findMany({
          where: { id: { in: Array.from(allUserIds) } },
          select: { id: true, displayName: true, avatar: true }
        })
      : [];

    const userMap = new Map(users.map(u => [u.id, u]));

    const enrichedReactions: CommentReactionAggregationWithUsers[] = aggregations.map(agg => ({
      ...agg,
      users: agg.userIds.map((uid: string) => {
        const user = userMap.get(uid);
        const reaction = reactions.find(r => r.emoji === agg.emoji && r.userId === uid);
        return {
          userId: uid,
          username: user?.displayName ?? 'Anonymous',
          avatar: user?.avatar ?? null,
          createdAt: reaction?.createdAt?.toISOString() ?? new Date().toISOString()
        };
      })
    }));

    const userReactions = reactions
      .filter(r => currentUserId && r.userId === currentUserId)
      .map(r => r.emoji);

    return {
      commentId,
      postId: comment?.postId ?? '',
      reactions: enrichedReactions,
      totalCount: reactions.length,
      userReactions: Array.from(new Set(userReactions))
    };
  }

  async getEmojiAggregation(
    commentId: string,
    emoji: string,
    currentUserId?: string
  ): Promise<CommentReactionAggregation> {
    this.validateCommentId(commentId);

    const sanitized = sanitizeEmoji(emoji);
    if (!sanitized) {
      throw new Error('Invalid emoji format');
    }

    const reactions = await this.prisma.commentReaction.findMany({
      where: {
        commentId,
        emoji: sanitized
      }
    });

    const userIds = reactions.map(r => r.userId);

    const hasCurrentUser = reactions.some(r =>
      currentUserId && r.userId === currentUserId
    );

    return {
      emoji: sanitized,
      count: reactions.length,
      userIds,
      hasCurrentUser
    };
  }

  async getUserReactions(userId: string): Promise<CommentReactionData[]> {
    const reactions = await this.prisma.commentReaction.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 100
    });

    return reactions.map(r => this.mapReactionToData(r));
  }

  async hasUserReacted(
    commentId: string,
    emoji: string,
    userId: string
  ): Promise<boolean> {
    const sanitized = sanitizeEmoji(emoji);
    if (!sanitized) return false;

    const reaction = await this.prisma.commentReaction.findFirst({
      where: {
        commentId,
        emoji: sanitized,
        userId
      }
    });

    return reaction !== null;
  }

  async deleteCommentReactions(commentId: string): Promise<number> {
    const result = await this.prisma.commentReaction.deleteMany({
      where: { commentId }
    });

    if (result.count > 0) {
      await this.prisma.postComment.update({
        where: { id: commentId },
        data: {
          reactionSummary: {},
          reactionCount: 0
        }
      });
    }

    return result.count;
  }

  async createUpdateEvent(
    commentId: string,
    emoji: string,
    action: 'add' | 'remove',
    userId: string,
    postId: string
  ): Promise<CommentReactionUpdateEvent> {
    const aggregation = await this.getEmojiAggregation(
      commentId,
      emoji,
      userId
    );

    return {
      commentId,
      postId,
      userId,
      emoji,
      action,
      aggregation,
      timestamp: new Date()
    };
  }

  private async updateCommentReactionSummary(commentId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const comment = await tx.postComment.findUnique({
        where: { id: commentId },
        select: { id: true }
      });

      if (!comment) return;

      // Ventilation par emoji ET total recalculés depuis la table `CommentReaction`
      // (source de vérité), au lieu d'appliquer un delta add/remove sur une carte
      // dénormalisée. Le pré-check des réactions dans addReaction/removeReaction se
      // fait hors transaction, donc deux mutations concurrentes peuvent laisser un
      // emoji fantôme dans reactionSummary (ligne présente, jamais reflétée dans la
      // carte) ; recomputer depuis groupBy est auto-réparant, quel que soit l'état
      // après la course. `reactionCount` ET `likeCount` synchronisés sur le total
      // (parité REST/socket du like de commentaire : `PostCommentService.likeComment`
      // = increment). Miroir de ReactionService.updateMessageReactionSummary /
      // PostReactionService.updatePostReactionSummary.
      const grouped = await tx.commentReaction.groupBy({
        by: ['emoji'],
        where: { commentId },
        _count: { emoji: true }
      });

      const reactionSummary = grouped.reduce<Record<string, number>>((summary, group) => {
        summary[group.emoji] = group._count.emoji;
        return summary;
      }, {});
      const total = grouped.reduce((sum, group) => sum + group._count.emoji, 0);

      await tx.postComment.update({
        where: { id: commentId },
        data: { reactionSummary, reactionCount: total, likeCount: total }
      });
    });
  }

  private mapReactionToData(reaction: CommentReaction): CommentReactionData {
    return {
      id: reaction.id,
      commentId: reaction.commentId,
      userId: reaction.userId,
      emoji: reaction.emoji,
      createdAt: reaction.createdAt,
      updatedAt: reaction.updatedAt
    };
  }

  validateAddReactionOptions(options: AddCommentReactionOptions): void {
    if (!options.commentId) {
      throw new Error('commentId is required');
    }

    if (!options.userId) {
      throw new Error('userId must be provided');
    }

    if (!options.emoji) {
      throw new Error('emoji is required');
    }

    if (!isValidEmoji(options.emoji)) {
      throw new Error('Invalid emoji format');
    }
  }

  validateRemoveReactionOptions(options: RemoveCommentReactionOptions): void {
    if (!options.commentId) {
      throw new Error('commentId is required');
    }

    if (!options.userId) {
      throw new Error('userId must be provided');
    }

    if (!options.emoji) {
      throw new Error('emoji is required');
    }

    if (!isValidEmoji(options.emoji)) {
      throw new Error('Invalid emoji format');
    }
  }
}

export const createCommentReactionService = (prisma: PrismaClient) => {
  return new CommentReactionService(prisma);
};
