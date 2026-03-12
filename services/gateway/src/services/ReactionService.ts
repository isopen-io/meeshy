/**
 * Service de gestion des réactions emoji sur les messages
 *
 * Unified Participant model: all reactions use participantId
 */

import { PrismaClient, Reaction } from '@meeshy/shared/prisma/client';
import type {
  ReactionData,
  ReactionAggregation,
  ReactionSync,
  ReactionUpdateEvent
} from '@meeshy/shared/types';
import { sanitizeEmoji, isValidEmoji } from '@meeshy/shared/types/reaction';

export interface AddReactionOptions {
  messageId: string;
  participantId: string;
  emoji: string;
}

export interface RemoveReactionOptions {
  messageId: string;
  participantId: string;
  emoji: string;
}

export interface GetReactionsOptions {
  messageId: string;
  currentParticipantId?: string;
}

export class ReactionService {
  constructor(private readonly prisma: PrismaClient) {}

  async addReaction(options: AddReactionOptions): Promise<ReactionData | null> {
    const { messageId, participantId, emoji } = options;

    const sanitized = sanitizeEmoji(emoji);
    if (!sanitized) {
      throw new Error('Invalid emoji format');
    }

    if (!participantId) {
      throw new Error('participantId must be provided');
    }

    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      include: {
        conversation: {
          include: {
            participants: { where: { isActive: true } }
          }
        }
      }
    });

    if (!message) {
      throw new Error('Message not found');
    }

    const isParticipant = message.conversation.participants.some(p => p.id === participantId);
    if (!isParticipant) {
      throw new Error('User is not a participant of this conversation');
    }

    const MAX_REACTIONS_PER_USER = 3;

    const userExistingReactions = await this.prisma.reaction.findMany({
      where: {
        messageId,
        participantId
      },
      select: { emoji: true }
    });

    const uniqueEmojis = new Set(userExistingReactions.map(r => r.emoji));

    if (uniqueEmojis.size >= MAX_REACTIONS_PER_USER && !uniqueEmojis.has(sanitized)) {
      throw new Error(`Maximum ${MAX_REACTIONS_PER_USER} different reactions per message reached`);
    }

    const existingReaction = await this.prisma.reaction.findFirst({
      where: {
        messageId,
        participantId,
        emoji: sanitized
      }
    });

    if (existingReaction) {
      return this.mapReactionToData(existingReaction);
    }

    const reaction = await this.prisma.reaction.create({
      data: {
        messageId,
        participantId,
        emoji: sanitized
      }
    });

    await this.updateMessageReactionSummary(messageId, sanitized, 'add');

    return this.mapReactionToData(reaction);
  }

  async removeReaction(options: RemoveReactionOptions): Promise<boolean> {
    const { messageId, participantId, emoji } = options;

    const sanitized = sanitizeEmoji(emoji);
    if (!sanitized) {
      throw new Error('Invalid emoji format');
    }

    const result = await this.prisma.reaction.deleteMany({
      where: {
        messageId,
        participantId,
        emoji: sanitized
      }
    });

    if (result.count > 0) {
      await this.updateMessageReactionSummary(messageId, sanitized, 'remove', result.count);
    }

    return result.count > 0;
  }

  async getMessageReactions(options: GetReactionsOptions): Promise<ReactionSync> {
    const { messageId, currentParticipantId } = options;

    const reactions = await this.prisma.reaction.findMany({
      where: { messageId },
      orderBy: { createdAt: 'asc' }
    });

    const aggregationMap = new Map<string, ReactionAggregation>();

    reactions.forEach(reaction => {
      const existing = aggregationMap.get(reaction.emoji);

      if (existing) {
        const participantIds = [...existing.participantIds];
        participantIds.push(reaction.participantId);

        let hasCurrentUser = existing.hasCurrentUser;
        if (currentParticipantId && reaction.participantId === currentParticipantId) {
          hasCurrentUser = true;
        }

        aggregationMap.set(reaction.emoji, {
          emoji: reaction.emoji,
          count: existing.count + 1,
          participantIds,
          hasCurrentUser
        });
      } else {
        const hasCurrentUser = !!(currentParticipantId && reaction.participantId === currentParticipantId);

        aggregationMap.set(reaction.emoji, {
          emoji: reaction.emoji,
          count: 1,
          participantIds: [reaction.participantId],
          hasCurrentUser
        });
      }
    });

    const aggregations = Array.from(aggregationMap.values());

    const allParticipantIds = new Set<string>();
    aggregations.forEach(a => a.participantIds.forEach((pid: string) => allParticipantIds.add(pid)));

    const participants = allParticipantIds.size > 0
      ? await this.prisma.participant.findMany({
          where: { id: { in: Array.from(allParticipantIds) } },
          select: { id: true, displayName: true, avatar: true, userId: true }
        })
      : [];

    const participantMap = new Map(participants.map(p => [p.id, p]));

    const enrichedReactions = aggregations.map(agg => ({
      ...agg,
      users: agg.participantIds.map((pid: string) => {
        const participant = participantMap.get(pid);
        const reaction = reactions.find(r => r.emoji === agg.emoji && r.participantId === pid);
        return {
          participantId: pid,
          username: participant?.displayName ?? 'Anonymous',
          avatar: participant?.avatar ?? null,
          createdAt: reaction?.createdAt?.toISOString() ?? new Date().toISOString()
        };
      })
    }));

    const userReactions = reactions
      .filter(r => currentParticipantId && r.participantId === currentParticipantId)
      .map(r => r.emoji);

    return {
      messageId,
      reactions: enrichedReactions,
      totalCount: reactions.length,
      userReactions: Array.from(new Set(userReactions))
    };
  }

  async getEmojiAggregation(
    messageId: string,
    emoji: string,
    currentParticipantId?: string
  ): Promise<ReactionAggregation> {
    const sanitized = sanitizeEmoji(emoji);
    if (!sanitized) {
      throw new Error('Invalid emoji format');
    }

    const reactions = await this.prisma.reaction.findMany({
      where: {
        messageId,
        emoji: sanitized
      }
    });

    const participantIds = reactions.map(r => r.participantId);

    const hasCurrentUser = reactions.some(r =>
      currentParticipantId && r.participantId === currentParticipantId
    );

    return {
      emoji: sanitized,
      count: reactions.length,
      participantIds,
      hasCurrentUser
    };
  }

  async getParticipantReactions(participantId: string): Promise<ReactionData[]> {
    const reactions = await this.prisma.reaction.findMany({
      where: { participantId },
      orderBy: { createdAt: 'desc' },
      take: 100
    });

    return reactions.map(r => this.mapReactionToData(r));
  }

  async hasParticipantReacted(
    messageId: string,
    emoji: string,
    participantId: string
  ): Promise<boolean> {
    const sanitized = sanitizeEmoji(emoji);
    if (!sanitized) return false;

    const reaction = await this.prisma.reaction.findFirst({
      where: {
        messageId,
        emoji: sanitized,
        participantId
      }
    });

    return reaction !== null;
  }

  async deleteMessageReactions(messageId: string): Promise<number> {
    const result = await this.prisma.reaction.deleteMany({
      where: { messageId }
    });

    if (result.count > 0) {
      await this.prisma.message.update({
        where: { id: messageId },
        data: {
          reactionSummary: {},
          reactionCount: 0
        }
      });
    }

    return result.count;
  }

  async createUpdateEvent(
    messageId: string,
    emoji: string,
    action: 'add' | 'remove',
    participantId: string,
    conversationId: string
  ): Promise<ReactionUpdateEvent> {
    const aggregation = await this.getEmojiAggregation(
      messageId,
      emoji,
      participantId
    );

    return {
      messageId,
      conversationId,
      participantId,
      emoji,
      action,
      aggregation,
      timestamp: new Date()
    };
  }

  private async updateMessageReactionSummary(
    messageId: string,
    emoji: string,
    action: 'add' | 'remove',
    count: number = 1
  ): Promise<void> {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      select: { reactionSummary: true, reactionCount: true }
    });

    if (!message) {
      return;
    }

    const currentSummary = (message.reactionSummary as Record<string, number>) || {};
    const currentCount = message.reactionCount || 0;

    if (action === 'add') {
      currentSummary[emoji] = (currentSummary[emoji] || 0) + count;
    } else {
      if (currentSummary[emoji]) {
        currentSummary[emoji] -= count;
        if (currentSummary[emoji] <= 0) {
          delete currentSummary[emoji];
        }
      }
    }

    const newReactionCount = action === 'add'
      ? currentCount + count
      : Math.max(0, currentCount - count);

    await this.prisma.message.update({
      where: { id: messageId },
      data: {
        reactionSummary: currentSummary,
        reactionCount: newReactionCount
      }
    });
  }

  private mapReactionToData(reaction: Reaction): ReactionData {
    return {
      id: reaction.id,
      messageId: reaction.messageId,
      participantId: reaction.participantId,
      emoji: reaction.emoji,
      createdAt: reaction.createdAt,
      updatedAt: reaction.updatedAt
    };
  }

  validateAddReactionOptions(options: AddReactionOptions): void {
    if (!options.messageId) {
      throw new Error('messageId is required');
    }

    if (!options.participantId) {
      throw new Error('participantId must be provided');
    }

    if (!options.emoji) {
      throw new Error('emoji is required');
    }

    if (!isValidEmoji(options.emoji)) {
      throw new Error('Invalid emoji format');
    }
  }

  validateRemoveReactionOptions(options: RemoveReactionOptions): void {
    if (!options.messageId) {
      throw new Error('messageId is required');
    }

    if (!options.participantId) {
      throw new Error('participantId must be provided');
    }

    if (!options.emoji) {
      throw new Error('emoji is required');
    }

    if (!isValidEmoji(options.emoji)) {
      throw new Error('Invalid emoji format');
    }
  }
}

export const createReactionService = (prisma: PrismaClient) => {
  return new ReactionService(prisma);
};
