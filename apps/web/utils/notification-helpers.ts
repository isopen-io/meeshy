/**
 * Utilitaires simples pour les notifications V2
 * Utilise directement les données du backend sans reformatage
 * Intègre les traductions i18n pour les titres et contenus
 */

import {
  NotificationType,
  type NotificationV2,
  type NotificationIcon
} from '@/types/notification-v2';
import { getUserDisplayName } from './user-display-name';

// Type pour la fonction de traduction
type TranslateFunction = (key: string, params?: Record<string, string>) => string;

/**
 * Configuration des icônes et couleurs par type de notification
 */
export const NOTIFICATION_ICONS: Record<NotificationType, NotificationIcon> = {
  [NotificationType.NEW_MESSAGE]: {
    emoji: '💬',
    color: 'text-blue-600',
    bgColor: 'bg-blue-50'
  },
  [NotificationType.MESSAGE_REPLY]: {
    emoji: '↩️',
    color: 'text-blue-400',
    bgColor: 'bg-blue-50'
  },
  [NotificationType.USER_MENTIONED]: {
    emoji: '@',
    color: 'text-orange-600',
    bgColor: 'bg-orange-50'
  },
  [NotificationType.MESSAGE_REACTION]: {
    emoji: '❤️',
    color: 'text-pink-600',
    bgColor: 'bg-pink-50'
  },
  [NotificationType.CONTACT_REQUEST]: {
    emoji: '🤝',
    color: 'text-green-600',
    bgColor: 'bg-green-50'
  },
  [NotificationType.CONTACT_ACCEPTED]: {
    emoji: '✅',
    color: 'text-green-400',
    bgColor: 'bg-green-50'
  },
  [NotificationType.NEW_CONVERSATION_DIRECT]: {
    emoji: '👤',
    color: 'text-blue-600',
    bgColor: 'bg-blue-50'
  },
  [NotificationType.NEW_CONVERSATION_GROUP]: {
    emoji: '👥',
    color: 'text-purple-600',
    bgColor: 'bg-purple-50'
  },
  [NotificationType.MEMBER_JOINED]: {
    emoji: '👋',
    color: 'text-indigo-600',
    bgColor: 'bg-indigo-50'
  },
  [NotificationType.MISSED_CALL]: {
    emoji: '📞',
    color: 'text-red-600',
    bgColor: 'bg-red-50'
  },
  [NotificationType.SYSTEM]: {
    emoji: '🔔',
    color: 'text-gray-600',
    bgColor: 'bg-gray-50'
  }
};

/**
 * Retourne l'icône pour une notification
 */
export function getNotificationIcon(notification: NotificationV2): NotificationIcon {
  return NOTIFICATION_ICONS[notification.type] || NOTIFICATION_ICONS[NotificationType.SYSTEM];
}

/**
 * Retourne la couleur de bordure pour le toast selon le type de notification
 */
export function getNotificationBorderColor(notification: NotificationV2): string {
  const borderColors: Record<NotificationType, string> = {
    [NotificationType.NEW_MESSAGE]: 'border-l-blue-500',
    [NotificationType.MESSAGE_REPLY]: 'border-l-blue-400',
    [NotificationType.USER_MENTIONED]: 'border-l-orange-500',
    [NotificationType.MESSAGE_REACTION]: 'border-l-pink-500',
    [NotificationType.CONTACT_REQUEST]: 'border-l-green-500',
    [NotificationType.CONTACT_ACCEPTED]: 'border-l-green-400',
    [NotificationType.NEW_CONVERSATION_DIRECT]: 'border-l-blue-500',
    [NotificationType.NEW_CONVERSATION_GROUP]: 'border-l-purple-500',
    [NotificationType.MEMBER_JOINED]: 'border-l-indigo-500',
    [NotificationType.MISSED_CALL]: 'border-l-red-500',
    [NotificationType.SYSTEM]: 'border-l-gray-500'
  };

  return borderColors[notification.type] || 'border-l-blue-500';
}

/**
 * Formate le timestamp de la notification (temps relatif)
 */
export function formatNotificationTimestamp(createdAt: Date | string): string {
  const date = createdAt instanceof Date ? createdAt : new Date(createdAt);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSeconds < 10) return 'à l\'instant';
  if (diffSeconds < 60) return `il y a ${diffSeconds}s`;
  if (diffMinutes < 60) return `il y a ${diffMinutes}min`;
  if (diffHours < 24) return `il y a ${diffHours}h`;
  if (diffDays < 7) return `il y a ${diffDays}j`;

  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

/**
 * Formate le contexte de la notification (conversation + temps)
 */
export function formatNotificationContext(notification: NotificationV2): string {
  const parts: string[] = [];

  // Nom de la conversation
  if (notification.context?.conversationTitle) {
    parts.push(`💬 ${notification.context.conversationTitle}`);
  }

  // Timestamp
  parts.push(formatNotificationTimestamp(notification.createdAt));

  return parts.join(' • ');
}

/**
 * Formate l'aperçu du message avec attachments
 */
export function formatMessagePreview(content: string, attachments?: any[]): string {
  if (attachments && attachments.length > 0) {
    const count = attachments.length;
    const type = attachments[0].mimeType?.startsWith('image/') ? '📷 Photo' : '📎 Fichier';
    return count > 1 ? `${type} (${count})` : type;
  }
  return content;
}

/**
 * Retourne le lien de navigation pour une notification
 */
export function getNotificationLink(notification: NotificationV2): string | null {
  const conversationId = notification.context?.conversationId;
  const messageId = notification.context?.messageId;

  if (conversationId) {
    return messageId
      ? `/conversations/${conversationId}?messageId=${messageId}`
      : `/conversations/${conversationId}`;
  }

  return null;
}

/**
 * Détermine si la notification requiert une action utilisateur
 */
export function requiresUserAction(notification: NotificationV2): boolean {
  return notification.type === NotificationType.CONTACT_REQUEST;
}

/**
 * Obtient le nom d'affichage d'un utilisateur pour les notifications
 * Utilise la fonction centralisée getUserDisplayName
 */
export function getSenderDisplayName(sender?: NotificationV2['sender']): string {
  return getUserDisplayName(sender, 'Un utilisateur');
}

/**
 * Construit le titre de la notification à partir des données brutes
 * Cette fonction remplace les titres pré-formatés du backend
 * Utilise getSenderDisplayName pour afficher le bon nom (displayName > firstName+lastName > username)
 * Supporte les traductions i18n avec la fonction t fournie
 */
export function buildNotificationTitle(
  notification: NotificationV2,
  t?: TranslateFunction
): string {
  const senderName = getSenderDisplayName(notification.sender);
  const conversationTitle = notification.context?.conversationTitle || (t ? t('content.defaultConversation') : 'la conversation');

  // Si pas de fonction de traduction, utiliser les textes en dur (fallback)
  if (!t) {
    switch (notification.type) {
      case NotificationType.NEW_MESSAGE:
        return `Message de ${senderName}`;
      case NotificationType.MESSAGE_REPLY:
        return `Réponse de ${senderName}`;
      case NotificationType.USER_MENTIONED:
        return `${senderName} vous a cité`;
      case NotificationType.MESSAGE_REACTION:
        return `${senderName} a réagi à votre message`;
      case NotificationType.CONTACT_REQUEST:
        return `${senderName} veut se connecter`;
      case NotificationType.CONTACT_ACCEPTED:
        return `${senderName} a accepté votre invitation`;
      case NotificationType.NEW_CONVERSATION_DIRECT:
        return `Conversation de ${senderName}`;
      case NotificationType.NEW_CONVERSATION_GROUP:
        return `Invitation de ${senderName}`;
      case NotificationType.MEMBER_JOINED:
        return `Nouveau membre dans ${conversationTitle}`;
      case NotificationType.MISSED_CALL:
        return `Appel manqué de ${senderName}`;
      case NotificationType.SYSTEM:
        return notification.title || 'Notification système';
      default:
        return notification.title || 'Nouvelle notification';
    }
  }

  // Avec traductions i18n
  switch (notification.type) {
    case NotificationType.NEW_MESSAGE:
      return t('titles.newMessage', { sender: senderName });

    case NotificationType.MESSAGE_REPLY:
      return t('titles.reply', { sender: senderName });

    case NotificationType.USER_MENTIONED:
      return t('titles.mentioned', { sender: senderName });

    case NotificationType.MESSAGE_REACTION:
      const emoji = notification.metadata?.reactionEmoji || '❤️';
      return t('titles.reaction', { sender: senderName, emoji });

    case NotificationType.CONTACT_REQUEST:
      return t('titles.contactRequest', { sender: senderName });

    case NotificationType.CONTACT_ACCEPTED:
      return t('titles.contactAccepted', { sender: senderName });

    case NotificationType.NEW_CONVERSATION_DIRECT:
      return t('titles.newConversationDirect', { sender: senderName });

    case NotificationType.NEW_CONVERSATION_GROUP:
      return t('titles.newConversationGroup', { title: conversationTitle });

    case NotificationType.MEMBER_JOINED:
      return t('titles.memberJoined', { title: conversationTitle });

    case NotificationType.MISSED_CALL:
      const callType = notification.metadata?.callType || 'video';
      return t('titles.missedCall', { type: callType });

    case NotificationType.SYSTEM:
      return notification.title || t('titles.system');

    default:
      return notification.title || t('titles.default');
  }
}

/**
 * Construit le contenu de la notification à partir des données brutes
 * Utilise getSenderDisplayName pour afficher le bon nom
 * Supporte les traductions i18n avec la fonction t fournie
 */
export function buildNotificationContent(
  notification: NotificationV2,
  t?: TranslateFunction
): string {
  // Si on a un messagePreview, l'utiliser
  if (notification.messagePreview) {
    return formatMessagePreview(notification.messagePreview, notification.metadata?.attachments);
  }

  // Sinon, utiliser le content du backend ou construire un message par défaut
  if (notification.content) {
    return notification.content;
  }

  // Messages par défaut basés sur le type
  const senderName = getSenderDisplayName(notification.sender);
  const conversationTitle = notification.context?.conversationTitle || (t ? t('content.defaultConversation') : 'la conversation');

  // Si pas de fonction de traduction, utiliser les textes en dur (fallback)
  if (!t) {
    switch (notification.type) {
      case NotificationType.CONTACT_ACCEPTED:
        return `${senderName} a accepté votre invitation. Vous pouvez maintenant discuter ensemble.`;
      case NotificationType.CONTACT_REQUEST:
        return `${senderName} vous a envoyé une invitation`;
      case NotificationType.NEW_CONVERSATION_DIRECT:
        return `${senderName} a commencé une conversation avec vous`;
      case NotificationType.NEW_CONVERSATION_GROUP:
        return `${senderName} vous a invité à rejoindre ${conversationTitle}`;
      case NotificationType.MEMBER_JOINED:
        return `${senderName} a rejoint le groupe`;
      default:
        return '';
    }
  }

  // Avec traductions i18n
  switch (notification.type) {
    case NotificationType.CONTACT_ACCEPTED:
      return t('content.contactAcceptedMessage', { sender: senderName });

    case NotificationType.CONTACT_REQUEST:
      return t('content.contactRequestMessage', { sender: senderName });

    case NotificationType.NEW_CONVERSATION_GROUP:
      const isMember = notification.metadata?.isMember;
      if (!isMember) {
        return t('content.notMemberHint');
      }
      return '';

    case NotificationType.MEMBER_JOINED:
      return t('content.memberJoinedMessage', { sender: senderName });

    default:
      return '';
  }
}
