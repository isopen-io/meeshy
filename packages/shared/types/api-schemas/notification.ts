/**
 * Schémas d’API — notifications et leurs préférences.
 *
 * Extrait de `types/api-schemas.ts` par #4635 (découpage du contrat de réponse
 * du dépôt, directive 2026-08-28). Le texte des schémas est INCHANGÉ : seule
 * leur adresse de fichier bouge. `types/api-schemas.ts` reste la FAÇADE qui les
 * ré-exporte, et aucun importeur n’a bougé.
 *
 * @module @meeshy/shared/types/api-schemas/notification
 */

// =============================================================================
// NOTIFICATION SCHEMAS
// =============================================================================

/**
 * Actor schema - qui a déclenché la notification
 */
export const notificationActorSchema = {
  type: 'object',
  description: 'User who triggered the notification',
  properties: {
    id: { type: 'string', description: 'Actor user ID' },
    username: { type: 'string', description: 'Actor username' },
    displayName: { type: 'string', nullable: true, description: 'Actor display name' },
    avatar: { type: 'string', nullable: true, description: 'Actor avatar URL' }
  },
  required: ['id', 'username']
} as const;

/**
 * Context schema - où c'est arrivé
 */
export const notificationContextSchema = {
  type: 'object',
  description: 'Notification context for navigation',
  properties: {
    conversationId: { type: 'string', nullable: true, description: 'Related conversation ID' },
    conversationTitle: { type: 'string', nullable: true, description: 'Conversation title' },
    conversationType: {
      type: 'string',
      enum: ['direct', 'group', 'public', 'global', 'broadcast'],
      nullable: true,
      description: 'Conversation type'
    },
    messageId: { type: 'string', nullable: true, description: 'Related message ID' },
    originalMessageId: { type: 'string', nullable: true, description: 'Original message ID (for replies)' },
    callSessionId: { type: 'string', nullable: true, description: 'Related call session ID' },
    friendRequestId: { type: 'string', nullable: true, description: 'Related friend request ID' },
    reactionId: { type: 'string', nullable: true, description: 'Related reaction ID' },
    postId: { type: 'string', nullable: true, description: 'Related post/story/mood ID (navigation target)' },
    commentId: { type: 'string', nullable: true, description: 'Related comment ID (navigation anchor)' }
  }
} as const;

/**
 * State schema - statut de lecture
 */
export const notificationStateSchema = {
  type: 'object',
  description: 'Notification state',
  properties: {
    isRead: { type: 'boolean', description: 'Whether notification is read' },
    readAt: { type: 'string', format: 'date-time', nullable: true, description: 'Read timestamp' },
    createdAt: { type: 'string', format: 'date-time', description: 'Creation timestamp' },
    expiresAt: { type: 'string', format: 'date-time', nullable: true, description: 'Expiration timestamp' }
  },
  required: ['isRead', 'createdAt']
} as const;

/**
 * Delivery schema - suivi multi-canal
 */
export const notificationDeliverySchema = {
  type: 'object',
  description: 'Notification delivery status',
  properties: {
    emailSent: { type: 'boolean', description: 'Email notification sent' },
    pushSent: { type: 'boolean', description: 'Push notification sent' }
  },
  required: ['emailSent', 'pushSent']
} as const;

/**
 * Metadata schema - données type-spécifiques
 */
export const notificationMetadataSchema = {
  type: 'object',
  description: 'Type-specific notification metadata',
  properties: {
    action: {
      type: 'string',
      enum: ['view_message', 'view_conversation', 'join_conversation', 'accept_or_reject_contact', 'open_call', 'view_details', 'update_app', 'none'],
      nullable: true,
      description: 'Action to perform when clicking notification'
    },
    messagePreview: { type: 'string', nullable: true, description: 'Message preview text' },
    attachments: {
      type: 'object',
      nullable: true,
      properties: {
        count: { type: 'number', description: 'Number of attachments' },
        firstType: {
          type: 'string',
          enum: ['image', 'video', 'audio', 'document', 'text', 'code'],
          description: 'Type of first attachment'
        },
        firstFilename: { type: 'string', description: 'Filename of first attachment' }
      },
      description: 'Attachment information'
    },
    reactionEmoji: { type: 'string', nullable: true, description: 'Reaction emoji' },
    callType: {
      type: 'string',
      enum: ['audio', 'video'],
      nullable: true,
      description: 'Type of call'
    },
    memberCount: { type: 'number', nullable: true, description: 'Number of members' },
    isMember: { type: 'boolean', nullable: true, description: 'Is user a member' },
    joinMethod: {
      type: 'string',
      enum: ['via_link', 'invited'],
      nullable: true,
      description: 'How user joined'
    },
    systemType: {
      type: 'string',
      enum: ['maintenance', 'security', 'announcement', 'feature'],
      nullable: true,
      description: 'Type of system notification'
    }
  },
  additionalProperties: true
} as const;

/**
 * Notification schema for API responses
 * IMPORTANT: Pas de champ title - construit dynamiquement côté frontend via i18n
 */
export const notificationSchema = {
  type: 'object',
  description: 'User notification (grouped structure)',
  properties: {
    // === CORE - Identité ===
    id: { type: 'string', description: 'Notification unique identifier' },
    userId: { type: 'string', description: 'Recipient user ID' },
    type: {
      type: 'string',
      description: 'Notification type (determines title via i18n)'
    },
    priority: {
      type: 'string',
      enum: ['low', 'normal', 'high', 'urgent'],
      description: 'Notification priority'
    },

    // === CONTENT ===
    title: { type: 'string', nullable: true, description: 'Localized, entity-aware "actor + action" headline (server-built single source; null → client fallback)' },
    subtitle: { type: 'string', nullable: true, description: 'Localized subtitle base WITHOUT date (client appends the device-local date)' },
    content: { type: 'string', description: 'Notification content (preview or main text)' },

    // === ACTOR - Qui a déclenché ===
    actor: { ...notificationActorSchema, nullable: true, description: 'User who triggered the notification' },

    // === CONTEXT - Où c'est arrivé ===
    context: { ...notificationContextSchema, description: 'Navigation context' },

    // === METADATA - Type-specific data ===
    metadata: { ...notificationMetadataSchema, description: 'Type-specific metadata' },

    // === STATE - Statut ===
    state: { ...notificationStateSchema, description: 'Notification state' },

    // === DELIVERY - Suivi ===
    delivery: { ...notificationDeliverySchema, description: 'Delivery status' }
  },
  required: ['id', 'userId', 'type', 'priority', 'content', 'context', 'metadata', 'state', 'delivery']
} as const;

/**
 * Notification preferences schema
 */
export const notificationPreferenceSchema = {
  type: 'object',
  description: 'User notification preferences',
  properties: {
    id: { type: 'string', description: 'Preference unique identifier' },
    userId: { type: 'string', description: 'User ID' },

    // Global toggles
    pushEnabled: { type: 'boolean', description: 'Push notifications enabled' },
    emailEnabled: { type: 'boolean', description: 'Email notifications enabled' },
    soundEnabled: { type: 'boolean', description: 'Sound enabled' },

    // Per-type preferences
    newMessageEnabled: { type: 'boolean', description: 'New message notifications' },
    missedCallEnabled: { type: 'boolean', description: 'Missed call notifications' },
    systemEnabled: { type: 'boolean', description: 'System notifications' },
    conversationEnabled: { type: 'boolean', description: 'Conversation notifications' },
    replyEnabled: { type: 'boolean', description: 'Reply notifications' },
    mentionEnabled: { type: 'boolean', description: 'Mention notifications' },
    reactionEnabled: { type: 'boolean', description: 'Reaction notifications' },
    contactRequestEnabled: { type: 'boolean', description: 'Contact request notifications' },
    memberJoinedEnabled: { type: 'boolean', description: 'Member joined notifications' },

    // Do Not Disturb
    dndEnabled: { type: 'boolean', description: 'Do Not Disturb enabled' },
    dndStartTime: { type: 'string', nullable: true, description: 'DND start time (HH:mm)' },
    dndEndTime: { type: 'string', nullable: true, description: 'DND end time (HH:mm)' },

    createdAt: { type: 'string', format: 'date-time', description: 'Creation timestamp' },
    updatedAt: { type: 'string', format: 'date-time', description: 'Last update timestamp' }
  }
} as const;

/**
 * Update notification preferences request schema
 */
export const updateNotificationPreferencesRequestSchema = {
  type: 'object',
  properties: {
    pushEnabled: { type: 'boolean' },
    emailEnabled: { type: 'boolean' },
    soundEnabled: { type: 'boolean' },
    newMessageEnabled: { type: 'boolean' },
    missedCallEnabled: { type: 'boolean' },
    systemEnabled: { type: 'boolean' },
    conversationEnabled: { type: 'boolean' },
    replyEnabled: { type: 'boolean' },
    mentionEnabled: { type: 'boolean' },
    reactionEnabled: { type: 'boolean' },
    contactRequestEnabled: { type: 'boolean' },
    memberJoinedEnabled: { type: 'boolean' },
    dndEnabled: { type: 'boolean' },
    dndStartTime: { type: 'string', pattern: '^([01]?[0-9]|2[0-3]):[0-5][0-9]$' },
    dndEndTime: { type: 'string', pattern: '^([01]?[0-9]|2[0-3]):[0-5][0-9]$' }
  }
} as const;
