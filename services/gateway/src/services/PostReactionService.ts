/**
 * Service de gestion des réactions emoji sur les posts
 *
 * Mirrors CommentReactionService exactly — uses userId (not participantId) and
 * verifies post existence instead of comment existence.
 *
 * Phase 3 privacy decision: aggregation returns { emoji, count } only —
 * NO userIds, NO hasCurrentUser.
 */

import { PrismaClient, PostReaction } from '@meeshy/shared/prisma/client';
import { sanitizeEmoji, isValidEmoji } from '@meeshy/shared/types/reaction';
import { isReactionAllowed, REACTION_LIMIT_REACHED_MESSAGE } from '@meeshy/shared/utils/reaction-limit';
import { ConflictError } from '../errors/custom-errors';
import { assertValidObjectId } from '../utils/object-id.js';

export interface PostReactionAggregation {
  readonly emoji: string;
  readonly count: number;
}

export interface PostReactionData {
  readonly id: string;
  readonly postId: string;
  readonly userId: string;
  readonly emoji: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/**
 * Résultat d'`addReaction` : la réaction PLUS un marqueur d'idempotence. `unchanged`
 * est `true` quand la ligne existait déjà (re-fire d'un like : double-fire optimiste,
 * retry socket, second appareil) — aucun état n'a changé en base. Le handler s'en
 * sert pour NE PAS re-diffuser `post:liked`/`post:reaction-added` ni re-notifier
 * l'auteur sur un no-op. Miroir de `ReactionService.addReaction`
 * (`{ reaction, unchanged }`), forme aplatie ici (le modèle post n'a jamais eu
 * de swap). Marqueur transitoire — jamais persisté ni diffusé.
 *
 * `replacedEmojis` a disparu du miroir avec le swap lui-même (2026-08-18) :
 * le nommer ici décrirait `ReactionService` par une forme qu'il n'a plus.
 */
export type AddPostReactionResult = PostReactionData & { readonly unchanged: boolean };

export interface PostReactionSync {
  readonly postId: string;
  readonly reactions: readonly PostReactionAggregation[];
  readonly totalCount: number;
  readonly userReactions: readonly string[];
}

export interface PostReactionUpdateEvent {
  readonly postId: string;
  readonly userId: string;
  readonly emoji: string;
  readonly action: 'add' | 'remove';
  readonly aggregation: PostReactionAggregation;
  readonly timestamp: Date;
}

export interface AddPostReactionOptions {
  postId: string;
  userId: string;
  emoji: string;
}

export interface RemovePostReactionOptions {
  postId: string;
  userId: string;
  emoji: string;
}

export interface GetPostReactionsOptions {
  postId: string;
  currentUserId?: string;
}

export class PostReactionService {
  private validatePostId(postId: string): void {
    assertValidObjectId(postId, 'post');
  }

  constructor(private readonly prisma: PrismaClient) {}

  async addReaction(options: AddPostReactionOptions): Promise<AddPostReactionResult | null> {
    const { postId, userId, emoji } = options;

    this.validatePostId(postId);

    const sanitized = sanitizeEmoji(emoji);
    if (!sanitized) {
      throw new Error('Invalid emoji format');
    }

    if (!userId) {
      throw new Error('userId must be provided');
    }

    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      select: { id: true, deletedAt: true }
    });

    if (!post) {
      throw new Error('Post not found');
    }

    if (post.deletedAt) {
      throw new Error('Post has been deleted');
    }

    // Multi-réactions (2026-08-18) : la clé unique DB (postId, userId, emoji)
    // accepte tout emoji distinct par utilisateur, à parité avec les messages
    // et les pièces jointes — mais le CODE plafonne ce nombre à cinq (bloc
    // ci-dessous, 2026-08-20) : la base elle-même n'impose rien.
    const existingReaction = await this.prisma.postReaction.findFirst({
      where: {
        postId,
        userId,
        emoji: sanitized
      }
    });

    if (existingReaction) {
      return { ...this.mapReactionToData(existingReaction), unchanged: true };
    }

    // Plafond des cinq réactions (2026-08-20) : règle déclarée UNE SEULE
    // FOIS dans `packages/shared/utils/reaction-limit.ts`. Comptage effectué
    // uniquement ici, APRÈS avoir établi (bloc ci-dessus) qu'il s'agit d'une
    // création réelle — un `findFirst` qui aurait trouvé l'emoji déjà posé ne
    // consomme aucune place et ne doit jamais être bloqué par ce plafond.
    const existingReactionCount = await this.prisma.postReaction.count({
      where: { postId, userId }
    });
    if (!isReactionAllowed(existingReactionCount)) {
      // `ConflictError` : `routes/posts/interactions.ts` (POST /posts/:postId/like,
      // partagé par les posts, stories et statuts) trie déjà sur `instanceof
      // ConflictError` pour répondre 409 (refus légitime), pas 500.
      throw new ConflictError(REACTION_LIMIT_REACHED_MESSAGE, 'REACTION_LIMIT_REACHED');
    }

    try {
      const reaction = await this.prisma.postReaction.create({
        data: {
          postId,
          userId,
          emoji: sanitized
        }
      });

      await this.updatePostReactionSummary(postId);

      return { ...this.mapReactionToData(reaction), unchanged: false };
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'code' in err && err.code === 'P2002') {
        // Concurrent insert race: treat as idempotent success, summary already correct.
        const existing = await this.prisma.postReaction.findFirst({
          where: { postId, userId, emoji: sanitized }
        });
        if (existing) return { ...this.mapReactionToData(existing), unchanged: true };
      }
      throw err;
    }
  }

  async removeReaction(options: RemovePostReactionOptions): Promise<boolean> {
    const { postId, userId, emoji } = options;

    this.validatePostId(postId);

    const sanitized = sanitizeEmoji(emoji);
    if (!sanitized) {
      throw new Error('Invalid emoji format');
    }

    const result = await this.prisma.postReaction.deleteMany({
      where: {
        postId,
        userId,
        emoji: sanitized
      }
    });

    if (result.count > 0) {
      await this.updatePostReactionSummary(postId);
    }

    return result.count > 0;
  }

  async getPostReactions(options: GetPostReactionsOptions): Promise<PostReactionSync> {
    const { postId, currentUserId } = options;

    this.validatePostId(postId);

    const reactions = await this.prisma.postReaction.findMany({
      where: { postId },
      orderBy: { createdAt: 'asc' }
    });

    const aggregationMap = new Map<string, PostReactionAggregation>();

    reactions.forEach(reaction => {
      const existing = aggregationMap.get(reaction.emoji);

      if (existing) {
        aggregationMap.set(reaction.emoji, {
          emoji: reaction.emoji,
          count: existing.count + 1
        });
      } else {
        aggregationMap.set(reaction.emoji, {
          emoji: reaction.emoji,
          count: 1
        });
      }
    });

    const aggregations = Array.from(aggregationMap.values());

    const userReactions = reactions
      .filter(r => currentUserId && r.userId === currentUserId)
      .map(r => r.emoji);

    return {
      postId,
      reactions: aggregations,
      totalCount: reactions.length,
      userReactions: Array.from(new Set(userReactions))
    };
  }

  async getEmojiAggregation(
    postId: string,
    emoji: string,
    _currentUserId?: string
  ): Promise<PostReactionAggregation> {
    this.validatePostId(postId);

    const sanitized = sanitizeEmoji(emoji);
    if (!sanitized) {
      throw new Error('Invalid emoji format');
    }

    const reactions = await this.prisma.postReaction.findMany({
      where: {
        postId,
        emoji: sanitized
      }
    });

    return {
      emoji: sanitized,
      count: reactions.length
    };
  }

  async getUserReactions(userId: string): Promise<PostReactionData[]> {
    const reactions = await this.prisma.postReaction.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 100
    });

    return reactions.map(r => this.mapReactionToData(r));
  }

  async hasUserReacted(
    postId: string,
    emoji: string,
    userId: string
  ): Promise<boolean> {
    const sanitized = sanitizeEmoji(emoji);
    if (!sanitized) return false;

    const reaction = await this.prisma.postReaction.findFirst({
      where: {
        postId,
        emoji: sanitized,
        userId
      }
    });

    return reaction !== null;
  }

  async deletePostReactions(postId: string): Promise<number> {
    const result = await this.prisma.postReaction.deleteMany({
      where: { postId }
    });

    if (result.count > 0) {
      await this.prisma.post.update({
        where: { id: postId },
        data: {
          reactionSummary: {},
          reactionCount: 0
        }
      });
    }

    return result.count;
  }

  async createUpdateEvent(
    postId: string,
    emoji: string,
    action: 'add' | 'remove',
    userId: string
  ): Promise<PostReactionUpdateEvent> {
    const aggregation = await this.getEmojiAggregation(
      postId,
      emoji,
      userId
    );

    return {
      postId,
      userId,
      emoji,
      action,
      aggregation,
      timestamp: new Date()
    };
  }

  private async updatePostReactionSummary(postId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const post = await tx.post.findUnique({
        where: { id: postId },
        select: { id: true }
      });

      if (!post) return;

      // Ventilation par emoji ET total recalculés depuis la table `PostReaction`
      // (source de vérité), au lieu d'appliquer un delta add/remove sur une carte
      // dénormalisée. Le pré-check des réactions dans addReaction/removeReaction se
      // fait hors transaction, donc deux mutations concurrentes peuvent laisser un
      // emoji fantôme dans reactionSummary (ligne présente, jamais reflétée dans la
      // carte) ; recomputer depuis groupBy est auto-réparant, quel que soit l'état
      // après la course. `reactionCount` ET `likeCount` synchronisés sur le total
      // (parité REST/socket du like de post : `likePost` = reactions.length). Miroir
      // de ReactionService.updateMessageReactionSummary / CommentReactionService.
      const grouped = await tx.postReaction.groupBy({
        by: ['emoji'],
        where: { postId },
        _count: { emoji: true }
      });

      const reactionSummary = grouped.reduce<Record<string, number>>((summary, group) => {
        summary[group.emoji] = group._count.emoji;
        return summary;
      }, {});
      const total = grouped.reduce((sum, group) => sum + group._count.emoji, 0);

      await tx.post.update({
        where: { id: postId },
        data: { reactionSummary, reactionCount: total, likeCount: total }
      });
    });
  }

  private mapReactionToData(reaction: PostReaction): PostReactionData {
    return {
      id: reaction.id,
      postId: reaction.postId,
      userId: reaction.userId,
      emoji: reaction.emoji,
      createdAt: reaction.createdAt,
      updatedAt: reaction.updatedAt
    };
  }

  validateAddReactionOptions(options: AddPostReactionOptions): void {
    if (!options.postId) {
      throw new Error('postId is required');
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

  validateRemoveReactionOptions(options: RemovePostReactionOptions): void {
    if (!options.postId) {
      throw new Error('postId is required');
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

export const createPostReactionService = (prisma: PrismaClient) => {
  return new PostReactionService(prisma);
};
