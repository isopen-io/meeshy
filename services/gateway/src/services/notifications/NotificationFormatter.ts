/**
 * NotificationFormatter - Formatage et transformation des notifications
 *
 * Responsabilités :
 * - Formater les aperçus de messages avec attachments
 * - Tronquer le contenu des messages
 * - Transformer les objets Prisma en événements Socket.IO
 * - Générer les descriptions d'attachments
 */

import type { NotificationEventData, AttachmentInfo } from './types';

export class NotificationFormatter {
  /**
   * Tronquer un message à une longueur maximale (en mots)
   */
  truncateMessage(message: string, maxWords: number = 25): string {
    if (!message) return '';

    const words = message.trim().split(/\s+/);
    if (words.length <= maxWords) {
      return message;
    }
    return words.slice(0, maxWords).join(' ') + '...';
  }

  /**
   * Formater les informations d'attachment pour les notifications
   */
  formatAttachmentInfo(attachments?: Array<{
    id: string;
    filename: string;
    mimeType: string;
    fileSize: number
  }>): AttachmentInfo | null {
    if (!attachments || attachments.length === 0) return null;

    const firstAttachment = attachments[0];
    const attachmentType = firstAttachment.mimeType.split('/')[0];

    return {
      count: attachments.length,
      firstType: attachmentType,
      firstFilename: firstAttachment.filename,
      firstMimeType: firstAttachment.mimeType
    };
  }

  /**
   * Générer une description textuelle d'un attachment
   */
  private getAttachmentDescription(
    mimeType: string,
    count: number
  ): string {
    const attachmentType = mimeType.split('/')[0];

    let description = '';
    switch (attachmentType) {
      case 'image':
        description = '📷 Photo';
        break;
      case 'video':
        description = '🎥 Vidéo';
        break;
      case 'audio':
        description = '🎵 Audio';
        break;
      case 'application':
        if (mimeType === 'application/pdf') {
          description = '📄 PDF';
        } else {
          description = '📎 Document';
        }
        break;
      default:
        description = '📎 Fichier';
    }

    if (count > 1) {
      description += ` (+${count - 1})`;
    }

    return description;
  }

  /**
   * Formater un message avec attachments pour l'aperçu de notification
   */
  formatMessagePreview(
    messageContent: string,
    attachments?: Array<{
      id: string;
      filename: string;
      mimeType: string;
      fileSize: number
    }>,
    maxWords: number = 25
  ): string {
    if (attachments && attachments.length > 0) {
      const attachment = attachments[0];
      const attachmentDescription = this.getAttachmentDescription(
        attachment.mimeType,
        attachments.length
      );

      if (messageContent && messageContent.trim().length > 0) {
        const textPreview = this.truncateMessage(messageContent, Math.min(maxWords, 15));
        return `${textPreview} ${attachmentDescription}`;
      } else {
        return attachmentDescription;
      }
    }

    return this.truncateMessage(messageContent, maxWords);
  }

  /**
   * Formater une notification Prisma en événement Socket.IO
   */
  formatNotificationEvent(notification: any): NotificationEventData {
    return {
      id: notification.id,
      userId: notification.userId,
      type: notification.type,
      title: notification.title,
      content: notification.content,
      priority: notification.priority,
      isRead: notification.isRead,
      createdAt: notification.createdAt,
      senderId: notification.senderId || undefined,
      senderUsername: notification.senderUsername || undefined,
      senderAvatar: notification.senderAvatar || undefined,
      senderDisplayName: notification.senderDisplayName || undefined,
      senderFirstName: notification.senderFirstName || undefined,
      senderLastName: notification.senderLastName || undefined,
      messagePreview: notification.messagePreview || undefined,
      conversationId: notification.conversationId || undefined,
      messageId: notification.messageId || undefined,
      callSessionId: notification.callSessionId || undefined,
      data: notification.data ? JSON.parse(notification.data) : undefined
    };
  }

  /**
   * Créer les données de notification pour batch creation
   */
  createNotificationData(
    userId: string,
    type: string,
    title: string,
    content: string,
    options: {
      priority?: 'low' | 'normal' | 'high' | 'urgent';
      senderId?: string;
      senderUsername?: string;
      senderAvatar?: string;
      senderDisplayName?: string;
      senderFirstName?: string;
      senderLastName?: string;
      messagePreview?: string;
      conversationId?: string;
      messageId?: string;
      callSessionId?: string;
      data?: any;
    }
  ): any {
    return {
      userId,
      type,
      title,
      content,
      priority: options.priority || 'normal',
      senderId: options.senderId,
      senderUsername: options.senderUsername,
      senderAvatar: options.senderAvatar,
      senderDisplayName: options.senderDisplayName,
      senderFirstName: options.senderFirstName,
      senderLastName: options.senderLastName,
      messagePreview: options.messagePreview,
      conversationId: options.conversationId,
      messageId: options.messageId,
      callSessionId: options.callSessionId,
      data: options.data ? JSON.stringify(options.data) : null,
      isRead: false
    };
  }
}
