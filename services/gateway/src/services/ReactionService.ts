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

export interface AddReactionResult {
  reaction: ReactionData;
  /**
   * Emojis the participant had on this message before this add and that were
   * swapped out by it (single-reaction-per-user model). Callers must broadcast
   * a REACTION_REMOVED event per entry so other clients drop the old emoji.
   */
  replacedEmojis: string[];
  /**
   * True when the participant already had exactly this emoji on this message,
   * so addReaction made no DB change. Callers MUST skip the REACTION_ADDED
   * broadcast and the author notification — nothing changed, and re-emitting
   * both spams every participant in the room and (once the anti-spam window
   * has elapsed) double-notifies the author for a single logical reaction.
   * Mirrors `removeReaction`'s `false` return, which every consumer already
   * respects to avoid a no-op REACTION_REMOVED broadcast.
   */
  unchanged: boolean;
}

export class ReactionService {
  private static readonly OBJECT_ID_REGEX = /^[0-9a-fA-F]{24}$/;

  private validateMessageId(messageId: string): void {
    if (!messageId || !ReactionService.OBJECT_ID_REGEX.test(messageId)) {
      throw new Error(`Invalid message ID format: ${messageId.substring(0, 20)}`);
    }
  }

  constructor(private readonly prisma: PrismaClient) {}

  async addReaction(options: AddReactionOptions): Promise<AddReactionResult | null> {
    const { messageId, participantId, emoji } = options;

    this.validateMessageId(messageId);

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

    if (message.messageType === 'system') {
      throw new Error('Cannot react to a system message');
    }

    const isParticipant = message.conversation.participants.some(p => p.id === participantId);
    if (!isParticipant) {
      throw new Error('User is not a participant of this conversation');
    }

    const previousReaction = await this.prisma.reaction.findFirst({
      where: { messageId, participantId },
      select: { emoji: true }
    });

    if (previousReaction?.emoji === sanitized) {
      const existingReaction = await this.prisma.reaction.findFirst({
        where: { messageId, participantId, emoji: sanitized }
      });
      if (existingReaction) {
        return { reaction: this.mapReactionToData(existingReaction), replacedEmojis: [], unchanged: true };
      }
    }

    // Single-reaction-per-user model: the DB unique key is (messageId,
    // participantId) — no emoji — so this upsert is atomic at the Mongo
    // level. Two concurrent addReaction calls for different emojis now race
    // on the SAME document instead of each inserting its own row (the prior
    // find/deleteMany/create sequence let both pass the "no existing
    // reaction" check before either committed).
    const reaction = await this.prisma.reaction.upsert({
      where: { participant_reaction_unique: { messageId, participantId } },
      update: { emoji: sanitized },
      create: { messageId, participantId, emoji: sanitized }
    });

    const replacedEmojis = previousReaction && previousReaction.emoji !== sanitized
      ? [previousReaction.emoji]
      : [];

    await this.updateMessageReactionSummary(messageId);

    return { reaction: this.mapReactionToData(reaction), replacedEmojis, unchanged: false };
  }

  async removeReaction(options: RemoveReactionOptions): Promise<boolean> {
    const { messageId, participantId, emoji } = options;

    this.validateMessageId(messageId);

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
      await this.updateMessageReactionSummary(messageId);
    }

    return result.count > 0;
  }

  async getMessageReactions(options: GetReactionsOptions): Promise<ReactionSync> {
    const { messageId, currentParticipantId } = options;

    this.validateMessageId(messageId);

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
    this.validateMessageId(messageId);

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

  // A user has a distinct Participant.id per conversation, and reactions are
  // keyed by Participant.id — never by User.id (they are ObjectIds from
  // different collections and never collide). Resolving the user's reactions
  // therefore requires expanding userId → their participant ids first, then
  // filtering reactions across all of them. Passing a User.id straight into
  // `getParticipantReactions` (the previous route behaviour) matched zero rows.
  async getUserReactions(userId: string): Promise<ReactionData[]> {
    const participants = await this.prisma.participant.findMany({
      where: { userId },
      select: { id: true }
    });

    const participantIds = participants.map(p => p.id);
    if (participantIds.length === 0) {
      return [];
    }

    const reactions = await this.prisma.reaction.findMany({
      where: { participantId: { in: participantIds } },
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

  private async updateMessageReactionSummary(messageId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const message = await tx.message.findUnique({
        where: { id: messageId },
        select: { id: true }
      });

      if (!message) return;

      // Ventilation par emoji ET total recalculés depuis la table `Reaction`
      // (source de vérité), au lieu d'appliquer un delta add/remove sur une carte
      // dénormalisée. La lecture du "previousReaction" dans addReaction se fait hors
      // transaction, donc deux addReaction concurrents pour le même participant avec
      // des emojis différents peuvent tous deux la croire absente et incrémenter
      // chacun leur propre delta — laissant un emoji fantôme dans reactionSummary
      // sans ligne `Reaction` derrière. Recalculer depuis groupBy est auto-réparant,
      // quel que soit l'état après la course.
      const grouped = await tx.reaction.groupBy({
        by: ['emoji'],
        where: { messageId },
        _count: { emoji: true }
      });

      const reactionSummary = grouped.reduce<Record<string, number>>((summary, group) => {
        summary[group.emoji] = group._count.emoji;
        return summary;
      }, {});
      const total = grouped.reduce((sum, group) => sum + group._count.emoji, 0);

      await tx.message.update({
        where: { id: messageId },
        data: { reactionSummary, reactionCount: total }
      });
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
