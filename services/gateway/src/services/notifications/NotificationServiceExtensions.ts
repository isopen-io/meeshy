/**
 * NotificationServiceExtensions - Méthodes de notification spécialisées
 *
 * Responsabilités :
 * - Fournir des méthodes high-level pour chaque type de notification
 * - Gérer la logique métier spécifique à chaque type
 * - Extension du NotificationService principal
 */

import { PrismaClient } from '@meeshy/shared/prisma/client';
import { logger } from '../../utils/logger';
import { NotificationService } from './NotificationService';
import type { NotificationEventData } from './types';

/**
 * Extension du NotificationService avec méthodes spécialisées
 */
export class NotificationServiceExtensions {
  constructor(
    private notificationService: NotificationService,
    private prisma: PrismaClient
  ) {}

  /**
   * Créer une notification de réponse à un message
   */
  async createReplyNotification(data: {
    originalMessageAuthorId: string;
    replierId: string;
    replierUsername: string;
    replierAvatar?: string;
    replyContent: string;
    conversationId: string;
    conversationTitle?: string;
    originalMessageId: string;
    replyMessageId: string;
    attachments?: Array<{ id: string; filename: string; mimeType: string; fileSize: number }>;
  }): Promise<NotificationEventData | null> {
    if (data.originalMessageAuthorId === data.replierId) {
      return null;
    }

    const senderInfo = await this.fetchSenderInfo(data.replierId);
    const formatter = (this.notificationService as any).formatter;
    const messagePreview = formatter.formatMessagePreview(data.replyContent, data.attachments);

    return this.notificationService.createNotification({
      userId: data.originalMessageAuthorId,
      type: 'message_reply',
      title: 'Réponse',
      content: messagePreview,
      priority: 'normal',
      senderId: data.replierId,
      senderUsername: senderInfo?.senderUsername || data.replierUsername,
      senderAvatar: senderInfo?.senderAvatar || data.replierAvatar,
      senderDisplayName: senderInfo?.senderDisplayName,
      senderFirstName: senderInfo?.senderFirstName,
      senderLastName: senderInfo?.senderLastName,
      messagePreview,
      conversationId: data.conversationId,
      messageId: data.replyMessageId,
      data: {
        originalMessageId: data.originalMessageId,
        conversationTitle: data.conversationTitle,
        attachments: formatter.formatAttachmentInfo(data.attachments),
        action: 'view_message'
      }
    });
  }

  /**
   * Créer une notification de réaction à un message
   */
  async createReactionNotification(data: {
    messageAuthorId: string;
    reactorId: string;
    reactorUsername: string;
    reactorAvatar?: string;
    emoji: string;
    messageContent: string;
    conversationId: string;
    conversationTitle?: string;
    messageId: string;
    reactionId: string;
  }): Promise<NotificationEventData | null> {
    if (data.messageAuthorId === data.reactorId) {
      return null;
    }

    const senderInfo = await this.fetchSenderInfo(data.reactorId);
    const formatter = (this.notificationService as any).formatter;
    const messagePreview = formatter.truncateMessage(data.messageContent, 15);

    return this.notificationService.createNotification({
      userId: data.messageAuthorId,
      type: 'message_reaction',
      title: 'Réaction',
      content: `${data.emoji} ${messagePreview}`,
      priority: 'low',
      senderId: data.reactorId,
      senderUsername: senderInfo?.senderUsername || data.reactorUsername,
      senderAvatar: senderInfo?.senderAvatar || data.reactorAvatar,
      senderDisplayName: senderInfo?.senderDisplayName,
      senderFirstName: senderInfo?.senderFirstName,
      senderLastName: senderInfo?.senderLastName,
      messagePreview,
      conversationId: data.conversationId,
      messageId: data.messageId,
      data: {
        reactionId: data.reactionId,
        emoji: data.emoji,
        conversationTitle: data.conversationTitle,
        action: 'view_message'
      }
    });
  }

  /**
   * Créer une notification de demande de contact
   */
  async createContactRequestNotification(data: {
    recipientId: string;
    requesterId: string;
    requesterUsername: string;
    requesterAvatar?: string;
    message?: string;
    friendRequestId: string;
  }): Promise<NotificationEventData | null> {
    const senderInfo = await this.fetchSenderInfo(data.requesterId);

    return this.notificationService.createNotification({
      userId: data.recipientId,
      type: 'contact_request',
      title: 'Demande de contact',
      content: data.message || 'Nouvelle demande de contact',
      priority: 'high',
      senderId: data.requesterId,
      senderUsername: senderInfo?.senderUsername || data.requesterUsername,
      senderAvatar: senderInfo?.senderAvatar || data.requesterAvatar,
      senderDisplayName: senderInfo?.senderDisplayName,
      senderFirstName: senderInfo?.senderFirstName,
      senderLastName: senderInfo?.senderLastName,
      data: {
        friendRequestId: data.friendRequestId,
        message: data.message,
        action: 'accept_or_reject_contact'
      }
    });
  }

  /**
   * Créer une notification d'acceptation de contact
   */
  async createContactAcceptedNotification(data: {
    requesterId: string;
    accepterId: string;
    accepterUsername: string;
    accepterAvatar?: string;
    conversationId: string;
  }): Promise<NotificationEventData | null> {
    const senderInfo = await this.fetchSenderInfo(data.accepterId);

    return this.notificationService.createNotification({
      userId: data.requesterId,
      type: 'contact_accepted',
      title: 'Contact accepté',
      content: 'a accepté votre invitation. Vous pouvez maintenant discuter ensemble.',
      priority: 'normal',
      senderId: data.accepterId,
      senderUsername: senderInfo?.senderUsername || data.accepterUsername,
      senderAvatar: senderInfo?.senderAvatar || data.accepterAvatar,
      senderDisplayName: senderInfo?.senderDisplayName,
      senderFirstName: senderInfo?.senderFirstName,
      senderLastName: senderInfo?.senderLastName,
      conversationId: data.conversationId,
      data: {
        conversationId: data.conversationId,
        action: 'view_conversation'
      }
    });
  }

  /**
   * Créer une notification de nouvelle conversation directe
   */
  async createDirectConversationNotification(data: {
    invitedUserId: string;
    inviterId: string;
    inviterUsername: string;
    inviterAvatar?: string;
    conversationId: string;
  }): Promise<NotificationEventData | null> {
    const senderInfo = await this.fetchSenderInfo(data.inviterId);

    return this.notificationService.createNotification({
      userId: data.invitedUserId,
      type: 'new_conversation_direct',
      title: 'Nouvelle conversation',
      content: 'a démarré une conversation avec vous',
      priority: 'normal',
      senderId: data.inviterId,
      senderUsername: senderInfo?.senderUsername || data.inviterUsername,
      senderAvatar: senderInfo?.senderAvatar || data.inviterAvatar,
      senderDisplayName: senderInfo?.senderDisplayName,
      senderFirstName: senderInfo?.senderFirstName,
      senderLastName: senderInfo?.senderLastName,
      conversationId: data.conversationId,
      data: {
        conversationType: 'direct',
        action: 'view_conversation'
      }
    });
  }

  /**
   * Créer une notification de nouvelle conversation de groupe
   */
  async createGroupConversationNotification(data: {
    invitedUserId: string;
    inviterId: string;
    inviterUsername: string;
    inviterAvatar?: string;
    conversationId: string;
    conversationTitle: string;
  }): Promise<NotificationEventData | null> {
    const senderInfo = await this.fetchSenderInfo(data.inviterId);

    return this.notificationService.createNotification({
      userId: data.invitedUserId,
      type: 'new_conversation_group',
      title: 'Invitation de groupe',
      content: `vous a invité à rejoindre ${data.conversationTitle}`,
      priority: 'normal',
      senderId: data.inviterId,
      senderUsername: senderInfo?.senderUsername || data.inviterUsername,
      senderAvatar: senderInfo?.senderAvatar || data.inviterAvatar,
      senderDisplayName: senderInfo?.senderDisplayName,
      senderFirstName: senderInfo?.senderFirstName,
      senderLastName: senderInfo?.senderLastName,
      conversationId: data.conversationId,
      data: {
        conversationTitle: data.conversationTitle,
        conversationType: 'group',
        action: 'view_conversation'
      }
    });
  }

  /**
   * Créer des notifications pour des membres qui rejoignent un groupe (batch)
   */
  async createMemberJoinedNotification(data: {
    groupId: string;
    groupTitle: string;
    newMemberId: string;
    newMemberUsername: string;
    newMemberAvatar?: string;
    adminIds: string[];
    joinMethod?: 'via_link' | 'invited';
  }): Promise<number> {
    if (data.adminIds.length === 0) return 0;

    const senderInfo = await this.fetchSenderInfo(data.newMemberId);
    const formatter = (this.notificationService as any).formatter;

    const notificationsData = data.adminIds.map(adminId =>
      formatter.createNotificationData(
        adminId,
        'member_joined',
        'Nouveau membre',
        `${senderInfo?.senderDisplayName || senderInfo?.senderFirstName || data.newMemberUsername} a rejoint le groupe`,
        {
          priority: 'low',
          senderId: data.newMemberId,
          senderUsername: senderInfo?.senderUsername || data.newMemberUsername,
          senderAvatar: senderInfo?.senderAvatar || data.newMemberAvatar,
          senderDisplayName: senderInfo?.senderDisplayName,
          senderFirstName: senderInfo?.senderFirstName,
          senderLastName: senderInfo?.senderLastName,
          conversationId: data.groupId,
          data: {
            groupTitle: data.groupTitle,
            joinMethod: data.joinMethod || 'invited',
            action: 'view_conversation'
          }
        }
      )
    );

    try {
      const result = await this.prisma.notification.createMany({
        data: notificationsData
      });

      const createdNotifications = await this.prisma.notification.findMany({
        where: {
          conversationId: data.groupId,
          type: 'member_joined',
          userId: { in: data.adminIds },
          senderId: data.newMemberId
        },
        orderBy: { createdAt: 'desc' },
        take: data.adminIds.length
      });

      const socketService = (this.notificationService as any).socketService;
      for (const notification of createdNotifications) {
        socketService.emitNotification(
          notification.userId,
          formatter.formatNotificationEvent(notification)
        );
      }

      logger.info('✅ Created member joined notifications', {
        count: result.count,
        groupId: data.groupId
      });

      return result.count;
    } catch (error) {
      logger.error('❌ Error creating member joined notifications:', error);
      return 0;
    }
  }

  /**
   * Créer une notification système
   */
  async createSystemNotification(data: {
    userId: string;
    title: string;
    content: string;
    priority?: 'low' | 'normal' | 'high' | 'urgent';
    systemType?: 'maintenance' | 'security' | 'announcement' | 'feature';
    action?: string;
    expiresAt?: Date;
  }): Promise<NotificationEventData | null> {
    return this.notificationService.createNotification({
      userId: data.userId,
      type: 'system',
      title: data.title,
      content: data.content,
      priority: data.priority || 'normal',
      expiresAt: data.expiresAt,
      data: {
        systemType: data.systemType || 'announcement',
        action: data.action || 'view_details'
      }
    });
  }

  /**
   * Supprimer toutes les notifications lues
   */
  async deleteAllReadNotifications(userId: string): Promise<number> {
    try {
      const result = await this.prisma.notification.deleteMany({
        where: { userId, isRead: true }
      });

      logger.info('✅ Deleted all read notifications', {
        userId,
        count: result.count
      });

      return result.count;
    } catch (error) {
      logger.error('❌ Error deleting read notifications:', error);
      return 0;
    }
  }

  // ========== PRIVATE HELPERS ==========

  private async fetchSenderInfo(senderId: string) {
    return (this.notificationService as any).fetchSenderInfo(senderId);
  }
}
