/**
 * Service de gestion des statuts de lecture/réception des messages
 *
 * Architecture hybride:
 * - ConversationReadCursor: curseur par utilisateur par conversation (pour unread count rapide)
 * - MessageStatusEntry: statut par message par utilisateur (pour détails granulaires)
 * - AttachmentStatusEntry: statut par attachment par utilisateur (audio écouté, vidéo vue, etc.)
 */

import { PrismaClient, Message, Prisma } from '@meeshy/shared/prisma/client';

// Helper pour retry des transactions en cas de deadlock (P2034)
async function withRetry<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  baseDelayMs: number = 50
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error: any) {
      lastError = error;

      // P2034 = Transaction deadlock/write conflict
      if (error?.code === 'P2034' && attempt < maxRetries - 1) {
        // Exponential backoff avec jitter
        const delay = baseDelayMs * Math.pow(2, attempt) + Math.random() * 50;
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      throw error;
    }
  }

  throw lastError;
}

export class MessageReadStatusService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Calcule le nombre de messages non lus dans une conversation pour un utilisateur
   * Utilise le cache unreadCount du curseur pour performance
   */
  async getUnreadCount(userId: string, conversationId: string): Promise<number> {
    try {
      // Récupérer le curseur de l'utilisateur
      const cursor = await this.prisma.conversationReadCursor.findUnique({
        where: {
          conversation_user_cursor: { userId, conversationId }
        }
      });

      // Si curseur existe avec unreadCount, utiliser le cache
      if (cursor) {
        return cursor.unreadCount;
      }

      // Sinon, compter tous les messages (sauf ceux de l'utilisateur)
      return await this.prisma.message.count({
        where: {
          conversationId,
          isDeleted: false,
          senderId: { not: userId }
        }
      });
    } catch (error) {
      console.error('[MessageReadStatus] Error getting unread count:', error);
      return 0;
    }
  }

  /**
   * Calcule le unreadCount pour plusieurs conversations d'un utilisateur
   * Optimisé pour afficher la liste des conversations avec leurs compteurs
   */
  async getUnreadCountsForConversations(
    userId: string,
    conversationIds: string[]
  ): Promise<Map<string, number>> {
    try {
      // Récupérer tous les curseurs de l'utilisateur (1 seule requête)
      const cursors = await this.prisma.conversationReadCursor.findMany({
        where: {
          userId,
          conversationId: { in: conversationIds }
        }
      });

      // Map conversationId → cursor
      const cursorMap = new Map(cursors.map(c => [c.conversationId, c]));

      // Map conversationId → unreadCount
      const unreadCounts = new Map<string, number>();

      // Pour les conversations avec curseur, utiliser le cache
      for (const cursor of cursors) {
        unreadCounts.set(cursor.conversationId, cursor.unreadCount);
      }

      // OPTIMISATION: Pour les conversations sans curseur, calculer en parallèle
      const convWithoutCursor = conversationIds.filter(id => !cursorMap.has(id));
      if (convWithoutCursor.length > 0) {
        // Batch de 5 requêtes parallèles pour éviter de surcharger la DB
        const BATCH_SIZE = 5;
        for (let i = 0; i < convWithoutCursor.length; i += BATCH_SIZE) {
          const batch = convWithoutCursor.slice(i, i + BATCH_SIZE);
          const counts = await Promise.all(
            batch.map(async convId => {
              const count = await this.prisma.message.count({
                where: {
                  conversationId: convId,
                  isDeleted: false,
                  senderId: { not: userId }
                }
              });
              return { convId, count };
            })
          );
          counts.forEach(({ convId, count }) => unreadCounts.set(convId, count));
        }
      }

      return unreadCounts;
    } catch (error) {
      console.error('[MessageReadStatus] Error getting unread counts:', error);
      return new Map();
    }
  }

  /**
   * Marque les messages comme reçus pour un utilisateur connecté
   * Met à jour le curseur ET crée des MessageStatusEntry pour chaque message
   * TRANSACTION: Garantit l'atomicité des opérations cursor + status
   */
  async markMessagesAsReceived(
    userId: string,
    conversationId: string,
    latestMessageId?: string
  ): Promise<void> {
    try {
      // Si pas de messageId fourni, récupérer le dernier message de la conversation
      let messageId = latestMessageId;
      if (!messageId) {
        const latestMessage = await this.prisma.message.findFirst({
          where: {
            conversationId,
            isDeleted: false
          },
          orderBy: { createdAt: 'desc' },
          select: { id: true }
        });

        if (!latestMessage) return;
        messageId = latestMessage.id;
      } else {
        // Valider que le message fourni appartient bien à la conversation
        const messageCheck = await this.prisma.message.findFirst({
          where: {
            id: latestMessageId,
            conversationId: conversationId,
            isDeleted: false
          }
        });

        if (!messageCheck) {
          throw new Error(
            `Message ${latestMessageId} does not belong to conversation ${conversationId} or is deleted`
          );
        }
      }

      const now = new Date();
      const finalMessageId = messageId;

      // TRANSACTION: Opérations atomiques pour cursor + status (avec retry pour deadlock)
      await withRetry(() => this.prisma.$transaction(async (tx) => {
        // Mettre à jour le curseur (pour unread count rapide)
        await tx.conversationReadCursor.upsert({
          where: {
            conversation_user_cursor: { userId, conversationId }
          },
          create: {
            userId,
            conversationId,
            lastDeliveredMessageId: finalMessageId,
            lastDeliveredAt: now,
            unreadCount: 0, // Will be recalculated
            version: 0
          },
          update: {
            lastDeliveredMessageId: finalMessageId,
            lastDeliveredAt: now,
            version: { increment: 1 }
            // Note: Ne pas toucher lastReadMessageId ou lastReadAt
          }
        });

        // Créer/mettre à jour le MessageStatusEntry pour ce message
        await tx.messageStatusEntry.upsert({
          where: {
            message_user_status: { messageId: finalMessageId, userId }
          },
          create: {
            messageId: finalMessageId,
            conversationId,
            userId,
            deliveredAt: now,
            receivedAt: now
          },
          update: {
            deliveredAt: now,
            receivedAt: now
          }
        });
      }));

      // Recalculer et mettre à jour le unreadCount (hors transaction pour performance)
      await this.updateUnreadCount(userId, conversationId);

      // Mettre à jour les champs dénormalisés sur le message
      await this.updateMessageComputedStatus(messageId);

      console.log(`✅ [MessageReadStatus] User ${userId} received message ${messageId} in conversation ${conversationId}`);
    } catch (error) {
      console.error('[MessageReadStatus] Error marking messages as received:', error);
      throw error;
    }
  }

  /**
   * Marque les messages comme lus pour un utilisateur
   * Met à jour le curseur ET les MessageStatusEntry
   * OPTIMISÉ: Utilise des opérations par lot pour réduire les requêtes DB
   * TRANSACTION: Garantit l'atomicité du curseur + status entries
   */
  async markMessagesAsRead(
    userId: string,
    conversationId: string,
    latestMessageId?: string
  ): Promise<void> {
    try {
      // Si pas de messageId fourni, récupérer le dernier message de la conversation
      let messageId = latestMessageId;
      let message: { id: string; createdAt: Date } | null = null;

      if (!messageId) {
        message = await this.prisma.message.findFirst({
          where: {
            conversationId,
            isDeleted: false
          },
          orderBy: { createdAt: 'desc' },
          select: { id: true, createdAt: true }
        });

        if (!message) return;
        messageId = message.id;
      } else {
        message = await this.prisma.message.findFirst({
          where: {
            id: latestMessageId,
            conversationId: conversationId,
            isDeleted: false
          },
          select: { id: true, createdAt: true }
        });

        if (!message) {
          throw new Error(
            `Message ${latestMessageId} does not belong to conversation ${conversationId} or is deleted`
          );
        }
      }

      const now = new Date();
      const finalMessageId = messageId;
      const messageCreatedAt = message.createdAt;

      // Récupérer les messages à marquer comme lus (hors transaction pour éviter lock long)
      const unreadMessages = await this.prisma.message.findMany({
        where: {
          conversationId,
          isDeleted: false,
          createdAt: { lte: messageCreatedAt },
          senderId: { not: userId }
        },
        select: { id: true }
      });

      const messageIds = unreadMessages.map(m => m.id);

      // TRANSACTION: Curseur + status entries atomiques (avec retry pour deadlock)
      await withRetry(() => this.prisma.$transaction(async (tx) => {
        // Mettre à jour le curseur
        await tx.conversationReadCursor.upsert({
          where: {
            conversation_user_cursor: { userId, conversationId }
          },
          create: {
            userId,
            conversationId,
            lastReadMessageId: finalMessageId,
            lastReadAt: now,
            lastDeliveredMessageId: finalMessageId,
            lastDeliveredAt: now,
            unreadCount: 0,
            version: 0
          },
          update: {
            lastReadMessageId: finalMessageId,
            lastReadAt: now,
            lastDeliveredMessageId: finalMessageId,
            lastDeliveredAt: now,
            unreadCount: 0,
            version: { increment: 1 }
          }
        });

        // OPTIMISATION: Opérations par lot avec Promise.all dans la transaction
        if (messageIds.length > 0) {
          const BATCH_SIZE = 10;
          for (let i = 0; i < messageIds.length; i += BATCH_SIZE) {
            const batch = messageIds.slice(i, i + BATCH_SIZE);
            await Promise.all(
              batch.map(msgId =>
                tx.messageStatusEntry.upsert({
                  where: {
                    message_user_status: { messageId: msgId, userId }
                  },
                  create: {
                    messageId: msgId,
                    conversationId,
                    userId,
                    deliveredAt: now,
                    receivedAt: now,
                    readAt: now
                  },
                  update: {
                    readAt: now
                  }
                })
              )
            );
          }
        }
      }));

      if (messageIds.length === 0) {
        console.log(`✅ [MessageReadStatus] No messages to mark as read for user ${userId}`);
        return;
      }

      // OPTIMISATION: Mise à jour des computed status en batch (hors transaction pour performance)
      const COMPUTE_BATCH_SIZE = 5;
      for (let i = 0; i < messageIds.length; i += COMPUTE_BATCH_SIZE) {
        const batch = messageIds.slice(i, i + COMPUTE_BATCH_SIZE);
        await Promise.all(batch.map(msgId => this.updateMessageComputedStatus(msgId)));
      }

      console.log(`✅ [MessageReadStatus] User ${userId} read ${messageIds.length} messages in conversation ${conversationId}`);

      // Synchroniser avec les notifications
      try {
        const { NotificationService } = await import('./NotificationService.js');
        const notificationService = new NotificationService(this.prisma);
        const notifCount = await notificationService.markConversationNotificationsAsRead(userId, conversationId);

        if (notifCount > 0) {
          console.log(`✅ [MessageReadStatus] Marked ${notifCount} notifications as read for conversation ${conversationId}`);
        }
      } catch (notifError) {
        console.warn('[MessageReadStatus] Error syncing notifications:', notifError);
      }
    } catch (error) {
      console.error('[MessageReadStatus] Error marking messages as read:', error);
      throw error;
    }
  }

  /**
   * Récupère le statut de lecture d'un message spécifique
   * Utilise MessageStatusEntry pour des détails précis
   */
  async getMessageReadStatus(
    messageId: string,
    conversationId: string
  ): Promise<{
    messageId: string;
    totalMembers: number;
    receivedCount: number;
    readCount: number;
    receivedBy: Array<{ userId: string; username: string; receivedAt: Date }>;
    readBy: Array<{ userId: string; username: string; readAt: Date }>;
  }> {
    try {
      // Récupérer le message
      const message = await this.prisma.message.findUnique({
        where: { id: messageId },
        select: {
          id: true,
          createdAt: true,
          senderId: true,
          anonymousSenderId: true,
          conversationId: true
        }
      });

      if (!message) {
        throw new Error(`Message ${messageId} not found`);
      }

      const authorId = message.senderId || message.anonymousSenderId;

      // Compter les membres (exclure l'expéditeur)
      const totalMembers = await this.prisma.conversationMember.count({
        where: {
          conversationId,
          isActive: true,
          ...(message.senderId ? { userId: { not: message.senderId } } : {})
        }
      });

      // Récupérer les statuts de ce message
      const statuses = await this.prisma.messageStatusEntry.findMany({
        where: {
          messageId,
          userId: { not: authorId }
        },
        include: {
          user: {
            select: { id: true, username: true }
          }
        }
      });

      const receivedBy: Array<{ userId: string; username: string; receivedAt: Date }> = [];
      const readBy: Array<{ userId: string; username: string; readAt: Date }> = [];

      for (const status of statuses) {
        if (status.receivedAt && status.user) {
          receivedBy.push({
            userId: status.userId!,
            username: status.user.username,
            receivedAt: status.receivedAt
          });
        }

        if (status.readAt && status.user) {
          readBy.push({
            userId: status.userId!,
            username: status.user.username,
            readAt: status.readAt
          });
        }
      }

      return {
        messageId,
        totalMembers,
        receivedCount: receivedBy.length,
        readCount: readBy.length,
        receivedBy,
        readBy
      };
    } catch (error) {
      console.error('[MessageReadStatus] Error getting message read status:', error);
      throw error;
    }
  }

  /**
   * Récupère les statuts de lecture pour plusieurs messages
   * NOTE: Pour l'affichage en liste, utiliser les champs dénormalisés (deliveredCount, readCount)
   */
  async getConversationReadStatuses(
    conversationId: string,
    messageIds: string[]
  ): Promise<Map<string, { receivedCount: number; readCount: number }>> {
    try {
      // Récupérer tous les statuts pour ces messages
      const statuses = await this.prisma.messageStatusEntry.findMany({
        where: {
          messageId: { in: messageIds },
          conversationId
        }
      });

      // Grouper par messageId
      const statusMap = new Map<string, { receivedCount: number; readCount: number }>();

      // Initialiser avec 0
      for (const msgId of messageIds) {
        statusMap.set(msgId, { receivedCount: 0, readCount: 0 });
      }

      // Compter
      for (const status of statuses) {
        const entry = statusMap.get(status.messageId);
        if (entry) {
          if (status.receivedAt) entry.receivedCount++;
          if (status.readAt) entry.readCount++;
        }
      }

      return statusMap;
    } catch (error) {
      console.error('[MessageReadStatus] Error getting conversation read statuses:', error);
      throw error;
    }
  }

  /**
   * Récupère la liste détaillée des statuts de lecture d'un message avec pagination offset/limit
   * À utiliser UNIQUEMENT quand l'utilisateur demande les détails (évite N+1)
   */
  async getMessageStatusDetails(
    messageId: string,
    options: {
      offset?: number;
      limit?: number;
      filter?: 'all' | 'delivered' | 'read' | 'unread';
    } = {}
  ): Promise<{
    statuses: Array<{
      userId: string;
      username: string;
      avatar?: string | null;
      deliveredAt: Date | null;
      receivedAt: Date | null;
      readAt: Date | null;
      readDevice?: string | null;
    }>;
    pagination: {
      total: number;
      limit: number;
      offset: number;
      hasMore: boolean;
    };
  }> {
    const { offset = 0, limit = 20, filter = 'all' } = options;

    try {
      // Construire le filtre
      const whereClause: any = { messageId };
      if (filter === 'delivered') {
        whereClause.deliveredAt = { not: null };
      } else if (filter === 'read') {
        whereClause.readAt = { not: null };
      } else if (filter === 'unread') {
        whereClause.readAt = null;
      }

      // Compter le total
      const total = await this.prisma.messageStatusEntry.count({
        where: whereClause
      });

      // Récupérer avec offset/limit
      const statuses = await this.prisma.messageStatusEntry.findMany({
        where: whereClause,
        take: limit,
        skip: offset,
        orderBy: [
          { readAt: 'desc' },
          { deliveredAt: 'desc' },
          { createdAt: 'desc' }
        ],
        include: {
          user: {
            select: {
              id: true,
              username: true,
              avatar: true
            }
          }
        }
      });

      return {
        statuses: statuses.map(s => ({
          userId: s.userId!,
          username: s.user?.username || 'Unknown',
          avatar: s.user?.avatar,
          deliveredAt: s.deliveredAt,
          receivedAt: s.receivedAt,
          readAt: s.readAt,
          readDevice: s.readDevice
        })),
        pagination: {
          total,
          limit,
          offset,
          hasMore: offset + statuses.length < total
        }
      };
    } catch (error) {
      console.error('[MessageReadStatus] Error getting message status details:', error);
      throw error;
    }
  }

  /**
   * Récupère la liste détaillée des statuts d'un attachment avec pagination offset/limit
   * À utiliser UNIQUEMENT quand l'utilisateur ouvre les détails d'un attachment
   */
  async getAttachmentStatusDetails(
    attachmentId: string,
    options: {
      offset?: number;
      limit?: number;
      filter?: 'all' | 'viewed' | 'downloaded' | 'listened' | 'watched';
    } = {}
  ): Promise<{
    statuses: Array<{
      userId: string;
      username: string;
      avatar?: string | null;
      viewedAt: Date | null;
      downloadedAt: Date | null;
      listenedAt: Date | null;
      watchedAt: Date | null;
      listenCount: number;
      watchCount: number;
      listenedComplete: boolean;
      watchedComplete: boolean;
      lastPlayPositionMs: number | null;
      lastWatchPositionMs: number | null;
    }>;
    pagination: {
      total: number;
      limit: number;
      offset: number;
      hasMore: boolean;
    };
  }> {
    const { offset = 0, limit = 20, filter = 'all' } = options;

    try {
      // Construire le filtre
      const whereClause: any = { attachmentId };
      if (filter === 'viewed') {
        whereClause.viewedAt = { not: null };
      } else if (filter === 'downloaded') {
        whereClause.downloadedAt = { not: null };
      } else if (filter === 'listened') {
        whereClause.listenedAt = { not: null };
      } else if (filter === 'watched') {
        whereClause.watchedAt = { not: null };
      }

      // Compter le total
      const total = await this.prisma.attachmentStatusEntry.count({
        where: whereClause
      });

      // Récupérer avec offset/limit
      const statuses = await this.prisma.attachmentStatusEntry.findMany({
        where: whereClause,
        take: limit,
        skip: offset,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              avatar: true
            }
          }
        }
      });

      return {
        statuses: statuses.map(s => ({
          userId: s.userId!,
          username: s.user?.username || 'Unknown',
          avatar: s.user?.avatar,
          viewedAt: s.viewedAt,
          downloadedAt: s.downloadedAt,
          listenedAt: s.listenedAt,
          watchedAt: s.watchedAt,
          listenCount: s.listenCount,
          watchCount: s.watchCount,
          listenedComplete: s.listenedComplete,
          watchedComplete: s.watchedComplete,
          lastPlayPositionMs: s.lastPlayPositionMs,
          lastWatchPositionMs: s.lastWatchPositionMs
        })),
        pagination: {
          total,
          limit,
          offset,
          hasMore: offset + statuses.length < total
        }
      };
    } catch (error) {
      console.error('[MessageReadStatus] Error getting attachment status details:', error);
      throw error;
    }
  }

  /**
   * Met à jour le statut d'écoute d'un audio
   * TRANSACTION: Garantit atomicité status + computed fields
   */
  async markAudioAsListened(
    userId: string,
    attachmentId: string,
    options?: {
      playPositionMs?: number;
      listenDurationMs?: number;
      complete?: boolean;
    }
  ): Promise<void> {
    try {
      const attachment = await this.prisma.messageAttachment.findUnique({
        where: { id: attachmentId },
        select: { id: true, messageId: true, message: { select: { conversationId: true } } }
      });

      if (!attachment) {
        throw new Error(`Attachment ${attachmentId} not found`);
      }

      const now = new Date();

      await withRetry(() => this.prisma.$transaction(async (tx) => {
        await tx.attachmentStatusEntry.upsert({
          where: {
            attachment_user_status: { attachmentId, userId }
          },
          create: {
            attachmentId,
            messageId: attachment.messageId,
            conversationId: attachment.message.conversationId,
            userId,
            listenedAt: now,
            listenCount: 1,
            lastPlayPositionMs: options?.playPositionMs,
            totalListenDurationMs: options?.listenDurationMs || 0,
            listenedComplete: options?.complete || false
          },
          update: {
            listenedAt: now,
            listenCount: { increment: 1 },
            lastPlayPositionMs: options?.playPositionMs,
            totalListenDurationMs: options?.listenDurationMs
              ? { increment: options.listenDurationMs }
              : undefined,
            listenedComplete: options?.complete
          }
        });
      }));

      // Mettre à jour les champs dénormalisés sur l'attachment (hors transaction)
      await this.updateAttachmentComputedStatus(attachmentId);

      console.log(`✅ [MessageReadStatus] User ${userId} listened to audio ${attachmentId}`);
    } catch (error) {
      console.error('[MessageReadStatus] Error marking audio as listened:', error);
      throw error;
    }
  }

  /**
   * Met à jour le statut de visionnage d'une vidéo
   * TRANSACTION: Garantit atomicité status + computed fields
   */
  async markVideoAsWatched(
    userId: string,
    attachmentId: string,
    options?: {
      watchPositionMs?: number;
      watchDurationMs?: number;
      complete?: boolean;
    }
  ): Promise<void> {
    try {
      const attachment = await this.prisma.messageAttachment.findUnique({
        where: { id: attachmentId },
        select: { id: true, messageId: true, message: { select: { conversationId: true } } }
      });

      if (!attachment) {
        throw new Error(`Attachment ${attachmentId} not found`);
      }

      const now = new Date();

      await withRetry(() => this.prisma.$transaction(async (tx) => {
        await tx.attachmentStatusEntry.upsert({
          where: {
            attachment_user_status: { attachmentId, userId }
          },
          create: {
            attachmentId,
            messageId: attachment.messageId,
            conversationId: attachment.message.conversationId,
            userId,
            watchedAt: now,
            watchCount: 1,
            lastWatchPositionMs: options?.watchPositionMs,
            totalWatchDurationMs: options?.watchDurationMs || 0,
            watchedComplete: options?.complete || false
          },
          update: {
            watchedAt: now,
            watchCount: { increment: 1 },
            lastWatchPositionMs: options?.watchPositionMs,
            totalWatchDurationMs: options?.watchDurationMs
              ? { increment: options.watchDurationMs }
              : undefined,
            watchedComplete: options?.complete
          }
        });
      }));

      // Mettre à jour les champs dénormalisés sur l'attachment (hors transaction)
      await this.updateAttachmentComputedStatus(attachmentId);

      console.log(`✅ [MessageReadStatus] User ${userId} watched video ${attachmentId}`);
    } catch (error) {
      console.error('[MessageReadStatus] Error marking video as watched:', error);
      throw error;
    }
  }

  /**
   * Met à jour le statut de vue d'une image
   * TRANSACTION: Garantit atomicité status + computed fields
   */
  async markImageAsViewed(
    userId: string,
    attachmentId: string,
    options?: {
      viewDurationMs?: number;
      wasZoomed?: boolean;
    }
  ): Promise<void> {
    try {
      const attachment = await this.prisma.messageAttachment.findUnique({
        where: { id: attachmentId },
        select: { id: true, messageId: true, message: { select: { conversationId: true } } }
      });

      if (!attachment) {
        throw new Error(`Attachment ${attachmentId} not found`);
      }

      const now = new Date();

      await withRetry(() => this.prisma.$transaction(async (tx) => {
        await tx.attachmentStatusEntry.upsert({
          where: {
            attachment_user_status: { attachmentId, userId }
          },
          create: {
            attachmentId,
            messageId: attachment.messageId,
            conversationId: attachment.message.conversationId,
            userId,
            viewedAt: now,
            viewDurationMs: options?.viewDurationMs,
            wasZoomed: options?.wasZoomed || false
          },
          update: {
            viewedAt: now,
            viewDurationMs: options?.viewDurationMs,
            wasZoomed: options?.wasZoomed
          }
        });
      }));

      // Mettre à jour les champs dénormalisés sur l'attachment (hors transaction)
      await this.updateAttachmentComputedStatus(attachmentId);

      console.log(`✅ [MessageReadStatus] User ${userId} viewed image ${attachmentId}`);
    } catch (error) {
      console.error('[MessageReadStatus] Error marking image as viewed:', error);
      throw error;
    }
  }

  /**
   * Met à jour le statut de téléchargement d'un attachment
   * TRANSACTION: Garantit atomicité status + computed fields
   */
  async markAttachmentAsDownloaded(
    userId: string,
    attachmentId: string
  ): Promise<void> {
    try {
      const attachment = await this.prisma.messageAttachment.findUnique({
        where: { id: attachmentId },
        select: { id: true, messageId: true, message: { select: { conversationId: true } } }
      });

      if (!attachment) {
        throw new Error(`Attachment ${attachmentId} not found`);
      }

      const now = new Date();

      await withRetry(() => this.prisma.$transaction(async (tx) => {
        await tx.attachmentStatusEntry.upsert({
          where: {
            attachment_user_status: { attachmentId, userId }
          },
          create: {
            attachmentId,
            messageId: attachment.messageId,
            conversationId: attachment.message.conversationId,
            userId,
            downloadedAt: now
          },
          update: {
            downloadedAt: now
          }
        });
      }));

      // Mettre à jour les champs dénormalisés sur l'attachment (hors transaction)
      await this.updateAttachmentComputedStatus(attachmentId);

      console.log(`✅ [MessageReadStatus] User ${userId} downloaded attachment ${attachmentId}`);
    } catch (error) {
      console.error('[MessageReadStatus] Error marking attachment as downloaded:', error);
      throw error;
    }
  }

  /**
   * Récupère le statut d'un attachment pour un utilisateur
   */
  async getAttachmentStatus(
    attachmentId: string,
    userId: string
  ): Promise<{
    viewed: boolean;
    downloaded: boolean;
    listened: boolean;
    watched: boolean;
    listenCount: number;
    watchCount: number;
    listenedComplete: boolean;
    watchedComplete: boolean;
    lastPlayPositionMs: number | null;
    lastWatchPositionMs: number | null;
  } | null> {
    try {
      const status = await this.prisma.attachmentStatusEntry.findUnique({
        where: {
          attachment_user_status: { attachmentId, userId }
        }
      });

      if (!status) {
        return null;
      }

      return {
        viewed: !!status.viewedAt,
        downloaded: !!status.downloadedAt,
        listened: !!status.listenedAt,
        watched: !!status.watchedAt,
        listenCount: status.listenCount,
        watchCount: status.watchCount,
        listenedComplete: status.listenedComplete,
        watchedComplete: status.watchedComplete,
        lastPlayPositionMs: status.lastPlayPositionMs,
        lastWatchPositionMs: status.lastWatchPositionMs
      };
    } catch (error) {
      console.error('[MessageReadStatus] Error getting attachment status:', error);
      return null;
    }
  }

  /**
   * Recalcule et met à jour le unreadCount pour un utilisateur/conversation
   */
  private async updateUnreadCount(userId: string, conversationId: string): Promise<void> {
    try {
      const cursor = await this.prisma.conversationReadCursor.findUnique({
        where: {
          conversation_user_cursor: { userId, conversationId }
        }
      });

      let unreadCount = 0;

      if (!cursor || !cursor.lastReadAt) {
        // Tous les messages sont non lus
        unreadCount = await this.prisma.message.count({
          where: {
            conversationId,
            isDeleted: false,
            senderId: { not: userId }
          }
        });
      } else {
        // Compter les messages après la dernière lecture
        unreadCount = await this.prisma.message.count({
          where: {
            conversationId,
            isDeleted: false,
            senderId: { not: userId },
            createdAt: { gt: cursor.lastReadAt }
          }
        });
      }

      // Mettre à jour le cache
      if (cursor) {
        await this.prisma.conversationReadCursor.update({
          where: { id: cursor.id },
          data: { unreadCount }
        });
      }
    } catch (error) {
      console.error('[MessageReadStatus] Error updating unread count:', error);
    }
  }

  /**
   * Met à jour les champs dénormalisés "all users" sur Message
   * Appelé après création/modification d'un MessageStatusEntry
   */
  private async updateMessageComputedStatus(messageId: string): Promise<void> {
    try {
      const message = await this.prisma.message.findUnique({
        where: { id: messageId },
        select: {
          id: true,
          conversationId: true,
          senderId: true,
          anonymousSenderId: true
        }
      });

      if (!message) return;

      const authorId = message.senderId || message.anonymousSenderId;

      // Compter le nombre total de participants (sauf l'expéditeur)
      const totalParticipants = await this.prisma.conversationMember.count({
        where: {
          conversationId: message.conversationId,
          isActive: true,
          ...(message.senderId ? { userId: { not: message.senderId } } : {})
        }
      });

      // Compter les statuts
      const [deliveredCount, readCount] = await Promise.all([
        this.prisma.messageStatusEntry.count({
          where: {
            messageId,
            deliveredAt: { not: null },
            userId: { not: authorId }
          }
        }),
        this.prisma.messageStatusEntry.count({
          where: {
            messageId,
            readAt: { not: null },
            userId: { not: authorId }
          }
        })
      ]);

      // Déterminer les dates "all"
      let deliveredToAllAt: Date | null = null;
      let readByAllAt: Date | null = null;

      if (deliveredCount >= totalParticipants && totalParticipants > 0) {
        // Récupérer la date du dernier delivery
        const lastDelivered = await this.prisma.messageStatusEntry.findFirst({
          where: {
            messageId,
            deliveredAt: { not: null },
            userId: { not: authorId }
          },
          orderBy: { deliveredAt: 'desc' },
          select: { deliveredAt: true }
        });
        deliveredToAllAt = lastDelivered?.deliveredAt || null;
      }

      if (readCount >= totalParticipants && totalParticipants > 0) {
        // Récupérer la date du dernier read
        const lastRead = await this.prisma.messageStatusEntry.findFirst({
          where: {
            messageId,
            readAt: { not: null },
            userId: { not: authorId }
          },
          orderBy: { readAt: 'desc' },
          select: { readAt: true }
        });
        readByAllAt = lastRead?.readAt || null;
      }

      // Mettre à jour le message
      await this.prisma.message.update({
        where: { id: messageId },
        data: {
          deliveredCount,
          readCount,
          deliveredToAllAt,
          readByAllAt
        }
      });
    } catch (error) {
      console.error('[MessageReadStatus] Error updating message computed status:', error);
    }
  }

  /**
   * Met à jour les champs dénormalisés "all users" sur MessageAttachment
   * Appelé après création/modification d'un AttachmentStatusEntry
   */
  private async updateAttachmentComputedStatus(attachmentId: string): Promise<void> {
    try {
      const attachment = await this.prisma.messageAttachment.findUnique({
        where: { id: attachmentId },
        select: {
          id: true,
          messageId: true,
          mimeType: true,
          message: {
            select: {
              conversationId: true,
              senderId: true,
              anonymousSenderId: true
            }
          }
        }
      });

      if (!attachment) return;

      const authorId = attachment.message.senderId || attachment.message.anonymousSenderId;
      const conversationId = attachment.message.conversationId;

      // Compter le nombre total de participants (sauf l'expéditeur)
      const totalParticipants = await this.prisma.conversationMember.count({
        where: {
          conversationId,
          isActive: true,
          ...(attachment.message.senderId ? { userId: { not: attachment.message.senderId } } : {})
        }
      });

      // Compter les statuts
      const [viewedCount, downloadedCount, listenedCount, watchedCount] = await Promise.all([
        this.prisma.attachmentStatusEntry.count({
          where: { attachmentId, viewedAt: { not: null }, userId: { not: authorId } }
        }),
        this.prisma.attachmentStatusEntry.count({
          where: { attachmentId, downloadedAt: { not: null }, userId: { not: authorId } }
        }),
        this.prisma.attachmentStatusEntry.count({
          where: { attachmentId, listenedAt: { not: null }, userId: { not: authorId } }
        }),
        this.prisma.attachmentStatusEntry.count({
          where: { attachmentId, watchedAt: { not: null }, userId: { not: authorId } }
        })
      ]);

      // Déterminer le type d'attachement pour consumedCount
      const isAudio = attachment.mimeType.startsWith('audio/');
      const isVideo = attachment.mimeType.startsWith('video/');
      const consumedCount = isAudio ? listenedCount : isVideo ? watchedCount : viewedCount;

      // Déterminer les dates "all"
      let viewedByAllAt: Date | null = null;
      let downloadedByAllAt: Date | null = null;
      let listenedByAllAt: Date | null = null;
      let watchedByAllAt: Date | null = null;

      if (totalParticipants > 0) {
        if (viewedCount >= totalParticipants) {
          const last = await this.prisma.attachmentStatusEntry.findFirst({
            where: { attachmentId, viewedAt: { not: null }, userId: { not: authorId } },
            orderBy: { viewedAt: 'desc' },
            select: { viewedAt: true }
          });
          viewedByAllAt = last?.viewedAt || null;
        }

        if (downloadedCount >= totalParticipants) {
          const last = await this.prisma.attachmentStatusEntry.findFirst({
            where: { attachmentId, downloadedAt: { not: null }, userId: { not: authorId } },
            orderBy: { downloadedAt: 'desc' },
            select: { downloadedAt: true }
          });
          downloadedByAllAt = last?.downloadedAt || null;
        }

        if (listenedCount >= totalParticipants && isAudio) {
          const last = await this.prisma.attachmentStatusEntry.findFirst({
            where: { attachmentId, listenedAt: { not: null }, userId: { not: authorId } },
            orderBy: { listenedAt: 'desc' },
            select: { listenedAt: true }
          });
          listenedByAllAt = last?.listenedAt || null;
        }

        if (watchedCount >= totalParticipants && isVideo) {
          const last = await this.prisma.attachmentStatusEntry.findFirst({
            where: { attachmentId, watchedAt: { not: null }, userId: { not: authorId } },
            orderBy: { watchedAt: 'desc' },
            select: { watchedAt: true }
          });
          watchedByAllAt = last?.watchedAt || null;
        }
      }

      // Mettre à jour l'attachment
      await this.prisma.messageAttachment.update({
        where: { id: attachmentId },
        data: {
          viewedCount,
          downloadedCount,
          consumedCount,
          viewedByAllAt,
          downloadedByAllAt,
          listenedByAllAt,
          watchedByAllAt
        }
      });
    } catch (error) {
      console.error('[MessageReadStatus] Error updating attachment computed status:', error);
    }
  }

  /**
   * Nettoie les curseurs obsolètes
   */
  async cleanupObsoleteCursors(conversationId: string): Promise<number> {
    try {
      const cursors = await this.prisma.conversationReadCursor.findMany({
        where: { conversationId },
        select: { id: true, lastReadMessageId: true }
      });

      if (cursors.length === 0) {
        return 0;
      }

      const messageIds = cursors
        .map(c => c.lastReadMessageId)
        .filter((id): id is string => id !== null);

      const existingMessages = await this.prisma.message.findMany({
        where: {
          id: { in: messageIds },
          isDeleted: false
        },
        select: { id: true }
      });

      const existingMessageIds = new Set(existingMessages.map(m => m.id));

      const obsoleteCursorIds = cursors
        .filter(c => c.lastReadMessageId && !existingMessageIds.has(c.lastReadMessageId))
        .map(c => c.id);

      if (obsoleteCursorIds.length > 0) {
        await this.prisma.conversationReadCursor.deleteMany({
          where: { id: { in: obsoleteCursorIds } }
        });
      }

      console.log(`✅ [MessageReadStatus] Cleaned up ${obsoleteCursorIds.length} obsolete cursors in conversation ${conversationId}`);
      return obsoleteCursorIds.length;
    } catch (error) {
      console.error('[MessageReadStatus] Error cleaning up cursors:', error);
      throw error;
    }
  }
}
