/**
 * Types partagés pour le système de notifications
 */

export interface CreateNotificationData {
  userId: string;
  type: 'new_message' | 'new_conversation_direct' | 'new_conversation_group' | 'message_reply' | 'member_joined' | 'contact_request' | 'contact_accepted' | 'user_mentioned' | 'message_reaction' | 'missed_call' | 'system' | 'new_conversation' | 'message_edited';
  title: string;
  content: string;
  priority?: 'low' | 'normal' | 'high' | 'urgent';

  // Informations de l'expéditeur
  senderId?: string;
  senderUsername?: string;
  senderAvatar?: string;
  senderDisplayName?: string;
  senderFirstName?: string;
  senderLastName?: string;

  // Aperçu du message
  messagePreview?: string;

  // Références pour navigation
  conversationId?: string;
  messageId?: string;
  callSessionId?: string;
  friendRequestId?: string;
  reactionId?: string;

  // Données supplémentaires
  data?: any;
  expiresAt?: Date;
}

export interface NotificationEventData {
  id: string;
  userId: string;
  type: string;
  title: string;
  content: string;
  priority: string;
  isRead: boolean;
  createdAt: Date;

  // Informations enrichies
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

export interface AttachmentInfo {
  count: number;
  firstType: string;
  firstFilename: string;
  firstMimeType: string;
}

export interface SenderInfo {
  senderUsername: string;
  senderAvatar?: string;
  senderDisplayName?: string;
  senderFirstName?: string;
  senderLastName?: string;
}

export interface NotificationMetrics {
  notificationsCreated: number;
  webSocketSent: number;
  firebaseSent: number;
  firebaseFailed: number;
  firebaseEnabled: boolean;
}

export interface NotificationStats {
  total: number;
  unread: number;
  byType: Record<string, number>;
}
