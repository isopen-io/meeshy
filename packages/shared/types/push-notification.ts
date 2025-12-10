/**
 * PUSH NOTIFICATION TYPES
 * Types partagés pour les notifications push
 */

/**
 * Subscription Push (format JSON standard)
 */
export interface PushSubscriptionJSON {
  readonly endpoint: string;
  readonly expirationTime: number | null;
  readonly keys: {
    readonly p256dh: string;
    readonly auth: string;
  };
}

/**
 * Payload d'une notification push
 */
export interface PushNotificationPayload {
  /** Titre de la notification */
  readonly title: string;

  /** Corps du message */
  readonly body: string;

  /** URL de l'icône (optionnel) */
  readonly icon?: string;

  /** URL du badge (optionnel) */
  readonly badge?: string;

  /** Image à afficher (optionnel) */
  readonly image?: string;

  /** Données additionnelles */
  readonly data?: PushNotificationData;

  /** Tag pour grouper les notifications */
  readonly tag?: string;

  /** Si true, remplace l'ancienne notification avec le même tag */
  readonly renotify?: boolean;

  /** Si true, la notification reste jusqu'à interaction */
  readonly requireInteraction?: boolean;

  /** Pattern de vibration [durée_on, durée_off, ...] en ms */
  readonly vibrate?: number[];

  /** Actions disponibles sur la notification */
  readonly actions?: readonly PushNotificationAction[];
}

/**
 * Données additionnelles d'une notification
 */
export interface PushNotificationData {
  /** ID de la conversation */
  readonly conversationId?: string;

  /** ID du message */
  readonly messageId?: string;

  /** ID de l'expéditeur */
  readonly senderId?: string;

  /** Nom/pseudo de l'expéditeur */
  readonly senderName?: string;

  /** Avatar de l'expéditeur */
  readonly senderAvatar?: string;

  /** Nombre de messages non lus */
  readonly unreadCount?: number;

  /** Type de notification */
  readonly type?: PushNotificationType;

  /** Timestamp */
  readonly timestamp?: number;

  /** URL de destination */
  readonly url?: string;

  /** Données personnalisées additionnelles */
  readonly [key: string]: any;
}

/**
 * Action sur une notification
 */
export interface PushNotificationAction {
  readonly action: string;
  readonly title: string;
  readonly icon?: string;
}

/**
 * Types de notifications push
 */
export type PushNotificationType =
  | 'message' // Nouveau message
  | 'mention' // Mention dans un message
  | 'friend_request' // Demande d'ami
  | 'conversation_invite' // Invitation à une conversation
  | 'community_invite' // Invitation à une communauté
  | 'system' // Notification système
  | 'call' // Appel entrant
  | 'other'; // Autre

/**
 * Configuration d'une subscription sauvegardée en base
 */
export interface SavedPushSubscription {
  readonly id: string;
  readonly userId: string;
  readonly endpoint: string;
  readonly p256dh: string;
  readonly auth: string;
  readonly expirationTime?: number;
  readonly userAgent?: string;
  readonly deviceName?: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/**
 * Statistiques d'envoi de notifications
 */
export interface PushNotificationStats {
  /** Nombre total de notifications envoyées */
  readonly sent: number;

  /** Nombre de succès */
  readonly success: number;

  /** Nombre d'échecs */
  readonly failed: number;

  /** Subscriptions expirées/invalides */
  readonly expired: number;
}

/**
 * Préférences de notifications d'un utilisateur
 */
export interface PushNotificationPreferences {
  /** Activer les notifications push */
  readonly enabled: boolean;

  /** Types de notifications à recevoir */
  readonly types: {
    readonly messages: boolean;
    readonly mentions: boolean;
    readonly friendRequests: boolean;
    readonly conversationInvites: boolean;
    readonly communityInvites: boolean;
    readonly calls: boolean;
    readonly system: boolean;
  };

  /** Ne pas déranger (horaires) */
  readonly quietHours?: {
    readonly enabled: boolean;
    readonly start: string; // Format HH:mm
    readonly end: string; // Format HH:mm
  };

  /** Grouper les notifications par conversation */
  readonly groupByConversation: boolean;

  /** Son des notifications */
  readonly sound: boolean;

  /** Vibration */
  readonly vibrate: boolean;
}
