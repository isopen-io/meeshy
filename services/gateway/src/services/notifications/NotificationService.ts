/**
 * NotificationService V2 - Structure groupée et moderne
 *
 * Changements majeurs :
 * - Pas de champ `title` (construit côté frontend via i18n)
 * - Structure groupée : actor, context, metadata, state, delivery
 * - Pas de backward compatibility
 * - Code simplifié et type-safe
 */

import { PrismaClient } from '@meeshy/shared/prisma/client';
import type {
  NotificationContext,
  NotificationMetadata,
  NotificationPriority,
  NotificationType,
  Notification,
} from '@meeshy/shared/types/notification';

// Type temporaire jusqu'à recompilation de @meeshy/shared
type NotificationActor = {
  id: string;
  username: string;
  displayName?: string | null;
  avatar?: string | null;
};
import { notificationLogger } from '../../utils/logger-enhanced';
import type { Server as SocketIOServer } from 'socket.io';

export class NotificationService {
  constructor(
    private prisma: PrismaClient,
    private io?: SocketIOServer
  ) {}

  // ==============================================
  // CORE - Méthode générique de création
  // ==============================================

  /**
   * Crée une notification avec la structure V2
   */
  private async createNotification(params: {
    userId: string;
    type: NotificationType;
    priority: NotificationPriority;
    content: string;
    actor?: NotificationActor;
    context: NotificationContext;
    metadata: NotificationMetadata;
    expiresAt?: Date;
  }): Promise<Notification | null> {
    try {
      const notification = await this.prisma.notification.create({
        data: {
          userId: params.userId,
          type: params.type,
          priority: params.priority,
          content: params.content,

          // Groupes V2 (cast en any car Prisma doit être régénéré)
          actor: (params.actor || null) as any,
          context: params.context as any,
          metadata: params.metadata as any,

          // State (isRead, readAt, createdAt en DB, expiresAt si fourni)
          isRead: false,
          readAt: null,
          expiresAt: params.expiresAt || null,
          createdAt: new Date(),

          // Delivery (cast en any car Prisma Json type)
          delivery: {
            emailSent: false,
            pushSent: false,
          } as any,
        } as any, // Cast global pour compilation avant régénération Prisma
      });

      // Émettre via Socket.IO
      if (this.io) {
        this.io.to(params.userId).emit('notification:new', this.formatForSocket(notification));
      }

      notificationLogger.info('Notification created', {
        notificationId: notification.id,
        userId: params.userId,
        type: params.type,
      });

      return this.formatNotification(notification);
    } catch (error) {
      notificationLogger.error('Failed to create notification', {
        error,
        userId: params.userId,
        type: params.type,
      });
      return null;
    }
  }

  // ==============================================
  // FORMATTERS
  // ==============================================

  /**
   * Formate une notification DB → API
   */
  private formatNotification(raw: any): Notification {
    return {
      id: raw.id,
      userId: raw.userId,
      type: raw.type as NotificationType,
      priority: raw.priority as NotificationPriority,
      content: raw.content,

      actor: (raw.actor || undefined) as NotificationActor | undefined,
      context: raw.context as NotificationContext,
      metadata: raw.metadata as NotificationMetadata,

      state: {
        isRead: raw.isRead,
        readAt: raw.readAt ? new Date(raw.readAt) : null,
        createdAt: new Date(raw.createdAt),
        expiresAt: raw.expiresAt ? new Date(raw.expiresAt) : undefined,
      },

      delivery: (raw.delivery || { emailSent: false, pushSent: false }) as any,
    } as any; // Cast pour compilation avant régénération Prisma
  }

  /**
   * Formate pour Socket.IO (même structure)
   */
  private formatForSocket(raw: any): Notification {
    return this.formatNotification(raw);
  }

  // ==============================================
  // NEW_MESSAGE
  // ==============================================

  async createMessageNotification(params: {
    recipientUserId: string;
    senderId: string;
    messageId: string;
    conversationId: string;
    messagePreview: string;
    hasAttachments?: boolean;
    attachmentCount?: number;
    firstAttachmentType?: 'image' | 'video' | 'audio' | 'document' | 'text' | 'code';
    firstAttachmentFilename?: string;
  }): Promise<Notification | null> {
    // Récupérer les infos de l'expéditeur
    const sender = await this.prisma.user.findUnique({
      where: { id: params.senderId },
      select: { username: true, displayName: true, avatar: true },
    });

    if (!sender) {
      notificationLogger.warn('Sender not found for message notification', {
        senderId: params.senderId,
      });
      return null;
    }

    // Récupérer les infos de la conversation
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: params.conversationId },
      select: { title: true, type: true },
    });

    return this.createNotification({
      userId: params.recipientUserId,
      type: 'new_message',
      priority: 'normal',
      content: params.messagePreview,

      actor: {
        id: params.senderId,
        username: sender.username,
        displayName: sender.displayName,
        avatar: sender.avatar,
      },

      context: {
        conversationId: params.conversationId,
        conversationTitle: conversation?.title,
        conversationType: conversation?.type as any,
        messageId: params.messageId,
      },

      metadata: {
        action: 'view_message',
        messagePreview: params.messagePreview,
        ...(params.hasAttachments && params.attachmentCount && {
          attachments: {
            count: params.attachmentCount,
            firstType: params.firstAttachmentType || 'document',
            firstFilename: params.firstAttachmentFilename || 'file',
          },
        }),
      } as any,
    });
  }

  // ==============================================
  // USER_MENTIONED
  // ==============================================

  async createMentionNotification(params: {
    mentionedUserId: string;
    mentionerUserId: string;
    messageId: string;
    conversationId: string;
    messagePreview: string;
  }): Promise<Notification | null> {
    const mentioner = await this.prisma.user.findUnique({
      where: { id: params.mentionerUserId },
      select: { username: true, displayName: true, avatar: true },
    });

    if (!mentioner) return null;

    const conversation = await this.prisma.conversation.findUnique({
      where: { id: params.conversationId },
      select: { title: true, type: true },
    });

    return this.createNotification({
      userId: params.mentionedUserId,
      type: 'user_mentioned',
      priority: 'high',
      content: params.messagePreview,

      actor: {
        id: params.mentionerUserId,
        username: mentioner.username,
        displayName: mentioner.displayName,
        avatar: mentioner.avatar,
      },

      context: {
        conversationId: params.conversationId,
        conversationTitle: conversation?.title,
        conversationType: conversation?.type as any,
        messageId: params.messageId,
      },

      metadata: {
        action: 'view_message',
        messagePreview: params.messagePreview,
      } as any,
    });
  }

  /**
   * Créer des notifications de mention en batch (simplifié)
   */
  async createMentionNotificationsBatch(
    mentionedUserIds: string[],
    commonData: {
      senderId: string;
      senderUsername: string;
      senderAvatar?: string;
      messageContent: string;
      conversationId: string;
      messageId: string;
    },
    memberIds: string[]
  ): Promise<number> {
    let count = 0;
    for (const userId of mentionedUserIds) {
      if (userId === commonData.senderId) continue;
      if (!memberIds.includes(userId)) continue;

      const notification = await this.createMentionNotification({
        mentionedUserId: userId,
        mentionerUserId: commonData.senderId,
        messageId: commonData.messageId,
        conversationId: commonData.conversationId,
        messagePreview: commonData.messageContent,
      });

      if (notification) count++;
    }
    return count;
  }

  // ==============================================
  // MESSAGE_REACTION
  // ==============================================

  async createReactionNotification(params: {
    messageAuthorId: string;
    reactorUserId: string;
    messageId: string;
    conversationId: string;
    reactionEmoji: string;
  }): Promise<Notification | null> {
    const reactor = await this.prisma.user.findUnique({
      where: { id: params.reactorUserId },
      select: { username: true, displayName: true, avatar: true },
    });

    if (!reactor) return null;

    const conversation = await this.prisma.conversation.findUnique({
      where: { id: params.conversationId },
      select: { title: true, type: true },
    });

    return this.createNotification({
      userId: params.messageAuthorId,
      type: 'message_reaction',
      priority: 'low',
      content: params.reactionEmoji,

      actor: {
        id: params.reactorUserId,
        username: reactor.username,
        displayName: reactor.displayName,
        avatar: reactor.avatar,
      },

      context: {
        conversationId: params.conversationId,
        conversationTitle: conversation?.title,
        conversationType: conversation?.type as any,
        messageId: params.messageId,
      },

      metadata: {
        action: 'view_message',
        reactionEmoji: params.reactionEmoji,
      },
    });
  }

  // ==============================================
  // MISSED_CALL
  // ==============================================

  async createMissedCallNotification(params: {
    recipientUserId: string;
    callerId: string;
    conversationId: string;
    callSessionId: string;
    callType: 'audio' | 'video';
  }): Promise<Notification | null> {
    const caller = await this.prisma.user.findUnique({
      where: { id: params.callerId },
      select: { username: true, displayName: true, avatar: true },
    });

    if (!caller) return null;

    const conversation = await this.prisma.conversation.findUnique({
      where: { id: params.conversationId },
      select: { title: true, type: true },
    });

    return this.createNotification({
      userId: params.recipientUserId,
      type: 'missed_call',
      priority: 'high',
      content: `Appel ${params.callType === 'video' ? 'vidéo' : 'audio'} manqué`,

      actor: {
        id: params.callerId,
        username: caller.username,
        displayName: caller.displayName,
        avatar: caller.avatar,
      },

      context: {
        conversationId: params.conversationId,
        conversationTitle: conversation?.title,
        conversationType: conversation?.type as any,
        callSessionId: params.callSessionId,
      },

      metadata: {
        action: 'view_conversation',
        callType: params.callType,
      },
    });
  }

  // ==============================================
  // FRIEND_REQUEST
  // ==============================================

  async createFriendRequestNotification(params: {
    recipientUserId: string;
    requesterId: string;
    friendRequestId: string;
  }): Promise<Notification | null> {
    const requester = await this.prisma.user.findUnique({
      where: { id: params.requesterId },
      select: { username: true, displayName: true, avatar: true },
    });

    if (!requester) return null;

    return this.createNotification({
      userId: params.recipientUserId,
      type: 'friend_request',
      priority: 'normal',
      content: 'Nouvelle demande de contact',

      actor: {
        id: params.requesterId,
        username: requester.username,
        displayName: requester.displayName,
        avatar: requester.avatar,
      },

      context: {
        friendRequestId: params.friendRequestId,
      },

      metadata: {
        action: 'accept_or_reject_contact',
      },
    });
  }

  // ==============================================
  // FRIEND_ACCEPTED
  // ==============================================

  async createFriendAcceptedNotification(params: {
    recipientUserId: string;
    accepterUserId: string;
    conversationId?: string;
  }): Promise<Notification | null> {
    const accepter = await this.prisma.user.findUnique({
      where: { id: params.accepterUserId },
      select: { username: true, displayName: true, avatar: true },
    });

    if (!accepter) return null;

    return this.createNotification({
      userId: params.recipientUserId,
      type: 'friend_accepted',
      priority: 'normal',
      content: 'Demande de contact acceptée',

      actor: {
        id: params.accepterUserId,
        username: accepter.username,
        displayName: accepter.displayName,
        avatar: accepter.avatar,
      },

      context: {
        conversationId: params.conversationId,
      },

      metadata: {
        action: 'view_conversation',
      },
    });
  }

  // ==============================================
  // MEMBER_JOINED
  // ==============================================

  async createMemberJoinedNotification(params: {
    recipientUserId: string;
    newMemberUserId: string;
    conversationId: string;
    joinMethod?: 'via_link' | 'invited';
  }): Promise<Notification | null> {
    const newMember = await this.prisma.user.findUnique({
      where: { id: params.newMemberUserId },
      select: { username: true, displayName: true, avatar: true },
    });

    if (!newMember) return null;

    const conversation = await this.prisma.conversation.findUnique({
      where: { id: params.conversationId },
      select: { title: true, type: true },
    });

    // Compter les membres
    const memberCount = await this.prisma.conversationMember.count({
      where: { conversationId: params.conversationId },
    });

    return this.createNotification({
      userId: params.recipientUserId,
      type: 'member_joined',
      priority: 'low',
      content: 'Nouveau membre',

      actor: {
        id: params.newMemberUserId,
        username: newMember.username,
        displayName: newMember.displayName,
        avatar: newMember.avatar,
      },

      context: {
        conversationId: params.conversationId,
        conversationTitle: conversation?.title,
        conversationType: conversation?.type as any,
      },

      metadata: {
        action: 'view_conversation',
        memberCount,
        isMember: true,
        joinMethod: params.joinMethod,
      },
    });
  }

  // ==============================================
  // TRANSLATION_READY
  // ==============================================

  async createTranslationReadyNotification(params: {
    recipientUserId: string;
    messageId: string;
    conversationId: string;
  }): Promise<Notification | null> {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: params.conversationId },
      select: { title: true, type: true },
    });

    return this.createNotification({
      userId: params.recipientUserId,
      type: 'translation_ready',
      priority: 'low',
      content: 'Traduction disponible',

      context: {
        conversationId: params.conversationId,
        conversationTitle: conversation?.title,
        conversationType: conversation?.type as any,
        messageId: params.messageId,
      },

      metadata: {
        action: 'view_message',
      },
    });
  }

  // ==============================================
  // MESSAGE_REPLY
  // ==============================================

  async createReplyNotification(params: {
    recipientUserId: string;
    replierUserId: string;
    messageId: string;
    conversationId: string;
    messagePreview: string;
    originalMessageId?: string;
  }): Promise<Notification | null> {
    const replier = await this.prisma.user.findUnique({
      where: { id: params.replierUserId },
      select: { username: true, displayName: true, avatar: true },
    });

    if (!replier) return null;

    const conversation = await this.prisma.conversation.findUnique({
      where: { id: params.conversationId },
      select: { title: true, type: true },
    });

    return this.createNotification({
      userId: params.recipientUserId,
      type: 'message_reply',
      priority: 'normal',
      content: params.messagePreview,

      actor: {
        id: params.replierUserId,
        username: replier.username,
        displayName: replier.displayName,
        avatar: replier.avatar,
      },

      context: {
        conversationId: params.conversationId,
        conversationTitle: conversation?.title,
        conversationType: conversation?.type as any,
        messageId: params.messageId,
        originalMessageId: params.originalMessageId,
      },

      metadata: {
        action: 'view_message',
        messagePreview: params.messagePreview,
      } as any,
    });
  }

  // ==============================================
  // SYSTEM
  // ==============================================

  async createSystemNotification(params: {
    recipientUserId: string;
    content: string;
    systemType?: 'maintenance' | 'security' | 'announcement' | 'feature';
    priority?: NotificationPriority;
  }): Promise<Notification | null> {
    return this.createNotification({
      userId: params.recipientUserId,
      type: 'system',
      priority: params.priority || 'normal',
      content: params.content,

      context: {},

      metadata: {
        action: 'view_details',
        systemType: params.systemType,
      },
    });
  }

  // ==============================================
  // QUERIES
  // ==============================================

  /**
   * Récupère les notifications d'un utilisateur
   */
  async getUserNotifications(params: {
    userId: string;
    limit?: number;
    offset?: number;
    unreadOnly?: boolean;
  }): Promise<{ notifications: Notification[]; total: number }> {
    const where: any = { userId: params.userId };
    if (params.unreadOnly) {
      where.isRead = false;
    }

    const [notifications, total] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: params.limit || 50,
        skip: params.offset || 0,
      }),
      this.prisma.notification.count({ where }),
    ]);

    return {
      notifications: notifications.map((n) => this.formatNotification(n)),
      total,
    };
  }

  /**
   * Marque une notification comme lue
   */
  async markAsRead(notificationId: string): Promise<Notification | null> {
    try {
      const notification = await this.prisma.notification.update({
        where: { id: notificationId },
        data: {
          isRead: true,
          readAt: new Date(),
        },
      });

      return this.formatNotification(notification);
    } catch (error) {
      notificationLogger.error('Failed to mark notification as read', {
        error,
        notificationId,
      });
      return null;
    }
  }

  /**
   * Marque toutes les notifications comme lues
   */
  async markAllAsRead(userId: string): Promise<number> {
    try {
      const result = await this.prisma.notification.updateMany({
        where: {
          userId,
          isRead: false,
        },
        data: {
          isRead: true,
          readAt: new Date(),
        },
      });

      return result.count;
    } catch (error) {
      notificationLogger.error('Failed to mark all notifications as read', {
        error,
        userId,
      });
      return 0;
    }
  }

  /**
   * Marque toutes les notifications d'une conversation comme lues
   * Note: Filtre simplifié car Prisma MongoDB ne supporte pas les filtres JSON complexes
   */
  async markConversationNotificationsAsRead(userId: string, conversationId: string): Promise<number> {
    try {
      // Récupérer toutes les notifications non lues de l'utilisateur
      const notifications = await this.prisma.notification.findMany({
        where: {
          userId,
          isRead: false,
        }
      });

      // Filtrer côté application pour trouver celles liées à cette conversation
      const relevantNotifications = notifications.filter((n: any) =>
        n.context?.conversationId === conversationId
      );

      // Marquer comme lues
      let count = 0;
      for (const notif of relevantNotifications) {
        await this.prisma.notification.update({
          where: { id: notif.id },
          data: { isRead: true, readAt: new Date() }
        });
        count++;
      }

      return count;
    } catch (error) {
      notificationLogger.error('Failed to mark conversation notifications as read', {
        error,
        userId,
        conversationId,
      });
      return 0;
    }
  }

  /**
   * Compte les notifications non lues
   */
  async getUnreadCount(userId: string): Promise<number> {
    return this.prisma.notification.count({
      where: {
        userId,
        isRead: false,
      },
    });
  }

  /**
   * Supprime une notification
   */
  async deleteNotification(notificationId: string): Promise<boolean> {
    try {
      await this.prisma.notification.delete({
        where: { id: notificationId },
      });
      return true;
    } catch (error) {
      notificationLogger.error('Failed to delete notification', {
        error,
        notificationId,
      });
      return false;
    }
  }

  // ==============================================
  // SOCKET.IO
  // ==============================================

  /**
   * Configure Socket.IO pour les notifications temps réel
   */
  setSocketIO(io: SocketIOServer, _userSocketsMap?: Map<string, Set<string>>): void {
    this.io = io;
    // userSocketsMap non utilisé dans V2 (utilise io.to(userId) directement)
  }
}
