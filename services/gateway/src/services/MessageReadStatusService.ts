/**
 * Service de gestion des statuts de lecture/réception des messages
 *
 * Architecture simplifiée (Time-Based Cursor):
 * - ConversationReadCursor: Source de vérité unique pour le statut de lecture via `lastReadAt`.
 * - Plus de création coûteuse de MessageStatusEntry pour chaque message texte.
 * - Les statuts "Lu par" sont calculés dynamiquement en comparant message.createdAt <= cursor.lastReadAt.
 * - AttachmentStatusEntry est conservé pour le suivi granulaire des médias (audio écouté, vidéo vue).
 */

import { PrismaClient, Message, Prisma } from "@meeshy/shared/prisma/client";

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
      if (error?.code === "P2034" && attempt < maxRetries - 1) {
        // Exponential backoff avec jitter
        const delay = baseDelayMs * Math.pow(2, attempt) + Math.random() * 50;
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }

      throw error;
    }
  }

  throw lastError;
}

export class MessageReadStatusService {
  /**
   * Cache statique pour éviter les appels multiples à markMessagesAsReceived/Read
   * Clé: `${userId}:${conversationId}:${type}` -> timestamp du dernier appel
   * TTL: 2 secondes (nettoyé automatiquement)
   */
  private static recentActionCache = new Map<string, number>();
  private static readonly DEDUP_TTL_MS = 2000;

  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Nettoie les entrées expirées du cache de déduplication
   */
  private static cleanupDedupCache(): void {
    const cleanupNow = Date.now();
    const keysToDelete: string[] = [];

    MessageReadStatusService.recentActionCache.forEach((timestamp, key) => {
      if (cleanupNow - timestamp > MessageReadStatusService.DEDUP_TTL_MS) {
        keysToDelete.push(key);
      }
    });

    keysToDelete.forEach((key) =>
      MessageReadStatusService.recentActionCache.delete(key)
    );
  }

  /**
   * Calcule le nombre de messages non lus dans une conversation pour un utilisateur
   * Utilise le cache unreadCount du curseur pour performance
   */
  async getUnreadCount(
    userId: string,
    conversationId: string
  ): Promise<number> {
    try {
      // Récupérer le curseur de l'utilisateur
      const cursor = await this.prisma.conversationReadCursor.findUnique({
        where: {
          conversation_user_cursor: { userId, conversationId },
        },
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
          senderId: { not: userId },
        },
      });
    } catch (error) {
      console.error("[MessageReadStatus] Error getting unread count:", error);
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
          conversationId: { in: conversationIds },
        },
      });

      // Map conversationId → unreadCount
      const unreadCounts = new Map<string, number>();

      // Initialiser à 0 par défaut
      conversationIds.forEach((id) => unreadCounts.set(id, 0));

      // Remplir avec les valeurs connues
      for (const cursor of cursors) {
        unreadCounts.set(cursor.conversationId, cursor.unreadCount);
      }

      return unreadCounts;
    } catch (error) {
      console.error("[MessageReadStatus] Error getting unread counts:", error);
      return new Map();
    }
  }

  /**
   * Marque les messages comme reçus pour un utilisateur connecté
   * Simplifié: Met à jour le curseur `lastDeliveredAt` UNIQUEMENT.
   */
  async markMessagesAsReceived(
    userId: string,
    conversationId: string,
    latestMessageId?: string
  ): Promise<void> {
    try {
      const dedupKey = `${userId}:${conversationId}:received`;
      const dedupNow = Date.now();
      const lastCall = MessageReadStatusService.recentActionCache.get(dedupKey);

      if (
        lastCall &&
        dedupNow - lastCall < MessageReadStatusService.DEDUP_TTL_MS
      ) {
        return;
      }

      MessageReadStatusService.recentActionCache.set(dedupKey, dedupNow);
      if (MessageReadStatusService.recentActionCache.size > 100) {
        MessageReadStatusService.cleanupDedupCache();
      }

      let messageId = latestMessageId;
      if (!messageId) {
        const latestMessage = await this.prisma.message.findFirst({
          where: { conversationId, isDeleted: false },
          orderBy: { createdAt: "desc" },
          select: { id: true },
        });

        if (!latestMessage) return;
        messageId = latestMessage.id;
      }

      const now = new Date();

      await this.prisma.conversationReadCursor.upsert({
        where: {
          conversation_user_cursor: { userId, conversationId },
        },
        create: {
          userId,
          conversationId,
          lastDeliveredMessageId: messageId,
          lastDeliveredAt: now,
          unreadCount: 0,
          version: 0,
        },
        update: {
          lastDeliveredMessageId: messageId,
          lastDeliveredAt: now,
          version: { increment: 1 },
        },
      });

      // Mettre à jour le compteur (au cas où de nouveaux messages seraient arrivés entre temps)
      await this.updateUnreadCount(userId, conversationId);

      console.log(
        `✅ [MessageReadStatus] User ${userId} received update in conversation ${conversationId}`
      );
    } catch (error) {
      console.error(
        "[MessageReadStatus] Error marking messages as received:",
        error
      );
      throw error;
    }
  }

  /**
   * Marque les messages comme lus pour un utilisateur
   * Simplifié: Met à jour `lastReadAt` dans `ConversationReadCursor`.
   */
  async markMessagesAsRead(
    userId: string,
    conversationId: string,
    latestMessageId?: string
  ): Promise<void> {
    try {
      const dedupKey = `${userId}:${conversationId}:read`;
      const dedupNow = Date.now();
      const lastCall = MessageReadStatusService.recentActionCache.get(dedupKey);

      if (
        lastCall &&
        dedupNow - lastCall < MessageReadStatusService.DEDUP_TTL_MS
      ) {
        return;
      }
      MessageReadStatusService.recentActionCache.set(dedupKey, dedupNow);

      const now = new Date();
      let messageId = latestMessageId;

      if (!messageId) {
        const latestMessage = await this.prisma.message.findFirst({
          where: { conversationId, isDeleted: false },
          orderBy: { createdAt: "desc" },
          select: { id: true },
        });
        if (!latestMessage) return;
        messageId = latestMessage.id;
      }

      await this.prisma.conversationReadCursor.upsert({
        where: {
          conversation_user_cursor: { userId, conversationId },
        },
        create: {
          userId,
          conversationId,
          lastReadMessageId: messageId,
          lastReadAt: now,
          lastDeliveredMessageId: messageId,
          lastDeliveredAt: now,
          unreadCount: 0,
          version: 0,
        },
        update: {
          lastReadMessageId: messageId,
          lastReadAt: now,
          unreadCount: 0,
          version: { increment: 1 },
        },
      });

      console.log(
        `✅ [MessageReadStatus] User ${userId} marked conversation ${conversationId} as read`
      );

      // Synchroniser avec les notifications
      try {
        const { NotificationService } = await import(
          "./notifications/NotificationService"
        );
        const notificationService = new NotificationService(this.prisma);
        await notificationService.markConversationNotificationsAsRead(
          userId,
          conversationId
        );
      } catch (notifError) {
        console.warn(
          "[MessageReadStatus] Error syncing notifications:",
          notifError
        );
      }
    } catch (error) {
      console.error(
        "[MessageReadStatus] Error marking messages as read:",
        error
      );
      throw error;
    }
  }

  /**
   * Récupère le statut de lecture d'un message spécifique via les curseurs
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
      const message = await this.prisma.message.findUnique({
        where: { id: messageId },
        select: { createdAt: true, senderId: true, anonymousSenderId: true },
      });

      if (!message) throw new Error(`Message ${messageId} not found`);

      const authorId = message.senderId || message.anonymousSenderId;

      const members = await this.prisma.conversationMember.findMany({
        where: { conversationId, isActive: true },
        select: { userId: true },
      });

      const totalMembers = Math.max(
        0,
        members.length - (message.senderId ? 1 : 0)
      );

      const cursors = await this.prisma.conversationReadCursor.findMany({
        where: {
          conversationId,
          userId: { not: authorId },
        },
        include: {
          user: { select: { id: true, username: true } },
        },
      });

      const receivedBy: Array<{
        userId: string;
        username: string;
        receivedAt: Date;
      }> = [];
      const readBy: Array<{ userId: string; username: string; readAt: Date }> =
        [];

      for (const cursor of cursors) {
        if (!cursor.user) continue;

        if (
          cursor.lastDeliveredAt &&
          cursor.lastDeliveredAt >= message.createdAt
        ) {
          receivedBy.push({
            userId: cursor.userId!,
            username: cursor.user.username,
            receivedAt: cursor.lastDeliveredAt,
          });
        }

        if (cursor.lastReadAt && cursor.lastReadAt >= message.createdAt) {
          readBy.push({
            userId: cursor.userId!,
            username: cursor.user.username,
            readAt: cursor.lastReadAt,
          });
        }
      }

      return {
        messageId,
        totalMembers,
        receivedCount: receivedBy.length,
        readCount: readBy.length,
        receivedBy,
        readBy,
      };
    } catch (error) {
      console.error(
        "[MessageReadStatus] Error getting message read status:",
        error
      );
      throw error;
    }
  }

  /**
   * Récupère les statuts de lecture pour plusieurs messages via les curseurs
   */
  async getConversationReadStatuses(
    conversationId: string,
    messageIds: string[]
  ): Promise<Map<string, { receivedCount: number; readCount: number }>> {
    try {
      const messages = await this.prisma.message.findMany({
        where: { id: { in: messageIds }, conversationId },
        select: { id: true, createdAt: true, senderId: true },
      });

      const cursors = await this.prisma.conversationReadCursor.findMany({
        where: { conversationId },
        select: { userId: true, lastReadAt: true, lastDeliveredAt: true },
      });

      const statusMap = new Map<
        string,
        { receivedCount: number; readCount: number }
      >();

      for (const msg of messages) {
        let receivedCount = 0;
        let readCount = 0;

        for (const cursor of cursors) {
          if (cursor.userId === msg.senderId) continue;

          if (
            cursor.lastDeliveredAt &&
            cursor.lastDeliveredAt >= msg.createdAt
          ) {
            receivedCount++;
          }
          if (cursor.lastReadAt && cursor.lastReadAt >= msg.createdAt) {
            readCount++;
          }
        }

        statusMap.set(msg.id, { receivedCount, readCount });
      }

      return statusMap;
    } catch (error) {
      console.error(
        "[MessageReadStatus] Error getting conversation read statuses:",
        error
      );
      throw error;
    }
  }

  async getMessageStatusDetails(
    messageId: string,
    options: {
      offset?: number;
      limit?: number;
      filter?: "all" | "delivered" | "read" | "unread";
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
    // Cette méthode interrogeait directement MessageStatusEntry.
    // Pour supporter le nouveau système, on va interroger les curseurs et filtrer.
    const { offset = 0, limit = 20, filter = "all" } = options;

    try {
      const message = await this.prisma.message.findUnique({
        where: { id: messageId },
        select: { createdAt: true, conversationId: true },
      });

      if (!message) throw new Error("Message not found");

      const cursors = await this.prisma.conversationReadCursor.findMany({
        where: { conversationId: message.conversationId },
        include: {
          user: { select: { id: true, username: true, avatar: true } },
        },
      });

      let results: any[] = [];

      for (const cursor of cursors) {
        if (!cursor.user) continue;

        const deliveredAt =
          cursor.lastDeliveredAt && cursor.lastDeliveredAt >= message.createdAt
            ? cursor.lastDeliveredAt
            : null;
        const readAt =
          cursor.lastReadAt && cursor.lastReadAt >= message.createdAt
            ? cursor.lastReadAt
            : null;

        if (filter === "delivered" && !deliveredAt) continue;
        if (filter === "read" && !readAt) continue;
        if (filter === "unread" && readAt) continue; // Si lu, on ignore pour 'unread'

        results.push({
          userId: cursor.userId!,
          username: cursor.user.username,
          avatar: cursor.user.avatar,
          deliveredAt,
          receivedAt: deliveredAt, // Assimilé à delivered
          readAt,
          readDevice: null, // Info perdue avec la simplification, null par défaut
        });
      }

      const total = results.length;
      const pagedResults = results.slice(offset, offset + limit);

      return {
        statuses: pagedResults,
        pagination: {
          total,
          limit,
          offset,
          hasMore: offset + limit < total,
        },
      };
    } catch (error) {
      console.error(
        "[MessageReadStatus] Error getting message status details:",
        error
      );
      throw error;
    }
  }

  async getAttachmentStatusDetails(
    attachmentId: string,
    options: {
      offset?: number;
      limit?: number;
      filter?: "all" | "viewed" | "downloaded" | "listened" | "watched";
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
    const { offset = 0, limit = 20, filter = "all" } = options;

    try {
      const whereClause: any = { attachmentId };
      if (filter === "viewed") whereClause.viewedAt = { not: null };
      else if (filter === "downloaded")
        whereClause.downloadedAt = { not: null };
      else if (filter === "listened") whereClause.listenedAt = { not: null };
      else if (filter === "watched") whereClause.watchedAt = { not: null };

      const total = await this.prisma.attachmentStatusEntry.count({
        where: whereClause,
      });

      const statuses = await this.prisma.attachmentStatusEntry.findMany({
        where: whereClause,
        take: limit,
        skip: offset,
        orderBy: { createdAt: "desc" },
        include: {
          user: { select: { id: true, username: true, avatar: true } },
        },
      });

      return {
        statuses: statuses.map((s) => ({
          userId: s.userId!,
          username: s.user?.username || "Unknown",
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
          lastWatchPositionMs: s.lastWatchPositionMs,
        })),
        pagination: {
          total,
          limit,
          offset,
          hasMore: offset + statuses.length < total,
        },
      };
    } catch (error) {
      console.error(
        "[MessageReadStatus] Error getting attachment status details:",
        error
      );
      throw error;
    }
  }

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
        select: {
          id: true,
          messageId: true,
          message: { select: { conversationId: true } },
        },
      });

      if (!attachment) {
        throw new Error(`Attachment ${attachmentId} not found`);
      }

      const now = new Date();

      await withRetry(() =>
        this.prisma.$transaction(async (tx) => {
          await tx.attachmentStatusEntry.upsert({
            where: {
              attachment_user_status: { attachmentId, userId },
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
              listenedComplete: options?.complete || false,
            },
            update: {
              listenedAt: now,
              listenCount: { increment: 1 },
              lastPlayPositionMs: options?.playPositionMs,
              totalListenDurationMs: options?.listenDurationMs
                ? { increment: options.listenDurationMs }
                : undefined,
              listenedComplete: options?.complete,
            },
          });
        })
      );

      await this.updateAttachmentComputedStatus(attachmentId);
    } catch (error) {
      console.error(
        "[MessageReadStatus] Error marking audio as listened:",
        error
      );
      throw error;
    }
  }

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
        select: {
          id: true,
          messageId: true,
          message: { select: { conversationId: true } },
        },
      });

      if (!attachment) {
        throw new Error(`Attachment ${attachmentId} not found`);
      }

      const now = new Date();

      await withRetry(() =>
        this.prisma.$transaction(async (tx) => {
          await tx.attachmentStatusEntry.upsert({
            where: {
              attachment_user_status: { attachmentId, userId },
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
              watchedComplete: options?.complete || false,
            },
            update: {
              watchedAt: now,
              watchCount: { increment: 1 },
              lastWatchPositionMs: options?.watchPositionMs,
              totalWatchDurationMs: options?.watchDurationMs
                ? { increment: options.watchDurationMs }
                : undefined,
              watchedComplete: options?.complete,
            },
          });
        })
      );

      await this.updateAttachmentComputedStatus(attachmentId);
    } catch (error) {
      console.error(
        "[MessageReadStatus] Error marking video as watched:",
        error
      );
      throw error;
    }
  }

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
        select: {
          id: true,
          messageId: true,
          message: { select: { conversationId: true } },
        },
      });

      if (!attachment) {
        throw new Error(`Attachment ${attachmentId} not found`);
      }

      const now = new Date();

      await withRetry(() =>
        this.prisma.$transaction(async (tx) => {
          await tx.attachmentStatusEntry.upsert({
            where: {
              attachment_user_status: { attachmentId, userId },
            },
            create: {
              attachmentId,
              messageId: attachment.messageId,
              conversationId: attachment.message.conversationId,
              userId,
              viewedAt: now,
              viewDurationMs: options?.viewDurationMs,
              wasZoomed: options?.wasZoomed || false,
            },
            update: {
              viewedAt: now,
              viewDurationMs: options?.viewDurationMs,
              wasZoomed: options?.wasZoomed,
            },
          });
        })
      );

      await this.updateAttachmentComputedStatus(attachmentId);
    } catch (error) {
      console.error(
        "[MessageReadStatus] Error marking image as viewed:",
        error
      );
      throw error;
    }
  }

  async markAttachmentAsDownloaded(
    userId: string,
    attachmentId: string
  ): Promise<void> {
    try {
      const attachment = await this.prisma.messageAttachment.findUnique({
        where: { id: attachmentId },
        select: {
          id: true,
          messageId: true,
          message: { select: { conversationId: true } },
        },
      });

      if (!attachment) {
        throw new Error(`Attachment ${attachmentId} not found`);
      }

      const now = new Date();

      await withRetry(() =>
        this.prisma.$transaction(async (tx) => {
          await tx.attachmentStatusEntry.upsert({
            where: {
              attachment_user_status: { attachmentId, userId },
            },
            create: {
              attachmentId,
              messageId: attachment.messageId,
              conversationId: attachment.message.conversationId,
              userId,
              downloadedAt: now,
            },
            update: {
              downloadedAt: now,
            },
          });
        })
      );

      await this.updateAttachmentComputedStatus(attachmentId);
    } catch (error) {
      console.error(
        "[MessageReadStatus] Error marking attachment as downloaded:",
        error
      );
      throw error;
    }
  }

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
          attachment_user_status: { attachmentId, userId },
        },
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
        lastWatchPositionMs: status.lastWatchPositionMs,
      };
    } catch (error) {
      console.error(
        "[MessageReadStatus] Error getting attachment status:",
        error
      );
      return null;
    }
  }

  private async updateUnreadCount(
    userId: string,
    conversationId: string
  ): Promise<void> {
    try {
      const cursor = await this.prisma.conversationReadCursor.findUnique({
        where: {
          conversation_user_cursor: { userId, conversationId },
        },
      });

      let unreadCount = 0;

      if (!cursor || !cursor.lastReadAt) {
        unreadCount = await this.prisma.message.count({
          where: {
            conversationId,
            isDeleted: false,
            senderId: { not: userId },
          },
        });
      } else {
        unreadCount = await this.prisma.message.count({
          where: {
            conversationId,
            isDeleted: false,
            senderId: { not: userId },
            createdAt: { gt: cursor.lastReadAt },
          },
        });
      }

      if (cursor) {
        await this.prisma.conversationReadCursor.update({
          where: { id: cursor.id },
          data: { unreadCount },
        });
      }
    } catch (error) {
      console.error("[MessageReadStatus] Error updating unread count:", error);
    }
  }

  // No-op method replacing legacy implementation
  async updateMessageComputedStatus(messageId: string): Promise<void> {
    // Legacy: Computed fields are no longer stored on Message to improve write performance.
    // Read statuses are computed dynamically via cursors.
    return;
  }

  private async updateAttachmentComputedStatus(
    attachmentId: string
  ): Promise<void> {
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
              anonymousSenderId: true,
            },
          },
        },
      });

      if (!attachment) return;

      const authorId =
        attachment.message.senderId || attachment.message.anonymousSenderId;
      const conversationId = attachment.message.conversationId;

      const totalParticipants = await this.prisma.conversationMember.count({
        where: {
          conversationId,
          isActive: true,
          ...(attachment.message.senderId
            ? { userId: { not: attachment.message.senderId } }
            : {}),
        },
      });

      const [viewedCount, downloadedCount, listenedCount, watchedCount] =
        await Promise.all([
          this.prisma.attachmentStatusEntry.count({
            where: {
              attachmentId,
              viewedAt: { not: null },
              userId: { not: authorId },
            },
          }),
          this.prisma.attachmentStatusEntry.count({
            where: {
              attachmentId,
              downloadedAt: { not: null },
              userId: { not: authorId },
            },
          }),
          this.prisma.attachmentStatusEntry.count({
            where: {
              attachmentId,
              listenedAt: { not: null },
              userId: { not: authorId },
            },
          }),
          this.prisma.attachmentStatusEntry.count({
            where: {
              attachmentId,
              watchedAt: { not: null },
              userId: { not: authorId },
            },
          }),
        ]);

      const isAudio = attachment.mimeType.startsWith("audio/");
      const isVideo = attachment.mimeType.startsWith("video/");
      const consumedCount = isAudio
        ? listenedCount
        : isVideo
        ? watchedCount
        : viewedCount;

      let viewedByAllAt: Date | null = null;
      let downloadedByAllAt: Date | null = null;
      let listenedByAllAt: Date | null = null;
      let watchedByAllAt: Date | null = null;

      if (totalParticipants > 0) {
        if (viewedCount >= totalParticipants) {
          const last = await this.prisma.attachmentStatusEntry.findFirst({
            where: {
              attachmentId,
              viewedAt: { not: null },
              userId: { not: authorId },
            },
            orderBy: { viewedAt: "desc" },
            select: { viewedAt: true },
          });
          viewedByAllAt = last?.viewedAt || null;
        }

        if (downloadedCount >= totalParticipants) {
          const last = await this.prisma.attachmentStatusEntry.findFirst({
            where: {
              attachmentId,
              downloadedAt: { not: null },
              userId: { not: authorId },
            },
            orderBy: { downloadedAt: "desc" },
            select: { downloadedAt: true },
          });
          downloadedByAllAt = last?.downloadedAt || null;
        }

        if (listenedCount >= totalParticipants && isAudio) {
          const last = await this.prisma.attachmentStatusEntry.findFirst({
            where: {
              attachmentId,
              listenedAt: { not: null },
              userId: { not: authorId },
            },
            orderBy: { listenedAt: "desc" },
            select: { listenedAt: true },
          });
          listenedByAllAt = last?.listenedAt || null;
        }

        if (watchedCount >= totalParticipants && isVideo) {
          const last = await this.prisma.attachmentStatusEntry.findFirst({
            where: {
              attachmentId,
              watchedAt: { not: null },
              userId: { not: authorId },
            },
            orderBy: { watchedAt: "desc" },
            select: { watchedAt: true },
          });
          watchedByAllAt = last?.watchedAt || null;
        }
      }

      await this.prisma.messageAttachment.update({
        where: { id: attachmentId },
        data: {
          viewedCount,
          downloadedCount,
          consumedCount,
          viewedByAllAt,
          downloadedByAllAt,
          listenedByAllAt,
          watchedByAllAt,
        },
      });
    } catch (error) {
      console.error(
        "[MessageReadStatus] Error updating attachment computed status:",
        error
      );
    }
  }

  async cleanupObsoleteCursors(conversationId: string): Promise<number> {
    try {
      const cursors = await this.prisma.conversationReadCursor.findMany({
        where: { conversationId },
        select: { id: true, lastReadMessageId: true },
      });

      if (cursors.length === 0) {
        return 0;
      }

      const messageIds = cursors
        .map((c) => c.lastReadMessageId)
        .filter((id): id is string => id !== null);

      const existingMessages = await this.prisma.message.findMany({
        where: {
          id: { in: messageIds },
          isDeleted: false,
        },
        select: { id: true },
      });

      const existingMessageIds = new Set(existingMessages.map((m) => m.id));

      const obsoleteCursorIds = cursors
        .filter(
          (c) =>
            c.lastReadMessageId && !existingMessageIds.has(c.lastReadMessageId)
        )
        .map((c) => c.id);

      if (obsoleteCursorIds.length > 0) {
        await this.prisma.conversationReadCursor.deleteMany({
          where: { id: { in: obsoleteCursorIds } },
        });
      }

      console.log(
        `✅ [MessageReadStatus] Cleaned up ${obsoleteCursorIds.length} obsolete cursors in conversation ${conversationId}`
      );
      return obsoleteCursorIds.length;
    } catch (error) {
      console.error("[MessageReadStatus] Error cleaning up cursors:", error);
      throw error;
    }
  }
}
