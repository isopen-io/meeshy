/**
 * Service de gestion des réactions emoji sur les messages
 * 
 * Gère l'ajout, la suppression, l'agrégation et la synchronisation
 * des réactions avec support utilisateurs authentifiés et anonymes
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
  userId?: string;
  anonymousId?: string;
  emoji: string;
}

export interface RemoveReactionOptions {
  messageId: string;
  userId?: string;
  anonymousId?: string;
  emoji: string;
}

export interface GetReactionsOptions {
  messageId: string;
  currentUserId?: string;
  currentAnonymousUserId?: string;
}

export class ReactionService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Ajoute une réaction à un message
   * Vérifie les permissions et évite les doublons
   */
  async addReaction(options: AddReactionOptions): Promise<ReactionData | null> {
    const { messageId, userId, anonymousId, emoji } = options;

    // Validation de l'emoji
    const sanitized = sanitizeEmoji(emoji);
    if (!sanitized) {
      throw new Error('Invalid emoji format');
    }

    // Vérifier que l'utilisateur ou anonyme est fourni
    if (!userId && !anonymousId) {
      throw new Error('Either userId or anonymousId must be provided');
    }

    // Vérifier que le message existe et permissions
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      include: {
        conversation: {
          include: {
            members: true,
            anonymousParticipants: true
          }
        }
      }
    });

    if (!message) {
      throw new Error('Message not found');
    }

    // Vérifier les permissions d'accès à la conversation
    if (userId) {
      const isMember = message.conversation.members.some(m => m.userId === userId);
      if (!isMember) {
        throw new Error('User is not a member of this conversation');
      }
    } else if (anonymousId) {
      const isParticipant = message.conversation.anonymousParticipants.some(
        p => p.id === anonymousId
      );
      if (!isParticipant) {
        throw new Error('Anonymous user is not a participant of this conversation');
      }
    }

    // LIMITE: Maximum 3 réactions différentes par utilisateur par message
    const MAX_REACTIONS_PER_USER = 3;

    // Compter combien de réactions différentes l'utilisateur a déjà sur ce message
    const userExistingReactions = await this.prisma.reaction.findMany({
      where: {
        messageId,
        ...(userId ? { userId } : { anonymousId })
      },
      select: { emoji: true }
    });

    // Extraire les emojis uniques
    const uniqueEmojis = new Set(userExistingReactions.map(r => r.emoji));

    // Si l'utilisateur a déjà 3 réactions différentes ET qu'il essaie d'en ajouter une nouvelle
    if (uniqueEmojis.size >= MAX_REACTIONS_PER_USER && !uniqueEmojis.has(sanitized)) {
      throw new Error(`Maximum ${MAX_REACTIONS_PER_USER} different reactions per message reached`);
    }

    // Vérifier si la réaction existe déjà
    const existingReaction = await this.prisma.reaction.findFirst({
      where: {
        messageId,
        ...(userId ? { userId } : { anonymousId }),
        emoji: sanitized
      }
    });

    if (existingReaction) {
      // Réaction déjà existante, retourner celle-ci
      return this.mapReactionToData(existingReaction);
    }

    // Créer la réaction
    const reaction = await this.prisma.reaction.create({
      data: {
        messageId,
        userId,
        anonymousId,
        emoji: sanitized
      }
    });

    // ===== MISE À JOUR DES CHAMPS DÉNORMALISÉS =====
    // Mettre à jour reactionSummary et reactionCount sur le message
    await this.updateMessageReactionSummary(messageId, sanitized, 'add');

    return this.mapReactionToData(reaction);
  }

  /**
   * Retire une réaction d'un message
   */
  async removeReaction(options: RemoveReactionOptions): Promise<boolean> {
    const { messageId, userId, anonymousId, emoji } = options;

    // Validation de l'emoji
    const sanitized = sanitizeEmoji(emoji);
    if (!sanitized) {
      throw new Error('Invalid emoji format');
    }

    // Supprimer la réaction
    const result = await this.prisma.reaction.deleteMany({
      where: {
        messageId,
        ...(userId ? { userId } : { anonymousId }),
        emoji: sanitized
      }
    });

    // ===== MISE À JOUR DES CHAMPS DÉNORMALISÉS =====
    // Mettre à jour reactionSummary et reactionCount si suppression réussie
    if (result.count > 0) {
      await this.updateMessageReactionSummary(messageId, sanitized, 'remove', result.count);
    }

    return result.count > 0;
  }

  /**
   * Récupère toutes les réactions pour un message avec agrégation
   */
  async getMessageReactions(options: GetReactionsOptions): Promise<ReactionSync> {
    const { messageId, currentUserId, currentAnonymousUserId } = options;

    // Récupérer toutes les réactions du message
    const reactions = await this.prisma.reaction.findMany({
      where: { messageId },
      orderBy: { createdAt: 'asc' }
    });

    // Agréger par emoji
    const aggregationMap = new Map<string, ReactionAggregation>();

    reactions.forEach(reaction => {
      const existing = aggregationMap.get(reaction.emoji);

      if (existing) {
        // Ajouter à l'agrégation existante
        const userIds = [...existing.userIds];
        const anonymousIds = [...existing.anonymousIds];

        if (reaction.userId) {
          userIds.push(reaction.userId);
        }
        if (reaction.anonymousId) {
          anonymousIds.push(reaction.anonymousId);
        }

        // Vérifier si l'utilisateur actuel a réagi
        let hasCurrentUser = existing.hasCurrentUser;
        if (currentUserId && reaction.userId === currentUserId) {
          hasCurrentUser = true;
        }
        if (currentAnonymousUserId && reaction.anonymousId === currentAnonymousUserId) {
          hasCurrentUser = true;
        }

        aggregationMap.set(reaction.emoji, {
          emoji: reaction.emoji,
          count: existing.count + 1,
          userIds,
          anonymousIds,
          hasCurrentUser
        });
      } else {
        // Créer nouvelle agrégation
        const hasCurrentUser = 
          (currentUserId && reaction.userId === currentUserId) ||
          (currentAnonymousUserId && reaction.anonymousId === currentAnonymousUserId);

        aggregationMap.set(reaction.emoji, {
          emoji: reaction.emoji,
          count: 1,
          userIds: reaction.userId ? [reaction.userId] : [],
          anonymousIds: reaction.anonymousId ? [reaction.anonymousId] : [],
          hasCurrentUser
        });
      }
    });

    // Convertir en tableau
    const aggregations = Array.from(aggregationMap.values());

    // Trouver les emojis utilisés par l'utilisateur actuel
    const userReactions = reactions
      .filter(r => 
        (currentUserId && r.userId === currentUserId) ||
        (currentAnonymousUserId && r.anonymousId === currentAnonymousUserId)
      )
      .map(r => r.emoji);

    return {
      messageId,
      reactions: aggregations,
      totalCount: reactions.length,
      userReactions: Array.from(new Set(userReactions)) // Dédupliquer
    };
  }

  /**
   * Récupère l'agrégation pour un emoji spécifique
   */
  async getEmojiAggregation(
    messageId: string,
    emoji: string,
    currentUserId?: string,
    currentAnonymousUserId?: string
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

    const userIds = reactions
      .filter(r => r.userId)
      .map(r => r.userId!);

    const anonymousIds = reactions
      .filter(r => r.anonymousId)
      .map(r => r.anonymousId!);

    const hasCurrentUser = reactions.some(r =>
      (currentUserId && r.userId === currentUserId) ||
      (currentAnonymousUserId && r.anonymousId === currentAnonymousUserId)
    );

    return {
      emoji: sanitized,
      count: reactions.length,
      userIds,
      anonymousIds,
      hasCurrentUser
    };
  }

  /**
   * Récupère toutes les réactions d'un utilisateur
   */
  async getUserReactions(userId: string): Promise<ReactionData[]> {
    const reactions = await this.prisma.reaction.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 100 // Limiter pour performance
    });

    return reactions.map(r => this.mapReactionToData(r));
  }

  /**
   * Récupère toutes les réactions d'un utilisateur anonyme
   */
  async getAnonymousUserReactions(anonymousId: string): Promise<ReactionData[]> {
    const reactions = await this.prisma.reaction.findMany({
      where: { anonymousId },
      orderBy: { createdAt: 'desc' },
      take: 100
    });

    return reactions.map(r => this.mapReactionToData(r));
  }

  /**
   * Vérifie si un utilisateur a déjà réagi avec un emoji
   */
  async hasUserReacted(
    messageId: string,
    emoji: string,
    userId?: string,
    anonymousId?: string
  ): Promise<boolean> {
    const sanitized = sanitizeEmoji(emoji);
    if (!sanitized) return false;

    const reaction = await this.prisma.reaction.findFirst({
      where: {
        messageId,
        emoji: sanitized,
        ...(userId ? { userId } : { anonymousId })
      }
    });

    return reaction !== null;
  }

  /**
   * Supprime toutes les réactions d'un message (cascade lors de suppression message)
   */
  async deleteMessageReactions(messageId: string): Promise<number> {
    const result = await this.prisma.reaction.deleteMany({
      where: { messageId }
    });

    // ===== RÉINITIALISER LES CHAMPS DÉNORMALISÉS =====
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

  /**
   * Crée un événement de mise à jour pour WebSocket
   */
  async createUpdateEvent(
    messageId: string,
    emoji: string,
    action: 'add' | 'remove',
    userId?: string,
    anonymousId?: string
  ): Promise<ReactionUpdateEvent> {
    const aggregation = await this.getEmojiAggregation(
      messageId,
      emoji,
      userId,
      anonymousId
    );

    return {
      messageId,
      userId,
      anonymousId,
      emoji,
      action,
      aggregation,
      timestamp: new Date()
    };
  }

  /**
   * Met à jour les champs dénormalisés reactionSummary et reactionCount sur le message
   * Appelé lors de l'ajout ou suppression de réactions
   */
  private async updateMessageReactionSummary(
    messageId: string,
    emoji: string,
    action: 'add' | 'remove',
    count: number = 1
  ): Promise<void> {
    // Récupérer le message actuel pour obtenir le reactionSummary
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      select: { reactionSummary: true, reactionCount: true }
    });

    if (!message) {
      return; // Message non trouvé, rien à faire
    }

    // Parser le reactionSummary actuel (ou initialiser vide)
    const currentSummary = (message.reactionSummary as Record<string, number>) || {};
    const currentCount = message.reactionCount || 0;

    // Mettre à jour selon l'action
    if (action === 'add') {
      currentSummary[emoji] = (currentSummary[emoji] || 0) + count;
    } else {
      // remove
      if (currentSummary[emoji]) {
        currentSummary[emoji] -= count;
        // Supprimer la clé si le compteur tombe à 0 ou moins
        if (currentSummary[emoji] <= 0) {
          delete currentSummary[emoji];
        }
      }
    }

    // Calculer le nouveau total
    const newReactionCount = action === 'add'
      ? currentCount + count
      : Math.max(0, currentCount - count);

    // Mettre à jour le message
    await this.prisma.message.update({
      where: { id: messageId },
      data: {
        reactionSummary: currentSummary,
        reactionCount: newReactionCount
      }
    });
  }

  /**
   * Mappe une Reaction Prisma vers ReactionData
   */
  private mapReactionToData(reaction: Reaction): ReactionData {
    return {
      id: reaction.id,
      messageId: reaction.messageId,
      userId: reaction.userId || undefined,
      anonymousId: reaction.anonymousId || undefined,
      emoji: reaction.emoji,
      createdAt: reaction.createdAt,
      updatedAt: reaction.updatedAt
    };
  }

  /**
   * Valide et nettoie les options d'ajout de réaction
   */
  validateAddReactionOptions(options: AddReactionOptions): void {
    if (!options.messageId) {
      throw new Error('messageId is required');
    }

    if (!options.userId && !options.anonymousId) {
      throw new Error('Either userId or anonymousId must be provided');
    }

    if (!options.emoji) {
      throw new Error('emoji is required');
    }

    if (!isValidEmoji(options.emoji)) {
      throw new Error('Invalid emoji format');
    }
  }

  /**
   * Valide et nettoie les options de suppression de réaction
   */
  validateRemoveReactionOptions(options: RemoveReactionOptions): void {
    if (!options.messageId) {
      throw new Error('messageId is required');
    }

    if (!options.userId && !options.anonymousId) {
      throw new Error('Either userId or anonymousId must be provided');
    }

    if (!options.emoji) {
      throw new Error('emoji is required');
    }

    if (!isValidEmoji(options.emoji)) {
      throw new Error('Invalid emoji format');
    }
  }
}

// Export singleton avec instance Prisma partagée
// Note: Cette instance sera injectée par le système de DI
export const createReactionService = (prisma: PrismaClient) => {
  return new ReactionService(prisma);
};
