/**
 * NotificationService - Orchestrateur principal des notifications
 *
 * Responsabilités :
 * - Orchestrer les sous-services (Firebase, Socket, Formatter)
 * - Créer et gérer les notifications en base de données
 * - Appliquer les préférences utilisateur et anti-spam
 * - Fournir une API high-level pour tous les types de notifications
 */

import { PrismaClient } from '@meeshy/shared/prisma/client';
import type { Server as SocketIOServer } from 'socket.io';
import { logger } from '../../utils/logger';
import { notificationLogger, securityLogger } from '../../utils/logger-enhanced';
import { SecuritySanitizer } from '../../utils/sanitize';

import { FirebaseNotificationService } from './FirebaseNotificationService';
import { SocketNotificationService } from './SocketNotificationService';
import { NotificationFormatter } from './NotificationFormatter';
import type {
  CreateNotificationData,
  NotificationEventData,
  SenderInfo,
  NotificationMetrics,
  NotificationStats
} from './types';

export class NotificationService {
  private firebaseService: FirebaseNotificationService;
  private socketService: SocketNotificationService;
  private formatter: NotificationFormatter;

  // Anti-spam: tracking des mentions récentes par paire (sender, recipient)
  private recentMentions: Map<string, number[]> = new Map();
  private readonly MAX_MENTIONS_PER_MINUTE = 5;
  private readonly MENTION_WINDOW_MS = 60000; // 1 minute

  // Métriques
  private metrics = {
    notificationsCreated: 0,
    webSocketSent: 0,
    firebaseSent: 0,
    firebaseFailed: 0
  };

  constructor(private prisma: PrismaClient) {
    this.firebaseService = new FirebaseNotificationService(prisma);
    this.socketService = new SocketNotificationService();
    this.formatter = new NotificationFormatter();

    // Nettoyer les mentions anciennes toutes les 2 minutes
    setInterval(() => this.cleanupOldMentions(), 120000);
  }

  /**
   * Initialiser le service avec Socket.IO
   */
  setSocketIO(io: SocketIOServer, userSocketsMap: Map<string, Set<string>>): void {
    this.socketService.setSocketIO(io, userSocketsMap);
    logger.info('📢 NotificationService: Socket.IO initialized');
  }

  /**
   * Obtenir les métriques du service de notifications
   */
  getMetrics(): NotificationMetrics {
    return {
      ...this.metrics,
      firebaseEnabled: this.firebaseService.isAvailable()
    };
  }

  /**
   * Créer une notification et l'émettre en temps réel
   */
  async createNotification(data: CreateNotificationData): Promise<NotificationEventData | null> {
    try {
      // SECURITY: Validate notification type
      if (!SecuritySanitizer.isValidNotificationType(data.type)) {
        securityLogger.logViolation('INVALID_NOTIFICATION_TYPE', {
          type: data.type,
          userId: data.userId
        });
        throw new Error(`Invalid notification type: ${data.type}`);
      }

      // SECURITY: Validate priority
      if (data.priority && !SecuritySanitizer.isValidPriority(data.priority)) {
        securityLogger.logViolation('INVALID_NOTIFICATION_PRIORITY', {
          priority: data.priority,
          userId: data.userId
        });
        throw new Error(`Invalid notification priority: ${data.priority}`);
      }

      // Vérifier les préférences utilisateur
      const shouldSend = await this.shouldSendNotification(data.userId, data.type);
      if (!shouldSend) {
        notificationLogger.debug('Notification skipped due to user preferences', {
          type: data.type,
          userId: data.userId
        });
        return null;
      }

      notificationLogger.info('Creating notification', {
        type: data.type,
        userId: data.userId,
        conversationId: data.conversationId
      });

      // SECURITY: Sanitize all inputs
      const sanitizedData = this.sanitizeNotificationData(data);

      // Créer la notification en base de données
      const notification = await this.prisma.notification.create({
        data: sanitizedData
      });

      // Formater pour l'événement Socket.IO
      const notificationEvent = this.formatter.formatNotificationEvent(notification);

      // Incrémenter métrique
      this.metrics.notificationsCreated++;

      // 1. Émettre via WebSocket
      const socketSent = this.socketService.emitNotification(data.userId, notificationEvent);
      if (socketSent) this.metrics.webSocketSent++;

      // 2. Tenter Firebase Push (fire-and-forget)
      if (this.firebaseService.isAvailable()) {
        this.firebaseService.sendPushNotification(data.userId, notificationEvent)
          .then(success => {
            if (success) this.metrics.firebaseSent++;
            else this.metrics.firebaseFailed++;
          })
          .catch(() => this.metrics.firebaseFailed++);
      }

      logger.info('✅ Notification created and emitted', {
        notificationId: notification.id,
        type: notification.type,
        webSocketSent: socketSent,
        firebaseAvailable: this.firebaseService.isAvailable()
      });

      return notificationEvent;
    } catch (error) {
      logger.error('❌ Error creating notification:', error);
      return null;
    }
  }

  /**
   * Créer une notification pour un nouveau message
   */
  async createMessageNotification(data: {
    recipientId: string;
    senderId: string;
    senderUsername: string;
    senderAvatar?: string;
    senderDisplayName?: string;
    senderFirstName?: string;
    senderLastName?: string;
    messageContent: string;
    conversationId: string;
    messageId: string;
    conversationIdentifier?: string;
    conversationType?: string;
    conversationTitle?: string;
    attachments?: Array<{ id: string; filename: string; mimeType: string; fileSize: number }>;
  }): Promise<NotificationEventData | null> {
    const messagePreview = this.formatter.formatMessagePreview(
      data.messageContent,
      data.attachments,
      25
    );

    const attachmentInfo = this.formatter.formatAttachmentInfo(data.attachments);

    return this.createNotification({
      userId: data.recipientId,
      type: 'new_message',
      title: 'Nouveau message',
      content: messagePreview,
      priority: 'normal',
      senderId: data.senderId,
      senderUsername: data.senderUsername,
      senderAvatar: data.senderAvatar,
      senderDisplayName: data.senderDisplayName,
      senderFirstName: data.senderFirstName,
      senderLastName: data.senderLastName,
      messagePreview,
      conversationId: data.conversationId,
      messageId: data.messageId,
      data: {
        conversationIdentifier: data.conversationIdentifier,
        conversationType: data.conversationType,
        conversationTitle: data.conversationTitle,
        attachments: attachmentInfo
      }
    });
  }

  /**
   * Créer une notification pour un appel manqué
   */
  async createMissedCallNotification(data: {
    recipientId: string;
    callerId: string;
    callerUsername: string;
    callerAvatar?: string;
    conversationId: string;
    callSessionId: string;
    callType?: 'video' | 'audio';
  }): Promise<NotificationEventData | null> {
    const callTypeLabel = data.callType === 'audio' ? 'audio' : 'vidéo';
    const senderInfo = await this.fetchSenderInfo(data.callerId);

    return this.createNotification({
      userId: data.recipientId,
      type: 'missed_call',
      title: `Appel ${callTypeLabel} manqué`,
      content: 'Appel manqué',
      priority: 'high',
      senderId: data.callerId,
      senderUsername: senderInfo?.senderUsername || data.callerUsername,
      senderAvatar: senderInfo?.senderAvatar || data.callerAvatar,
      senderDisplayName: senderInfo?.senderDisplayName,
      senderFirstName: senderInfo?.senderFirstName,
      senderLastName: senderInfo?.senderLastName,
      conversationId: data.conversationId,
      callSessionId: data.callSessionId,
      data: {
        callType: data.callType || 'video'
      }
    });
  }

  /**
   * Créer des notifications de mention en batch (optimisé)
   */
  async createMentionNotificationsBatch(
    mentionedUserIds: string[],
    commonData: {
      senderId: string;
      senderUsername: string;
      senderAvatar?: string;
      senderDisplayName?: string;
      senderFirstName?: string;
      senderLastName?: string;
      messageContent: string;
      conversationId: string;
      conversationTitle?: string | null;
      messageId: string;
      attachments?: Array<{ id: string; filename: string; mimeType: string; fileSize: number }>;
    },
    memberIds: string[]
  ): Promise<number> {
    if (mentionedUserIds.length === 0) return 0;

    try {
      // Formater le message une seule fois
      const messagePreview = this.formatter.formatMessagePreview(
        commonData.messageContent,
        commonData.attachments,
        20
      );
      const attachmentInfo = this.formatter.formatAttachmentInfo(commonData.attachments);

      // Filtrer avec rate limiting et préférences
      const validUserIds = await this.filterMentionRecipients(
        mentionedUserIds,
        commonData.senderId
      );

      if (validUserIds.length === 0) return 0;

      // Créer les données de notification en batch
      const notificationsData = validUserIds.map(userId => {
        const isMember = memberIds.includes(userId);
        const content = isMember
          ? messagePreview
          : `${messagePreview}\n\nVous n'êtes pas membre de cette conversation. Cliquez pour la rejoindre.`;

        return this.formatter.createNotificationData(
          userId,
          'user_mentioned',
          'Mention',
          content,
          {
            priority: 'normal',
            senderId: commonData.senderId,
            senderUsername: commonData.senderUsername,
            senderAvatar: commonData.senderAvatar,
            senderDisplayName: commonData.senderDisplayName,
            senderFirstName: commonData.senderFirstName,
            senderLastName: commonData.senderLastName,
            messagePreview,
            conversationId: commonData.conversationId,
            messageId: commonData.messageId,
            data: {
              conversationTitle: commonData.conversationTitle,
              isMember,
              action: isMember ? 'view_message' : 'join_conversation',
              attachments: attachmentInfo
            }
          }
        );
      });

      // Créer en batch
      const result = await this.prisma.notification.createMany({
        data: notificationsData
      });

      // Récupérer et émettre via Socket.IO
      const createdNotifications = await this.prisma.notification.findMany({
        where: {
          messageId: commonData.messageId,
          type: 'user_mentioned',
          userId: { in: validUserIds }
        },
        orderBy: { createdAt: 'desc' },
        take: validUserIds.length
      });

      for (const notification of createdNotifications) {
        this.socketService.emitNotification(
          notification.userId,
          this.formatter.formatNotificationEvent(notification)
        );
      }

      this.metrics.notificationsCreated += result.count;
      logger.info(`✅ Created ${result.count} mention notifications in batch`);

      return result.count;
    } catch (error) {
      logger.error('❌ Error creating batch mention notifications:', error);
      return 0;
    }
  }

  /**
   * Marquer une notification comme lue
   */
  async markAsRead(notificationId: string, userId: string): Promise<boolean> {
    try {
      await this.prisma.notification.updateMany({
        where: { id: notificationId, userId },
        data: { isRead: true }
      });
      return true;
    } catch (error) {
      logger.error('❌ Error marking notification as read:', error);
      return false;
    }
  }

  /**
   * Marquer toutes les notifications comme lues
   */
  async markAllAsRead(userId: string): Promise<boolean> {
    try {
      await this.prisma.notification.updateMany({
        where: { userId, isRead: false },
        data: { isRead: true }
      });
      return true;
    } catch (error) {
      logger.error('❌ Error marking all notifications as read:', error);
      return false;
    }
  }

  /**
   * Marquer les notifications d'une conversation comme lues
   */
  async markConversationNotificationsAsRead(
    userId: string,
    conversationId: string
  ): Promise<number> {
    try {
      const result = await this.prisma.notification.updateMany({
        where: { userId, conversationId, isRead: false },
        data: { isRead: true }
      });

      logger.info('✅ Marked conversation notifications as read', {
        userId,
        conversationId,
        count: result.count
      });

      return result.count;
    } catch (error) {
      logger.error('❌ Error marking conversation notifications as read:', error);
      return 0;
    }
  }

  /**
   * Supprimer une notification
   */
  async deleteNotification(notificationId: string, userId: string): Promise<boolean> {
    try {
      await this.prisma.notification.deleteMany({
        where: { id: notificationId, userId }
      });
      return true;
    } catch (error) {
      logger.error('❌ Error deleting notification:', error);
      return false;
    }
  }

  /**
   * Obtenir le nombre de notifications non lues
   */
  async getUnreadCount(userId: string): Promise<number> {
    try {
      return await this.prisma.notification.count({
        where: { userId, isRead: false }
      });
    } catch (error) {
      logger.error('❌ Error getting unread count:', error);
      return 0;
    }
  }

  /**
   * Obtenir les statistiques des notifications
   */
  async getNotificationStats(userId: string): Promise<NotificationStats> {
    try {
      const [stats, totalCount, unreadCount] = await Promise.all([
        this.prisma.notification.groupBy({
          by: ['type'],
          where: { userId },
          _count: { id: true }
        }),
        this.prisma.notification.count({ where: { userId } }),
        this.prisma.notification.count({ where: { userId, isRead: false } })
      ]);

      return {
        total: totalCount,
        unread: unreadCount,
        byType: stats.reduce((acc: any, stat: any) => {
          acc[stat.type] = stat._count.id;
          return acc;
        }, {} as Record<string, number>)
      };
    } catch (error) {
      logger.error('❌ Error getting notification stats:', error);
      return { total: 0, unread: 0, byType: {} };
    }
  }

  // ========== PRIVATE HELPERS ==========

  /**
   * Vérifier si une notification doit être envoyée selon les préférences
   */
  private async shouldSendNotification(userId: string, type: string): Promise<boolean> {
    try {
      const preferences = await this.prisma.notificationPreference.findUnique({
        where: { userId }
      });

      if (!preferences) return true;

      // Vérifier Do Not Disturb
      if (preferences.dndEnabled && preferences.dndStartTime && preferences.dndEndTime) {
        const now = new Date();
        const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

        if (currentTime >= preferences.dndStartTime && currentTime <= preferences.dndEndTime) {
          logger.debug('📢 Notification supprimée (Do Not Disturb)', { userId, type });
          return false;
        }
      }

      // Vérifier les préférences par type
      const typeMap: Record<string, boolean> = {
        'new_message': preferences.newMessageEnabled,
        'message_reply': preferences.replyEnabled || preferences.newMessageEnabled,
        'user_mentioned': preferences.mentionEnabled || preferences.newMessageEnabled,
        'message_reaction': preferences.reactionEnabled,
        'missed_call': preferences.missedCallEnabled,
        'system': preferences.systemEnabled,
        'new_conversation': preferences.conversationEnabled,
        'new_conversation_direct': preferences.conversationEnabled,
        'new_conversation_group': preferences.conversationEnabled,
        'message_edited': preferences.conversationEnabled,
        'contact_request': preferences.contactRequestEnabled,
        'contact_accepted': preferences.contactRequestEnabled,
        'member_joined': preferences.memberJoinedEnabled
      };

      return typeMap[type] !== undefined ? typeMap[type] : true;
    } catch (error) {
      logger.error('❌ Error checking notification preferences:', error);
      return true;
    }
  }

  /**
   * Sanitiser les données d'une notification
   */
  private sanitizeNotificationData(data: CreateNotificationData): any {
    return {
      userId: data.userId,
      type: data.type,
      title: SecuritySanitizer.sanitizeText(data.title),
      content: SecuritySanitizer.sanitizeText(data.content),
      priority: data.priority || 'normal',
      senderId: data.senderId,
      senderUsername: data.senderUsername
        ? SecuritySanitizer.sanitizeUsername(data.senderUsername)
        : undefined,
      senderAvatar: data.senderAvatar
        ? SecuritySanitizer.sanitizeURL(data.senderAvatar)
        : undefined,
      senderDisplayName: data.senderDisplayName
        ? SecuritySanitizer.sanitizeText(data.senderDisplayName)
        : undefined,
      senderFirstName: data.senderFirstName
        ? SecuritySanitizer.sanitizeText(data.senderFirstName)
        : undefined,
      senderLastName: data.senderLastName
        ? SecuritySanitizer.sanitizeText(data.senderLastName)
        : undefined,
      messagePreview: data.messagePreview
        ? SecuritySanitizer.sanitizeText(data.messagePreview)
        : undefined,
      conversationId: data.conversationId,
      messageId: data.messageId,
      callSessionId: data.callSessionId,
      data: data.data ? JSON.stringify(SecuritySanitizer.sanitizeJSON(data.data)) : null,
      expiresAt: data.expiresAt,
      isRead: false
    };
  }

  /**
   * Récupérer les informations d'un expéditeur
   */
  private async fetchSenderInfo(senderId: string): Promise<SenderInfo | null> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: senderId },
        select: {
          username: true,
          avatar: true,
          displayName: true,
          firstName: true,
          lastName: true
        }
      });

      if (!user) {
        logger.warn(`[NotificationService] User ${senderId} not found`);
        return null;
      }

      return {
        senderUsername: user.username,
        senderAvatar: user.avatar || undefined,
        senderDisplayName: user.displayName || undefined,
        senderFirstName: user.firstName,
        senderLastName: user.lastName
      };
    } catch (error) {
      logger.error('[NotificationService] Error fetching sender info:', error);
      return null;
    }
  }

  /**
   * Filtrer les destinataires de mentions avec rate limiting
   */
  private async filterMentionRecipients(
    mentionedUserIds: string[],
    senderId: string
  ): Promise<string[]> {
    const validUserIds: string[] = [];

    for (const userId of mentionedUserIds) {
      if (userId === senderId) continue;

      if (!this.shouldCreateMentionNotification(senderId, userId)) {
        logger.debug(`Mention rate limited: ${senderId} → ${userId}`);
        continue;
      }

      const shouldSend = await this.shouldSendNotification(userId, 'user_mentioned');
      if (shouldSend) {
        validUserIds.push(userId);
      }
    }

    return validUserIds;
  }

  /**
   * Vérifier le rate limit des mentions
   */
  private shouldCreateMentionNotification(senderId: string, recipientId: string): boolean {
    const key = `${senderId}:${recipientId}`;
    const now = Date.now();
    const cutoff = now - this.MENTION_WINDOW_MS;

    const timestamps = this.recentMentions.get(key) || [];
    const recentTimestamps = timestamps.filter(ts => ts > cutoff);

    if (recentTimestamps.length >= this.MAX_MENTIONS_PER_MINUTE) {
      return false;
    }

    recentTimestamps.push(now);
    this.recentMentions.set(key, recentTimestamps);
    return true;
  }

  /**
   * Nettoyer les mentions anciennes
   */
  private cleanupOldMentions(): void {
    const now = Date.now();
    const cutoff = now - this.MENTION_WINDOW_MS;

    for (const [key, timestamps] of this.recentMentions.entries()) {
      const recent = timestamps.filter(ts => ts > cutoff);
      if (recent.length === 0) {
        this.recentMentions.delete(key);
      } else {
        this.recentMentions.set(key, recent);
      }
    }
  }
}

// Export des types et services
export * from './types';
export { FirebaseNotificationService } from './FirebaseNotificationService';
export { SocketNotificationService } from './SocketNotificationService';
export { NotificationFormatter } from './NotificationFormatter';
