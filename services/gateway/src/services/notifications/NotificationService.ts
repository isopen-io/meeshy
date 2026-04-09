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
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import type {
  NotificationContext,
  NotificationMetadata,
  NotificationPriority,
  NotificationType,
  Notification,
} from '@meeshy/shared/types/notification';
import {
  NOTIFICATION_PREFERENCE_DEFAULTS,
  type NotificationPreference as NotifPrefs,
} from '@meeshy/shared/types/preferences';

// Type temporaire jusqu'à recompilation de @meeshy/shared
type NotificationActor = {
  id: string;
  username: string;
  displayName?: string | null;
  avatar?: string | null;
};
import { notificationLogger, securityLogger } from '../../utils/logger-enhanced';
import { SecuritySanitizer } from '../../utils/sanitize';
import type { Server as SocketIOServer } from 'socket.io';
import { PushNotificationService } from '../PushNotificationService';
import { EmailService } from '../EmailService';

function formatDuration(ms: number): string {
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}:${String(seconds).padStart(2, '0')}` : `0:${String(seconds).padStart(2, '0')}`;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

function formatAttachmentNotificationBody(params: {
  attachmentCount?: number;
  firstAttachmentType?: string;
  firstAttachmentFileSize?: number | null;
  firstAttachmentDuration?: number | null;
  firstAttachmentWidth?: number | null;
  firstAttachmentHeight?: number | null;
}): string {
  const count = params.attachmentCount ?? 1;
  const type = params.firstAttachmentType ?? 'document';
  const details: string[] = [];

  if (type === 'audio') {
    const label = count > 1 ? `🎵 ${count} audios` : '🎵 Audio';
    if (params.firstAttachmentDuration) details.push(formatDuration(params.firstAttachmentDuration));
    if (params.firstAttachmentFileSize) details.push(formatFileSize(params.firstAttachmentFileSize));
    return details.length > 0 ? `${label} · ${details.join(' · ')}` : label;
  }

  if (type === 'video') {
    const label = count > 1 ? `🎬 ${count} vidéos` : '🎬 Vidéo';
    if (params.firstAttachmentDuration) details.push(formatDuration(params.firstAttachmentDuration));
    if (params.firstAttachmentFileSize) details.push(formatFileSize(params.firstAttachmentFileSize));
    return details.length > 0 ? `${label} · ${details.join(' · ')}` : label;
  }

  if (type === 'image') {
    const label = count > 1 ? `📷 ${count} photos` : '📷 Photo';
    if (params.firstAttachmentWidth && params.firstAttachmentHeight) {
      details.push(`${params.firstAttachmentWidth}×${params.firstAttachmentHeight}`);
    }
    if (params.firstAttachmentFileSize) details.push(formatFileSize(params.firstAttachmentFileSize));
    return details.length > 0 ? `${label} · ${details.join(' · ')}` : label;
  }

  return count > 1 ? `📎 ${count} fichiers` : '📎 Document';
}

export class NotificationService {
  // Anti-spam: tracking des mentions récentes par paire (sender:recipient)
  private recentMentions: Map<string, number[]> = new Map();
  private readonly MAX_MENTIONS_PER_MINUTE = 5;
  private readonly MENTION_WINDOW_MS = 60000; // 1 minute
  private pushService?: PushNotificationService;
  private emailService?: EmailService;

  constructor(
    private prisma: PrismaClient,
    private io?: SocketIOServer
  ) {
    // Nettoyer les entrées de rate limit périmées toutes les 2 minutes
    setInterval(() => this.cleanupOldMentions(), 120000);
  }

  // ==============================================
  // PREFERENCE CHECKS
  // ==============================================

  /**
   * Vérifie si une notification doit être créée selon les préférences utilisateur.
   * Lit UserPreferences.notification (JSON) — source unique de vérité.
   * Les notifications système passent toujours.
   */
  private async shouldCreateNotification(userId: string, type: NotificationType): Promise<boolean> {
    // Les notifications système/sécurité passent toujours
    if (type === 'system') return true;

    try {
      const userPrefs = await this.prisma.userPreferences.findUnique({
        where: { userId },
        select: { notification: true },
      });

      const raw = (userPrefs?.notification ?? {}) as Record<string, unknown>;
      const prefs: NotifPrefs = { ...NOTIFICATION_PREFERENCE_DEFAULTS, ...raw };

      // 1) Vérifier le toggle par type
      if (!this.isTypeEnabled(prefs, type)) {
        notificationLogger.info('Notification bloquée par préférence de type', { userId, type });
        return false;
      }

      // 2) Vérifier le mode Ne Pas Déranger
      if (this.isDNDActive(prefs)) {
        notificationLogger.info('Notification bloquée par DND', { userId, type });
        return false;
      }

      return true;
    } catch (error) {
      // Fail open : en cas d'erreur de lecture des prefs, on crée la notification
      notificationLogger.error('Erreur lecture préférences, notification autorisée par défaut', { error, userId, type });
      return true;
    }
  }

  /**
   * Mapping NotificationType → champ booléen dans UserPreferences.notification
   */
  private isTypeEnabled(prefs: NotifPrefs, type: NotificationType): boolean {
    switch (type) {
      case 'new_message':       return prefs.newMessageEnabled;
      case 'missed_call':       return prefs.missedCallEnabled;
      case 'system':            return prefs.systemEnabled;
      case 'user_mentioned':
      case 'mention':           return prefs.mentionEnabled;
      case 'message_reaction':
      case 'reaction':          return prefs.reactionEnabled;
      case 'contact_request':
      case 'contact_accepted':
      case 'friend_request':
      case 'friend_accepted':   return prefs.contactRequestEnabled;
      case 'member_joined':     return prefs.memberJoinedEnabled;
      case 'message_reply':
      case 'reply':             return prefs.replyEnabled;
      case 'translation_ready': return true; // toujours activé
      case 'post_like':         return prefs.postLikeEnabled ?? true;
      case 'post_comment':      return prefs.postCommentEnabled ?? true;
      case 'post_repost':       return prefs.postRepostEnabled ?? true;
      case 'story_reaction':    return prefs.storyReactionEnabled ?? true;
      case 'status_reaction':   return prefs.storyReactionEnabled ?? true;
      case 'comment_like':      return prefs.commentLikeEnabled ?? false;
      case 'comment_reply':     return prefs.commentReplyEnabled ?? true;
      case 'new_conversation_direct':
      case 'new_conversation_group':
      case 'new_conversation':  return prefs.conversationEnabled;
      case 'added_to_conversation':
      case 'removed_from_conversation':
      case 'member_removed':
      case 'member_left':           return prefs.memberJoinedEnabled;
      case 'member_promoted':
      case 'member_demoted':
      case 'member_role_changed':   return prefs.memberJoinedEnabled;
      case 'password_changed':
      case 'two_factor_enabled':
      case 'two_factor_disabled':
      case 'login_new_device':      return true; // sécurité = toujours actif
      default:                  return true;
    }
  }

  /**
   * Vérifie si le mode DND est actuellement actif.
   * Utilise l'heure UTC du serveur.
   */
  private isDNDActive(prefs: NotifPrefs): boolean {
    if (!prefs.dndEnabled) return false;

    const now = new Date();

    // Si dndDays est défini et non vide, vérifier le jour
    if (prefs.dndDays && prefs.dndDays.length > 0) {
      const dayMap = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
      const today = dayMap[now.getUTCDay()];
      if (!prefs.dndDays.includes(today as any)) return false;
    }

    const currentTime = `${now.getUTCHours().toString().padStart(2, '0')}:${now.getUTCMinutes().toString().padStart(2, '0')}`;
    const start = prefs.dndStartTime;
    const end = prefs.dndEndTime;

    // DND nocturne (ex: 22:00 - 08:00)
    if (start > end) {
      return currentTime >= start || currentTime < end;
    }

    // DND diurne (ex: 14:00 - 16:00)
    return currentTime >= start && currentTime < end;
  }

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
      // SECURITY: Validate notification type
      if (!SecuritySanitizer.isValidNotificationType(params.type)) {
        securityLogger.logViolation('INVALID_NOTIFICATION_TYPE', {
          type: params.type,
          userId: params.userId,
        });
        return null;
      }

      // SECURITY: Validate priority
      if (!SecuritySanitizer.isValidPriority(params.priority)) {
        securityLogger.logViolation('INVALID_NOTIFICATION_PRIORITY', {
          priority: params.priority,
          userId: params.userId,
        });
        return null;
      }

      // Vérifier les préférences utilisateur avant création
      const allowed = await this.shouldCreateNotification(params.userId, params.type);
      if (!allowed) {
        return null;
      }

      // SECURITY: Sanitize user-provided content (defense-in-depth)
      const sanitizedContent = SecuritySanitizer.sanitizeText(params.content);
      const sanitizedActor = params.actor ? {
        ...params.actor,
        displayName: params.actor.displayName
          ? SecuritySanitizer.sanitizeText(params.actor.displayName)
          : params.actor.displayName,
        avatar: params.actor.avatar
          ? SecuritySanitizer.sanitizeURL(params.actor.avatar) ?? params.actor.avatar
          : params.actor.avatar,
      } : undefined;
      const sanitizedMetadata = SecuritySanitizer.sanitizeJSON(params.metadata);

      const notification = await this.prisma.notification.create({
        data: {
          userId: params.userId,
          type: params.type,
          priority: params.priority,
          content: sanitizedContent,

          // Relation optionnelle avec Message
          messageId: params.context.messageId || null,

          // Groupes V2 (cast en any car Prisma doit être régénéré)
          actor: (sanitizedActor || null) as any,
          context: params.context as any,
          metadata: sanitizedMetadata as any,

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

      const formatted = this.formatNotification(notification);

      // Émettre via Socket.IO
      if (this.io) {
        this.io.to(params.userId).emit(SERVER_EVENTS.NOTIFICATION_NEW, formatted);
      }

      // Send push notification if user is offline
      if (this.pushService && this.io) {
        try {
          const sockets = await this.io.in(params.userId).fetchSockets();
          if (sockets.length === 0) {
            const link = params.context.conversationId ?
              (params.context.messageId ?
                `/conversations/${params.context.conversationId}?messageId=${params.context.messageId}` :
                `/conversations/${params.context.conversationId}`) :
              undefined;

            this.pushService.sendToUser({
              userId: params.userId,
              payload: {
                title: params.actor?.displayName || 'Meeshy',
                body: params.content.substring(0, 200),
                link,
                data: {
                  type: params.type,
                  conversationId: params.context.conversationId || '',
                  messageId: params.context.messageId || '',
                  postId: params.context.postId || '',
                  postType: (params.metadata && 'postType' in params.metadata ? String(params.metadata.postType ?? '') : ''),
                },
              },
            }).catch(err => {
              notificationLogger.error('Push notification failed', { error: err, userId: params.userId });
            });
          }
        } catch (err) {
          // fetchSockets can fail — non-blocking
        }
      }

      // Send immediate email for high-priority notifications to offline users
      if (this.emailService && params.priority === 'high') {
        try {
          const sockets = this.io ? await this.io.in(params.userId).fetchSockets() : [];
          if (sockets.length === 0) {
            const { getCacheStore } = await import('../CacheStore');
            const cache = getCacheStore();
            const throttleKey = `notif:email:throttle:${params.userId}`;
            const canSend = await cache.setnx(throttleKey, '1', 300);
            if (canSend) {
              const user = await this.prisma.user.findUnique({
                where: { id: params.userId },
                select: { email: true, systemLanguage: true, username: true }
              });
              if (user?.email) {
                this.emailService.sendSecurityAlertEmail({
                  to: user.email,
                  name: user.username || 'User',
                  language: user.systemLanguage || 'fr',
                  alertType: params.type,
                  details: params.content.substring(0, 500),
                }).catch(err => {
                  notificationLogger.error('Immediate email failed', { error: err, userId: params.userId });
                });
              }
            }
          }
        } catch (err) {
          // Non-blocking
        }
      }

      return formatted;
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
   * Sanitize une date pour éviter "Invalid time value"
   * Retourne la date valide ou la valeur par défaut
   */
  private sanitizeDate(value: any, defaultValue: Date | null = null): Date | null {
    // Cas 1: valeur null/undefined/false/empty
    if (!value) return defaultValue;

    try {
      // Cas 2: déjà un objet Date (vérifier qu'il est valide)
      if (value instanceof Date) {
        if (isNaN(value.getTime())) {
          notificationLogger.warn('Invalid Date object detected, using default', {
            value: value.toString(),
            defaultValue
          });
          return defaultValue;
        }
        return value;
      }

      // Cas 3: convertir en Date et vérifier
      const date = new Date(value);
      if (isNaN(date.getTime())) {
        notificationLogger.warn('Invalid date value detected, using default', {
          value,
          valueType: typeof value,
          defaultValue
        });
        return defaultValue;
      }

      return date;
    } catch (error) {
      notificationLogger.error('Error sanitizing date, using default', {
        error,
        value,
        defaultValue
      });
      return defaultValue;
    }
  }

  /**
   * Convertit une date en ISO string de manière sûre
   * Retourne null si la date est null/invalide
   */
  private toISOStringOrNull(date: Date | null): string | null {
    if (!date) return null;
    try {
      return date.toISOString();
    } catch (error) {
      notificationLogger.error('Failed to convert date to ISO string', { error, date });
      return null;
    }
  }

  /**
   * Formate une notification DB → API
   */
  private formatNotification(raw: any): Notification {
    const readAtDate = this.sanitizeDate(raw.readAt, null);
    const createdAtDate = this.sanitizeDate(raw.createdAt, null);
    const expiresAtDate = this.sanitizeDate(raw.expiresAt, null);

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
        // Garder les objets Date pour le type TypeScript
        // Fastify les convertira automatiquement en ISO string via le schéma
        readAt: readAtDate,
        createdAt: createdAtDate,
        expiresAt: expiresAtDate || undefined,
      },

      delivery: (raw.delivery || { emailSent: false, pushSent: false }) as any,
    } as any; // Cast pour compilation avant régénération Prisma
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
    firstAttachmentFileSize?: number | null;
    firstAttachmentDuration?: number | null;
    firstAttachmentWidth?: number | null;
    firstAttachmentHeight?: number | null;
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

    const content = params.messagePreview || (params.hasAttachments
      ? formatAttachmentNotificationBody(params)
      : '');

    return this.createNotification({
      userId: params.recipientUserId,
      type: 'new_message',
      priority: 'normal',
      content,

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
    // Anti-spam: rate limit des mentions par paire (sender → recipient)
    if (!this.shouldCreateMentionNotification(params.mentionerUserId, params.mentionedUserId)) {
      notificationLogger.info('Mention notification blocked (rate limit)', {
        senderId: params.mentionerUserId,
        mentionedUserId: params.mentionedUserId,
      });
      return null;
    }

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

      // Anti-spam: rate limit per sender:recipient pair
      if (!this.shouldCreateMentionNotification(commonData.senderId, userId)) {
        notificationLogger.info('Batch mention blocked (rate limit)', {
          senderId: commonData.senderId,
          recipientId: userId,
        });
        continue;
      }

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
    const [reactor, conversation, message] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: params.reactorUserId },
        select: { username: true, displayName: true, avatar: true },
      }),
      this.prisma.conversation.findUnique({
        where: { id: params.conversationId },
        select: { title: true, type: true },
      }),
      this.prisma.message.findUnique({
        where: { id: params.messageId },
        select: { content: true },
      }),
    ]);

    if (!reactor) return null;

    const messagePreview = message?.content
      ? message.content.length > 100
        ? message.content.substring(0, 100) + '…'
        : message.content
      : null;

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
        ...(messagePreview && { messageContent: messagePreview }),
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
    const memberCount = await this.prisma.participant.count({
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
  // SOCIAL — POST_LIKE / STORY_REACTION / STATUS_REACTION
  // ==============================================

  async createPostLikeNotification(params: {
    actorId: string;
    postId: string;
    postAuthorId: string;
    emoji: string;
    postType?: 'POST' | 'STORY' | 'STATUS';
  }): Promise<Notification | null> {
    // Don't notify yourself
    if (params.actorId === params.postAuthorId) return null;

    const actor = await this.prisma.user.findUnique({
      where: { id: params.actorId },
      select: { username: true, displayName: true, avatar: true },
    });
    if (!actor) return null;

    // Map postType to the right notification type
    const type = params.postType === 'STORY'
      ? 'story_reaction'
      : params.postType === 'STATUS'
        ? 'status_reaction'
        : 'post_like';

    return this.createNotification({
      userId: params.postAuthorId,
      type,
      priority: 'normal',
      content: `a réagi ${params.emoji} à votre ${params.postType === 'STORY' ? 'story' : params.postType === 'STATUS' ? 'statut' : 'publication'}`,

      actor: {
        id: params.actorId,
        username: actor.username,
        displayName: actor.displayName,
        avatar: actor.avatar,
      },

      context: {
        postId: params.postId,
      },

      metadata: {
        action: 'view_post',
        postId: params.postId,
        emoji: params.emoji,
        postType: params.postType || 'POST',
      },
    });
  }

  // ==============================================
  // SOCIAL — POST_COMMENT
  // ==============================================

  async createPostCommentNotification(params: {
    actorId: string;
    postId: string;
    postAuthorId: string;
    commentId: string;
    commentPreview: string;
  }): Promise<Notification | null> {
    if (params.actorId === params.postAuthorId) return null;

    const actor = await this.prisma.user.findUnique({
      where: { id: params.actorId },
      select: { username: true, displayName: true, avatar: true },
    });
    if (!actor) return null;

    return this.createNotification({
      userId: params.postAuthorId,
      type: 'post_comment',
      priority: 'normal',
      content: this.truncateMessage(params.commentPreview),

      actor: {
        id: params.actorId,
        username: actor.username,
        displayName: actor.displayName,
        avatar: actor.avatar,
      },

      context: {
        postId: params.postId,
      },

      metadata: {
        action: 'view_post',
        postId: params.postId,
        commentId: params.commentId,
        commentPreview: this.truncateMessage(params.commentPreview),
      },
    });
  }

  // ==============================================
  // SOCIAL — POST_REPOST
  // ==============================================

  async createPostRepostNotification(params: {
    actorId: string;
    originalPostId: string;
    postAuthorId: string;
    repostId: string;
  }): Promise<Notification | null> {
    if (params.actorId === params.postAuthorId) return null;

    const actor = await this.prisma.user.findUnique({
      where: { id: params.actorId },
      select: { username: true, displayName: true, avatar: true },
    });
    if (!actor) return null;

    return this.createNotification({
      userId: params.postAuthorId,
      type: 'post_repost',
      priority: 'normal',
      content: 'A reposté ton post',

      actor: {
        id: params.actorId,
        username: actor.username,
        displayName: actor.displayName,
        avatar: actor.avatar,
      },

      context: {
        postId: params.originalPostId,
      },

      metadata: {
        action: 'view_post',
        originalPostId: params.originalPostId,
        repostId: params.repostId,
      },
    });
  }

  // ==============================================
  // SOCIAL — COMMENT_REPLY
  // ==============================================

  async createCommentReplyNotification(params: {
    actorId: string;
    postId: string;
    commentAuthorId: string;
    commentId: string;
    replyPreview: string;
  }): Promise<Notification | null> {
    if (params.actorId === params.commentAuthorId) return null;

    const actor = await this.prisma.user.findUnique({
      where: { id: params.actorId },
      select: { username: true, displayName: true, avatar: true },
    });
    if (!actor) return null;

    return this.createNotification({
      userId: params.commentAuthorId,
      type: 'comment_reply',
      priority: 'normal',
      content: this.truncateMessage(params.replyPreview),

      actor: {
        id: params.actorId,
        username: actor.username,
        displayName: actor.displayName,
        avatar: actor.avatar,
      },

      context: {
        postId: params.postId,
      },

      metadata: {
        action: 'view_post',
        postId: params.postId,
        commentId: params.commentId,
        commentPreview: this.truncateMessage(params.replyPreview),
      },
    });
  }

  // ==============================================
  // SOCIAL — COMMENT_LIKE
  // ==============================================

  async createCommentLikeNotification(params: {
    actorId: string;
    postId: string;
    commentId: string;
    commentAuthorId: string;
    emoji: string;
  }): Promise<Notification | null> {
    if (params.actorId === params.commentAuthorId) return null;

    const actor = await this.prisma.user.findUnique({
      where: { id: params.actorId },
      select: { username: true, displayName: true, avatar: true },
    });
    if (!actor) return null;

    return this.createNotification({
      userId: params.commentAuthorId,
      type: 'comment_like',
      priority: 'low',
      content: `A réagi ${params.emoji} à ton commentaire`,

      actor: {
        id: params.actorId,
        username: actor.username,
        displayName: actor.displayName,
        avatar: actor.avatar,
      },

      context: {
        postId: params.postId,
      },

      metadata: {
        action: 'view_post',
        postId: params.postId,
        commentId: params.commentId,
        emoji: params.emoji,
      },
    });
  }

  // ==============================================
  // CONVERSATION_INVITE / ADDED_TO_CONVERSATION
  // ==============================================

  async createConversationInviteNotification(params: {
    invitedUserId: string;
    inviterId: string;
    inviterUsername?: string;
    inviterAvatar?: string;
    conversationId: string;
    conversationTitle?: string;
    conversationType: 'direct' | 'group' | 'public' | 'global' | 'broadcast' | string;
  }): Promise<Notification | null> {
    const type = params.conversationType === 'direct' ? 'new_conversation_direct' : 'new_conversation_group';

    // Si on n'a pas les infos de l'inviteur, on les récupère
    let actor = {
      id: params.inviterId,
      username: params.inviterUsername || 'User',
      displayName: params.inviterUsername || 'User',
      avatar: params.inviterAvatar
    };

    if (!params.inviterUsername) {
      const user = await this.prisma.user.findUnique({
        where: { id: params.inviterId },
        select: { username: true, displayName: true, avatar: true }
      });
      if (user) {
        actor.username = user.username;
        actor.displayName = user.displayName || user.username;
        actor.avatar = user.avatar || undefined;
      }
    }

    const content = params.conversationType === 'direct'
      ? `Nouvelle conversation avec ${actor.displayName}`
      : `Invitation au groupe ${params.conversationTitle || 'sans nom'}`;

    return this.createNotification({
      userId: params.invitedUserId,
      type: type as any,
      priority: 'normal',
      content,
      actor,
      context: {
        conversationId: params.conversationId,
        conversationTitle: params.conversationTitle,
        conversationType: params.conversationType as any,
      },
      metadata: { action: 'view_conversation' },
    });
  }

  async createAddedToConversationNotification(params: {
    recipientUserId: string;
    addedByUserId: string;
    conversationId: string;
  }): Promise<Notification | null> {
    const actor = await this.prisma.user.findUnique({
      where: { id: params.addedByUserId },
      select: { username: true, displayName: true, avatar: true },
    });
    if (!actor) return null;

    const conversation = await this.prisma.conversation.findUnique({
      where: { id: params.conversationId },
      select: { title: true, type: true },
    });

    return this.createNotification({
      userId: params.recipientUserId,
      type: 'added_to_conversation',
      priority: 'normal',
      content: conversation?.type === 'direct' ? 'Nouveau contact' : `Ajouté au groupe ${conversation?.title || ''}`,
      actor: {
        id: params.addedByUserId,
        username: actor.username,
        displayName: actor.displayName,
        avatar: actor.avatar,
      },
      context: {
        conversationId: params.conversationId,
        conversationTitle: conversation?.title,
        conversationType: conversation?.type as any,
      },
      metadata: { action: 'view_conversation' },
    });
  }

  // ==============================================
  // REMOVED_FROM_CONVERSATION
  // ==============================================

  async createRemovedFromConversationNotification(params: {
    recipientUserId: string;
    removedByUserId: string;
    conversationId: string;
  }): Promise<Notification | null> {
    const actor = await this.prisma.user.findUnique({
      where: { id: params.removedByUserId },
      select: { username: true, displayName: true, avatar: true },
    });
    if (!actor) return null;

    const conversation = await this.prisma.conversation.findUnique({
      where: { id: params.conversationId },
      select: { title: true, type: true },
    });

    return this.createNotification({
      userId: params.recipientUserId,
      type: 'removed_from_conversation',
      priority: 'normal',
      content: '',
      actor: {
        id: params.removedByUserId,
        username: actor.username,
        displayName: actor.displayName,
        avatar: actor.avatar,
      },
      context: {
        conversationId: params.conversationId,
        conversationTitle: conversation?.title,
        conversationType: conversation?.type as any,
      },
      metadata: { action: 'view_details' },
    });
  }

  // ==============================================
  // MEMBER_REMOVED (notifie les autres membres)
  // ==============================================

  async createMemberRemovedNotification(params: {
    recipientUserId: string;
    removedByUserId: string;
    conversationId: string;
  }): Promise<Notification | null> {
    const actor = await this.prisma.user.findUnique({
      where: { id: params.removedByUserId },
      select: { username: true, displayName: true, avatar: true },
    });
    if (!actor) return null;

    const conversation = await this.prisma.conversation.findUnique({
      where: { id: params.conversationId },
      select: { title: true, type: true },
    });

    return this.createNotification({
      userId: params.recipientUserId,
      type: 'member_removed',
      priority: 'normal',
      content: '',
      actor: {
        id: params.removedByUserId,
        username: actor.username,
        displayName: actor.displayName,
        avatar: actor.avatar,
      },
      context: {
        conversationId: params.conversationId,
        conversationTitle: conversation?.title,
        conversationType: conversation?.type as any,
      },
      metadata: { action: 'view_conversation' },
    });
  }

  // ==============================================
  // MEMBER_ROLE_CHANGED / PROMOTED / DEMOTED
  // ==============================================

  async createMemberRoleChangedNotification(params: {
    recipientUserId: string;
    changedByUserId: string;
    conversationId: string;
    newRole: 'ADMIN' | 'MODERATOR' | 'MEMBER';
    previousRole: string;
  }): Promise<Notification | null> {
    const actor = await this.prisma.user.findUnique({
      where: { id: params.changedByUserId },
      select: { username: true, displayName: true, avatar: true },
    });
    if (!actor) return null;

    const conversation = await this.prisma.conversation.findUnique({
      where: { id: params.conversationId },
      select: { title: true, type: true },
    });

    const roleHierarchy: Record<string, number> = { MEMBER: 0, MODERATOR: 1, ADMIN: 2, CREATOR: 3 };
    const oldLevel = roleHierarchy[params.previousRole] ?? 0;
    const newLevel = roleHierarchy[params.newRole] ?? 0;
    const type = newLevel > oldLevel ? 'member_promoted' : newLevel < oldLevel ? 'member_demoted' : 'member_role_changed';

    return this.createNotification({
      userId: params.recipientUserId,
      type,
      priority: 'normal',
      content: '',
      actor: {
        id: params.changedByUserId,
        username: actor.username,
        displayName: actor.displayName,
        avatar: actor.avatar,
      },
      context: {
        conversationId: params.conversationId,
        conversationTitle: conversation?.title,
        conversationType: conversation?.type as any,
      },
      metadata: {
        action: 'view_conversation',
        newRole: params.newRole,
        previousRole: params.previousRole,
      },
    });
  }

  // ==============================================
  // MEMBER_LEFT
  // ==============================================

  async createMemberLeftNotification(params: {
    recipientUserId: string;
    memberUserId: string;
    conversationId: string;
  }): Promise<Notification | null> {
    const member = await this.prisma.user.findUnique({
      where: { id: params.memberUserId },
      select: { username: true, displayName: true, avatar: true },
    });
    if (!member) return null;

    const conversation = await this.prisma.conversation.findUnique({
      where: { id: params.conversationId },
      select: { title: true, type: true },
    });

    return this.createNotification({
      userId: params.recipientUserId,
      type: 'member_left',
      priority: 'low',
      content: '',
      actor: {
        id: params.memberUserId,
        username: member.username,
        displayName: member.displayName,
        avatar: member.avatar,
      },
      context: {
        conversationId: params.conversationId,
        conversationTitle: conversation?.title,
        conversationType: conversation?.type as any,
      },
      metadata: { action: 'view_conversation' },
    });
  }

  // ==============================================
  // SECURITY — PASSWORD_CHANGED
  // ==============================================

  async createPasswordChangedNotification(params: {
    recipientUserId: string;
  }): Promise<Notification | null> {
    return this.createNotification({
      userId: params.recipientUserId,
      type: 'password_changed',
      priority: 'high',
      content: '',
      context: {},
      metadata: { action: 'view_details' },
    });
  }

  // ==============================================
  // SECURITY — TWO_FACTOR_ENABLED / DISABLED
  // ==============================================

  async createTwoFactorNotification(params: {
    recipientUserId: string;
    enabled: boolean;
  }): Promise<Notification | null> {
    return this.createNotification({
      userId: params.recipientUserId,
      type: params.enabled ? 'two_factor_enabled' : 'two_factor_disabled',
      priority: 'high',
      content: '',
      context: {},
      metadata: { action: 'view_details' },
    });
  }

  // ==============================================
  // SECURITY — LOGIN_NEW_DEVICE
  // ==============================================

  async createLoginNewDeviceNotification(params: {
    recipientUserId: string;
    deviceInfo?: {
      type?: string;
      vendor?: string | null;
      model?: string | null;
      os?: string | null;
      osVersion?: string | null;
    } | null;
    ipAddress?: string;
    geoData?: {
      country?: string | null;
      countryName?: string | null;
      city?: string | null;
      location?: string | null;
    } | null;
  }): Promise<Notification | null> {
    const device = params.deviceInfo;
    const geo = params.geoData;

    const deviceName = [device?.vendor, device?.model].filter(Boolean).join(' ') || null;
    const deviceOS = device?.os
      ? (device.osVersion ? `${device.os} ${device.osVersion}` : device.os)
      : null;
    const location = geo?.location || [geo?.city, geo?.countryName].filter(Boolean).join(', ') || null;

    return this.createNotification({
      userId: params.recipientUserId,
      type: 'login_new_device',
      priority: 'high',
      content: '',
      context: {},
      metadata: {
        action: 'view_details' as const,
        deviceName,
        deviceVendor: device?.vendor || null,
        deviceOS,
        deviceOSVersion: device?.osVersion || null,
        deviceType: device?.type || null,
        ipAddress: params.ipAddress || null,
        country: geo?.country || null,
        countryName: geo?.countryName || null,
        city: geo?.city || null,
        location,
      },
    });
  }

  // ==============================================
  // ANTI-SPAM & UTILITIES
  // ==============================================

  /**
   * Vérifie le rate limit des mentions par paire (sender → recipient).
   * Maximum MAX_MENTIONS_PER_MINUTE mentions par minute par paire.
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
   * Nettoie les entrées périmées de la map recentMentions.
   * Appelé automatiquement toutes les 2 minutes via setInterval.
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

  /**
   * Tronque un message par nombre de mots (pas de caractères).
   * Plus naturel pour les aperçus de messages multilingues.
   */
  private truncateMessage(message: string, maxWords: number = 25): string {
    if (!message) return '';

    const words = message.trim().split(/\s+/);
    if (words.length <= maxWords) {
      return message;
    }
    return words.slice(0, maxWords).join(' ') + '...';
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
      // Note: Vérifier que context existe et n'est pas null (anciennes données)
      const relevantNotifications = notifications.filter((n: any) => {
        // Ignorer les notifications avec context null ou invalide
        if (!n.context || typeof n.context !== 'object') {
          notificationLogger.warn('Notification with invalid context found', {
            notificationId: n.id,
            userId: n.userId,
            contextValue: n.context
          });
          return false;
        }
        return n.context.conversationId === conversationId;
      });

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
    notificationLogger.info('🔌 [SOCKET.IO] setSocketIO appelé', {
      hasIo: !!io,
      ioType: typeof io,
    });
    this.io = io;
    notificationLogger.info('✅ [SOCKET.IO] this.io configuré avec succès', {
      hasThisIo: !!this.io,
    });
    // userSocketsMap non utilisé dans V2 (utilise io.to(userId) directement)
  }

  setPushNotificationService(pushService: PushNotificationService): void {
    this.pushService = pushService;
    notificationLogger.info('✅ PushNotificationService configured');
  }

  setEmailService(emailService: EmailService): void {
    this.emailService = emailService;
    notificationLogger.info('✅ EmailService configured for immediate notifications');
  }
}
